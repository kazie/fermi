import { describe, expect, it } from 'vitest'
import { quoteExcerpt } from '../../apps/server/src/questions/dedupe.ts'
import { htmlToText } from '../../apps/server/src/questions/html.ts'
import { draftFromPick, parsePicks, pickPrompt, tableRows } from '../harvest.ts'

const html = `<html><head><title>List of imaginary towers - Fakepedia</title></head><body>
<table><tr><th>Tower</th><th>Height (m)</th></tr>
<tr><td>Zork Spire</td><td>1,234<sup>[1]</sup></td></tr>
<tr><td>Blip &amp; Blop Mast</td><td>567.8</td></tr>
<tr><td>Zork Spire</td><td>1,234<sup>[1]</sup></td></tr>
<tr><td>No number here at all</td></tr></table></body></html>`

describe('harvest', () => {
  it('reads the title and the distinct table rows that hold a number', () => {
    const { title, rows } = tableRows(html)
    expect(title).toBe('List of imaginary towers - Fakepedia')
    expect(rows).toEqual(['Zork Spire 1,234', 'Blip & Blop Mast 567.8'])
  })
  it('turns rows into quotes the quote check finds on the page', () => {
    for (const row of tableRows(html).rows) expect(quoteExcerpt(htmlToText(html), row)).not.toBeNull()
  })
  it('keeps picks that point at a row and carry a question and a positive answer', () => {
    const reply = JSON.stringify([
      { row: 0, id: 'zork-spire-height', question: 'How tall is the Zork Spire?', unit: 'm', answer: 1234 },
      { row: 9, id: 'out-of-range', question: 'q', unit: 'm', answer: 1 },
      { row: 1, id: 'Bad Id', question: 'q', unit: 'm', answer: 1 },
      { row: 1, id: 'zero', question: 'q', unit: 'm', answer: 0 },
    ])
    expect(parsePicks(reply, 2).map((p) => p.id)).toEqual(['zork-spire-height'])
  })
  it('builds a draft whose only source quotes the row', () => {
    const page = { url: 'https://example.org/wiki/Towers', ...tableRows(html) }
    const [pick] = parsePicks(
      JSON.stringify([{ row: 1, id: 'blip-mast', question: 'How tall is the Blip & Blop Mast?', unit: 'm', answer: 567.8, difficulty: 7 }]),
      2,
    )
    const d = draftFromPick(pick, 'architecture', page, '2026-10-24')
    expect(d).toMatchObject({ id: 'blip-mast', category: 'architecture', kind: 'direct', difficulty: 2, timeSensitive: false })
    expect(d.sources).toEqual([
      {
        id: 's1',
        url: page.url,
        title: page.title,
        publisher: 'example.org',
        accessed: '2026-10-24',
        quote: 'Blip & Blop Mast 567.8',
      },
    ])
  })
  it('shows numbered rows and the existing questions to the picker', () => {
    const p = pickPrompt('architecture', 5, { url: 'u', title: 't', rows: ['a 1', 'b 2'] }, ['Old one?'])
    expect(p).toContain('0: a 1\n1: b 2')
    expect(p).toContain('- Old one?')
    expect(p).toContain('Pick up to 5 rows')
  })
})
