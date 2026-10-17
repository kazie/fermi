import { crowdEstimate, type CrowdStats } from './crowd.ts'

/** Points per rank step: last gets 100, first gets 100 × N. */
export const RANK_POINTS = 100
export const BULLSEYE_RATIO = 1.1
export const BULLSEYE_BONUS = 100
export const CLOSE_RATIO = 2
export const CLOSE_BONUS = 50
/** A dunce cap needs the answer to be at least this many orders of magnitude off the truth. */
export const DUNCE_MIN_ORDERS = 3

const EPS = 1e-12

/** Orders of magnitude off: |log10(guess / answer)|. Non-positive guesses are infinitely wrong. */
export function logError(guess: number, answer: number): number {
  if (!(guess > 0) || !Number.isFinite(guess)) return Infinity
  return Math.abs(Math.log10(guess / answer))
}

export type DunceKind = 'mild' | 'severe' | 'cosmic' | 'nonpositive'

export function dunceSeverity(err: number): Exclude<DunceKind, 'nonpositive'> {
  return err > 12 ? 'cosmic' : err > 6 ? 'severe' : 'mild'
}

export interface Entry {
  playerId: string
  /** null = no (valid) answer */
  value: number | null
}

export interface PlayerResult {
  playerId: string
  value: number | null
  err: number | null
  /** 10^err, i.e. "3.2× too high" */
  factor: number | null
  direction: 'high' | 'low' | 'exact' | null
  rank: number | null
  basePoints: number
  bonus: number
  bonusKind: 'bullseye' | 'close' | null
  /** Points the player keeps (0 if FerMEANie stole the round). */
  points: number
  /** Points FerMEANie took from this player. */
  stolen: number
  dunce: DunceKind | null
}

export interface RoundScore {
  results: PlayerResult[]
  crowd: CrowdStats | null
  fermeanie: {
    value: number
    err: number
    factor: number
    direction: 'high' | 'low' | 'exact'
    beatsAll: boolean
    points: number
  } | null
  bestErr: number | null
}

/** Same threshold formatFactor uses for "exact" (factor < 1.0005), so cards never say "exact too high". */
const EXACT_ERR = Math.log10(1.0005)

function direction(value: number, answer: number, err: number): 'high' | 'low' | 'exact' {
  if (err < EXACT_ERR) return 'exact'
  return value > answer ? 'high' : 'low'
}

export function scoreRound(answer: number, entries: Entry[]): RoundScore {
  const answered = entries.filter((e) => e.value !== null)
  const n = answered.length
  const errs = new Map<string, number>()
  for (const e of answered) errs.set(e.playerId, logError(e.value as number, answer))

  const crowd = crowdEstimate(entries.map((e) => e.value))
  const outlierIds = new Set((crowd?.outliers ?? []).map((i) => entries[i].playerId))

  const results: PlayerResult[] = entries.map((e) => {
    if (e.value === null) {
      return {
        playerId: e.playerId,
        value: null,
        err: null,
        factor: null,
        direction: null,
        rank: null,
        basePoints: 0,
        bonus: 0,
        bonusKind: null,
        points: 0,
        stolen: 0,
        dunce: null,
      }
    }
    const err = errs.get(e.playerId)!
    let better = 0
    for (const other of errs.values()) if (other < err - EPS) better++
    const rank = better + 1
    const basePoints = RANK_POINTS * (n - rank + 1)
    const bonusKind = err <= Math.log10(BULLSEYE_RATIO) + EPS ? 'bullseye' : err <= Math.log10(CLOSE_RATIO) + EPS ? 'close' : null
    const bonus = bonusKind === 'bullseye' ? BULLSEYE_BONUS : bonusKind === 'close' ? CLOSE_BONUS : 0
    let dunce: DunceKind | null = null
    if (!(e.value > 0)) dunce = 'nonpositive'
    else if (outlierIds.has(e.playerId) && err >= DUNCE_MIN_ORDERS) dunce = dunceSeverity(err)
    return {
      playerId: e.playerId,
      value: e.value,
      err: Number.isFinite(err) ? err : null,
      factor: Number.isFinite(err) ? 10 ** err : null,
      direction: Number.isFinite(err) ? direction(e.value, answer, err) : null,
      rank,
      basePoints,
      bonus,
      bonusKind,
      points: basePoints + bonus,
      stolen: 0,
      dunce,
    }
  })

  const bestErr = answered.length ? Math.min(...errs.values()) : null
  let fermeanie: RoundScore['fermeanie'] = null
  if (crowd) {
    const err = logError(crowd.official, answer)
    const beatsAll = bestErr === null || err < bestErr - EPS
    let points = 0
    if (beatsAll) {
      for (const r of results) {
        r.stolen = r.points
        points += r.points
        r.points = 0
      }
    }
    fermeanie = { value: crowd.official, err, factor: 10 ** err, direction: direction(crowd.official, answer, err), beatsAll, points }
  }

  return { results, crowd, fermeanie, bestErr: bestErr !== null && Number.isFinite(bestErr) ? bestErr : null }
}

// ---------- FerMEANie's version easter egg ----------

export const PI_DIGITS =
  '3.1415926535897932384626433832795028841971693993751058209749445923078164062862089986280348253421170679821480865132823066470938446095505822317253594081284811174502841027019385211055596446229489549303819644288109756659334461284756482337867831652712019091456485669234603486104543266482133936072602491412737245870066063155881748815209209628292540917153643678925903600113305305488204665213841469519415116094330572703657595919530921861173819326117931051185480744623799627495673518857527248912279381830119491'

/** `v3.14` with no wins, gaining one digit of π per win. */
export function fermeanieVersion(wins: number): string {
  return 'v' + PI_DIGITS.slice(0, Math.min(PI_DIGITS.length, 4 + Math.max(0, wins)))
}
