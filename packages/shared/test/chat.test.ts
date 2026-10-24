import { describe, expect, it } from 'vitest'
import { chatDuration, holdDuration, messageStarts, speechDuration } from '../src/chat.ts'
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
  it('with a voice, keeps each message up until she has said it, and the stage until she has said the last one', () => {
    const chat = ['Twins. Two of you said the same thing, which is not a strategy.', 'I win this round.']
    const [first, second] = messageStarts(chat, { paced: true })
    expect(second - first).toBeGreaterThan(speechDuration(chat[0]))
    const l = lines({ twins: chat[0], verdict: chat[1] })
    expect(fermeanieStageMs(l, null, 0, { paced: true })).toBeGreaterThan(second + speechDuration(chat[1]))
    expect(holdDuration('Hi.', true, true)).toBe(HOLD_MS)
  })
  it('after a steal with nothing to say, still gives a moment to see the points land', () => {
    const stage = fermeanieStageMs({ dunce: {}, verdict: '' }, 8, 0)
    expect(stage).toBe(stealTiming(8).doneAt + HOLD_MS)
  })
  it('without a voice, keeps the plain reading pause', () => {
    const long = 'Twins. Two of you said the same thing, which is not a strategy, and I have notes.'
    expect(holdDuration(long, false)).toBe(HOLD_MS)
    expect(holdDuration(long, false, true)).toBeGreaterThan(HOLD_MS)
  })
  it('estimates more time for more sentences and characters, and for numbers read out', () => {
    expect(speechDuration('One. Two.')).toBeGreaterThan(speechDuration('One two.'))
    expect(speechDuration('x'.repeat(100))).toBeGreaterThan(speechDuration('x'.repeat(50)))
    expect(speechDuration('Off by 3.2 × 10⁻⁵.')).toBeGreaterThan(speechDuration('Off by abcdefghijk.') + 500)
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
