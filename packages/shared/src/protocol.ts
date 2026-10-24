import { z } from 'zod'
import { MIN_CROWD, type CrowdStats } from './crowd.ts'
import type { PublicQuestion, RevealedQuestion } from './question.ts'
import type { DunceKind, FermeanieRelease } from './scoring.ts'
import { LIMITS } from './calc/evaluate.ts'
import { chatDuration, HOLD_MS, holdDuration } from './chat.ts'
import { plainText } from './markup.ts'

export const ROUND_OPTIONS = [5, 10, 15] as const
export const TIMER_OPTIONS = [30, 60, 90] as const
/** Discussion break between rounds (seconds); 0 = off. */
export const BREAK_OPTIONS = [0, 15, 30, 60] as const
export const DEFAULT_BREAK_SEC = 30
/** Players needed to start: FerMEANie sits out any round with fewer answers, and Fermi is a game for friends. */
export const MIN_PLAYERS = MIN_CROWD

/** How many more connected players the lobby needs before the game can start. */
export const playersMissing = (players: { connected: boolean }[]) => Math.max(0, MIN_PLAYERS - players.filter((p) => p.connected).length)

/** `timer`: breaks count down on their own. `host`: after each reveal, everyone waits until the host taps Next. */
export const PACING_OPTIONS = ['timer', 'host'] as const
export type Pacing = (typeof PACING_OPTIONS)[number]
/** With a break coming, the reveal's scoreboard step is short: the break shows the scores anyway. */
export const SCOREBOARD_BEFORE_BREAK_MS = 3000

/**
 * The intro before the first question. `full`: FerMEANie says hello, introduces every player, explains the rules and
 * plays an unscored example question. `short`: hello and the roll call only. Play again switches `full` to `short`.
 */
export const INTRO_OPTIONS = ['full', 'short', 'off'] as const
export type IntroMode = (typeof INTRO_OPTIONS)[number]
/** The rule slides, in order. */
export const RULES = ['sheet', 'times_off', 'points', 'swarm'] as const
export type Rule = (typeof RULES)[number]
/**
 * Intro pacing (ms): the shortest each step lasts. A step also lasts until her line is typed out (and said, with a
 * voice) and can be read, like her reveal stage.
 */
export const INTRO_TIMING = {
  hello: 6000,
  player: 3000,
  rule: 6000,
  /** The example question's answering time. */
  practiceSec: 45,
  /** The example's reveal flips fewer cards, faster. */
  practiceCardEach: 2500,
  practiceCardsMaxTotal: 12000,
  /** After the example's reveal, before the first real question. */
  practiceOutro: 4000,
} as const
export const NAME_MAX = 24
export const ROOM_CODE_RE = /^[A-Z]{4}$/
/** A player's private key (never shown to other players): 32 random bytes, base64url. */
export const KEY_RE = /^[A-Za-z0-9_-]{32,128}$/

/** Reveal pacing (ms). Shared so the lobby can estimate the game length. */
export const REVEAL_TIMING = {
  numberLine: 2500,
  truth: 4500,
  cardEach: 3500,
  cardsMaxTotal: 35000,
  /** Long enough for the steal: points fly into the eye, then the verdict. */
  fermeanie: 6500,
  scoreboard: 6000,
} as const

/** The steal (ms from the start of FerMEANie's stage): each stolen card's points take off in turn, then fly. */
export const STEAL = { lead: 700, spread: 1700, maxStagger: 300, flight: 900 } as const

/** How the steal's take-offs are spaced, and when the last points land, for this many stolen cards. */
export function stealTiming(victims: number) {
  const stagger = victims > 1 ? Math.min(STEAL.maxStagger, STEAL.spread / (victims - 1)) : 0
  const doneAt = victims ? STEAL.lead + (victims - 1) * stagger + STEAL.flight : STEAL.lead
  return { stagger, doneAt }
}

/** FerMEANie's chat in the reveal, in the order she says it. Missing lines are left out. */
export function revealChat(lines: RevealView['lines']): string[] {
  return [lines.lesson, lines.twins, lines.bullseye, lines.ruleChange, lines.dunceGroup, lines.verdict].filter((l): l is string => !!l)
}

/** How many cards FerMEANie steals from (null without a steal). The one count the steal and its timing use. */
export function stolenCards(fermeanie: { beatsAll: boolean } | null, rows: { stolen: number }[]): number | null {
  return fermeanie?.beatsAll ? rows.filter((r) => r.stolen > 0).length : null
}

/** When FerMEANie starts talking, in ms from the start of her stage: right away, or once the stolen points landed. */
export const chatDelay = (stolen: number | null) => (stolen === null ? 0 : stealTiming(stolen).doneAt)

/**
 * How long FerMEANie's stage lasts (ms): at least `minMs`, and long enough for the steal, her whole chat after it and
 * a moment to read (and hear) her last line. Those are real time: clients play them at normal speed, even in sped-up
 * test games, which only shorten `minMs`.
 */
