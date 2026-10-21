import { describe, expect, it } from 'vitest'
import { chatDuration } from '../src/chat.ts'
import { plainText } from '../src/markup.ts'
import {
  fermeanieStageMs,
  HOLD_MS,
  REVEAL_TIMING,
  revealChat,
  revealDuration,
  stealTiming,
  TYPICAL_FERMEANIE_MS,
  type RevealView,
} from '../src/index.ts'

const long = 'x'.repeat(300)
const lines = (extra: Partial<RevealView['lines']> = {}): RevealView['lines'] => ({ dunce: {}, verdict: 'Beaten.', ...extra })

describe("FerMEANie's reveal stage", () => {
  it('chats in a fixed order and leaves out missing lines', () => {
    expect(revealChat(lines({ twins: 'T', bullseye: 'B', ruleChange: 'R', dunceGroup: 'D' }))).toEqual(['T', 'B', 'R', 'D', 'Beaten.'])
    expect(revealChat(lines())).toEqual(['Beaten.'])
  })
  it('lasts at least the usual stage', () => {
    expect(fermeanieStageMs(lines(), null)).toBe(REVEAL_TIMING.fermeanie)
  })
  it('is long enough for the steal, every message and a moment to read the last one', () => {
    const l = lines({ twins: long, ruleChange: long, dunceGroup: long, verdict: long })
    const stage = fermeanieStageMs(l, 8)
    expect(stage).toBeGreaterThanOrEqual(stealTiming(8).doneAt + chatDuration(revealChat(l).map(plainText)) + HOLD_MS)
    expect(stage).toBeGreaterThan(REVEAL_TIMING.fermeanie)
  })
  it('estimates a round with a typical chat, longer than the minimum stage', () => {
    expect(TYPICAL_FERMEANIE_MS).toBeGreaterThan(REVEAL_TIMING.fermeanie)
    const t = REVEAL_TIMING
    expect(revealDuration(4)).toBe(t.numberLine + t.truth + 4 * t.cardEach + TYPICAL_FERMEANIE_MS + t.scoreboard)
  })
  it('counts visible characters, not markup', () => {
    expect(plainText('*bold* move')).toBe('bold move')
  })
})
