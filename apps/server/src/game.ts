// One room: lobby → intro → question → reveal → … → final. The server is authoritative for
// timers, answers (re-evaluated from the raw sheets) and scoring.

import { randomUUID } from 'node:crypto'
import {
  chatDelay,
  DEFAULT_BREAK_SEC,
  evaluateSheet,
  fermeanieRelease,
  fermeanieStageMs,
  formatFactor,
  formatNumber,
  INTRO_TIMING,
  isPieRelease,
  lineDuration,
  messageStarts,
  MIN_PLAYERS,
  plainText,
  REVEAL_TIMING,
  revealChat,
  RULES,
  SCOREBOARD_BEFORE_BREAK_MS,
  scoreRound,
  stolenCards,
  toRevealed,
  type ClientMessage,
  type FermeanieRelease,
  type FinalView,
  type IntroStep,
  type IntroView,
  type PlayerView,
  type Question,
  type RevealCard,
  type RevealView,
  type RoomSettings,
  type RoomView,
  type ServerMessage,
} from '@fermi/shared'
import { nowIso, type DB } from './db.ts'
import type { LineArgs, LineCategory } from '@fermi/shared/lines'
import { exampleQuestion, loadExamples } from './intro.ts'
import { LinePicker, type ChosenLine, type LinePool } from './lines.ts'
import { countActive, markPlayed, markSeen, pickQuestion } from './questions/repo.ts'
import type { Voice } from './voice/index.ts'
import { nameSentences } from './voice/sweep.ts'

export const MAX_PLAYERS = 30

/** Highest score first; ties by name. */
const byStanding = (a: { score: number; name: string | null }, b: { score: number; name: string | null }) =>
  b.score - a.score || (a.name ?? '').localeCompare(b.name ?? '')

/**
 * Who a quip may single out. The leader: ahead of every other player and of FerMEANie. The last:
 * behind everyone else, in the game from the start (a newcomer starting on 0 isn't falling behind), and still here
 * (someone who left isn't trailing). A leader who is away for a moment still leads.
 */
export function quipNames(players: { name: string; score: number; fromStart: boolean; here: boolean }[], fermeanieScore: number) {
  const ranked = players.toSorted(byStanding)
  const [first, second] = ranked
  const [last, aboveLast] = [ranked.at(-1), ranked.at(-2)]
  return {
    leader: second && first.score > Math.max(second.score, fermeanieScore) ? first.name : undefined,
    last: last && aboveLast && last.score < aboveLast.score && last.fromStart && last.here ? last.name : undefined,
  }
}
/** Extra time after the deadline for last drafts in flight. */
export const DEADLINE_GRACE_MS = 750
export const HOST_HANDOVER_MS = 15_000
/** Clips rendered within this long of each other are announced to a room in one message. */
export const VOICE_READY_BATCH_MS = 100
export const LOBBY_DROP_MS = 60_000

export interface Conn {
  send(msg: ServerMessage): void
}

interface Player {
  /** Public, per-room id: safe to show to everyone, useless as a credential. */
  id: string
  /** Private, stable across games (hash of the player's key): question/line history. Never sent to clients. */
  seenKey: string
  name: string | null
  conns: Set<Conn>
  score: number
  dunces: number
  /** Joined mid-round: plays from the next question. */
  spectating: boolean
  /** Took part in a real round of this game (not just the intro's example): only they get the game in their history. */
  played: boolean
  joinedAt: number
  dropTimer?: ReturnType<typeof setTimeout>
}

interface Sheet {
  text: string
  locked: boolean
}

interface RoundState {
  index: number
  question: Question
  startedAt: number
  endsAt: number
  participants: Set<string>
  sheets: Map<string, Sheet>
  /** What FerMEANie says while the question is up. */
  line: string
  /** The intro's example question: nothing is scored, saved or marked as seen. */
  practice?: true
}

/**
 * The intro, from Start until the first real question: its steps, then (full intro) the example question. Skip votes
 * count throughout.
 */
interface IntroState {
  mode: IntroView['mode']
  startedAt: number
  steps: IntroStep[]
  endsAt: number
  votes: Set<string>
}

/**
 * Timed breaks count down and take skip votes. With host pacing the break lasts until the host taps Next, and its
 * line names whoever is host when it's shown.
 */
type BreakState =
  | { index: number; startedAt: number; line: string; timed: { endsAt: number; votes: Set<string> } }
  | { index: number; startedAt: number; hostWait: ChosenLine<'host_wait'>; timed?: undefined }

/** A tally as clients see it. */
const skipView = ({ votes, needed, youVoted }: { votes: number; needed: number; youVoted: boolean }) => ({ votes, needed, youVoted })

/** How the intro ended (see GameState.introEnd). */
type IntroEnd = 'played' | 'intro' | 'skipped'

/** A line to pick: its category and values. */
type LineCall = { [K in LineCategory]: { key: K; vars: LineArgs<K> } }[LineCategory]

interface GameState {
  id: string
  usedQuestionIds: string[]
  /** Never two questions from the same template in one game. */
  usedTemplateIds: string[]
  lines: LinePicker
  startedAt: number
  /**
   * How the intro ended, for the first question's line: `for_real.played` after the example question, `for_real.intro`
   * after a short one, `for_real.skipped` when someone skipped it. Unset without an intro (the `intro` greeting).
   */
  introEnd?: IntroEnd
  /** The leader the last question's line could name (see quipNames), to spot a lead change. */
  leader?: string
  /**
   * Lines picked before they're said, so her voice can render them while the reveal plays: the next question's line
   * and the final lines, by slot. Used when the situation turned out as expected (same category), else picked anew.
   */
  prepared: Map<string, { key: LineCategory; chosen: ChosenLine<LineCategory> }>
}

export interface RoomDeps {
  db: DB
  lines: LinePool
  now?: () => number
  rand?: () => number
  /** Speeds up reveals for end-to-end tests (FERMI_TIME_SCALE). 1 = normal. */
  timeScale?: number
  /** FerMEANie's voice (FERMI_VOICE): renders what she says, in time for it to be said. */
  voice?: Voice
}

