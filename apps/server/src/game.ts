// One room: lobby → question → reveal → … → final. The server is authoritative for
// timers, answers (re-evaluated from the raw sheets) and scoring.

import { randomUUID } from 'node:crypto'
import {
  DEFAULT_BREAK_SEC,
  evaluateSheet,
  fermeanieRelease,
  formatFactor,
  formatNumber,
  isPieRelease,
  REVEAL_TIMING,
  SCOREBOARD_BEFORE_BREAK_MS,
  scoreRound,
  toRevealed,
  type ClientMessage,
  type FinalView,
  type PlayerView,
  type Question,
  type RevealCard,
  type RevealView,
  type RoomSettings,
  type RoomView,
  type ServerMessage,
} from '@fermi/shared'
import { nowIso, type DB } from './db.ts'
import { LinePicker, type LinePool } from './lines.ts'
import { countActive, markPlayed, markSeen, pickQuestion } from './questions/repo.ts'

export const MAX_PLAYERS = 30

/** Highest score first; ties by name. */
const byStanding = (a: { score: number; name: string | null }, b: { score: number; name: string | null }) =>
  b.score - a.score || (a.name ?? '').localeCompare(b.name ?? '')

/**
 * Who a quip may single out. The leader: ahead of every other player and of FerMEANie. The last:
 * behind everyone else, and in the game from the start (a newcomer starting on 0 isn't falling behind).
 */
export function quipNames(players: { name: string; score: number; fromStart: boolean }[], fermeanieScore: number) {
  const ranked = players.toSorted(byStanding)
  const [first, second] = ranked
  const [last, aboveLast] = [ranked.at(-1), ranked.at(-2)]
  return {
    leader: second && first.score > Math.max(second.score, fermeanieScore) ? first.name : undefined,
    last: last && aboveLast && last.score < aboveLast.score && last.fromStart ? last.name : undefined,
  }
}
/** Extra time after the deadline for last drafts in flight. */
export const DEADLINE_GRACE_MS = 750
export const HOST_HANDOVER_MS = 15_000
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
}

interface GameState {
  id: string
  usedQuestionIds: string[]
  /** Never two questions from the same template in one game. */
  usedTemplateIds: string[]
  lines: LinePicker
  startedAt: number
  /** The leader the last question's line could name (see quipNames), to spot a lead change. */
  leader?: string
}

export interface RoomDeps {
  db: DB
  lines: LinePool
  now?: () => number
  rand?: () => number
  /** Speeds up reveals for end-to-end tests (FERMI_TIME_SCALE). 1 = normal. */
  timeScale?: number
}

export class Room {
  readonly code: string
  private deps: RoomDeps
  private players = new Map<string, Player>()
  /** key hash → public id */
  private keyToId = new Map<string, string>()
  private hostId: string | null = null
  private phase: RoomView['phase'] = 'lobby'
  private settings: RoomSettings = { rounds: 10, timerSec: 60, breakSec: DEFAULT_BREAK_SEC, pacing: 'timer' }
  /** Big screens (TVs) watching: they get snapshots but never play. */
  private screens = new Set<Conn>()
  /** `endsAt` and `votes` only with timed breaks; with host pacing the break lasts until the host taps Next. */
  private breakState: { index: number; startedAt: number; line: string; timed?: { endsAt: number; votes: Set<string> } } | null = null
  private fermeanieScore = 0
  private game: GameState | null = null
  private round: RoundState | null = null
  private reveal: RevealView | null = null
  private final: FinalView | null = null
  private timer: ReturnType<typeof setTimeout> | undefined
  private hostTimer: ReturnType<typeof setTimeout> | undefined
  lastActivity: number

