import { createHash } from 'node:crypto'

/** Players' private keys are stored and compared only as hashes. */
export const hashKey = (key: string) => createHash('sha256').update(key).digest('base64url')

/** A tiny in-memory fixed-window rate limiter: `allow(id)` is false once `max` hits happen within `windowMs`. */
export function rateLimiter(max: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, { count: number; resetAt: number }>()
  return (id: string): boolean => {
    const t = now()
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k)
    const h = hits.get(id)
    if (!h || h.resetAt <= t) {
      hits.set(id, { count: 1, resetAt: t + windowMs })
      return true
    }
    h.count++
    return h.count <= max
  }
}
