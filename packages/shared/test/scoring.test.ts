import { describe, expect, it } from 'vitest'
import {
  crowdEstimate,
  fermeanieCodename,
  fermeanieVersion,
  isPieRelease,
  logError,
  PIE_RELEASES,
  scoreRound,
  roundMultiplier,
  ClientMessageSchema,
  estimateGameMinutes,
  introDuration,
} from '../src/index.ts'

const entries = (...values: (number | null)[]) => values.map((value, i) => ({ playerId: `p${i}`, value }))

describe('logError', () => {
  it('is symmetric in ratio', () => {
    expect(logError(200, 100)).toBeCloseTo(logError(50, 100), 12)
    expect(logError(100, 100)).toBe(0)
  })
  it('treats non-positive guesses as infinitely wrong', () => {
    expect(logError(0, 100)).toBe(Infinity)
    expect(logError(-5, 100)).toBe(Infinity)
  })
})

describe('crowdEstimate', () => {
  it('needs at least 3 positive answers', () => {
    expect(crowdEstimate([1, 2])).toBeNull()
    expect(crowdEstimate([1, 2, 0, null, -4])).toBeNull()
  })
  it('uses the geometric mean without outliers', () => {
    const c = crowdEstimate([10, 100, 1000])!
    expect(c.method).toBe('geomean')
    expect(c.official).toBeCloseTo(100, 9)
    expect(c.median).toBeCloseTo(100, 9)
    expect(c.mean).toBeCloseTo(370, 9)
    expect(c.outliers).toEqual([])
  })
  it('switches to the median when someone types 1e99', () => {
    const c = crowdEstimate([100, 200, 150, 1e99])!
    expect(c.method).toBe('median')
    expect(c.outliers).toEqual([3])
    expect(c.official).toBeCloseTo(c.median, 9)
    expect(c.official).toBeLessThan(1000)
  })
  it('does not flag a merely bold answer (2 orders of magnitude)', () => {
    const c = crowdEstimate([100, 200, 150, 10_000])!
    expect(c.method).toBe('geomean')
  })
  it('a widely spread crowd tolerates spread (MAD scaling)', () => {
    const c = crowdEstimate([1, 1e2, 1e4, 1e6, 1e8])!
    expect(c.outliers).toEqual([])
  })
  it('ignores non-positive values', () => {
    const c = crowdEstimate([0, 10, 100, 1000, -1])!
    expect(c.count).toBe(3)
    expect(c.outliers).toEqual([])
  })
})

describe('scoreRound', () => {
  it('ranks by orders of magnitude and awards bonuses', () => {
    const r = scoreRound(100, entries(105, 300, 20))
    const [a, b, c] = r.results
    expect(a.rank).toBe(1)
    expect(a.bonusKind).toBe('bullseye')
    expect(a.basePoints).toBe(300)
    expect(b.rank).toBe(2)
    expect(c.rank).toBe(3)
    expect(b.direction).toBe('high')
    expect(c.direction).toBe('low')
    expect(c.factor).toBeCloseTo(5, 9)
  })
  it('2× too high and 2× too low tie', () => {
    const r = scoreRound(100, entries(200, 50, 1000))
    expect(r.results[0].rank).toBe(1)
    expect(r.results[1].rank).toBe(1)
    expect(r.results[2].rank).toBe(3)
    expect(r.results[0].basePoints).toBe(300)
    expect(r.results[0].bonusKind).toBe('close')
  })
  it('no-answers score nothing and are not ranked', () => {
    const r = scoreRound(100, entries(100, null))
    expect(r.results[1]).toMatchObject({ rank: null, points: 0, value: null })
    expect(r.results[0].basePoints).toBe(100)
    expect(r.fermeanie).toBeNull()
  })
  it('FerMEANie steals the round when the crowd beats every human', () => {
    // geomean of 10 and 1000 and 100_000 → 1000; truth 1000; nobody else is exact
    const r = scoreRound(900, entries(10, 1000 * 3, 100_000 / 3))
    const humanBest = Math.min(...r.results.map((x) => x.err!))
    expect(r.fermeanie!.err).toBeLessThan(humanBest)
    expect(r.fermeanie!.beatsAll).toBe(true)
    const total = r.results.reduce((a, x) => a + x.stolen, 0)
    expect(r.fermeanie!.points).toBe(total)
    expect(total).toBeGreaterThan(0)
    expect(r.results.every((x) => x.points === 0)).toBe(true)
  })
  it('the final round counts double: rank points, bonuses and the steal', () => {
    expect([0, 3, 4].map((i) => roundMultiplier(i, 5))).toEqual([1, 1, 2])
    const once = scoreRound(100, entries(105, 300, 20))
    const twice = scoreRound(100, entries(105, 300, 20), 2)
    expect(twice.results.map((x) => [x.basePoints, x.bonus, x.points])).toEqual(
      once.results.map((x) => [x.basePoints * 2, x.bonus * 2, x.points * 2]),
    )
    const steal = scoreRound(900, entries(10, 1000 * 3, 100_000 / 3), 2)
    expect(steal.fermeanie!.beatsAll).toBe(true)
    expect(steal.fermeanie!.points).toBeGreaterThan(0)
    expect(steal.fermeanie!.points).toBe(2 * scoreRound(900, entries(10, 1000 * 3, 100_000 / 3)).fermeanie!.points)
  })
  it('ties go to the humans', () => {
    const r = scoreRound(100, entries(100, 100, 100))
    expect(r.fermeanie!.beatsAll).toBe(false)
    expect(r.results[0].points).toBeGreaterThan(0)
  })
  it('dunce caps outliers that are also way off the truth, by severity', () => {
    const r = scoreRound(100, entries(120, 80, 150, 1e99, 0))
    expect(r.crowd!.method).toBe('median')
    expect(r.results[3].dunce).toBe('cosmic')
    expect(r.results[4].dunce).toBe('nonpositive')
    expect(r.results[0].dunce).toBeNull()
    expect(scoreRound(100, entries(120, 80, 150, 1e7)).results[3].dunce).toBe('mild')
    expect(scoreRound(100, entries(120, 80, 150, 1e10)).results[3].dunce).toBe('severe')
  })
  it('a lonely genius is an outlier but gets no dunce cap', () => {
    const r = scoreRound(1e9, entries(10, 20, 15, 1e9))
    expect(r.crowd!.outliers).toEqual([3])
    expect(r.results[3].dunce).toBeNull()
    expect(r.results[3].rank).toBe(1)
  })
})

