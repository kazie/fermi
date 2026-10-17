import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import BreakScreen from '../src/components/BreakScreen.vue'
import ControllerReveal from '../src/components/ControllerReveal.vue'
import { breakRoom, players, reveals } from '../src/fixtures/rooms'
import { savedPhoneView, savePhoneView } from '../src/lib/storage'

describe('ControllerReveal (phone with a big screen)', () => {
  const r = reveals.dunce()
  const mine = r.cards.findIndex((c) => c.playerId === 'p3')
  const at = (now: number) => mount(ControllerReveal, { props: { reveal: r, players: players(5), you: 'p3', now } })

  it('shows only your own card, once it has flipped', () => {
    const before = at(r.cards[0].at + 10)
    expect(before.findAll('.ac')).toHaveLength(0)
    expect(before.text()).toContain('Your card is coming up')
    const after = at(r.cards[mine].at + 10)
    expect(after.findAll('.ac')).toHaveLength(1)
    expect(after.find('.ac').attributes('data-steal-from')).toBe('p3')
    expect(after.text()).toContain('Look at the big screen')
  })

  it('ends with your score and rank', () => {
    const w = at(r.timeline.scoreboardAt + 10)
    expect(w.text()).toContain(String(r.scoresAfter.p3))
    expect(w.text()).toMatch(/#\d/)
  })
})

describe('BreakScreen', () => {
  it('lets you vote once and shows the count', async () => {
    const room = breakRoom({ votes: 1 })
    const w = mount(BreakScreen, { props: { room, now: room.break!.startedAt + 1000 } })
    expect(w.text()).toContain('Discuss! Next question in 22s')
    await w.find('.skip').trigger('click')
    expect(w.emitted('skip')).toHaveLength(1)
    const voted = breakRoom({ votes: 2, youVoted: true })
    const v = mount(BreakScreen, { props: { room: voted, now: voted.break!.startedAt } })
    expect(v.find('.skip').attributes('disabled')).toBeDefined()
    expect(v.text()).toContain('Waiting for others · 2/3')
  })
  it('the big screen has no button, just the tally', () => {
    const room = breakRoom({ votes: 2 })
    const w = mount(BreakScreen, { props: { room, now: room.break!.startedAt, variant: 'tv' } })
    expect(w.find('.skip').exists()).toBe(false)
    expect(w.text()).toContain('2 of 3 want to skip')
  })
})

describe('phone view preference', () => {
  it('defaults to controller and remembers the choice', () => {
    expect(savedPhoneView()).toBe('controller')
    savePhoneView('full')
    expect(savedPhoneView()).toBe('full')
    savePhoneView('controller')
  })
})