export function fermeanieStageMs(
  lines: RevealView['lines'],
  stolen: number | null,
  minMs: number = REVEAL_TIMING.fermeanie,
  { paced = false } = {},
): number {
  const chat = revealChat(lines).map(plainText)
  if (!chat.length) return Math.max(minMs, chatDelay(stolen) + HOLD_MS) // a moment to see the stolen points land
  return Math.max(minMs, chatDelay(stolen) + chatDuration(chat, { paced }) + holdDuration(chat.at(-1)!, true, paced))
}

/**
 * FerMEANie's stage in a typical round, for estimates: her lines average about 100 characters, and many rounds add a
 * second one (twins, a rule change, a group dunce) to the verdict.
 */
export const TYPICAL_FERMEANIE_MS = fermeanieStageMs({ dunce: {}, twins: 'x'.repeat(100), verdict: 'x'.repeat(100) }, null)

export function revealDuration(players: number): number {
  const t = REVEAL_TIMING
  return t.numberLine + t.truth + Math.min(t.cardsMaxTotal, players * t.cardEach) + TYPICAL_FERMEANIE_MS + t.scoreboard
}

export interface RoomSettings {
  rounds: number
  timerSec: number
  breakSec: number
  pacing: Pacing
  intro: IntroMode
}

/**
 * About how long the intro takes (ms), for estimates. A roll-call line usually outlasts its 3 s minimum, and the
 * example question rarely runs its full time, but its reveal adds about as much.
 */
export function introDuration(mode: IntroMode, players: number): number {
  if (mode === 'off') return 0
  const t = INTRO_TIMING
  const greeting = t.hello + players * 4000
  return mode === 'short' ? greeting : greeting + RULES.length * t.rule + t.practiceSec * 1000
}

/** Breaks count only when they're timed: with host pacing, nobody knows how long the talk takes. */
export function estimateGameMinutes({ rounds, timerSec, breakSec, pacing, intro }: RoomSettings, players: number): number {
  const breaks = pacing === 'host' ? 0 : Math.max(0, rounds - 1) * breakSec * 1000
  const game = rounds * (timerSec * 1000 + revealDuration(Math.max(players, 2))) + breaks + introDuration(intro, players)
  return Math.max(1, Math.round(game / 60000))
}

const name = z
  .string()
  .transform((s) => s.replace(/\s+/g, ' ').trim())
  .pipe(z.string().min(1, 'Pick a name').max(NAME_MAX, `Max ${NAME_MAX} characters`))

const sheet = z.string().max(LIMITS.maxChars)

export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('join'), name }),
  z.object({ type: z.literal('rename'), name }),
  z.object({
    type: z.literal('settings'),
    rounds: z.union(ROUND_OPTIONS.map((n) => z.literal(n)) as [z.ZodLiteral<5>, z.ZodLiteral<10>, z.ZodLiteral<15>]),
    timerSec: z.union(TIMER_OPTIONS.map((n) => z.literal(n)) as [z.ZodLiteral<30>, z.ZodLiteral<60>, z.ZodLiteral<90>]),
    breakSec: z
      .union(BREAK_OPTIONS.map((n) => z.literal(n)) as [z.ZodLiteral<0>, z.ZodLiteral<15>, z.ZodLiteral<30>, z.ZodLiteral<60>])
      .optional(),
    pacing: z.enum(PACING_OPTIONS).optional(),
    intro: z.enum(INTRO_OPTIONS).optional(),
  }),
  z.object({ type: z.literal('start') }),
  /** Host pacing: end the break and start the next question. */
  z.object({ type: z.literal('next') }),
  z.object({ type: z.literal('draft'), text: sheet }),
  z.object({ type: z.literal('lock'), text: sheet }),
  z.object({ type: z.literal('unlock') }),
  z.object({ type: z.literal('skip_break') }),
  /** The host skips the intro at once; anyone else votes, and a majority skips it. */
  z.object({ type: z.literal('skip_intro') }),
  z.object({ type: z.literal('play_again') }),
  z.object({ type: z.literal('ping'), t: z.number() }),
])

export type ClientMessage = z.infer<typeof ClientMessageSchema>

export type Phase = 'lobby' | 'intro' | 'question' | 'reveal' | 'break' | 'final'

export interface PlayerView {
  id: string
  name: string
  connected: boolean
  isHost: boolean
  score: number
  lockedIn: boolean
  /** Has a draft in progress this round (no content is shared). */
  typing: boolean
  /** Joined mid-round: plays from the next question. */
  spectating: boolean
  dunces: number
}

export interface FermeanieView extends FermeanieRelease {
  score: number
}

export interface QuestionView {
  index: number
  total: number
  question: PublicQuestion
  startedAt: number
  endsAt: number
  /** What FerMEANie says while the question is up: the intro in the first round, a quip after that. */
  line: string
  /** The intro's example question: no points, and the real game starts after its reveal. */
  practice?: true
}

