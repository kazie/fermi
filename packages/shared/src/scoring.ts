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

const PI = '3.141592'
const PIE_EVERY = 5
/** A named release every 5 wins, in alphabetical order (like Android's desserts). */
export const PIE_RELEASES = [
  'Apple Pie',
  'Banoffee Pie',
  'Cherry Pie',
  'Deep Dish Pie',
  'Egg Custard Pie',
  'Fish Pie',
  'Gooseberry Pie',
  'Hand Pie',
  'Key Lime Pie',
  'Lemon Meringue Pie',
  'Mud Pie',
  'Pecan Pie',
  'Pumpkin Pie',
  'Quiche',
  'Rhubarb Pie',
  'Shepherd’s Pie',
  'Sweet Potato Pie',
  'Whoopie Pie',
] as const

/** `v3.14` with no wins, gaining a digit of π per win up to `v3.141592…`. */
export function fermeanieVersion(wins: number): string {
  const decimals = 2 + Math.max(0, wins)
  return decimals > PI.length - 2 ? `v${PI}…` : `v${PI.slice(0, 2 + decimals)}`
}

/** FerMEANie's release after `wins` wins: version, win count and, from the fifth win, the pie. */
export function fermeanieRelease(wins: number): { version: string; wins: number; codename?: string } {
  const codename = fermeanieCodename(wins)
  return { version: fermeanieVersion(wins), wins, ...(codename ? { codename } : {}) }
}

/** True when this win count starts a new pie release. */
export function isPieRelease(wins: number): boolean {
  return wins > 0 && wins % PIE_EVERY === 0
}

/** The current pie release ("Cherry Pie"); none before the fifth win. After the last pie, they repeat as "Apple Pie II". */
export function fermeanieCodename(wins: number): string | undefined {
  const release = Math.floor(wins / PIE_EVERY) - 1
  if (release < 0) return undefined
  const lap = Math.floor(release / PIE_RELEASES.length)
  const name = PIE_RELEASES[release % PIE_RELEASES.length]
  return lap ? `${name} ${roman(lap + 1)}` : name
}

function roman(n: number): string {
  const ones = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX']
  return 'X'.repeat(Math.floor(n / 10)) + ones[n % 10]
}
