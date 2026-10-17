import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { chatDuration, chatState, DOTS_MS, HOLD_MS, typeDuration } from '../src/lib/chat'
import FermeanieSays from '../src/components/FermeanieSays.vue'

const msgs = ['First message here.', 'Second one.']

describe('FerMEANie chat timing', () => {
  it('types, holds, shows dots, then types the next message', () => {
    const d0 = typeDuration(msgs[0].length)
    expect(chatState(msgs, 0)).toMatchObject({ index: 0, dots: false, done: false })
    expect(chatState(msgs, d0 + 10)).toMatchObject({ index: 0, shown: msgs[0].length, dots: false })
    expect(chatState(msgs, d0 + HOLD_MS + 10)).toMatchObject({ index: 0, dots: true })
    expect(chatState(msgs, d0 + HOLD_MS + DOTS_MS + 10)).toMatchObject({ index: 1, dots: false, done: false })
    expect(chatState(msgs, chatDuration(msgs) + 1)).toMatchObject({ index: 1, shown: msgs[1].length, done: true })
  })
  it('caps long lines', () => {
    expect(typeDuration(10_000)).toBe(3500)
  })
})

describe('FermeanieSays with messages', () => {
  const at = (t: number) => mount(FermeanieSays, { props: { messages: [...msgs, null], startAt: 0, now: t } })
  it('shows one bubble that switches messages, with typing dots between', () => {
    const d0 = typeDuration(msgs[0].length)
    expect(
      at(d0 + 10)
        .find('.line')
        .text(),
    ).toContain('First message here.')
    expect(
      at(d0 + HOLD_MS + 10)
        .find('.dots')
        .exists(),
    ).toBe(true)
    const end = at(chatDuration(msgs) + 1)
    const visible = end.find('.line > span[aria-hidden="true"]').text()
    expect(visible).toContain('Second one.')
    expect(visible).not.toContain('First message')
    expect(end.findAll('.bubble')).toHaveLength(1)
  })
  it('a single remaining message behaves like plain text', () => {
    const w = mount(FermeanieSays, { props: { messages: ['Only one', null], instant: true } })
    expect(w.find('.line').text()).toContain('Only one')
  })
})
