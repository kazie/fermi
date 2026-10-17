// FerMEANie's chat timing: how fast it types, and how a sequence of messages plays out in one bubble
// (type → pause to read → typing dots → next message). Pure, so stories and tests can scrub it.

/** Typing speed, and the longest any line may take to type out (long lines speed up to fit). */
export const MS_PER_CHAR = 24
export const MAX_TYPE_MS = 3500
/** Pause after a message before the dots, so it can be read. */
export const HOLD_MS = 1400
/** How long the "…" typing dots show between messages. */
export const DOTS_MS = 1100

export const typeDuration = (len: number) => Math.min(len * MS_PER_CHAR, MAX_TYPE_MS)

export interface ChatState {
  /** Which message is showing. */
  index: number
  /** How many of its characters are visible. */
  shown: number
  /** Showing the typing dots instead of text. */
  dots: boolean
  /** The last message is fully typed. */
  done: boolean
}

export function chatState(messages: string[], t: number): ChatState {
  let rest = Math.max(0, t)
  for (let i = 0; i < messages.length; i++) {
    const len = messages[i].length
    const d = typeDuration(len)
    if (rest < d) return { index: i, shown: Math.min(len, Math.floor((rest / d) * len) + 1), dots: false, done: false }
    rest -= d
    const last = i === messages.length - 1
    if (last || rest < HOLD_MS) return { index: i, shown: len, dots: false, done: last }
    rest -= HOLD_MS
    if (rest < DOTS_MS) return { index: i, shown: 0, dots: true, done: false }
    rest -= DOTS_MS
  }
  return { index: Math.max(0, messages.length - 1), shown: messages.at(-1)?.length ?? 0, dots: false, done: true }
}

/** Total time a sequence takes until its last message is fully typed. */
export function chatDuration(messages: string[]): number {
  return messages.reduce((t, m, i) => t + typeDuration(m.length) + (i < messages.length - 1 ? HOLD_MS + DOTS_MS : 0), 0)
}
