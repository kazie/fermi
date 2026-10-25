import { describe, expect, it } from 'vitest'
import { limitMessage, limitReset, limitWait } from '../grow-report.ts'

describe('usage limits', () => {
  const out = `{"type":"result","is_error":true,"result":"You've hit your session limit · resets 4:20am (Europe/Stockholm)"}`
  it('finds the limit message in a run output', () => {
    expect(limitMessage(out)).toBe("You've hit your session limit · resets 4:20am (Europe/Stockholm)")
    expect(limitMessage('{"result":"+3 added"}')).toBeNull()
  })
  it('waits until the next reset time, plus 2 minutes', () => {
    const at = (h: number, m: number) => new Date(2026, 9, 20, h, m)
    expect(limitReset('resets 4:20am', at(1, 35))).toBe(at(4, 22).getTime())
    expect(limitReset('resets 4:20am', at(23, 30))).toBe(new Date(2026, 9, 21, 4, 22).getTime())
    expect(limitReset('resets at 3pm', at(11, 0))).toBe(at(15, 2).getTime())
    expect(limitReset('resets 12am', at(22, 0))).toBe(new Date(2026, 9, 21, 0, 2).getTime())
    expect(limitReset('resets 16:30', at(13, 0))).toBe(at(16, 32).getTime())
  })
  it('takes the second of a time that comes twice when clocks go back', () => {
    const tz = process.env.TZ
    process.env.TZ = 'Europe/Stockholm'
    try {
      // 02:12 CEST, 25 Oct 2026: the first 2:10 has passed, the second (CET) is an hour away
      expect(limitReset('resets 2:10am', new Date('2026-10-25T00:12:00Z'))).toBe(Date.parse('2026-10-25T01:12:00Z'))
      expect(limitReset('resets 2:10am', new Date('2026-10-24T23:28:00Z'))).toBe(Date.parse('2026-10-25T00:12:00Z'))
    } finally {
      process.env.TZ = tz
    }
  })
  it('reads the time in the zone the message names', () => {
    const tz = process.env.TZ
    process.env.TZ = 'UTC'
    try {
      const now = new Date('2026-10-20T00:00:00Z')
      expect(limitReset('resets 4:20am (Europe/Stockholm)', now)).toBe(Date.parse('2026-10-20T02:22:00Z'))
      expect(limitReset('resets 4:20am (Mars/Olympus)', now)).toBe(Date.parse('2026-10-20T04:22:00Z'))
    } finally {
      process.env.TZ = tz
    }
  })
  it('wakes after the 5-hour window when the time is further off than that', () => {
    const at = (h: number, m: number) => new Date(2026, 9, 20, h, m)
    expect(limitReset('resets 4:20am', at(4, 25))).toBe(at(9, 27).getTime())
    expect(limitReset('resets 16:30', at(10, 0))).toBe(at(15, 2).getTime())
  })
  it('reads the older epoch format', () => {
    expect(limitMessage('{"result":"Claude AI usage limit reached|1792461600"}')).toBe('Claude AI usage limit reached|1792461600')
    expect(limitReset('Claude AI usage limit reached|1792461600', new Date())).toBe(1792461600 * 1000 + 2 * 60 * 1000)
  })
  it('gives no time for a limit that names a date', () => {
    expect(limitReset('weekly limit · resets Oct 23, 4pm', new Date())).toBeNull()
  })
  it('waits out a session limit, but not one that lifts more than 6 hours away', () => {
    const at = (h: number, m: number) => new Date(2026, 9, 20, h, m)
    expect(limitWait('session limit · resets 4:20am', at(1, 35))).toBe(at(4, 22).getTime())
    // a time that has just passed is a misreading: look again after the window rather than stop
    expect(limitWait('session limit · resets 4:20am', at(4, 25))).toBe(at(9, 27).getTime())
    expect(limitWait("You've hit your weekly limit · resets Oct 30, 4pm (Europe/Stockholm)", at(11, 45))).toBeNull()
    expect(limitWait('Claude AI usage limit reached|1792461600', new Date(1792461600 * 1000 - 3 * 86_400_000))).toBeNull()
  })
})
