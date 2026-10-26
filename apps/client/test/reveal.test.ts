import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { players, reveals } from '@/fixtures/rooms.ts'
import { STEAL } from '@fermi/shared'
import { flippedCount, stealPlan } from '@/lib/reveal.ts'
import { tween } from '@/composables/useProgress.ts'
import RevealSequence from '../src/components/RevealSequence.vue'

const mountAt = (r: ReturnType<typeof reveals.normal>, now: number) =>
  mount(RevealSequence, { props: { reveal: r, players: players(r.cards.length), you: 'p0', now, fermeanieBefore: 0, noScroll: true } })

describe('reveal suspense', () => {
  it('puts every answer on the line as an unnamed dot, and names each as its card flips', () => {
    const r = reveals.normal()
    const answered = r.cards.filter((c) => c.value !== null)
    const lineText = (w: ReturnType<typeof mountAt>) => w.find('.nl').text()

    const before = mountAt(r, r.timeline.truthAt)
    expect(before.findAll('.pin')).toHaveLength(answered.length)
    for (const c of r.cards) expect(lineText(before)).not.toContain(c.name) // nobody's name yet

    const mid = mountAt(r, r.cards[1].at)
    expect(flippedCount(r, r.cards[1].at)).toBe(2)
    expect(mid.findAll('.pin')).toHaveLength(answered.length)
    expect(lineText(mid)).toContain(r.cards[0].name)
    expect(lineText(mid)).toContain(r.cards[1].name)
    expect(lineText(mid)).not.toContain(r.cards[3].name)
    // face-down cards don't show whose they are
    expect(mid.findAll('.ac:not(.flipped)').every((c) => !c.text().includes(r.cards[3].name))).toBe(true)

    const end = mountAt(r, r.timeline.fermeanieAt)
    expect(end.findAll('.pin.anon')).toHaveLength(0)
    for (const c of answered) expect(lineText(end)).toContain(c.name)
  })

  it('marks the statistic FerMEANie played', () => {
    const r = reveals.normal()
    const w = mountAt(r, r.timeline.fermeanieAt + 100)
    const picked = w.findAll('.nerd .picked')
    expect(picked).toHaveLength(1)
    expect(picked[0].text()).toContain(r.crowd!.method === 'median' ? 'median' : 'geomean')
  })
})

describe('the steal', () => {
  it('takes every victim’s points one by one, furthest first, then lands the verdict', () => {
    const r = reveals.steal()
    const plan = stealPlan(r)!
    const victims = r.cards.filter((c) => c.stolen > 0).map((c) => c.playerId)
    expect(Object.keys(plan.starts)).toEqual(victims)
    const starts = victims.map((id) => plan.starts[id])
    expect(starts[0]).toBe(STEAL.lead)
    expect(starts.every((s, i) => i === 0 || s > starts[i - 1])).toBe(true)
    expect(plan.doneAt).toBe(starts[starts.length - 1] + STEAL.flight)
    expect(plan.doneAt).toBeLessThan(4000)
  })

  it('has no plan when a human wins', () => {
    expect(stealPlan(reveals.normal())).toBeNull()
  })

  it('drains the cards as their points leave, and stamps the verdict at the end', () => {
    const r = reveals.steal()
    const plan = stealPlan(r)!
    const at = (t: number) => mountAt(r, r.timeline.fermeanieAt + t)
    expect(at(0).findAll('.ac.stolen')).toHaveLength(0)
    expect(at(0).find('.verdict').exists()).toBe(false)
    const first = r.cards.find((c) => c.stolen > 0)!
    expect(at(plan.starts[first.playerId]).findAll('.ac.stolen')).toHaveLength(1)
    const done = at(plan.doneAt)
    expect(done.findAll('.ac.stolen')).toHaveLength(Object.keys(plan.starts).length)
    expect(done.find('.verdict.steal').text()).toContain(String(r.fermeanie!.points))
  })
})

describe('tween', () => {
  it('starts and ends exactly on the scores', () => {
    expect(tween(100, 1500, 0)).toBe(100)
    expect(tween(100, 1500, 1)).toBe(1500)
    expect(tween(100, 1500, 2)).toBe(1500)
    const mid = tween(100, 1500, 0.5)
    expect(mid).toBeGreaterThan(800) // eased out: most of the way there by halfway
    expect(mid).toBeLessThan(1500)
  })
})
