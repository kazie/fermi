// FerMEANie's line markup on the client (see packages/shared/src/markup.ts).

import { safeParseMarkup, type MarkupSegment } from '@fermi/shared'

/** The styled pieces of a line; bad markup shows as plain text. */
export const segments = safeParseMarkup

/** The text for screen readers: redacted parts are announced as such. */
export const spoken = (line: string) => spokenSegments(segments(line))

/** `spoken`, for a line already parsed. */
export const spokenSegments = (parts: MarkupSegment[]) => parts.map((s) => (s.redacted ? '(redacted)' : s.text)).join('')
