import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { plain, spoken } from '@/lib/markup.ts'
import { breakRoom } from '@/fixtures/rooms.ts'
import BreakScreen from '../src/components/BreakScreen.vue'
import FerText from '../src/components/FerText.vue'

const line = '~~Ada will lose.~~ I believe in **you**, ||Ada||.'

describe('line markup', () => {
  it('counts and speaks the visible text, with redactions announced', () => {
    expect(plain(line)).toBe('Ada will lose. I believe in you, Ada.')
    expect(spoken(line)).toBe('Ada will lose. I believe in you, (redacted).')
    expect(plain('a stray ** marker')).toBe('a stray ** marker') // shown as is, never a crash
  })

  it('renders styles as elements, never as HTML, and types out only visible characters', () => {
    const text = (shown?: number) => mount(FerText, { props: { text: line, shown } })
    const full = text()
    expect(full.find('.s').text()).toBe('Ada will lose.')
    expect(full.find('.b').text()).toBe('you')
    expect(full.find('.redacted').attributes('tabindex')).toBe('0')
    expect(text(17).text()).toBe('Ada will lose. I') // the markers don't count
    expect(mount(FerText, { props: { text: '<b>hi</b>' } }).text()).toBe('<b>hi</b>')
  })
})

describe('break screen pacing', () => {
  it('counts down with timed breaks, and waits for the host otherwise', () => {
    const timed = mount(BreakScreen, { props: { room: breakRoom(), now: breakRoom().break!.startedAt } })
    expect(timed.text()).toContain('Next question in 23s')
    expect(timed.find('button').text()).toContain('Skip break')

    const host = mount(BreakScreen, { props: { room: breakRoom({ hostPaced: true }), now: 0 } })
    expect(host.text()).not.toContain('Skip break')
    host.find('button').trigger('click')
    expect(host.emitted('next')).toHaveLength(1)

    const guest = mount(BreakScreen, { props: { room: breakRoom({ hostPaced: true, host: false }), now: 0 } })
    expect(guest.find('button').exists()).toBe(false)
    expect(guest.text()).toContain('Waiting for Bob…')
  })
})