export class Room {
  readonly code: string
  private deps: RoomDeps
  private players = new Map<string, Player>()
  /** key hash → public id */
  private keyToId = new Map<string, string>()
  private hostId: string | null = null
  private phase: RoomView['phase'] = 'lobby'
  private settings: RoomSettings = { rounds: 10, timerSec: 60, breakSec: DEFAULT_BREAK_SEC, pacing: 'timer', intro: 'full' }
  /** Big screens (TVs) watching: they get snapshots but never play. */
  private screens = new Set<Conn>()
  private breakState: BreakState | null = null
  private intro: IntroState | null = null
  /** The last example question this room played, so the next game's intro gets another. */
  private lastExample: string | undefined
  /** This room has finished a game: her next hello is a welcome back (`hello_again`), not an introduction. */
  private playedBefore = false
  private fermeanieScore = 0
  private game: GameState | null = null
  private round: RoundState | null = null
  private reveal: RevealView | null = null
  private final: FinalView | null = null
  private timer: ReturnType<typeof setTimeout> | undefined
  /** The clips in the last snapshot, and those rendered since that haven't been announced yet. */
  private voiceKeys = new Set<string>()
  private voiceReady = new Set<string>()
  private voiceTimer: ReturnType<typeof setTimeout> | undefined
  private stopListening: (() => void) | undefined
  /** Names her voice has rendered ahead for (capped, so renaming in a loop can't keep the renderer busy). */
  private voicedNames = new Set<string>()
  private hostTimer: ReturnType<typeof setTimeout> | undefined
  lastActivity: number

  constructor(code: string, deps: RoomDeps) {
    this.code = code
    this.deps = deps
    this.lastActivity = this.now()
    this.stopListening = deps.voice?.onRendered((key) => this.voiceRendered(key))
  }

  private now() {
    return this.deps.now?.() ?? Date.now()
  }

  // ---------- connections ----------

  /** The public id for a player's key hash, minting a fresh random one the first time. */
  idForKey(keyHash: string): string {
    let id = this.keyToId.get(keyHash)
    if (!id) {
      id = randomUUID()
      this.keyToId.set(keyHash, id)
    }
    return id
  }

  // Every public entry point runs through `guard`, so a bug in one room can't take the server down.
  connect(playerId: string, conn: Conn, seenKey = playerId) {
    this.guard('connect', () => this.onConnect(playerId, conn, seenKey))
  }
  disconnect(playerId: string, conn: Conn) {
    this.guard('disconnect', () => this.onDisconnect(playerId, conn))
  }
  connectScreen(conn: Conn) {
    this.guard('screen connect', () => this.onConnectScreen(conn))
  }
  disconnectScreen(conn: Conn) {
    this.guard('screen disconnect', () => this.onDisconnectScreen(conn))
  }
  handle(playerId: string, msg: ClientMessage, conn?: Conn) {
    this.guard(msg.type, () => this.onMessage(playerId, msg, conn))
  }

  private onConnect(playerId: string, conn: Conn, seenKey: string) {
    let p = this.players.get(playerId)
    if (!p) {
      p = {
        id: playerId,
        seenKey,
        name: null,
        conns: new Set(),
        score: 0,
        dunces: 0,
        spectating: false,
        played: false,
        joinedAt: this.now(),
      }
      this.players.set(playerId, p)
    }
    clearTimeout(p.dropTimer)
    p.conns.add(conn)
    this.lastActivity = this.now()
    this.joinRound(p)
    if (this.hostId === playerId) this.stopHostTimer()
    this.ensureHost()
    this.broadcast()
  }

  private onDisconnect(playerId: string, conn: Conn) {
    const p = this.players.get(playerId)
    if (!p) return
    p.conns.delete(conn)
    this.lastActivity = this.now()
    if (p.conns.size > 0) return
    if (p.name === null) {
      this.players.delete(playerId)
      return
    }
    if (this.hostId === playerId) {
      this.stopHostTimer()
      this.hostTimer = setTimeout(
        () =>
          this.guard('host handover', () => {
            this.hostTimer = undefined
            this.ensureHost()
            this.broadcast()
          }),
        HOST_HANDOVER_MS,
      )
    }
    if (this.phase === 'lobby') {
      p.dropTimer = setTimeout(
        () =>
          this.guard('lobby drop', () => {
            if (p.conns.size === 0 && this.phase === 'lobby') {
              this.players.delete(p.id)
              this.ensureHost()
              this.broadcast()
            }
          }),
        LOBBY_DROP_MS,
      )
    }
    this.broadcast()
    if (this.phase === 'question') this.maybeEndEarly()
    if (this.phase === 'break') this.maybeEndBreak()
    if (this.intro) this.maybeEndIntro()
  }

  /** The question being answered right now (its answer must not be looked up meanwhile). */
  get liveQuestionId(): string | null {
    return this.phase === 'question' && this.round ? this.round.question.id : null
  }

  get connectedCount() {
    return this.connectedPlayers().length + this.screens.size
  }

  private connectedPlayers() {
    return [...this.players.values()].filter((p) => p.name !== null && p.conns.size > 0)
  }

  private onConnectScreen(conn: Conn) {
    this.screens.add(conn)
    this.lastActivity = this.now()
    this.broadcast()
  }

  private onDisconnectScreen(conn: Conn) {
    this.screens.delete(conn)
    this.lastActivity = this.now()
    this.broadcast()
  }

  /**
   * Makes sure someone hosts: if the host is gone (left, dropped, or never named) and isn't within their grace period
   * after a disconnect, the earliest-joined connected player takes over. With nobody to take over, the next player to
   * connect or join does. Callers broadcast.
   */
  private ensureHost() {
    const host = this.hostId ? this.players.get(this.hostId) : undefined
    if (host && host.name !== null && (host.conns.size > 0 || this.hostTimer !== undefined)) return
    const next = this.connectedPlayers().sort((a, b) => a.joinedAt - b.joinedAt)[0]
    if (next) this.hostId = next.id
  }

  private stopHostTimer() {
    clearTimeout(this.hostTimer)
    this.hostTimer = undefined
  }

  private breakLine(b: BreakState) {
    return 'hostWait' in b ? this.game!.lines.say(b.hostWait, { host: this.hostName() }) : b.line
  }

  private hostName() {
    return (this.hostId && this.players.get(this.hostId)?.name) || 'the host'
  }

  // ---------- messages ----------

