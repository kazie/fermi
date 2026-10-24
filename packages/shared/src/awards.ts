// End-of-game awards: a few superlatives FerMEANie reads out before the winner is crowned. Pure, so the server can
// hand them out and tests can check every rule. Each award needs one clear winner (a tie means nobody gets it), at
// most three are given, and each to a different player, so the game's winner can't sweep them.

import { callRight, type Call } from './protocol.ts'

export const AWARDS = [
  'swarm_slayer',
  'bullseye',
  'steady_hand',
  'abacus',
  'gut_feeling',
  'contrarian',
  'bold_estimator',
  'last_minute',
  'swarm_twin',
  'comeback',
  'optimist',
  'pessimist',
  'late_bloomer',
  'one_liner',
  'round_numbers',
  'near_miss',
  'swarm_donor',
  'hindsight',
] as const
export type AwardKind = (typeof AWARDS)[number]

/** How many awards a game gets at most. */
export const MAX_AWARDS = 3

/**
 * What each award's number is, which is also the variable her line gets it as (besides `$name`): rounds or answers
 * counted, a "times off" factor, lines of working, seconds, places climbed or points. One table for the server's line
 * call, LINE_VARIABLES (a test keeps them in step) and the client's wording.
 */
export const AWARD_VALUES = {
  swarm_slayer: 'count',
  bullseye: 'count',
  steady_hand: 'factor',
  abacus: 'lines',
  gut_feeling: 'seconds',
  contrarian: 'count',
  bold_estimator: 'factor',
  last_minute: 'seconds',
  swarm_twin: 'factor',
  comeback: 'places',
  optimist: 'count',
  pessimist: 'count',
  late_bloomer: 'factor',
  one_liner: 'count',
  round_numbers: 'count',
  near_miss: 'count',
  swarm_donor: 'points',
  hindsight: 'count',
} as const satisfies Record<AwardKind, string>

/** Her line for an award: its category, and its number as the line shows it (factors formatted, like "3.2×"). */
export function awardLineCall(a: Award, name: string, formatFactor: (f: number) => string) {
  const variable = AWARD_VALUES[a.kind]
  return {
    key: `award.${a.kind}` as const,
    vars: { name, [variable]: variable === 'factor' ? formatFactor(a.value) : a.value } as Record<string, string | number>,
  }
}

/** One player's answer in one counted round, as the awards need it. */
export interface AwardEntry {
  playerId: string
  /** Orders of magnitude off; null without a positive answer. */
  err: number | null
  direction: 'high' | 'low' | 'exact' | null
  bonusKind: 'bullseye' | 'close' | null
  /** Their whole answer sheet. */
  text: string
  /** How long after the question appeared they locked in (ms); null if they never did. */
  lockMs?: number | null
  /** Their answer. */
  value?: number | null
  /** Points the swarm took from them. */
  stolen?: number
}

export interface AwardRound {
  cards: AwardEntry[]
  /** The swarm's estimate and its error, if it played. */
  fermeanie: { err: number; value?: number } | null
  /** Everyone's score after this round, as the server applied it (Comeback). */
  scoresAfter?: Record<string, number>
  /** The call: whether each player said the truth was higher or lower than their answer (Hindsight). */
  calls?: Record<string, Call>
}

export interface Award {
  kind: AwardKind
  playerId: string
  /** The number the award is for (see AWARD_VALUES): rounds, a factor, lines, seconds, places or points. */
  value: number
}