export interface RevealCard {
  playerId: string
  name: string
  /** Their whole answer sheet, so everyone can see the working. */
  text: string
  value: number | null
  err: number | null
  factor: number | null
  direction: 'high' | 'low' | 'exact' | null
  rank: number | null
  basePoints: number
  bonus: number
  bonusKind: 'bullseye' | 'close' | null
  points: number
  stolen: number
  dunce: DunceKind | null
  /** When this card flips (server ms). */
  at: number
}

export interface RevealView {
  index: number
  total: number
  /** The intro's example question: the points are what it would have scored, and nobody keeps them. */
  practice?: true
  question: RevealedQuestion
  timeline: {
    startedAt: number
    truthAt: number
    fermeanieAt: number
    /** When her chat starts: after the steal, if there is one. */
    chatAt: number
    scoreboardAt: number
    endsAt: number
  }
  /** Ordered furthest → closest (no-answers first). */
  cards: RevealCard[]
  crowd: (Omit<CrowdStats, 'outliers'> & { outlierIds: string[] }) | null
  fermeanie: {
    value: number
    err: number
    factor: number
    direction: 'high' | 'low' | 'exact'
    beatsAll: boolean
    points: number
  } | null
  lines: {
    ruleChange?: string
    dunce: Record<string, string>
    /** When two or more players got the dunce cap this round. */
    dunceGroup?: string
    /** Everyone locked in with at least half the time left. */
    everyone?: string
    /** Two or more players gave exactly the same answer. */
    twins?: string
    /** steal / defeated / sits_out / everyone_way_off */
    verdict: string
    bullseye?: string
    /** The example question: what the number line shows, said as the answers drop. */
    guide?: string
    /** The example question: what the swarm is, said before her verdict. */
    lesson?: string
  }
  scoresAfter: Record<string, number>
  fermeanieScoreAfter: number
}

/** The end of a game. Its release is FerMEANie's after this game. */
export interface FinalView extends FermeanieRelease {
  gameId: string
  ranking: { playerId: string; name: string; score: number }[]
  winnerId: string | null
  fermeanieScore: number
  fermeanieWon: boolean
  /** When the game ended: her final lines start then (server ms). */
  startedAt: number
  line: string
  /** After a win: the release notes, or the announcement of a new pie release. */
  versionLine?: string
}

/** One beat of the intro. `at`: when it starts (server ms); it lasts until the next one, or the intro's end. */
export type IntroStep =
  | { kind: 'hello'; at: number; line: string }
  | { kind: 'player'; at: number; line: string; playerId: string; name: string }
  | { kind: 'rule'; at: number; line: string; rule: Rule }

/**
 * The intro: its steps (set when it starts, so late joiners aren't introduced), and the vote to skip it, which runs
 * through the example question too. Set while the intro or its example question is on.
 */
export interface IntroView {
  mode: Exclude<IntroMode, 'off'>
  startedAt: number
  steps: IntroStep[]
  /** When the last step ends: then the example question, or the first real one. */
  endsAt: number
  skip: { votes: number; needed: number; youVoted: boolean }
}

export interface BreakView {
  /** The round that just finished. */
  index: number
  total: number
  startedAt: number
  /** What FerMEANie says during the break. */
  line: string
  /**
   * Timed breaks: the countdown, the players who voted to skip, and how many votes end the break early (a majority
   * of connected players). Missing with host pacing: the break lasts until the host taps Next.
   */
  timed?: { endsAt: number; votes: number; needed: number; youVoted: boolean }
}

export interface RoomView {
  code: string
  you: string
  hostId: string | null
  phase: Phase
  settings: RoomSettings
  /** Big screens (TVs) watching this room. Phones can switch to controller mode when one is present. */
  screens: number
  /** Set when this snapshot is for a big screen rather than a player. */
  viewer?: 'screen'
  players: PlayerView[]
  fermeanie: FermeanieView
  /** Number of playable questions in the pool. */
  poolSize: number
  round?: QuestionView
  /** Your own sheet for this round (restored on reconnect). */
  yourSheet?: { text: string; locked: boolean }
  reveal?: RevealView
  final?: FinalView
  /** The intro, and its vote to skip (also during its example question). */
  intro?: IntroView
  /** The discussion break after a reveal (`reveal` stays set alongside, for the recap of that round). */
  break?: BreakView
  /** With FerMEANie's voice on (the server's FERMI_VOICE): the clips for what she says in this view. */
  voice?: VoiceView
}

/**
 * For each line she says or question she reads, its clips, sentence by sentence (`/voice/<key>.webm` or `.mp3`), and
 * which of them aren't rendered yet (nearly always none). Clients only fetch clips that are ready: never one that isn't
 * there yet. The server announces pending ones as they're rendered (`{ type: 'voice' }`).
 */
export interface VoiceView {
  lines: Record<string, string[]>
  pending: string[]
}

export type ServerMessage =
  | { type: 'snapshot'; room: RoomView; serverNow: number }
  /** Clips in this room's view that have just been rendered (between snapshots). */
  | { type: 'voice'; ready: string[] }
  | { type: 'pong'; t: number; serverNow: number }
  | { type: 'error'; message: string; fatal?: boolean }
