import { describe, expect, it } from 'vitest'
import { REACTION_BURST, REACTION_GAP_MS, REACTION_WINDOW_MS, reactionRest, reactionSent } from '../src/protocol.ts'

/** A player reacting as fast as they're allowed, from t = 0: when each reaction goes out. */
function spam(n: number) {
  let sent: number[] = []
  const times: number[] = []
  for (let i = 0; i < n; i++) {
    const t = Math.max(0, reactionRest(sent).until)
    times.push(t)
    sent = reactionSent(sent, t)
  }
  return times
}

describe('reaction limits', () => {
  it('lets the first reaction through at once, then waits the gap', () => {
    expect(reactionRest([]).until).toBe(-Infinity)
    expect(reactionRest([1000]).until).toBe(1000 + REACTION_GAP_MS)
  })

  it('cools a spammer down until the oldest of a full burst leaves the window', () => {
    const times = spam(REACTION_BURST + 2)
    expect(times.slice(0, REACTION_BURST)).toEqual(Array.from({ length: REACTION_BURST }, (_, i) => i * REACTION_GAP_MS))
    expect(times[REACTION_BURST]).toBe(REACTION_WINDOW_MS)
    expect(times[REACTION_BURST + 1]).toBe(REACTION_GAP_MS + REACTION_WINDOW_MS)
  })

  it('keeps only what it needs', () => {
    expect(reactionSent([1, 2, 3, 4, 5], 6)).toHaveLength(REACTION_BURST)
  })

  it('says when the burst limit is the one in force', () => {
    const times = spam(REACTION_BURST)
    expect(reactionRest(times.slice(0, -1)).burst).toBe(false)
    expect(reactionRest(times)).toEqual({ until: REACTION_WINDOW_MS, burst: true })
  })
})