/** Lines of working: lines with a calculation on them (not blank, not only a comment). */
export function workingLines(text: string): number {
  return text.split('\n').filter((l) => l.replace(/#.*/, '').trim() !== '').length
}

/** The one player with the highest (or lowest) score, if exactly one has it. */
function unique(scores: Map<string, number>, best: 'max' | 'min'): { playerId: string; value: number } | null {
  if (!scores.size) return null
  const values = [...scores.values()]
  const top = best === 'max' ? Math.max(...values) : Math.min(...values)
  const at = [...scores].filter(([, v]) => v === top)
  return at.length === 1 ? { playerId: at[0][0], value: top } : null
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

/** Each award's winner in these rounds, if it has a clear one. */
export function awardWinners(rounds: AwardRound[]): Award[] {
  const ids = [...new Set(rounds.flatMap((r) => r.cards.map((c) => c.playerId)))]
  const per = <T>(fn: (id: string) => T) => new Map(ids.map((id) => [id, fn(id)]))
  const cardsOf = (id: string) => rounds.flatMap((r) => r.cards.filter((c) => c.playerId === id))
  /** Enough rounds answered for an average to mean something: at least two, and half the game. */
  const enough = (n: number) => n >= 2 && n >= rounds.length / 2
  const counts = (scores: Map<string, number>) => new Map([...scores].filter(([, v]) => v > 0))
  const out: Award[] = []
  const add = (kind: AwardKind, w: { playerId: string; value: number } | null) => w && out.push({ kind, ...w })

  // beat the swarm: closer than her estimate, in a round she played
  add(
    'swarm_slayer',
    unique(
      counts(
        per(
          (id) =>
            rounds.filter((r) => r.fermeanie && r.cards.some((c) => c.playerId === id && c.err !== null && c.err < r.fermeanie!.err))
              .length,
        ),
      ),
      'max',
    ),
  )
  add('bullseye', unique(counts(per((id) => cardsOf(id).filter((c) => c.bonusKind === 'bullseye').length)), 'max'))

  // closest on average, over the rounds they answered
  const errs = per((id) => cardsOf(id).flatMap((c) => (c.err === null ? [] : [c.err])))
  const steady = unique(new Map([...errs].filter(([, e]) => enough(e.length)).map(([id, e]) => [id, mean(e)])), 'min')
  add('steady_hand', steady && { playerId: steady.playerId, value: 10 ** steady.value }) // shown as "times off"

  // the longest working, on average: three lines or more
  const lines = per((id) =>
    cardsOf(id)
      .filter((c) => c.text.trim())
      .map((c) => workingLines(c.text)),
  )
  // decided on the exact averages; only the number shown is rounded
  const rounded = (w: { playerId: string; value: number } | null, by = 1) => w && { playerId: w.playerId, value: Math.round(w.value / by) }
  add(
    'abacus',
    rounded(unique(new Map([...lines].filter(([, l]) => enough(l.length) && mean(l) >= 3).map(([id, l]) => [id, mean(l)])), 'max')),
  )

  // the fastest and the slowest to lock in, on average (only with someone to compare with)
  const locks = per((id) => cardsOf(id).flatMap((c) => (c.lockMs == null ? [] : [c.lockMs])))
  const lockMeans = new Map([...locks].filter(([, l]) => enough(l.length)).map(([id, l]) => [id, mean(l)]))
  if (lockMeans.size >= 2) {
    add('gut_feeling', rounded(unique(lockMeans, 'min'), 1000))
    add('last_minute', rounded(unique(lockMeans, 'max'), 1000))
  }

  // on the other side of the truth from everyone else (at least two others, all on one side)
  add(
    'contrarian',
    unique(
      counts(
        per(
          (id) =>
            rounds.filter((r) => {
              const mine = r.cards.find((c) => c.playerId === id)?.direction
              const others = r.cards.filter((c) => c.playerId !== id && (c.direction === 'high' || c.direction === 'low'))
              if ((mine !== 'high' && mine !== 'low') || others.length < 2) return false
              return others.every((c) => c.direction !== mine)
            }).length,
        ),
      ),
      'max',
    ),
  )

  // the boldest single miss: ten times off or more
  const misses = per((id) => Math.max(0, ...cardsOf(id).flatMap((c) => (c.err === null ? [] : [c.err]))))
  const bold = unique(new Map([...misses].filter(([, e]) => e >= 1)), 'max')
  add('bold_estimator', bold && { playerId: bold.playerId, value: 10 ** bold.value })

  // the closest to the swarm on average: FerMEANie's favourite (only rounds she played)
  const twin = per((id) =>
    rounds.flatMap((r) => {
      const v = r.cards.find((c) => c.playerId === id)?.value
      const fer = r.fermeanie?.value
      return v && v > 0 && fer ? [Math.abs(Math.log10(v / fer))] : []
    }),
  )
  const twinBest = unique(new Map([...twin].filter(([, d]) => enough(d.length)).map(([id, d]) => [id, mean(d)])), 'min')
  // exactly the swarm every time (the median player in every round) would read "exact from the swarm": not an award
  if (twinBest && 10 ** twinBest.value >= 1.0005) add('swarm_twin', { playerId: twinBest.playerId, value: 10 ** twinBest.value })

  // the biggest climb: from their lowest place during the game (not the last round) to their place at the end
  if (rounds.length >= 3 && ids.length >= 3 && rounds.every((r) => r.scoresAfter)) {
    const places = rounds.map((r) => {
      const score = (id: string) => r.scoresAfter![id] ?? 0
      return new Map(ids.map((id) => [id, 1 + ids.filter((o) => score(o) > score(id)).length]))
    })
    const end = places.at(-1)!
    const climbs = per((id) => Math.max(...places.slice(0, -1).map((p) => p.get(id)!)) - end.get(id)!)
    add('comeback', unique(new Map([...climbs].filter(([, c]) => c >= 2)), 'max'))
  }

  // always too high, or always too low: at least three times, and two answers in three
  for (const [kind, side] of [
    ['optimist', 'high'],
    ['pessimist', 'low'],
  ] as const) {
    const sided = per((id) => {
      const dirs = cardsOf(id).flatMap((c) => (c.direction === 'high' || c.direction === 'low' ? [c.direction] : []))
      const n = dirs.filter((d) => d === side).length
      return n >= 3 && n >= (dirs.length * 2) / 3 ? n : 0
    })
    add(kind, unique(counts(sided), 'max'))
  }

  // the biggest improvement from the first half of the game to the second: at least twice as close
  const half = rounds.length / 2
  const bloom = per((id) => {
    const at = (from: number, to: number) =>
      rounds.slice(from, to).flatMap((r) => r.cards.filter((c) => c.playerId === id && c.err !== null).map((c) => c.err!))
    const [early, late] = [at(0, Math.floor(half)), at(Math.ceil(half), rounds.length)]
    return early.length >= 2 && late.length >= 2 ? mean(early) - mean(late) : 0
  })
  const bloomBest = unique(new Map([...bloom].filter(([, d]) => d >= Math.log10(2))), 'max')
  add('late_bloomer', bloomBest && { playerId: bloomBest.playerId, value: 10 ** bloomBest.value })

  // one line of working, again and again
  add(
    'one_liner',
    unique(
      counts(
        per((id) => {
          const n = cardsOf(id).filter((c) => c.text.trim() && workingLines(c.text) === 1).length
          return enough(n) ? n : 0
        }),
      ),
      'max',
    ),
  )

  // answers like 5 000 or 2 million: one significant digit, at least three times and in half their answers
  const round = (v: number) => {
    const m = v / 10 ** Math.floor(Math.log10(v))
    return Math.abs(m - Math.round(m)) < 1e-9
  }
  add(
    'round_numbers',
    unique(
      counts(
        per((id) => {
          const values = cardsOf(id).flatMap((c) => (c.value && c.value > 0 ? [c.value] : []))
          const n = values.filter(round).length
          return n >= 3 && n >= values.length / 2 ? n : 0
        }),
      ),
      'max',
    ),
  )

  // within twice the truth, but never quite a bullseye: at least twice
  add(
    'near_miss',
    unique(
      counts(
        per((id) => {
          // "never quite a bullseye": a player with one doesn't qualify
          const mine = cardsOf(id)
          const n = mine.filter((c) => c.bonusKind === 'close').length
          return n >= 2 && !mine.some((c) => c.bonusKind === 'bullseye') ? n : 0
        }),
      ),
      'max',
    ),
  )

  // knew which way they were wrong: the most right calls, at least three
  add(
    'hindsight',
    unique(
      counts(
        per((id) => {
          const n = rounds.filter((r) => callRight(r.calls?.[id], r.cards.find((c) => c.playerId === id)?.direction ?? null)).length
          return n >= 3 ? n : 0
        }),
      ),
      'max',
    ),
  )

  // the most points lost to the swarm
  add('swarm_donor', unique(counts(per((id) => cardsOf(id).reduce((n, c) => n + (c.stolen ?? 0), 0))), 'max'))

  return out
}

/** A seeded shuffle, so a game's awards are the same on every screen and in its recap. */
function shuffled<T>(xs: T[], seed: string): T[] {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  const rand = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
  const out = [...xs]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * The awards a game gives: up to `max`, in an order fixed by `seed` (the game's id), each to a different player.
 * Awards in `recent` (given in the room's previous game) only come up when nothing else qualifies, so a group playing
 * again hears different ones.
 */
export function pickAwards(rounds: AwardRound[], seed: string, max = MAX_AWARDS, recent: AwardKind[] = []): Award[] {
  const order = shuffled(awardWinners(rounds), seed)
  const fresh = [...order.filter((a) => !recent.includes(a.kind)), ...order.filter((a) => recent.includes(a.kind))]
  const picked: Award[] = []
  for (const a of fresh) {
    if (picked.length >= max) break
    if (!picked.some((p) => p.playerId === a.playerId)) picked.push(a)
  }
  return picked
}
