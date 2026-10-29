// Usage limits in headless session output, for `pnpm grow`. The limit message is the only session text ever printed,
// since anything else could hold question texts.

const SESSION_WINDOW = Temporal.Duration.from({ hours: 5 })
const GRACE_MS = 2 * 60 * 1000

/**
 * When a usage limit lifts (epoch ms), from a message like `… session limit · resets 4:20am (Europe/Stockholm)`: the
 * next moment the clock in that zone (the machine's if none is named) shows that time, plus 2 minutes. A session limit
 * lifts within its 5-hour window, so a time further off than that is a misreading: wake after the window instead and
 * look again. Null if there's no time in it (e.g. a date for a weekly limit).
 */
export function limitReset(msg: string, now: Temporal.Instant): number | null {
  // older CLIs: `Claude AI usage limit reached|<unix seconds>`
  const epoch = /usage limit reached\|(\d{9,11})/i.exec(msg)
  if (epoch) return Number(epoch[1]) * 1000 + GRACE_MS
  const m = /resets (?:at )?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(msg)
  if (!m) return null
  let hour = Number(m[1]) % 12
  if (m[3]?.toLowerCase() === 'pm' || (!m[3] && Number(m[1]) >= 12)) hour += 12
  const latest = now.add(SESSION_WINDOW)
  const minute = Number(m[2] ?? 0)
  if (minute > 59) return latest.epochMilliseconds + GRACE_MS
  const want = new Temporal.PlainTime(hour, minute)
  const zone = zoneOrLocal(/\(([\w+-]+(?:\/[\w+-]+)*)\)/.exec(msg)?.[1])
  // From the next whole minute on, like a clock watched minute by minute.
  const from = now.round({ smallestUnit: 'minute', roundingMode: 'floor' }).add({ minutes: 1 })
  const today = now.toZonedDateTimeISO(zone).toPlainDate()
  for (const day of [today, today.add({ days: 1 })]) {
    // When clocks go back, a time like 2:10 comes twice (earlier, later), and the next one is wanted. When they go
    // forward it doesn't come at all, and Temporal would move it to 3:10: skip it then.
    for (const disambiguation of ['earlier', 'later'] as const) {
      const at = day.toPlainDateTime(want).toZonedDateTime(zone, { disambiguation })
      if (!at.toPlainTime().equals(want)) continue
      const t = at.toInstant()
      if (Temporal.Instant.compare(t, from) >= 0 && Temporal.Instant.compare(t, latest) <= 0) return t.epochMilliseconds + GRACE_MS
    }
  }
  return latest.epochMilliseconds + GRACE_MS
}

/** The IANA zone the message names, or the machine's zone if it's missing or unknown. */
function zoneOrLocal(timeZone: string | undefined) {
  if (timeZone) {
    try {
      return Temporal.Now.zonedDateTimeISO(timeZone).timeZoneId
    } catch {
      // unknown zone
    }
  }
  return Temporal.Now.timeZoneId()
}

/**
 * The longest a worker sleeps through a usage limit. limitReset() never reads a time as more than the session window
 * away, so only a limit with a date (a weekly one) or a far-off epoch goes past it, and that stops the worker instead.
 */
export const MAX_LIMIT_WAIT_MS = 6 * 60 * 60 * 1000

/**
 * When to carry on after a usage limit, or null if it isn't worth waiting for: its reset can't be read (a weekly
 * limit names a date) or is more than MAX_LIMIT_WAIT_MS away.
 */
export function limitWait(msg: string, now: Temporal.Instant): number | null {
  const until = limitReset(msg, now)
  return until !== null && until - now.epochMilliseconds <= MAX_LIMIT_WAIT_MS ? until : null
}

/**
 * A usage-limit message anywhere in the output: `You've hit your session limit · resets 4:20am (Europe/Stockholm)`, or
 * the older `Claude AI usage limit reached|<unix seconds>`.
 */
export function limitMessage(out: string): string | null {
  const m =
    /[^"\n]{0,60}\blimit\b[^"\n]{0,40}\bresets\b[^"\n()]{0,30}(?:\([^)"\n]{0,40}\))?/i.exec(out) ??
    /Claude AI usage limit reached\|\d{9,11}/i.exec(out)
  return m ? m[0].trim() : null
}

/**
 * Reads a `claude -p --output-format json` result: its reply, cost and any usage limit it hit. A limit only counts
 * when the session failed: a reply that merely mentions a limit that resets (a question about speed limits, say) is
 * not one, and its text must never be printed as if it were.
 */
export function parseAgentOutput(out: string): { text: string; costUsd: number; limit: string | null } {
  let json: { total_cost_usd?: number; result?: string; is_error?: boolean } = {}
  let parsed = true
  try {
    json = JSON.parse(out)
  } catch {
    parsed = false // no JSON: the session died
  }
  const result = json.result ?? ''
  // Some CLI versions report a limit as an ordinary result: a short reply that is little more than the limit message.
  const inResult = limitMessage(result)
  const limitOnly =
    inResult !== null &&
    !/^\s*[[{]/.test(result) && // JSON is a real reply
    /\b(?:usage|session|weekly) limit\b|hit your (?:\w+ )?limit/i.test(inResult) &&
    inResult.length >= result.trim().length * 0.6
  const failed = !parsed || json.is_error === true || !result || limitOnly
  return {
    text: failed ? '' : result,
    costUsd: json.total_cost_usd ?? 0,
    limit: failed ? (inResult ?? limitMessage(out)) : null,
  }
}

const REST_MS = 24 * 60 * 60 * 1000
/** A category gets a rest when its last two runs, both within a day, added at most one question each. */
export function resting(runs: { at: string; added: number }[] = [], now = Date.now()) {
  const last = runs.slice(-2)
  return last.length === 2 && last.every((r) => r.added <= 1 && now - Date.parse(r.at) < REST_MS)
}
