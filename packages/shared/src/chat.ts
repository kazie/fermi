// FerMEANie's chat timing: a short "typing…" beat, then she types, pauses so it can be read (and heard: she speaks
// each message as it starts typing), shows the typing dots, and types the next message, all in one bubble. Pure, so
// the server can size the reveal around her lines, and stories and tests can scrub it.

import { sentences, speakable } from './speech.ts'

/** Typing speed, and the longest any line may take to type out (long lines speed up to fit). */
const MS_PER_CHAR = 24
const MAX_TYPE_MS = 3500
/** Shortest pause after a message before the dots, so it can be read. */
export const HOLD_MS = 1400
/** How long the "…" typing dots show between messages. */
export const DOTS_MS = 1100
/** The "she's typing" beat before her first message: longer lines take a little longer to "write". */
const LEAD_BASE_MS = 500
const LEAD_PER_CHAR_MS = 4
const LEAD_MAX_MS = 1200
/**
 * How long her voice takes to say a message, rounded up from her rendered clips (about 400 ms a sentence plus 54 ms
 * a character): each sentence is one clip, with a short gap between them. On a server with a voice (`paced`), a
 * message stays up until she has finished, plus a breath, so her voice is never cut off: the same on every device,
 * sound on or off, so they all stay in step.
 */
const SPEECH_MS_PER_SENTENCE = 400
const SPEECH_MS_PER_CHAR = 58
export const SPEECH_GAP_MS = 150
const AFTER_SPEECH_MS = 300

export const typeDuration = (len: number) => Math.min(len * MS_PER_CHAR, MAX_TYPE_MS)
export const leadDuration = (len: number) => Math.min(LEAD_BASE_MS + len * LEAD_PER_CHAR_MS, LEAD_MAX_MS)

/** How long saying `text` (plain text) takes: one clip per sentence, as her voice renders it. */
export function speechDuration(text: string): number {
  const said = sentences(speakable(text))
  const chars = said.reduce((n, s) => n + s.length, 0)
  return Math.max(1, said.length) * SPEECH_MS_PER_SENTENCE + chars * SPEECH_MS_PER_CHAR + Math.max(0, said.length - 1) * SPEECH_GAP_MS
}

export interface ChatOptions {
  /** Skip the first "typing…" beat. */
  lead?: boolean
  /** The server has a voice: each message stays up until she has said it. */
  paced?: boolean
}

/** The pause after a message is typed: long enough to read it, and (paced) for her to finish saying it. */
export function holdDuration(text: string, last: boolean, paced = false): number {
  if (!paced) return HOLD_MS
  const spoken = speechDuration(text) + AFTER_SPEECH_MS - typeDuration(text.length) - (last ? 0 : DOTS_MS)
  return Math.max(HOLD_MS, spoken)
}

export interface ChatState {
  /** Which message is showing (or is about to, while the dots show). */
  index: number
  /** When that message starts typing, in ms from the start of the sequence. */
  at: number
  /** How many of its characters are visible. */
  shown: number
  /** Showing the typing dots instead of text. */
  dots: boolean
  /** The last message is fully typed. */
  done: boolean
}

/**
 * When each message starts typing, in ms from the start of the sequence: the "typing…" beat (unless `lead: false`),
 * then for each message its typing, the pause after it, and the dots before the next.
 */
export function messageStarts(messages: string[], { lead = true, paced = false }: ChatOptions = {}): number[] {
  let t = lead && messages.length ? leadDuration(messages[0].length) : 0
  return messages.map((m) => {
    const start = t
    t += typeDuration(m.length) + holdDuration(m, false, paced) + DOTS_MS
    return start
  })
}

/** Where a sequence of messages (plain text) is `t` ms after it started. `starts`: messageStarts, if known already. */
export function chatState(messages: string[], t: number, opts: ChatOptions = {}, starts = messageStarts(messages, opts)): ChatState {
  const time = Math.max(0, t)
  let i = -1 // the last message that has started
  while (i + 1 < starts.length && time >= starts[i + 1]) i++
  if (i < 0) return { index: 0, at: starts[0] ?? 0, shown: 0, dots: messages.length > 0, done: !messages.length }
  const len = messages[i].length
  const typed = time - starts[i]
  const d = typeDuration(len)
  if (typed < d) return { index: i, at: starts[i], shown: Math.min(len, Math.floor((typed / d) * len) + 1), dots: false, done: false }
  const last = i === messages.length - 1
  // after the pause, the dots before the next message
  if (!last && time >= starts[i + 1] - DOTS_MS) return { index: i + 1, at: starts[i + 1], shown: 0, dots: true, done: false }
  return { index: i, at: starts[i], shown: len, dots: false, done: last }
}

/**
 * How long one line of hers holds the stage on its own (plain text): typed out, then long enough to read (and, `paced`,
 * to hear). The intro's steps and the example question's guide each last at least this long.
 */
export const lineDuration = (text: string, paced = false) => chatDuration([text], { paced }) + holdDuration(text, true, paced)

/** Total time a sequence takes until its last message is fully typed. */
export function chatDuration(messages: string[], opts: ChatOptions = {}): number {
  if (!messages.length) return 0
  return messageStarts(messages, opts).at(-1)! + typeDuration(messages.at(-1)!.length)
}
