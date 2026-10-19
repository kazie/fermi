import { describe, expect, it } from 'vitest'
import { escapeMarkup, parseMarkup } from '../src/markup.ts'

describe('parseMarkup', () => {
  it('returns plain text as one segment', () => {
    expect(parseMarkup('Just words.')).toEqual([{ text: 'Just words.' }])
    expect(parseMarkup('')).toEqual([])
  })

  it('reads bold, italic, strikethrough and redaction', () => {
    expect(parseMarkup('**Big** *slanted* ~~gone~~ ||secret||')).toEqual([
      { text: 'Big', bold: true },
      { text: ' ' },
      { text: 'slanted', italic: true },
      { text: ' ' },
      { text: 'gone', strike: true },
      { text: ' ' },
      { text: 'secret', redacted: true },
    ])
  })

  it('nests styles', () => {
    expect(parseMarkup('~~I *never* lose~~')).toEqual([
      { text: 'I ', strike: true },
      { text: 'never', strike: true, italic: true },
      { text: ' lose', strike: true },
    ])
  })

  it('treats a backslashed character literally', () => {
    expect(parseMarkup('\\*\\*Bob\\*\\* \\| ok')).toEqual([{ text: '**Bob** | ok' }])
    expect(parseMarkup(`**${escapeMarkup('a*b~~c||d\\')}**`)).toEqual([{ text: 'a*b~~c||d\\', bold: true }])
  })

  it('rejects markers that are never closed or close out of order', () => {
    expect(() => parseMarkup('**open')).toThrow('"**" is never closed')
    expect(() => parseMarkup('**a *b** c*')).toThrow('"**" closes before "*" does')
  })
})
