import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { chatDuration, chatState, DOTS_MS, holdDuration, leadDuration, typeDuration } from '@fermi/shared'
import FermeanieSays from '../src/components/FermeanieSays.vue'

const msgs = ['First message here.', 'Second one.']
const lead = leadDuration(msgs[0].length)
const hold = holdDuration(msgs[0], false)

describe('FerMEANie chat timing', () => {
  it('starts with a typing beat, then types, holds, shows dots and types the next message', () => {
    const d0 = typeDuration(msgs[0].length)
    expect(chatState(msgs, 0)).toMatchObject({ index: 0, shown: 0, dots: true, done: false })
    expect(chatState(msgs, lead + 10)).toMatchObject({ index: 0, dots: false, done: false })
    expect(chatState(msgs, lead + d0 + 10)).toMatchObject({ index: 0, shown: msgs[0].length, dots: false })
    expect(chatState(msgs, lead + d0 + hold + 10)).toMatchObject({ index: 1, shown: 0, dots: true })
    expect(chatState(msgs, lead + d0 + hold + DOTS_MS + 10)).toMatchObject({ index: 1, dots: false, done: false })
    expect(chatState(msgs, chatDuration(msgs) + 1)).toMatchObject({ index: 1, shown: msgs[1].length, done: true })
  })
  it('can skip the typing beat', () => {
    expect(chatState(msgs, 0, { lead: false })).toMatchObject({ index: 0, dots: false })
    expect(chatDuration(msgs) - chatDuration(msgs, { lead: false })).toBe(lead)
  })
  it('takes a little longer to "write" a longer line, within limits', () => {
    expect(leadDuration(10)).toBeLessThan(leadDuration(100))
    expect(leadDuration(10_000)).toBe(1200)
  })
  it('caps long lines', () => {
    expect(typeDuration(10_000)).toBe(3500)
  })
})

describe('FermeanieSays', () => {
  const at = (t: number, props: Record<string, unknown> = { messages: [...msgs, null] }) =>
    mount(FermeanieSays, { props: { ...props, startAt: 0, now: t } })
  const visible = (w: ReturnType<typeof at>) => w.find('.line > span[aria-hidden="true"]').text()
  const heard = (w: ReturnType<typeof at>) => w.find('[aria-live="polite"]').text()

  it('shows the typing dots before a single line too', () => {
    const w = at(10, { text: 'Hello there.' })
    expect(w.find('.dots').exists()).toBe(true)
    expect(at(leadDuration(12) + typeDuration(12) + 10, { text: 'Hello there.' }).text()).toContain('Hello there.')
  })
  it('shows one bubble that switches messages, with typing dots between', () => {
    const d0 = typeDuration(msgs[0].length)
    expect(visible(at(lead + d0 + 10))).toContain('First message here.')
    expect(
      at(lead + d0 + hold + 10)
        .find('.dots')
        .exists(),
    ).toBe(true)
    const end = at(chatDuration(msgs) + 1)
    expect(visible(end)).toContain('Second one.')
    expect(visible(end)).not.toContain('First message')
    expect(end.findAll('.bubble')).toHaveLength(1)
  })
  it('tells screen readers each message once it is typed, never ahead of the screen', () => {
    const d0 = typeDuration(msgs[0].length)
    expect(heard(at(lead + 10))).toBe('')
    expect(heard(at(lead + d0 + 10))).toContain('First message here.')
    expect(heard(at(lead + d0 + 10))).not.toContain('Second one.')
    expect(heard(at(chatDuration(msgs) + 1))).toContain('Second one.')
  })
  it('instant shows every message, not just the last', () => {
    const w = mount(FermeanieSays, { props: { messages: [...msgs, null], instant: true } })
    expect(w.findAll('.msg .shown').map((m) => m.text())).toEqual(msgs)
    expect(heard(w)).toContain('First message here.')
  })
  it('a single remaining message behaves like plain text', () => {
    const w = mount(FermeanieSays, { props: { messages: ['Only one', null], instant: true } })
    expect(w.find('.line').text()).toContain('Only one')
  })
})
