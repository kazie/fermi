// Usage limits in headless session output, for `pnpm grow`. The limit message is the only session text ever printed,
// since anything else could hold question texts.

const SESSION_WINDOW = Temporal.Duration.from({ hours: 5 })
const GRACE_MS = 2 * 60 * 1000
/** A reset time this recently gone by is one the limit has just passed (the session hit it right before). */
const JUST_LIFTED = Temporal.Duration.from({ minutes: 15 })
/** How soon the quick look after a just-lifted limit comes. */
const QUICK_LOOK_MS = 2 * 60 * 1000

/**
 * When a usage limit lifts (epoch ms), from a message like `… session limit · resets 4:20am (Europe/Stockholm)`: the
 * next moment the clock in that zone (the machine's if none is named) shows that time, plus 2 minutes. A session limit
 * lifts within its 5-hour window, so a time further off than that is a misreading: wake after the window instead and
 * look again. Null if there's no time in it (e.g. a date for a weekly limit).
 */
export function limitReset(msg: string, now: Temporal.Instant): number | null {
  const epoch = epochReset(msg)
  if (epoch !== null) return epoch + GRACE_MS
  const times = resetTimes(msg, now)
  if (!times) return null
  const from = nextMinute(now)
  const latest = now.add(SESSION_WINDOW)
  const next = times.find((t) => Temporal.Instant.compare(t, from) >= 0 && Temporal.Instant.compare(t, latest) <= 0)
  return (next ?? latest).epochMilliseconds + GRACE_MS
}

/**
 * Did the limit's reset time go by in the last 15 minutes? A session that hit the limit just before it lifted reports
 * it like that (seen at 23:50 and 23:52 for `resets 11:50pm`), and limitReset() would read it as tomorrow's.
 */
export function justLifted(msg: string, now: Temporal.Instant): boolean {
  const epoch = epochReset(msg)
  const times = epoch !== null ? [Temporal.Instant.fromEpochMilliseconds(epoch)] : (resetTimes(msg, now) ?? [])
  const since = now.subtract(JUST_LIFTED)
  const from = nextMinute(now)
  return times.some((t) => Temporal.Instant.compare(t, since) >= 0 && Temporal.Instant.compare(t, from) < 0)
}

/** older CLIs: `Claude AI usage limit reached|<unix seconds>` */
function epochReset(msg: string): number | null {
  const m = /usage limit reached\|(\d{9,11})/i.exec(msg)
  return m ? Number(m[1]) * 1000 : null
}

/** From the next whole minute on, like a clock watched minute by minute. */
const nextMinute = (now: Temporal.Instant) => now.round({ smallestUnit: 'minute', roundingMode: 'floor' }).add({ minutes: 1 })

/**
 * The moments, yesterday to tomorrow and in order, that the clock in the message's zone shows its reset time; empty
 * if the time can't be right, null if it names none. When clocks go back, a time like 2:10 comes twice (earlier,
 * later). When they go forward it doesn't come at all, and Temporal would move it to 3:10: skip it then.
 */
function resetTimes(msg: string, now: Temporal.Instant): Temporal.Instant[] | null {
  const m = /resets (?:at )?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(msg)
  if (!m) return null
  let hour = Number(m[1]) % 12
  if (m[3]?.toLowerCase() === 'pm' || (!m[3] && Number(m[1]) >= 12)) hour += 12
  const minute = Number(m[2] ?? 0)
  if (minute > 59) return []
  const want = new Temporal.PlainTime(hour, minute)
  const zone = zoneOrLocal(/\(([\w+-]+(?:\/[\w+-]+)*)\)/.exec(msg)?.[1])
  const today = now.toZonedDateTimeISO(zone).toPlainDate()
  return [today.subtract({ days: 1 }), today, today.add({ days: 1 })].flatMap((day) =>
    (['earlier', 'later'] as const)
      .map((disambiguation) => day.toPlainDateTime(want).toZonedDateTime(zone, { disambiguation }))
      .filter((at) => at.toPlainTime().equals(want))
      .map((at) => at.toInstant()),
  )
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
 * When a worker looks again after a limit (epoch ms, or null to stop), and whether that's a quick look. A reset time
 * that has just gone by gets one quick look 2 minutes on (`soon`); if the limit is still on then (`lookedSoon`), the
 * time was a misreading after all, so the usual limitWait() applies.
 */
export function nextLook(msg: string, now: Temporal.Instant, lookedSoon: boolean): { until: number | null; soon: boolean } {
  if (!lookedSoon && justLifted(msg, now)) return { until: now.epochMilliseconds + QUICK_LOOK_MS, soon: true }
  return { until: limitWait(msg, now), soon: false }
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
