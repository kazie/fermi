// Usage limits in headless session output, for `pnpm grow`. The limit message is the only session text ever printed,
// since anything else could hold question texts.

/**
 * When a usage limit lifts, from a message like `… session limit · resets 4:20am (Europe/Stockholm)`: the next such
 * wall-clock time in the machine's timezone, plus 2 minutes. Null if there's no time in it (e.g. a date for a weekly limit).
 */
export function limitReset(msg: string, now: Date): number | null {
  const m = /resets (?:at )?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(msg)
  if (!m) return null
  let h = Number(m[1]) % 12
  if (m[3]?.toLowerCase() === 'pm' || (!m[3] && Number(m[1]) >= 12)) h += 12
  const t = new Date(now)
  t.setHours(h, Number(m[2] ?? 0), 0, 0)
  if (t.getTime() <= now.getTime()) t.setDate(t.getDate() + 1)
  return t.getTime() + 2 * 60 * 1000
}

/** A usage-limit message (`You've hit your session limit · resets 4:20am (Europe/Stockholm)`) anywhere in the output. */
export function limitMessage(out: string): string | null {
  const m = /[^"\n]{0,60}\blimit\b[^"\n]{0,40}\bresets\b[^"\n()]{0,30}(?:\([^)"\n]{0,40}\))?/i.exec(out)
  return m ? m[0].trim() : null
}
