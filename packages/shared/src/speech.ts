// What FerMEANie's voice says for a line: the markup stripped, the game's number formats read out, split into
// sentences. The server renders one clip per sentence (apps/server/src/voice); the chat paces her messages to it.

import { GROUP } from './calc/format.ts'
import { safeParseMarkup } from './markup.ts'

/** A digit group separator (the game's narrow space, or a comma): 3 200 and 1,000,000 are one number. */
const DIGIT_GROUP = new RegExp(`(\\d)[${GROUP},](?=\\d{3}(?!\\d))`, 'g')
const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹'
const SUBSCRIPT = '₀₁₂₃₄₅₆₇₈₉'
const digit = (set: string) => (c: string) => (c === '⁻' ? 'minus ' : String(set.indexOf(c)))

/** A line (with markup) as plain words for text-to-speech. */
export const speechText = (line: string) =>
  speakable(
    safeParseMarkup(line)
      .map((s) => (s.redacted ? 'redacted' : s.text))
      .join(''),
  )

/** Plain text with the game's number formats spelled out for the speech engine. */
export function speakable(plain: string): string {
  return (
    plain
      // digit groups: 3 200 and 1,000,000 are one number
      .replace(DIGIT_GROUP, '$1')
      // powers of ten (10²⁰, 3.2 × 10⁻⁵) and units (km², m³), then subscripts (CO₂)
      .replace(/10([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g, (_, exp: string) => `10 to the ${[...exp].map(digit(SUPERSCRIPT)).join('')}`)
      .replace(/(\p{L})²/gu, '$1 squared')
      .replace(/(\p{L})³/gu, '$1 cubed')
      .replace(/[₀-₉]/g, digit(SUBSCRIPT))
      // how many times off: 2.4×, 4.1 million×, ∞×, and "×" between numbers
      .replace(/∞×/g, 'infinitely')
      .replace(/×/g, ' times ')
      // FerMEANie's versions (v3.14), then decimals digit by digit: 3.14 → 3 point 1 4
      .replace(/\bv(\d)/g, 'version $1')
      .replace(/(\d)\.(\d+)/g, (_, int: string, dec: string) => `${int} point ${[...dec].join(' ')}`)
      .replace(/\s+/g, ' ')
      .replace(/ ([,.!?;:])/g, '$1')
      .trim()
  )
}

/** Titles that end in a full stop without ending the sentence. */
const TITLES = new Set(['dr', 'mr', 'mrs', 'ms', 'st', 'prof', 'mt', 'no', 'vs', 'approx', 'etc'])

/**
 * The sentences of a speech text. A sentence ends at . ! ? or … (closing quotes and brackets included) before a space,
 * but not after a title (Dr.), an initial (J.), or when the next word starts in lower case (e.g. this).
 */
export function sentences(text: string): string[] {
  const out: string[] = []
  let start = 0
  for (const m of text.matchAll(/[.!?…]+['"’”)\]]*\s+/g)) {
    const end = m.index + m[0].length
    const next = text[end]
    const word = /(\S+)$/.exec(text.slice(start, m.index + 1))?.[1] ?? ''
    const bare = word.replace(/[^\p{L}]/gu, '').toLowerCase()
    if (m[0][0] === '.' && (TITLES.has(bare) || /^\p{Lu}\.$/u.test(word))) continue
    if (next && /\p{Ll}/u.test(next)) continue
    out.push(text.slice(start, end).trim())
    start = end
  }
  const rest = text.slice(start).trim()
  if (rest) out.push(rest)
  return out.filter((s) => /[\p{L}\p{N}]/u.test(s))
}
