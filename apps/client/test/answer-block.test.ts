import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import AnswerBlock from '../src/components/AnswerBlock.vue'
import { revealStage, flippedCount } from '../src/lib/reveal'
import { segments } from '../src/lib/highlight'
import { reveals, T0 } from '../src/fixtures/rooms'
import { evaluateSheet } from '@fermi/shared'

describe('AnswerBlock', () => {
  it('shows per-line results and the final answer', () => {
    const w = mount(AnswerBlock, { props: { modelValue: 'a = 6\na * 7', unit: 'things' } })
    const results = w.findAll('.res').map((r) => r.text())
    expect(results[0]).toContain('6')
    expect(results[1]).toContain('42')
    expect(w.find('.final .value').text()).toBe('42')
    expect(w.find('.lock').attributes('disabled')).toBeUndefined()
  })

  it('emits typed text and lock', async () => {
    const w = mount(AnswerBlock, { props: { modelValue: '' } })
    await w.find('textarea').setValue('2(3+4)')
    expect(w.emitted('update:modelValue')![0]).toEqual(['2(3+4)'])
    await w.setProps({ modelValue: '2(3+4)' })
    await w.find('.lock').trigger('click')
    expect(w.emitted('lock')).toHaveLength(1)
  })

  it('cannot lock without an answer, and shows the fix button', async () => {
    const w = mount(AnswerBlock, { props: { modelValue: '1,000' } })
    expect(w.find('.lock').attributes('disabled')).toBeDefined()
    expect(w.find('.status').text()).toMatch(/_ to group/)
    await w.find('.fix').trigger('click')
    expect(w.emitted('update:modelValue')!.at(-1)).toEqual(['1_000'])
  })

  it('inserts variable chips at the caret', async () => {
    const w = mount(AnswerBlock, { props: { modelValue: 'people = 5\n' }, attachTo: document.body })
    const ta = w.find('textarea').element as HTMLTextAreaElement
    ta.setSelectionRange(ta.value.length, ta.value.length)
    await w.find('.chip').trigger('click')
    await nextTick()
    expect(w.emitted('update:modelValue')!.at(-1)).toEqual(['people = 5\npeople'])
    w.unmount()
  })

  it('locked state offers unlock', async () => {
    const w = mount(AnswerBlock, { props: { modelValue: '5', locked: true } })
    expect(w.find('textarea').attributes('readonly')).toBeDefined()
    await w.find('.lock').trigger('click')
    expect(w.emitted('unlock')).toHaveLength(1)
  })
})

describe('syntax overlay', () => {
  it('reproduces the raw text exactly', () => {
    for (const src of ['people = 8 billion # hi', 'a = 1,5', '2(3+4)days', '']) {
      const line = evaluateSheet(src).lines[0]
      expect(
        segments(src, line)
          .map((s) => s.text)
          .join(''),
      ).toBe(src)
    }
  })
})

describe('reveal stages', () => {
  it('walks numberLine → truth → cards → fermeanie → scoreboard', () => {
    const r = reveals.normal()
    expect(revealStage(r, T0)).toBe('numberLine')
    expect(revealStage(r, r.timeline.truthAt)).toBe('truth')
    expect(revealStage(r, r.cards[0].at)).toBe('cards')
    expect(flippedCount(r, r.cards[1].at)).toBe(2)
    expect(revealStage(r, r.timeline.fermeanieAt)).toBe('fermeanie')
    expect(revealStage(r, r.timeline.scoreboardAt)).toBe('scoreboard')
  })
})
