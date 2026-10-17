import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { players, reveals } from '../src/fixtures/rooms'
import { flippedCount, STEAL, stealPlan } from '../src/lib/reveal'
import { pickWelcome } from '../src/lib/welcome'
import { tween } from '../src/composables/useProgress'
import RevealSequence from '../src/components/RevealSequence.vue'
import { welcome } from '../../../content/fermeanie-lines.json'

const mountAt = (r: ReturnType<typeof reveals.normal>, now: number) =>
  mount(RevealSequence, { props: { reveal: r, players: players(r.cards.length), you: 'p0', now, fermeanieBefore: 0, noScroll: true } })

describe('reveal suspense', () => {
  it('only pins the answers whose cards have flipped, and counts the rest', () => {
    const r = reveals.normal()
    const before = mountAt(r, r.timeline.truthAt)
    expect(before.findAll('.pin')).toHaveLength(0)
    expect(before.findAll('.pending .chip')).toHaveLength(r.cards.length)

    const mid = mountAt(r, r.cards[1].at)
    expect(flippedCount(r, r.cards[1].at)).toBe(2)
    expect(mid.findAll('.pin')).toHaveLength(2)
    expect(mid.findAll('.pending .chip')).toHaveLength(r.cards.length - 2)
    // face-down cards don't show whose they are
    expect(mid.findAll('.ac:not(.flipped)').every((c) => !c.text().includes(r.cards[3].name))).toBe(true)

    const end = mountAt(r, r.timeline.fermeanieAt)
    expect(end.findAll('.pin')).toHaveLength(r.cards.filter((c) => c.value !== null).length)
    expect(end.find('.pending').exists()).toBe(false)
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

describe('name screen', () => {
  it('picks a welcome line from the pool', () => {
    expect(welcome.length).toBeGreaterThanOrEqual(10)
    expect(pickWelcome(() => 0)).toBe(welcome[0])
    expect(pickWelcome(() => 0.9999)).toBe(welcome[welcome.length - 1])
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
