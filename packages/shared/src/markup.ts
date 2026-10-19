// A small markup for FerMEANie's lines: **bold**, *italic*, ~~struck out~~ and ||redacted||.
// A backslash makes the next character literal. Lines stay plain strings in the protocol; the
// client turns them into styled pieces with `parseMarkup`.

export interface MarkupSegment {
  text: string
  bold?: true
  italic?: true
  strike?: true
  redacted?: true
}

type Style = 'bold' | 'italic' | 'strike' | 'redacted'

// Longest marker first, so `**` isn't read as two `*`.
const MARKERS: (readonly [marker: string, style: Style])[] = [
  ['**', 'bold'],
  ['~~', 'strike'],
  ['||', 'redacted'],
  ['*', 'italic'],
]

/** Splits a line into styled segments; throws on a marker that isn't closed, or closes out of order. */
export function parseMarkup(line: string): MarkupSegment[] {
  const segments: MarkupSegment[] = []
  const open: (typeof MARKERS)[number][] = []
  let text = ''
  const flush = () => {
    if (!text) return
    const segment: MarkupSegment = { text }
    for (const [, style] of open) segment[style] = true
    segments.push(segment)
    text = ''
  }

  for (let i = 0; i < line.length;) {
    if (line[i] === '\\' && i + 1 < line.length) {
      text += line[i + 1]
      i += 2
      continue
    }
    const marker = MARKERS.find(([m]) => line.startsWith(m, i))
    if (!marker) {
      text += line[i++]
      continue
    }
    flush()
    const innermost = open.at(-1)
    if (!open.includes(marker)) open.push(marker)
    else if (innermost === marker) open.pop()
    else throw new Error(`"${marker[0]}" closes before "${innermost![0]}" does`)
    i += marker[0].length
  }
  if (open.length) throw new Error(`"${open.at(-1)![0]}" is never closed`)
  flush()
  return segments
}

/** Makes a value (like a player's name) show literally inside a line. */
export function escapeMarkup(value: string): string {
  return value.replace(/[\\*~|]/g, '\\$&')
}