  constructor(code: string, deps: RoomDeps) {
    this.code = code
    this.deps = deps
    this.lastActivity = this.now()
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

  connect(playerId: string, conn: Conn, seenKey = playerId) {
    let p = this.players.get(playerId)
    if (!p) {
      p = { id: playerId, seenKey, name: null, conns: new Set(), score: 0, dunces: 0, spectating: false, joinedAt: this.now() }
      this.players.set(playerId, p)
    }
    clearTimeout(p.dropTimer)
    p.conns.add(conn)
    this.lastActivity = this.now()
    if (this.hostId === playerId) clearTimeout(this.hostTimer)
    this.broadcast()
  }

  disconnect(playerId: string, conn: Conn) {
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
      clearTimeout(this.hostTimer)
      this.hostTimer = setTimeout(() => this.handOverHost(), HOST_HANDOVER_MS)
    }
    if (this.phase === 'lobby') {
      p.dropTimer = setTimeout(() => {
        if (p.conns.size === 0 && this.phase === 'lobby') {
          this.players.delete(p.id)
          if (this.hostId === p.id) this.handOverHost()
          this.broadcast()
        }
      }, LOBBY_DROP_MS)
    }
    this.broadcast()
    if (this.phase === 'question') this.maybeEndEarly()
    if (this.phase === 'break') this.maybeEndBreak()
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

  connectScreen(conn: Conn) {
    this.screens.add(conn)
    this.lastActivity = this.now()
    this.broadcast()
  }

  disconnectScreen(conn: Conn) {
    this.screens.delete(conn)
    this.lastActivity = this.now()
    this.broadcast()
  }

  private handOverHost() {
    const current = this.hostId ? this.players.get(this.hostId) : undefined
    if (current && current.conns.size) return
    const next = [...this.players.values()].filter((p) => p.name !== null && p.conns.size > 0).sort((a, b) => a.joinedAt - b.joinedAt)[0]
    this.hostId = next?.id ?? this.hostId
    if (this.phase === 'break' && this.breakState && this.hostPaced) this.breakState.line = this.breakLine()
    this.broadcast()
  }

  // ---------- messages ----------

  handle(playerId: string, msg: ClientMessage, conn?: Conn) {
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
          if (!this.hostId || !this.players.get(this.hostId)?.name) this.hostId = p.id
        }
        p.name = this.uniqueName(msg.name, p.id)
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
        }
        this.broadcast()
        return
      case 'start':
        if (!isHost) return fail('Only the host can start the game')
        if (this.phase !== 'lobby') return
        if (countActive(this.deps.db) === 0) return fail('There are no questions in the database yet')
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
      case 'next':
        if (!isHost) return fail('Only the host can move on')
        if (this.phase === 'break' && this.hostPaced) this.endBreak()
        return
      case 'play_again':
        if (!isHost) return fail('Only the host can start a new game')
        if (this.phase !== 'final') return
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
    }
    this.fermeanieScore = 0
    this.game = { id, usedQuestionIds: [], usedTemplateIds: [], lines: new LinePicker(lines, db, this.deps.rand), startedAt: this.now() }
    this.final = null
    db.prepare('INSERT INTO games (id, created_at, settings) VALUES (?, ?, ?)').run(id, nowIso(), JSON.stringify(this.settings))
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

  /** Who a line may single out right now (see quipNames). */
  private standings() {
    const game = this.game!
    return quipNames(
      this.joinedPlayers().map((p) => ({ name: p.name!, score: p.score, fromStart: p.joinedAt <= game.startedAt })),
      this.fermeanieScore,
    )
  }

  /** What FerMEANie says as a question appears: the intro, then the final round, a lead change or a quip. */
  private questionLine(index: number, count: number): string {
    const game = this.game!
    if (index === 0) return game.lines.pick('intro', { count })
    const names = this.standings()
    const previous = game.leader
    game.leader = names.leader
    if (index === this.settings.rounds - 1) return game.lines.pick('final_round', names)
    if (names.leader && previous && names.leader !== previous) return game.lines.pick('lead_change', { name: names.leader, previous })
    return game.lines.pick('quip', names)
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
    const start = this.now()
    const truthAt = start + t.numberLine
    const cardsStart = truthAt + t.truth
    const per = cardsSorted.length ? Math.min(t.cardEach, t.cardsMaxTotal / cardsSorted.length) : 0
    const fermeanieAt = cardsStart + cardsSorted.length * per
    const scoreboardAt = fermeanieAt + t.fermeanie
    // With a break coming, the scoreboard step is short: the break shows the scores anyway.
    const endsAt = scoreboardAt + (this.breakAfter(r.index) ? SCOREBOARD_BEFORE_BREAK_MS * k : t.scoreboard)

    // lines
    const lines = game.lines
    const dunceLines: Record<string, string> = {}
    const dunced: string[] = []
    for (const res of score.results) {
      if (!res.dunce) continue
      const p = this.players.get(res.playerId)
      if (p) p.dunces++
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
    const lockedEarly = ids.length >= 2 && r.endsAt - start >= (this.settings.timerSec * 1000) / 2
    const twins = sameAnswer(entries)
    const outlierIds = (score.crowd?.outliers ?? []).map((i) => entries[i].playerId)

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
      question: toRevealed(q),
      timeline: {
        startedAt: start,
        truthAt,
        fermeanieAt: Math.round(fermeanieAt),
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
      lines: {
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
      },
      scoresAfter,
      fermeanieScoreAfter: this.fermeanieScore + (score.fermeanie?.points ?? 0),
    }
    this.phase = 'reveal'
    markPlayed(db, q.id)
    this.saveRound()
    this.schedule(endsAt - start, () => this.finishReveal())
    this.broadcast()
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
    this.breakState = {
      index,
      startedAt,
      line: this.breakLine(),
      ...(this.hostPaced ? {} : { timed: { endsAt: startedAt + ms, votes: new Set<string>() } }),
    }
    this.phase = 'break'
    if (!this.hostPaced) this.schedule(ms, () => this.endBreak())
    this.broadcast()
  }

  private breakLine(): string {
    const { lines } = this.game!
    if (!this.hostPaced) return lines.pick('break_time', { leader: this.standings().leader })
    return lines.pick('host_wait', { host: (this.hostId && this.players.get(this.hostId)?.name) || 'the host' })
  }

  /** A majority of connected players; screens and disconnected players don't count. */
  private votesNeeded() {
    return Math.floor(this.connectedPlayers().length / 2) + 1
  }

  private maybeEndBreak(): boolean {
    const timed = this.breakState?.timed
    if (this.phase !== 'break' || !timed) return false
    const connected = new Set(this.connectedPlayers().map((p) => p.id))
    const votes = [...timed.votes].filter((id) => connected.has(id)).length
    if (votes < this.votesNeeded()) return false
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
    const ranking = this.joinedPlayers()
      .map((p) => ({ playerId: p.id, name: p.name!, score: p.score }))
      .sort(byStanding)
    const top = ranking[0]
    const fermeanieWon = this.fermeanieScore > (top?.score ?? 0)
    const { wins, losses } = db
      .prepare(
        `UPDATE fermeanie SET games_played = games_played + 1, wins = wins + ?1,
           loss_streak = CASE WHEN ?1 THEN 0 ELSE loss_streak + 1 END
         WHERE id = 1 RETURNING wins, loss_streak AS losses`,
      )
      .get(fermeanieWon ? 1 : 0) as { wins: number; losses: number }
    const release = fermeanieRelease(wins)
    const winner = top?.name ?? 'nobody'
    const tied = !!top && this.fermeanieScore === top.score
    this.final = {
      gameId: game.id,
      ranking,
      winnerId: top?.playerId ?? null,
      fermeanieScore: this.fermeanieScore,
      fermeanieWon,
      ...release,
      line: finalLine(game.lines, { ...release, winner, fermeanieWon, tied, losses }),
      ...(fermeanieWon ? { versionLine: versionLine(game.lines, { ...release, winner }) } : {}),
    }
    db.prepare('UPDATE games SET finished_at = ?, final = ? WHERE id = ?').run(nowIso(), JSON.stringify(this.final), game.id)
    this.round = null
    this.reveal = null
    this.phase = 'final'
    this.broadcast()
  }

  private toLobby() {
    clearTimeout(this.timer)
    this.phase = 'lobby'
    this.round = null
    this.reveal = null
    this.final = null
    this.game = null
    this.breakState = null
    for (const p of this.players.values()) {
      p.spectating = false
      if (p.name !== null && p.conns.size === 0) this.players.delete(p.id)
    }
    if (this.hostId && !this.players.has(this.hostId)) this.handOverHost()
    this.broadcast()
  }

  private schedule(ms: number, fn: () => void) {
    clearTimeout(this.timer)
    this.timer = setTimeout(fn, Math.max(0, ms))
  }

  dispose() {
    clearTimeout(this.timer)
    clearTimeout(this.hostTimer)
    for (const p of this.players.values()) clearTimeout(p.dropTimer)
  }

  // ---------- views ----------

  private broadcast() {
    const serverNow = this.now()
    const fv = this.fermeanieView()
    const pool = countActive(this.deps.db)
    for (const p of this.players.values()) {
      if (!p.conns.size) continue
      const msg: ServerMessage = { type: 'snapshot', room: this.view(p.id, fv, pool), serverNow }
      for (const c of p.conns) c.send(msg)
    }
    if (this.screens.size) {
      const msg: ServerMessage = { type: 'snapshot', room: this.screenView(fv, pool), serverNow }
      for (const c of this.screens) c.send(msg)
    }
  }

  private fermeanieView() {
    const { wins } = this.deps.db.prepare('SELECT wins FROM fermeanie WHERE id = 1').get() as { wins: number }
    return { score: this.fermeanieScore, ...fermeanieRelease(wins) }
  }

  view(forId: string, fv = this.fermeanieView(), poolSize = countActive(this.deps.db)): RoomView {
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
      fermeanie: fv,
      poolSize,
      ...(this.phase === 'question' && r
        ? {
            round: {
              index: r.index,
              total: this.settings.rounds,
              question: { id: r.question.id, question: r.question.question, unit: r.question.unit, category: r.question.category },
              startedAt: r.startedAt,
              endsAt: r.endsAt,
              line: r.line,
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
              line: this.breakState.line,
              ...(this.breakState.timed && {
                timed: {
                  endsAt: this.breakState.timed.endsAt,
                  votes: this.breakState.timed.votes.size,
                  needed: this.votesNeeded(),
                  youVoted: this.breakState.timed.votes.has(forId),
                },
              }),
            },
          }
        : {}),
      ...(this.phase === 'final' && this.final ? { final: this.final } : {}),
    }
  }

  /** What a big screen sees: everything public, nothing personal (no own sheet, no votes of its own). */
  screenView(fv = this.fermeanieView(), poolSize = countActive(this.deps.db)): RoomView {
    return { ...this.view('', fv, poolSize), viewer: 'screen' }
  }
}

