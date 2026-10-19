// FerMEANie's line markup on the client (see packages/shared/src/markup.ts).

import { parseMarkup, type MarkupSegment } from '@fermi/shared'

/** The server checks every line's markup; anything else that slips through shows as plain text. */
export function segments(line: string): MarkupSegment[] {
  try {
    return parseMarkup(line)
  } catch {
    return [{ text: line }]
  }
}

/** The text as it shows, without markers (redacted parts included: they're there, under the bar). */
export const plain = (line: string) =>
  segments(line)
    .map((s) => s.text)
    .join('')

/** The text for screen readers: redacted parts are announced as such. */
export const spoken = (line: string) =>
  segments(line)
    .map((s) => (s.redacted ? '(redacted)' : s.text))
    .join('')
