import { describe, expect, it } from 'vitest'
import { resting } from '../grow-report.ts'
import { parseIdeas, planPrompt } from '../plan.ts'

describe('planner', () => {
  it('reads ideas from a reply, keeping only well-formed ones', () => {
    const reply =
      'Here you go:\n```json\n[{"id": "Fake-Idea", "idea": " How many fakes? ", "source": "Fake office"},' +
      ' {"idea": "no id"}, {"id": "t-1", "idea": "Slot", "template": {"id": "tmpl", "slot": "Paris"}}]\n```'
    expect(parseIdeas(reply)).toEqual([
      { id: 'fake-idea', idea: 'How many fakes?', source: 'Fake office' },
      { id: 't-1', idea: 'Slot', template: { id: 'tmpl', slot: 'Paris' } },
    ])
    expect(parseIdeas('no ideas today')).toBeNull()
    expect(parseIdeas('[]')).toBeNull()
  })
  it('lists what to avoid in the prompt', () => {
    const p = planPrompt('food', 4, ['Existing one?'], [])
    expect(p).toContain('List 4 ideas for the category "food"')
    expect(p).toContain('- Existing one?')
    expect(p).toContain('Ideas already tried in this run:\n(none)')
  })
})

describe('resting categories', () => {
  const now = Date.parse('2026-10-24T12:00:00Z')
  const run = (hoursAgo: number, added: number) => ({ at: new Date(now - hoursAgo * 3600_000).toISOString(), added })
  it('rests a category after two thin runs within a day', () => {
    expect(resting([run(3, 1), run(1, 0)], now)).toBe(true)
  })
  it("doesn't rest it after one thin run, a good run, or once a day has passed", () => {
    expect(resting([run(1, 0)], now)).toBe(false)
    expect(resting([run(3, 0), run(1, 4)], now)).toBe(false)
    expect(resting([run(30, 0), run(1, 0)], now)).toBe(false)
    expect(resting(undefined, now)).toBe(false)
  })
})