  private onMessage(playerId: string, msg: ClientMessage, conn?: Conn) {
    const p = this.players.get(playerId)
    if (!p) return
    this.lastActivity = this.now()
    const isHost = this.hostId === playerId
    const fail = (message: string) => conn?.send({ type: 'error', message })

    switch (msg.type) {
      case 'ping':
        conn?.send({ type: 'pong', t: msg.t, serverNow: this.now() })
        return
      case 'join':
      case 'rename': {
        if (p.name === null) {
          if (this.joinedPlayers().length >= MAX_PLAYERS) return fail(`This room is full (${MAX_PLAYERS} players)`)
          p.joinedAt = this.now()
          p.spectating = this.phase === 'question' || this.phase === 'reveal'
        }
        p.name = this.uniqueName(msg.name, p.id)
        this.voiceName(p.name)
        this.ensureHost()
        this.broadcast()
        return
      }
      case 'settings':
        if (!isHost) return fail('Only the host can change settings')
        if (this.phase !== 'lobby') return
        this.settings = {
          rounds: msg.rounds,
          timerSec: msg.timerSec,
          breakSec: msg.breakSec ?? this.settings.breakSec,
          pacing: msg.pacing ?? this.settings.pacing,
          intro: msg.intro ?? this.settings.intro,
        }
        this.broadcast()
        return
      case 'start':
        if (!isHost) return fail('Only the host can start the game')
        if (this.phase !== 'lobby') return
        if (countActive(this.deps.db) === 0) return fail('There are no questions in the database yet')
        if (this.connectedPlayers().length < MIN_PLAYERS) return fail(`Fermi needs at least ${MIN_PLAYERS} players`)
        this.startGame()
        return
      case 'draft':
      case 'lock': {
        const r = this.round
        if (this.phase !== 'question' || !r || !r.participants.has(playerId)) return
        const sheet = r.sheets.get(playerId) ?? { text: '', locked: false }
        if (sheet.locked && msg.type === 'draft') return
        const wasTyping = sheet.text.trim() !== ''
        sheet.text = msg.text
        r.sheets.set(playerId, sheet)
        if (msg.type === 'lock') {
          sheet.locked = true
          this.broadcast()
          this.maybeEndEarly()
        } else if (wasTyping !== (sheet.text.trim() !== '')) {
          this.broadcast()
        }
        return
      }
      case 'unlock': {
        const sheet = this.round?.sheets.get(playerId)
        if (this.phase !== 'question' || !sheet) return
        sheet.locked = false
        this.broadcast()
        return
      }
      case 'skip_break': {
        const timed = this.breakState?.timed
        if (this.phase !== 'break' || !timed || p.name === null) return
        timed.votes.add(playerId)
        if (!this.maybeEndBreak()) this.broadcast()
        return
      }
      case 'skip_intro': {
        if (!this.intro || p.name === null) return
        if (isHost) return this.finishIntro('skipped')
        this.intro.votes.add(playerId)
        if (!this.maybeEndIntro()) this.broadcast()
        return
      }
      case 'next':
        if (!isHost) return fail('Only the host can move on')
        if (this.phase === 'break' && this.hostPaced) this.endBreak()
        return
      case 'play_again':
        if (!isHost) return fail('Only the host can start a new game')
        if (this.phase !== 'final') return
        // the same group has just heard the rules: next time, only hello and the roll call
        if (this.settings.intro === 'full') this.settings = { ...this.settings, intro: 'short' }
        this.toLobby()
        return
    }
  }

  private uniqueName(name: string, selfId: string): string {
    const taken = new Set([...this.players.values()].filter((p) => p.id !== selfId && p.name).map((p) => p.name!.toLowerCase()))
    if (!taken.has(name.toLowerCase()) && name.toLowerCase() !== 'fermeanie') return name
    for (let i = 2; ; i++) {
      const candidate = `${name.slice(0, 21)} ${i}`
      if (!taken.has(candidate.toLowerCase())) return candidate
    }
  }

  private joinedPlayers() {
    return [...this.players.values()].filter((p) => p.name !== null)
  }

  // ---------- game flow ----------

  private startGame() {
    const { db, lines } = this.deps
    const id = randomUUID()
    const joined = this.joinedPlayers()
    for (const p of joined) {
      p.score = 0
      p.dunces = 0
      p.spectating = false
      p.played = false
    }
    this.fermeanieScore = 0
    this.game = {
      id,
      usedQuestionIds: [],
      usedTemplateIds: [],
      lines: new LinePicker(lines, db, this.deps.rand),
      startedAt: this.now(),
      prepared: new Map(),
    }
    this.final = null
    db.prepare('INSERT INTO games (id, created_at, settings) VALUES (?, ?, ?)').run(id, nowIso(), JSON.stringify(this.settings))
    if (this.settings.intro === 'off') this.startRound(0)
    else this.startIntro(this.settings.intro)
  }

  // ---------- the intro ----------

  /**
   * Hello, then every player who is here, introduced in the order they joined, then (full intro) the rules. Each step
   * lasts its minimum or until her line has been typed, said and read, whichever is longer.
   */
  private startIntro(mode: IntroView['mode']) {
    const { lines } = this.game!
    const k = this.deps.timeScale ?? 1
    const players = this.connectedPlayers().sort((a, b) => a.joinedAt - b.joinedAt)
    const startedAt = this.now()
    const steps: IntroStep[] = []
    let t = startedAt
    /** A step starting at `t` (when the last one ends), and how long it lasts. */
    const add = (step: IntroStep, minMs: number) => {
      steps.push(step)
      t += Math.max(minMs * k, lineDuration(plainText(step.line), this.paced))
    }
    const hello = lines.pick(this.playedBefore ? 'hello_again' : 'hello', {
      count: players.length,
      version: this.fermeanieView().version,
    })
    add({ kind: 'hello', at: t, line: hello }, INTRO_TIMING.hello)
    for (const p of players) add({ kind: 'player', at: t, playerId: p.id, name: p.name!, line: this.rollCallLine(p) }, INTRO_TIMING.player)
    if (mode === 'full')
      for (const rule of RULES) add({ kind: 'rule', at: t, rule, line: lines.pick(`rules.${rule}`, {}) }, INTRO_TIMING.rule)
    this.intro = { mode, startedAt, steps, endsAt: t, votes: new Set() }
    this.phase = 'intro'
    this.schedule(t - startedAt, () => (mode === 'full' ? this.startPractice() : this.finishIntro('intro')))
    this.broadcast()
  }

  /**
   * A backhanded compliment for one player. Newcomers get `roll_call.new`. Returning players draw from
   * `roll_call.returning`, plus `roll_call.dunces` and `roll_call.losses` when they have caps or losses on record:
   * those join the pool (weighted by how many lines each has), they're never forced.
   */
  private rollCallLine(p: Player): string {
    const { lines } = this.game!
    const name = p.name!
    const h = this.deps.db
      .prepare(
        `SELECT COUNT(*) AS games, COALESCE(SUM(dunces), 0) AS dunces, COALESCE(SUM(fermeanie_won), 0) AS losses
         FROM player_games WHERE player_id = ?`,
      )
      .get(p.seenKey) as { games: number; dunces: number; losses: number }
    if (!h.games) return lines.pick('roll_call.new', { name }, p.seenKey)
    const calls: LineCall[] = [
      { key: 'roll_call.returning', vars: { name, games: h.games } },
      ...(h.dunces ? [{ key: 'roll_call.dunces', vars: { name, dunces: h.dunces } } as const] : []),
      ...(h.losses ? [{ key: 'roll_call.losses', vars: { name, losses: h.losses, games: h.games } } as const] : []),
    ]
    const sizes = calls.map((c) => this.deps.lines.categories[c.key].length)
    let r = (this.deps.rand ?? Math.random)() * sizes.reduce((a, b) => a + b, 0)
    const call = calls.find((_, i) => (r -= sizes[i]) < 0) ?? calls[0]
    return lines.pick(call.key, call.vars as LineArgs<typeof call.key>, p.seenKey)
  }

