import type { LineResult } from '@fermi/shared'

export interface Segment {
  text: string
  cls: string
}

/** Split a line into styled runs for the syntax overlay (exactly the raw text, so it aligns with the textarea). */
export function segments(raw: string, line?: LineResult): Segment[] {
  const n = raw.length
  if (!n) return []
  const cls: string[] = new Array(n).fill('')
  for (const h of line?.highlights ?? []) {
    for (let i = h.start; i < Math.min(h.end, n); i++) cls[i] = `syn-${h.cls}`
  }
  const err = line?.error
  if (err) {
    const s = Math.min(err.start, n - 1)
    const e = Math.max(s + 1, Math.min(err.end, n))
    for (let i = s; i < e; i++) cls[i] = `${cls[i]} syn-error`.trim()
  }
  const out: Segment[] = []
  for (let i = 0; i < n; i++) {
    const last = out[out.length - 1]
    if (last && last.cls === cls[i]) last.text += raw[i]
    else out.push({ text: raw[i], cls: cls[i] })
  }
  return out
}

/** Line index containing a character offset. */
export function lineAt(text: string, offset: number): number {
  let line = 0
  for (let i = 0; i < Math.min(offset, text.length); i++) if (text[i] === '\n') line++
  return line
}

/** Character offset where a line starts. */
export function lineStart(text: string, line: number): number {
  let idx = 0
  for (let l = 0; l < line; l++) {
    const nl = text.indexOf('\n', idx)
    if (nl === -1) return text.length
    idx = nl + 1
  }
  return idx
}
