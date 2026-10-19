import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { plain, spoken } from '@/lib/markup.ts'
import { breakRoom } from '@/fixtures/rooms.ts'
import BreakScreen from '../src/components/BreakScreen.vue'
import FerText from '../src/components/FerText.vue'
import NameForm from '../src/components/NameForm.vue'

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
    expect(text(17).find('.shown').text()).toBe('Ada will lose. I') // the markers don't count
    expect(
      mount(FerText, { props: { text: '<b>hi</b>' } })
        .find('.shown')
        .text(),
    ).toBe('<b>hi</b>')
  })

  it('keeps redactions redacted for screen readers, and peeks on tap', async () => {
    const full = mount(FerText, { props: { text: line } })
    expect(full.find('.shown').attributes('aria-hidden')).toBe('true')
    expect(full.find('.sr-only').text()).toBe(spoken(line))
    expect(full.find('[tabindex]').exists()).toBe(false) // no focus stops, also inside FermeanieSays' aria-hidden bubble
    await full.find('.redacted').trigger('click')
    expect(full.find('.redacted').classes()).toContain('peek')
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

describe('name form greeting', () => {
  it('shows a typed name exactly as typed, never as markup', async () => {
    const form = mount(NameForm, { props: { code: 'ABCD', quote: 'Hello.' } })
    await form.find('input').setValue('**Bob**')
    expect(form.text()).toContain('**Bob**')
  })
})