  /** The example question: played like a round, but never scored, saved or marked as seen. */
  private startPractice() {
    const participants = this.connectedPlayers()
    if (participants.length === 0) return this.finishIntro('intro')
    const examples = loadExamples()
    const fresh = examples.filter((e) => e.id !== this.lastExample)
    const example = fresh[Math.floor((this.deps.rand ?? Math.random)() * fresh.length)] ?? examples[0]
    this.lastExample = example.id
    const startedAt = this.now()
    const ms = INTRO_TIMING.practiceSec * 1000
    this.round = {
      index: 0,
      question: exampleQuestion(example),
      startedAt,
      endsAt: startedAt + ms,
      participants: new Set(participants.map((p) => p.id)),
      sheets: new Map(),
      line: this.game!.lines.pick('practice.question', {}),
      practice: true,
    }
    this.reveal = null
    this.phase = 'question'
    this.schedule(ms + DEADLINE_GRACE_MS, () => this.endRound())
    this.broadcast()
  }

  /** A majority of connected players voted to skip the intro (the host skips it at once). */
  private maybeEndIntro(): boolean {
    if (!this.intro || !this.tally(this.intro.votes, '').passed) return false
    this.finishIntro('skipped')
    return true
  }

  /** The intro is over (played, short or skipped, wherever it was): the first real question. */
  private finishIntro(end: IntroEnd) {
    if (!this.intro) return
    this.intro = null
    this.game!.introEnd = end
    this.startRound(0)
  }

  private startRound(index: number) {
    const { db } = this.deps
    const game = this.game!
    const participants = this.joinedPlayers().filter((p) => p.conns.size > 0)
    for (const p of this.joinedPlayers()) p.spectating = false
    if (participants.length === 0) {
      this.toLobby()
      return
    }
    for (const p of participants) p.played = true
    const ids = participants.map((p) => p.id)
    const seenKeys = participants.map((p) => p.seenKey)
    const question = pickQuestion(db, seenKeys, game.usedQuestionIds, game.usedTemplateIds)
    if (!question) {
      this.finishGame()
      return
    }
    game.usedQuestionIds.push(question.id)
    if (question.template) game.usedTemplateIds.push(question.template.id)
    markSeen(db, seenKeys, question.id)
    const startedAt = this.now()
    this.round = {
      index,
      question,
      startedAt,
      endsAt: startedAt + this.settings.timerSec * 1000,
      participants: new Set(ids),
      sheets: new Map(),
      line: this.questionLine(index, participants.length),
    }
    this.reveal = null
    this.phase = 'question'
    this.schedule(this.settings.timerSec * 1000 + DEADLINE_GRACE_MS, () => this.endRound())
    this.broadcast()
  }

  /**
   * A player who was in the game but offline when the question started (a phone that locked during the break) plays it
   * after all when they reconnect before the deadline. Players who joined mid-round (`spectating`) wait for the next one.
   */
  private joinRound(p: Player) {
    const r = this.round
    if (this.phase !== 'question' || !r || p.name === null || p.spectating || r.participants.has(p.id)) return
    if (this.now() >= r.endsAt) return
    r.participants.add(p.id)
    if (r.practice) return
    p.played = true
    markSeen(this.deps.db, [p.seenKey], r.question.id)
  }

  /** Who a line may single out right now (see quipNames), or with the scores a reveal is about to give. */
  private standings(scores?: Scores) {
    const game = this.game!
    return quipNames(
      this.joinedPlayers().map((p) => ({
        name: p.name!,
        score: scores?.players[p.id] ?? p.score,
        fromStart: p.joinedAt <= game.startedAt,
        here: p.conns.size > 0,
      })),
      scores?.fermeanie ?? this.fermeanieScore,
    )
  }

  /** What FerMEANie says as a question appears: the intro, then the final round, a lead change or a quip. */
  private questionLineCall(
    index: number,
    { count = 0, scores }: { count?: number; scores?: Scores } = {},
  ): {
    call: LineCall
    leader?: string
  } {
    if (index === 0) {
      const end = this.game!.introEnd
      return { call: end ? { key: `for_real.${end}`, vars: {} } : { key: 'intro', vars: { count } } }
    }
    const names = this.standings(scores)
    const previous = this.game!.leader
    const call: LineCall =
      index === this.settings.rounds - 1
        ? { key: 'final_round', vars: names }
        : names.leader && previous && names.leader !== previous
          ? { key: 'lead_change', vars: { name: names.leader, previous } }
          : { key: 'quip', vars: names }
    return { call, leader: names.leader }
  }

  private questionLine(index: number, count: number): string {
    const { call, leader } = this.questionLineCall(index, { count })
    if (leader) this.game!.leader = leader // a tie keeps the last leader, so Ada → tie → Bob is still a lead change
    return this.take(questionSlot(index), call)
  }

  /** Picks a line now, to be said later (`take`), and lets her voice render it in the meantime. */
  private prepare(slot: string, call: LineCall, at: number) {
    const game = this.game!
    const chosen = game.lines.choose(call.key, call.vars)
    game.prepared.set(slot, { key: call.key, chosen })
    this.deps.voice?.request(game.lines.say(chosen), { tier: 'ahead', at })
  }

  /**
   * The line for a slot: the prepared one with today's values if it's still the right kind and every name or number it
   * uses is still given (a quip about the last player can't stay once nobody is last), else a fresh pick.
   */
  private take(slot: string, call: LineCall): string {
    const game = this.game!
    const prepared = game.prepared.get(slot)
    game.prepared.delete(slot)
    const given: Record<string, unknown> = call.vars
    if (prepared?.key === call.key && prepared.chosen.msg.variables.every((v) => given[v] !== undefined))
      return game.lines.say(prepared.chosen, call.vars)
    if (prepared) game.lines.unuse(prepared.key, prepared.chosen) // never said: it may come up later in the game
    return game.lines.pick(call.key, call.vars)
  }