describe('FerMEANie version', () => {
  it('grows by one digit of pi per win, up to six decimals', () => {
    expect([0, 1, 3, 4, 5, 500].map(fermeanieVersion)).toEqual(['v3.14', 'v3.141', 'v3.14159', 'v3.141592', 'v3.141592…', 'v3.141592…'])
  })

  it('names a pie release every fifth win, repeating with a numeral after the last pie', () => {
    expect([0, 4, 5, 9, 10].map(fermeanieCodename)).toEqual([undefined, undefined, 'Apple Pie', 'Apple Pie', 'Banoffee Pie'])
    expect(fermeanieCodename(5 * PIE_RELEASES.length)).toBe(PIE_RELEASES.at(-1))
    expect(fermeanieCodename(5 * (PIE_RELEASES.length + 1))).toBe('Apple Pie II')
    expect([0, 1, 5, 7, 10].map(isPieRelease)).toEqual([false, false, true, false, true])
  })
})

describe('protocol', () => {
  it('validates and trims names', () => {
    expect(ClientMessageSchema.parse({ type: 'join', name: '  Ada   L ' })).toEqual({ type: 'join', name: 'Ada L' })
    expect(() => ClientMessageSchema.parse({ type: 'join', name: '   ' })).toThrow()
  })
  it('validates settings', () => {
    expect(() => ClientMessageSchema.parse({ type: 'settings', rounds: 7, timerSec: 60 })).toThrow()
    expect(ClientMessageSchema.parse({ type: 'settings', rounds: 10, timerSec: 30 })).toBeTruthy()
  })
  it('estimates game length, counting timed breaks only', () => {
    const settings = { rounds: 10, timerSec: 60, breakSec: 0, pacing: 'timer' as const, intro: 'off' as const }
    expect(estimateGameMinutes(settings, 4)).toBeGreaterThan(10)
    expect(estimateGameMinutes({ ...settings, breakSec: 60 }, 4)).toBe(estimateGameMinutes(settings, 4) + 9)
    expect(estimateGameMinutes({ ...settings, breakSec: 60, pacing: 'host' }, 4)).toBe(estimateGameMinutes(settings, 4))
  })
  it('counts the intro: about two minutes in full, less when short', () => {
    expect(introDuration('off', 5)).toBe(0)
    expect(introDuration('short', 5)).toBeLessThan(introDuration('full', 5))
    expect(introDuration('full', 5)).toBeGreaterThan(90_000)
    expect(introDuration('full', 5)).toBeLessThan(150_000)
  })
  it('accepts pacing and the Next message', () => {
    expect(ClientMessageSchema.parse({ type: 'settings', rounds: 10, timerSec: 30, pacing: 'host' })).toMatchObject({ pacing: 'host' })
    expect(() => ClientMessageSchema.parse({ type: 'settings', rounds: 10, timerSec: 30, pacing: 'never' })).toThrow()
    expect(ClientMessageSchema.parse({ type: 'next' })).toEqual({ type: 'next' })
  })
})

describe('exact threshold matches formatting', () => {
  it('1.00047× is exact, not "exact too high"', () => {
    const r = scoreRound(1_000_000, entries(1_000_470))
    expect(r.results[0].direction).toBe('exact')
  })
})