/** The players who gave the most common answer, if two or more did (ties: the first such answer). */
function sameAnswer(entries: { playerId: string; value: number | null }[]): string[] {
  const groups = new Map<number, string[]>()
  for (const { playerId, value } of entries) if (value !== null) groups.set(value, [...(groups.get(value) ?? []), playerId])
  const largest = [...groups.values()].reduce((a, b) => (b.length > a.length ? b : a), [])
  return largest.length >= 2 ? largest : []
}

type Release = ReturnType<typeof fermeanieRelease>

/** FerMEANie's verdict on the game. A tie goes to the humans; three losses in a row is humble pie. */
function finalLine(lines: LinePicker, r: Release & { winner: string; fermeanieWon: boolean; tied: boolean; losses: number }): string {
  const { winner, version, wins, losses } = r
  if (r.fermeanieWon) return lines.pick('game_win', { winner, version, wins })
  if (r.tied) return lines.pick('game_tie', { winner, version })
  if (losses >= 3) return lines.pick('humble_pie', { winner, version, losses })
  return lines.pick('game_loss', { winner, version })
}

/** After a win: a pie release every fifth win, release notes otherwise. */
function versionLine(lines: LinePicker, { codename, version, wins, winner }: Release & { winner: string }): string {
  if (codename && isPieRelease(wins)) return lines.pick('pie_release', { codename, version, wins })
  return lines.pick('release_notes', { winner, version, wins })
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