  /** Her voice gets a head start on every sentence that only names this player. */
  private voiceName(name: string) {
    if (!this.deps.voice || this.voicedNames.has(name) || this.voicedNames.size >= MAX_PLAYERS * 2) return
    this.voicedNames.add(name)
    // speculative (only a few get said), so after the sweep's questions and the lines picked ahead
    this.deps.voice.requestSentences(nameSentences(this.deps.lines, name))
  }

  /** With a voice, her chat waits for her to finish each message (on every device, so all stay in step). */
  private get paced() {
    return !!this.deps.voice
  }

  /** The players, best first; with `scores`, as a reveal is about to leave them. */
  private ranking(scores?: Record<string, number>) {
    return this.joinedPlayers()
      .map((p) => ({ playerId: p.id, name: p.name!, score: scores?.[p.id] ?? p.score }))
      .sort(byStanding)
  }

  private get hostPaced() {
    return this.settings.pacing === 'host'
  }

  /** A break follows this round: always with host pacing, otherwise if breaks are on. Never after the last round. */
  private breakAfter(index: number) {
    return index + 1 < this.settings.rounds && (this.hostPaced || this.settings.breakSec > 0)
  }

  private maybeEndEarly() {
    const r = this.round
    if (this.phase !== 'question' || !r) return
    const active = [...r.participants].filter((id) => (this.players.get(id)?.conns.size ?? 0) > 0)
    if (active.length > 0 && active.every((id) => r.sheets.get(id)?.locked)) this.endRound()
  }

  private endRound() {
    const r = this.round
    const game = this.game
    if (this.phase !== 'question' || !r || !game) return
    clearTimeout(this.timer)
    const { db } = this.deps
    const q = r.question
    const ids = [...r.participants]
    const texts = new Map(ids.map((id) => [id, r.sheets.get(id)?.text ?? '']))
    const entries = ids.map((id) => {
      const text = texts.get(id)!
      return { playerId: id, value: text.trim() ? evaluateSheet(text).answer : null }
    })
    const score = scoreRound(q.answer, entries)
    const name = (id: string) => this.players.get(id)?.name ?? '???'

    // Furthest first: no answer, then infinitely wrong (≤ 0), then by error descending.
    const tier = (x: (typeof score.results)[number]) => (x.value === null ? 0 : x.err === null ? 1 : 2)
    const cardsSorted = [...score.results].sort(
      (a, b) => tier(a) - tier(b) || (b.err ?? 0) - (a.err ?? 0) || name(a.playerId).localeCompare(name(b.playerId)),
    )

    const k = this.deps.timeScale ?? 1
    const t = Object.fromEntries(Object.entries(REVEAL_TIMING).map(([key, v]) => [key, v * k])) as Record<
      keyof typeof REVEAL_TIMING,
      number
    >
    const policy = this.revealPolicy(r, t)
    const { lines } = policy
    const start = this.now()
    // the example's guide is said before any answer shows: the number line waits until it's been read
    const truthAt = start + Math.max(t.numberLine, policy.guide ? lineDuration(plainText(policy.guide), this.paced) : 0)
    const cardsStart = truthAt + t.truth
    const per = cardsSorted.length ? Math.min(policy.cardEach, policy.cardsMaxTotal / cardsSorted.length) : 0
    const fermeanieAt = cardsStart + cardsSorted.length * per

    // lines
    const dunceLines: Record<string, string> = {}
    const dunced: string[] = []
    for (const res of score.results) {
      if (!res.dunce) continue
      const p = this.players.get(res.playerId)
      if (p && policy.counts) p.dunces++
      dunced.push(res.playerId)
      const count = p?.dunces ?? 1
      const key = count >= 2 ? 'dunce.repeat_offender' : (`dunce.${res.dunce}` as const)
      dunceLines[res.playerId] = lines.pick(
        key,
        {
          name: name(res.playerId),
          factor: res.factor !== null ? formatFactor(res.factor) : '∞×',
          value: res.value !== null ? formatNumber(res.value) : '0',
          count,
        },
        p?.seenKey,
      )
    }
    const ranked = score.results.filter((x) => x.rank !== null).sort((a, b) => a.rank! - b.rank!)
    const best = ranked[0]
    let verdict: string
    if (!score.crowd || !score.fermeanie) {
      verdict = lines.pick('sits_out', { count: entries.filter((e) => e.value !== null && e.value > 0).length })
    } else if (score.fermeanie.beatsAll) {
      verdict = lines.pick('steal', { points: score.fermeanie.points, best: best ? name(best.playerId) : 'nobody' })
    } else if (score.bestErr !== null && score.bestErr > 1) {
      verdict = lines.pick('everyone_way_off', { factor: formatFactor(10 ** score.bestErr) })
    } else {
      verdict = lines.pick('defeated', { name: best ? name(best.playerId) : 'someone' })
    }
    const bull = ranked.find((x) => x.bonusKind === 'bullseye')
    // everyone, not just the connected players maybeEndEarly waited for
    const lockedEarly = ids.length >= 2 && ids.every((id) => r.sheets.get(id)?.locked) && r.endsAt - start >= (r.endsAt - r.startedAt) / 2
    const twins = sameAnswer(entries)
    const outlierIds = (score.crowd?.outliers ?? []).map((i) => entries[i].playerId)

    const revealLines: RevealView['lines'] = {
      ...(lockedEarly ? { everyone: lines.pick('everyone_locked', {}) } : {}),
      ...(twins.length ? { twins: lines.pick('twins', { names: joinNames(twins.map(name)) }) } : {}),
      ...(score.crowd?.method === 'median' && outlierIds.length
        ? { ruleChange: lines.pick('rule_change', { name: name(outlierIds[0]), count: outlierIds.length }) }
        : {}),
      dunce: dunceLines,
      ...(dunced.length >= 2
        ? { dunceGroup: lines.pick('dunce.group', { names: joinNames(dunced.map(name)), count: dunced.length }) }
        : {}),
      verdict,
      ...(bull ? { bullseye: lines.pick('human_bullseye', { name: name(bull.playerId) }) } : {}),
      ...(policy.guide ? { guide: policy.guide } : {}),
      // what the swarm is, only when there is one (with fewer than three answers she sits out)
      ...(r.practice && score.fermeanie ? { lesson: lines.pick('practice.lesson', {}) } : {}),
    }
    // FerMEANie's stage lasts until the steal has landed and she has finished talking, so the next step can't cut her
    // off. Her chat isn't sped up by FERMI_TIME_SCALE: clients type at normal speed, test games included.
    const stolen = stolenCards(score.fermeanie, score.results)
    const chatAt = fermeanieAt + chatDelay(stolen)
    const scoreboardAt = fermeanieAt + fermeanieStageMs(revealLines, stolen, t.fermeanie, { paced: this.paced })
    const endsAt = scoreboardAt + policy.scoreboardMs

    // What the round leaves the scores at. Only a round that counts applies them, in finishReveal.
    const scoresAfter: Record<string, number> = {}
    for (const p of this.joinedPlayers()) scoresAfter[p.id] = p.score
    for (const res of score.results) scoresAfter[res.playerId] = (scoresAfter[res.playerId] ?? 0) + res.points

    const cards: RevealCard[] = cardsSorted.map((res, i) => ({
      ...res,
      name: name(res.playerId),
      text: texts.get(res.playerId) ?? '',
      at: Math.round(cardsStart + i * per),
    }))

    this.reveal = {
      index: r.index,
      total: this.settings.rounds,
      ...(r.practice ? { practice: true as const } : {}),
      question: toRevealed(q),
      timeline: {
        startedAt: start,
        truthAt,
        fermeanieAt: Math.round(fermeanieAt),
        chatAt: Math.round(chatAt),
        scoreboardAt: Math.round(scoreboardAt),
        endsAt: Math.round(endsAt),
      },
      cards,
      crowd: score.crowd
        ? {
            count: score.crowd.count,
            geomean: score.crowd.geomean,
            median: score.crowd.median,
            mean: score.crowd.mean,
            official: score.crowd.official,
            method: score.crowd.method,
            outlierIds,
          }
        : null,
      fermeanie: score.fermeanie,
      lines: revealLines,
      scoresAfter,
      fermeanieScoreAfter: this.fermeanieScore + (score.fermeanie?.points ?? 0),
    }
    this.phase = 'reveal'
    if (this.deps.voice) {
      // What she says next, picked now so her voice can render it while this reveal plays.
      const upcoming: Scores = { players: scoresAfter, fermeanie: this.reveal.fermeanieScoreAfter }
      if (r.practice) this.prepare(questionSlot(0), { key: 'for_real.played', vars: {} }, endsAt)
      else if (r.index + 1 < this.settings.rounds)
        this.prepare(questionSlot(r.index + 1), this.questionLineCall(r.index + 1, { scores: upcoming }).call, endsAt)
      else this.prepareFinal(upcoming, endsAt)
    }
    if (policy.counts) {
      markPlayed(db, q.id)
      this.saveRound()
    }
    this.schedule(endsAt - start, () => this.finishReveal())
    this.broadcast()
  }

