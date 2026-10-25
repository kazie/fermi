// Usage limits in headless session output, for `pnpm grow`. The limit message is the only session text ever printed,
// since anything else could hold question texts.

/**
 * When a usage limit lifts, from a message like `… session limit · resets 4:20am (Europe/Stockholm)`: the next such
 * wall-clock time in the machine's timezone, plus 2 minutes. Null if there's no time in it (e.g. a date for a weekly limit).
 */
export function limitReset(msg: string, now: Date): number | null {
  // older CLIs: `Claude AI usage limit reached|<unix seconds>`
  const epoch = /usage limit reached\|(\d{9,11})/i.exec(msg)
  if (epoch) return Number(epoch[1]) * 1000 + 2 * 60 * 1000
  const m = /resets (?:at )?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(msg)
  if (!m) return null
  let h = Number(m[1]) % 12
  if (m[3]?.toLowerCase() === 'pm' || (!m[3] && Number(m[1]) >= 12)) h += 12
  // Step forward a minute at a time rather than setHours(): when clocks go back, a time like 2:10 comes twice, and
  // setHours() gives the first even after it has passed.
  const min = Number(m[2] ?? 0)
  const t = new Date(now)
  t.setSeconds(0, 0)
  for (let i = 0; i < 26 * 60; i++) {
    t.setTime(t.getTime() + 60 * 1000)
    if (t.getHours() === h && t.getMinutes() === min) return t.getTime() + 2 * 60 * 1000
  }
  return null
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
