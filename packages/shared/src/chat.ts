// FerMEANie's chat timing: a short "typing…" beat, then she types, pauses so it can be read, shows the typing dots,
// and types the next message, all in one bubble. Pure, so the server can size the reveal around her lines, and
// stories and tests can scrub it.

/** Typing speed, and the longest any line may take to type out (long lines speed up to fit). */
const MS_PER_CHAR = 24
const MAX_TYPE_MS = 3500
/** Pause after a message before the dots, so it can be read. */
export const HOLD_MS = 1400
/** How long the "…" typing dots show between messages. */
export const DOTS_MS = 1100
/** The "she's typing" beat before her first message: longer lines take a little longer to "write". */
const LEAD_BASE_MS = 500
const LEAD_PER_CHAR_MS = 4
const LEAD_MAX_MS = 1200

export const typeDuration = (len: number) => Math.min(len * MS_PER_CHAR, MAX_TYPE_MS)
export const leadDuration = (len: number) => Math.min(LEAD_BASE_MS + len * LEAD_PER_CHAR_MS, LEAD_MAX_MS)

export interface ChatState {
  /** Which message is showing (or is about to, while the dots show). */
  index: number
  /** How many of its characters are visible. */
  shown: number
  /** Showing the typing dots instead of text. */
  dots: boolean
  /** The last message is fully typed. */
  done: boolean
}

/** Where a sequence of messages (plain text) is `t` ms after it started. `lead: false` skips the first dots. */
export function chatState(messages: string[], t: number, { lead = true } = {}): ChatState {
  let rest = Math.max(0, t)
  if (lead && messages.length) {
    const l = leadDuration(messages[0].length)
    if (rest < l) return { index: 0, shown: 0, dots: true, done: false }
    rest -= l
  }
  for (let i = 0; i < messages.length; i++) {
    const len = messages[i].length
    const d = typeDuration(len)
    if (rest < d) return { index: i, shown: Math.min(len, Math.floor((rest / d) * len) + 1), dots: false, done: false }
    rest -= d
    const last = i === messages.length - 1
    if (last || rest < HOLD_MS) return { index: i, shown: len, dots: false, done: last }
    rest -= HOLD_MS
    if (rest < DOTS_MS) return { index: i + 1, shown: 0, dots: true, done: false }
    rest -= DOTS_MS
  }
  return { index: Math.max(0, messages.length - 1), shown: messages.at(-1)?.length ?? 0, dots: false, done: true }
}

/** Total time a sequence takes until its last message is fully typed. */
export function chatDuration(messages: string[], { lead = true } = {}): number {
  const typing = messages.reduce((t, m, i) => t + typeDuration(m.length) + (i < messages.length - 1 ? HOLD_MS + DOTS_MS : 0), 0)
  return typing + (lead && messages.length ? leadDuration(messages[0].length) : 0)
}