  /**
   * How a round's reveal is paced and what it leaves behind. A real round counts: its dunce caps, saved round and
   * scores (applied in finishReveal), and its lines are the game's, so they aren't repeated. The intro's example counts
   * for nothing: its lines come from a picker of its own (no repeats used up, no player's history touched), it flips
   * its cards faster, says a guide to the number line first, and has no scoreboard, only a moment before the real game.
   */
  private revealPolicy(r: RoundState, t: Record<keyof typeof REVEAL_TIMING, number>) {
    const k = this.deps.timeScale ?? 1
    if (r.practice) {
      const lines = new LinePicker(this.deps.lines, undefined, this.deps.rand)
      return {
        counts: false,
        lines,
        guide: lines.pick('practice.guide', {}),
        cardEach: INTRO_TIMING.practiceCardEach * k,
        cardsMaxTotal: INTRO_TIMING.practiceCardsMaxTotal * k,
        scoreboardMs: INTRO_TIMING.practiceOutro * k,
      }
    }
    return {
      counts: true,
      lines: this.game!.lines,
      guide: undefined,
      cardEach: t.cardEach,
      cardsMaxTotal: t.cardsMaxTotal,
      // with a break coming, the scoreboard step is short: the break shows the scores anyway
      scoreboardMs: this.breakAfter(r.index) ? SCOREBOARD_BEFORE_BREAK_MS * k : t.scoreboard,
    }
  }

  private saveRound() {
    const rv = this.reveal!
    const { db } = this.deps
    const row = db.prepare('SELECT rounds FROM games WHERE id = ?').get(this.game!.id) as { rounds: string } | undefined
    const rounds = row ? JSON.parse(row.rounds) : []
    rounds.push({
      index: rv.index,
      question: rv.question,
      cards: rv.cards.map(({ at: _at, ...c }) => c),
      crowd: rv.crowd,
      fermeanie: rv.fermeanie,
      lines: rv.lines,
    })
    db.prepare('UPDATE games SET rounds = ? WHERE id = ?').run(JSON.stringify(rounds), this.game!.id)
  }

  private finishReveal() {
    const rv = this.reveal
    if (this.phase !== 'reveal' || !rv) return
    if (rv.practice) return this.finishIntro('played')
    for (const [id, s] of Object.entries(rv.scoresAfter)) {
      const p = this.players.get(id)
      if (p) p.score = s
    }
    this.fermeanieScore = rv.fermeanieScoreAfter
    const next = rv.index + 1
    if (next >= this.settings.rounds) this.finishGame()
    else if (this.breakAfter(rv.index)) this.startBreak(rv.index)
    else this.startRound(next)
  }

  // ---------- discussion break between rounds ----------

  private startBreak(index: number) {
    const startedAt = this.now()
    const ms = this.settings.breakSec * 1000 * (this.deps.timeScale ?? 1)
    const { lines } = this.game!
    if (this.hostPaced) {
      this.breakState = { index, startedAt, hostWait: lines.choose('host_wait', { host: this.hostName() }) }
    } else {
      const line = lines.pick('break_time', { leader: this.standings().leader })
      this.breakState = { index, startedAt, line, timed: { endsAt: startedAt + ms, votes: new Set<string>() } }
    }
    this.phase = 'break'
    if (!this.hostPaced) this.schedule(ms, () => this.endBreak())
    this.broadcast()
  }

  /**
   * A skip vote (the break's or the intro's), as everyone sees it: the votes of connected players (screens and players
   * who left don't count), the majority of them needed, and whether `forId` has voted.
   */
  private tally(votes: Set<string>, forId: string) {
    const connected = this.connectedPlayers()
    const count = connected.filter((p) => votes.has(p.id)).length
    const needed = Math.floor(connected.length / 2) + 1
    return { votes: count, needed, youVoted: votes.has(forId), passed: count >= needed }
  }

  private maybeEndBreak(): boolean {
    const timed = this.breakState?.timed
    if (this.phase !== 'break' || !timed || !this.tally(timed.votes, '').passed) return false
    this.endBreak()
    return true
  }

  private endBreak() {
    const b = this.breakState
    if (this.phase !== 'break' || !b) return
    this.breakState = null
    this.startRound(b.index + 1)
  }

  private finishGame() {
    clearTimeout(this.timer)
    const { db } = this.deps
    const game = this.game!
    const ranking = this.ranking()
    const outcome = gameOutcome(ranking, this.fermeanieScore)
    // one statement, so two games ending at once both count
    const record = db
      .prepare(
        `UPDATE fermeanie SET games_played = games_played + 1, wins = wins + ?1,
           loss_streak = CASE WHEN ?1 THEN 0 ELSE loss_streak + 1 END
         WHERE id = 1 RETURNING wins, loss_streak AS losses`,
      )
      .get(outcome.fermeanieWon ? 1 : 0) as { wins: number; losses: number }
    const o = withRecord(outcome, record)
    const played = db.prepare(
      `INSERT OR IGNORE INTO player_games (player_id, game_id, finished_at, score, dunces, fermeanie_won) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    for (const p of this.joinedPlayers().filter((p) => p.played))
      played.run(p.seenKey, game.id, nowIso(), p.score, p.dunces, o.fermeanieWon ? 1 : 0)
    this.playedBefore = true
    this.final = {
      gameId: game.id,
      ranking,
      winnerId: ranking[0]?.playerId ?? null,
      fermeanieScore: this.fermeanieScore,
      fermeanieWon: o.fermeanieWon,
      startedAt: this.now(),
      ...o.release,
      line: this.take('final', finalCall(o)),
      ...(o.fermeanieWon ? { versionLine: this.take('version', versionCall(o)) } : {}),
    }
    db.prepare('UPDATE games SET finished_at = ?, final = ? WHERE id = ?').run(nowIso(), JSON.stringify(this.final), game.id)
    this.round = null
    this.reveal = null
    this.phase = 'final'
    this.broadcast()
  }

  /**
   * During the last reveal: her final lines as the game is about to end (the scores are known; her record is read now,
   * so another game ending first only means a fresh pick), so her voice can render them while the reveal plays.
   */
  private prepareFinal(upcoming: Scores, at: number) {
    const outcome = gameOutcome(this.ranking(upcoming.players), upcoming.fermeanie)
    const o = withRecord(outcome, recordAfter(this.fermeanieRecord(), outcome.fermeanieWon))
    this.prepare('final', finalCall(o), at)
    if (o.fermeanieWon) this.prepare('version', versionCall(o), at)
  }

  /** FerMEANie's record before this game ends. */
  private fermeanieRecord() {
    return this.deps.db.prepare('SELECT wins, loss_streak AS losses FROM fermeanie WHERE id = 1').get() as { wins: number; losses: number }
  }

  private toLobby() {
    clearTimeout(this.timer)
    this.phase = 'lobby'
    this.round = null
    this.reveal = null
    this.final = null
    this.game = null
    this.breakState = null
    this.intro = null
    for (const p of this.players.values()) {
      p.spectating = false
      if (p.name !== null && p.conns.size === 0) this.players.delete(p.id)
    }
    this.ensureHost()
    this.broadcast()
  }

  private schedule(ms: number, fn: () => void) {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.guard('timer', fn), Math.max(0, ms))
  }

  /**
   * Runs `fn` so that a bug can't take the server (and every other room) down: it's logged, everyone in this room is
   * told, and a game in progress goes back to the lobby, since a half-done step can't be trusted. Every way into a
   * room (messages, connections, timers) goes through here.
   */
  guard(what: string, fn: () => void) {
    try {
      fn()
    } catch (e) {
      console.error(`[fermi] room ${this.code}: ${what} failed`, e)
      // The message first: going back to the lobby broadcasts, which may hit the same bug.
      this.sendAll({ type: 'error', message: 'Something broke on our side, so the game went back to the lobby. Sorry!' })
      try {
        if (this.phase !== 'lobby') this.toLobby()
      } catch (again) {
        console.error(`[fermi] room ${this.code}: recovering failed too`, again)
      }
    }
  }

  dispose() {
    clearTimeout(this.timer)
    clearTimeout(this.voiceTimer)
    this.stopListening?.()
    this.stopHostTimer()
    for (const p of this.players.values()) clearTimeout(p.dropTimer)
  }

  // ---------- views ----------

  private broadcast() {
    const serverNow = this.now()
    const shared = this.sharedView()
    for (const p of this.players.values()) {
      if (!p.conns.size) continue
      const msg: ServerMessage = { type: 'snapshot', room: this.view(p.id, shared), serverNow }
      for (const c of p.conns) c.send(msg)
    }
    if (this.screens.size) {
      const msg: ServerMessage = { type: 'snapshot', room: this.screenView(shared), serverNow }
      for (const c of this.screens) c.send(msg)
    }
  }

  private fermeanieView() {
    const { wins } = this.deps.db.prepare('SELECT wins FROM fermeanie WHERE id = 1').get() as { wins: number }
    return { score: this.fermeanieScore, ...fermeanieRelease(wins) }
  }

  /** The same message to every connection: players' and screens'. */
  private sendAll(msg: ServerMessage) {
    for (const p of this.players.values()) for (const c of p.conns) c.send(msg)
    for (const c of this.screens) c.send(msg)
  }

  /** The parts of a view that are the same for everyone, worked out once per broadcast. */
  private sharedView() {
    return {
      fermeanie: this.fermeanieView(),
      poolSize: countActive(this.deps.db),
      voice: this.voiceMap(),
    }
  }

  /**
   * Everything she says (or reads out) in this state, and when (server ms): the question, then her line; in a reveal
   * her remark, each dunce line as its card flips, then her chat; the break line; the final lines. The one list her
   * voice renders from and clients get clips for.
   */
  private utterances(): { text: string; at: number }[] {
    const out: { text: string; at: number }[] = []
    const say = (text: string | undefined, at: number) => text && out.push({ text, at })
    const chat = (texts: (string | undefined)[], at: number) => {
      const said = texts.filter((t): t is string => !!t)
      messageStarts(said.map(plainText), { paced: this.paced }).forEach((t, i) => say(said[i], at + t))
    }
    if (this.phase === 'intro' && this.intro) for (const step of this.intro.steps) say(step.line, step.at)
    const r = this.round
    if (this.phase === 'question' && r) {
      say(r.question.question, r.startedAt)
      say(r.line, r.startedAt)
    }
    const rv = this.reveal
    if ((this.phase === 'reveal' || this.phase === 'break') && rv) {
      say(rv.lines.everyone, rv.timeline.startedAt)
      say(rv.lines.guide, rv.timeline.startedAt)
      for (const card of rv.cards) say(rv.lines.dunce[card.playerId], card.at)
      chat(revealChat(rv.lines), rv.timeline.chatAt)
    }
    if (this.phase === 'break' && this.breakState) say(this.breakLine(this.breakState), this.breakState.startedAt)
    const f = this.final
    if (this.phase === 'final' && f) chat([f.line, f.versionLine], f.startedAt)
    return out
  }

  /**
   * Her voice's clips for everything in this snapshot, by text. Asking her voice for them on every broadcast is cheap
   * (rendered and queued clips are skipped, and late ones dropped) and covers a line that changed since it was picked.
   */
  private voiceMap(): RoomView['voice'] {
    const voice = this.deps.voice
    if (!voice) return undefined
    const lines = Object.fromEntries(this.utterances().map(({ text, at }) => [text, voice.request(text, { at })]))
    this.voiceKeys = new Set(Object.values(lines).flat())
    return { lines, pending: [...this.voiceKeys].filter((k) => !voice.has(k)) }
  }

  /**
   * A clip was rendered: if this room's view uses it, tell everyone here (in one message with any others rendered
   * around then), so clients fetch it the moment it exists instead of asking for it until it does.
   */
  private voiceRendered(key: string) {
    if (!this.voiceKeys.has(key)) return
    this.voiceReady.add(key)
    this.voiceTimer ??= setTimeout(() => {
      this.voiceTimer = undefined
      this.sendAll({ type: 'voice', ready: [...this.voiceReady] })
      this.voiceReady.clear()
    }, VOICE_READY_BATCH_MS)
  }

  view(forId: string, shared = this.sharedView()): RoomView {
    const r = this.round
    const players: PlayerView[] = this.joinedPlayers()
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((p) => {
        const sheet = r?.sheets.get(p.id)
        return {
          id: p.id,
          name: p.name!,
          connected: p.conns.size > 0,
          isHost: p.id === this.hostId,
          score: p.score,
          lockedIn: this.phase === 'question' && !!sheet?.locked,
          typing: this.phase === 'question' && !!sheet && sheet.text.trim() !== '',
          spectating: p.spectating || (this.phase === 'question' && !!r && !r.participants.has(p.id)),
          dunces: p.dunces,
        }
      })
    const mine = r?.sheets.get(forId)
    return {
      code: this.code,
      you: forId,
      hostId: this.hostId,
      phase: this.phase,
      settings: this.settings,
      screens: this.screens.size,
      players,
      fermeanie: shared.fermeanie,
      poolSize: shared.poolSize,
      voice: shared.voice,
      ...(this.phase === 'question' && r
        ? {
            round: {
              index: r.index,
              total: this.settings.rounds,
              question: { id: r.question.id, question: r.question.question, unit: r.question.unit, category: r.question.category },
              startedAt: r.startedAt,
              endsAt: r.endsAt,
              line: r.line,
              ...(r.practice ? { practice: true as const } : {}),
            },
            ...(r.participants.has(forId) ? { yourSheet: { text: mine?.text ?? '', locked: !!mine?.locked } } : {}),
          }
        : {}),
      ...((this.phase === 'reveal' || this.phase === 'break') && this.reveal ? { reveal: this.reveal } : {}),
      ...(this.phase === 'break' && this.breakState
        ? {
            break: {
              index: this.breakState.index,
              total: this.settings.rounds,
              startedAt: this.breakState.startedAt,
              line: this.breakLine(this.breakState),
              ...(this.breakState.timed && {
                timed: { endsAt: this.breakState.timed.endsAt, ...skipView(this.tally(this.breakState.timed.votes, forId)) },
              }),
            },
          }
        : {}),
      ...(this.phase === 'final' && this.final ? { final: this.final } : {}),
      ...(this.intro
        ? {
            intro: {
              mode: this.intro.mode,
              startedAt: this.intro.startedAt,
              steps: this.intro.steps,
              endsAt: this.intro.endsAt,
              skip: skipView(this.tally(this.intro.votes, forId)),
            },
          }
        : {}),
    }
  }

  /** What a big screen sees: everything public, nothing personal (no own sheet, no votes of its own). */
  screenView(shared = this.sharedView()): RoomView {
    return { ...this.view('', shared), viewer: 'screen' }
  }
}

/** The players who gave the most common answer, if two or more did (ties: the first such answer). */
function sameAnswer(entries: { playerId: string; value: number | null }[]): string[] {
  const groups = new Map<number, string[]>()
  for (const { playerId, value } of entries) if (value !== null) groups.set(value, [...(groups.get(value) ?? []), playerId])
  const largest = [...groups.values()].reduce((a, b) => (b.length > a.length ? b : a), [])
  return largest.length >= 2 ? largest : []
}

/** How a game ends, from the final ranking (best first) and her score: she wins only by beating every player. */
function gameOutcome(ranking: { name: string; score: number }[], fermeanieScore: number) {
  const top = ranking[0]
  return {
    winner: top?.name ?? 'nobody',
    fermeanieWon: fermeanieScore > (top?.score ?? 0),
    tied: !!top && fermeanieScore === top.score, // a tie goes to the humans
  }
}

/** Her record after a game: one more win, or one more loss in a row (what finishGame's UPDATE does, worked out ahead). */
function recordAfter(record: { wins: number; losses: number }, won: boolean) {
  return { wins: record.wins + (won ? 1 : 0), losses: won ? 0 : record.losses + 1 }
}

/** How the game ended, with her record (and release) after it: what her final lines say. */
type GameOutcome = ReturnType<typeof gameOutcome> & { wins: number; losses: number; release: FermeanieRelease }
const withRecord = (outcome: ReturnType<typeof gameOutcome>, record: { wins: number; losses: number }): GameOutcome => ({
  ...outcome,
  ...record,
  release: fermeanieRelease(record.wins),
})

/** Scores as a reveal is about to leave them: each player's, and hers. */
type Scores = { players: Record<string, number>; fermeanie: number }

/** FerMEANie's verdict on the game. A tie goes to the humans; three losses in a row is humble pie. */
function finalCall({ winner, fermeanieWon, tied, wins, losses, release: { version } }: GameOutcome): LineCall {
  if (fermeanieWon) return { key: 'game_win', vars: { winner, version, wins } }
  if (tied) return { key: 'game_tie', vars: { winner, version } }
  if (losses >= 3) return { key: 'humble_pie', vars: { winner, version, losses } }
  return { key: 'game_loss', vars: { winner, version } }
}

/** After a win: a pie release every fifth win, release notes otherwise. */
function versionCall({ winner, wins, release: { codename, version } }: GameOutcome): LineCall {
  if (codename && isPieRelease(wins)) return { key: 'pie_release', vars: { codename, version, wins } }
  return { key: 'release_notes', vars: { winner, version, wins } }
}

/** The slot for the line said as question `index` appears (see Room.prepare). */
const questionSlot = (index: number) => `question ${index}`

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
