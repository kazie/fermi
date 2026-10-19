// Wayback snapshots for question sources. Save Page Now refuses captures when too many run at once, and parallel
// `pnpm grow` runs share one IP, so every capture takes one of a few slots shared by all processes (lock files in
// `.fermi-work/.archive-slots`). Failed captures are retried with a pause. With FERMI_ARCHIVE_KEYS (archive.org S3
// keys, `access:secret`) captures go through the logged-in SPN2 API, which allows more at once.

import { mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { mtime } from './batch.ts'

export interface Snapshot {
  archiveUrl: string
  archivedAt: string
}

export interface ArchiveOptions {
  /** Directory for the shared slot lock files. */
  slotDir: string
  /** How many captures may run at once across all processes. */
  slots: number
  /** archive.org S3 keys as `access:secret`; uses the logged-in SPN2 API when set. */
  keys?: string
  fetchImpl?: typeof fetch
  sleepImpl?: (ms: number) => Promise<unknown>
  /** Pauses before each retry; one capture attempt per entry, plus the first. */
  retryDelays?: number[]
  now?: () => number
}

const DAY = 86_400_000
/** A slot held longer than this belongs to a crashed process. A capture times out well before. */
export const SLOT_STALE_MS = 5 * 60 * 1000
const SPN2_POLL_MS = 5000
const SPN2_MAX_POLLS = 36

/** Archive options from the environment: FERMI_ARCHIVE_KEYS, FERMI_ARCHIVE_SLOTS (default 3, the logged-in limit for a new account). */
export function archiveOptionsFromEnv(workDir: string): ArchiveOptions {
  const keys = process.env.FERMI_ARCHIVE_KEYS?.trim() || undefined
  const slots = Number(process.env.FERMI_ARCHIVE_SLOTS) || 3
  return { slotDir: join(workDir, '.archive-slots'), slots, keys }
}

export const toIso = (ts: string) =>
  `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(8, 10) || '00'}:${ts.slice(10, 12) || '00'}:${ts.slice(12, 14) || '00'}Z`

/** Runs `fn` while holding one of `slots` lock files in `dir`, waiting for a free one. Safe across processes. */
export async function withSlot<T>(
  dir: string,
  slots: number,
  fn: () => Promise<T>,
  { sleepImpl = sleep, now = Date.now }: Pick<ArchiveOptions, 'sleepImpl' | 'now'> = {},
): Promise<T> {
  mkdirSync(dir, { recursive: true })
  for (;;) {
    for (let i = 0; i < slots; i++) {
      const path = join(dir, `slot-${i}`)
      try {
        writeFileSync(path, String(process.pid), { flag: 'wx' })
      } catch {
        if (now() - (mtime(path) ?? now()) > SLOT_STALE_MS) rmSync(path, { force: true })
        continue
      }
      // Captures can take minutes; keep the slot fresh so others don't take it for a crashed one.
      const beat = setInterval(() => utimesSync(path, new Date(), new Date()), 60_000)
      try {
        return await fn()
      } finally {
        clearInterval(beat)
        rmSync(path, { force: true })
      }
    }
    await sleepImpl(1000 + Math.random() * 1000)
  }
}

/** A snapshot from the last 7 days, if Wayback already has one. */
async function recentSnapshot(url: string, f: typeof fetch, now: number): Promise<Snapshot | null> {
  const today = new Date(now).toISOString().slice(0, 10).replace(/-/g, '')
  try {
    const r = await f(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}&timestamp=${today}`, {
      signal: AbortSignal.timeout(30_000),
    })
    const j = (await r.json()) as { archived_snapshots?: { closest?: { available: boolean; url: string; timestamp: string } } }
    const c = j.archived_snapshots?.closest
    if (c?.available && Math.abs(Date.parse(toIso(c.timestamp)) - now) < 7 * DAY) {
      return { archiveUrl: c.url.replace(/^http:/, 'https:'), archivedAt: toIso(c.timestamp) }
    }
  } catch {
    /* no answer: capture instead */
  }
  return null
}

/** Anonymous Save Page Now: a GET that redirects to the new snapshot. */
async function saveAnonymous(url: string, f: typeof fetch): Promise<Snapshot> {
  const res = await f(`https://web.archive.org/save/${url}`, {
    redirect: 'follow',
    signal: AbortSignal.timeout(120_000),
    headers: { 'user-agent': 'Mozilla/5.0 (fermi archiver)' },
  }).catch((e) => {
    throw new Error(`Save Page Now failed: ${(e as Error).message}`)
  })
  const final = res.url.match(/web\.archive\.org\/web\/(\d{14})\//) ? res.url : (res.headers.get('content-location') ?? '')
  const m = final.match(/\/web\/(\d{14})\//)
  if (!m) throw new Error(`Save Page Now did not return a snapshot (HTTP ${res.status})`)
  return { archiveUrl: final.startsWith('http') ? final : `https://web.archive.org${final}`, archivedAt: toIso(m[1]) }
}

/** Logged-in SPN2: POST a capture job, then poll its status. */
async function saveWithKeys(url: string, keys: string, f: typeof fetch, wait: (ms: number) => Promise<unknown>): Promise<Snapshot> {
  const headers = { accept: 'application/json', authorization: `LOW ${keys}` }
  const fail = (msg: string) => new Error(`Save Page Now failed: ${msg}`)
  const res = await f('https://web.archive.org/save', {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ url, if_not_archived_within: '7d' }),
    signal: AbortSignal.timeout(60_000),
  }).catch((e) => {
    throw fail((e as Error).message)
  })
  const job = (await res.json().catch(() => ({}))) as { job_id?: string; message?: string; status_ext?: string }
  if (!job.job_id) throw fail(job.status_ext ?? job.message ?? `HTTP ${res.status}`)
  for (let i = 0; i < SPN2_MAX_POLLS; i++) {
    await wait(SPN2_POLL_MS)
    const s = (await f(`https://web.archive.org/save/status/${job.job_id}`, { headers, signal: AbortSignal.timeout(30_000) })
      .then((r) => r.json())
      .catch(() => ({ status: 'pending' }))) as {
      status?: string
      timestamp?: string
      original_url?: string
      status_ext?: string
      message?: string
    }
    if (s.status === 'success' && s.timestamp) {
      return { archiveUrl: `https://web.archive.org/web/${s.timestamp}/${s.original_url ?? url}`, archivedAt: toIso(s.timestamp) }
    }
    if (s.status === 'error') throw fail(s.status_ext ?? s.message ?? 'capture error')
  }
  throw fail('capture still pending after 3 minutes')
}

/** Find or create a Wayback snapshot. Throws (never exits), so `prepare` can record the failure and carry on. */
export async function archive(url: string, opts: ArchiveOptions): Promise<Snapshot> {
  const { fetchImpl: f = fetch, sleepImpl = sleep, retryDelays = [20_000, 60_000], now = Date.now } = opts
  const recent = await recentSnapshot(url, f, now())
  if (recent) return recent
  let last: Error = new Error('Save Page Now failed')
  for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
    if (attempt) await sleepImpl(retryDelays[attempt - 1])
    try {
      return await withSlot(
        opts.slotDir,
        opts.slots,
        () => (opts.keys ? saveWithKeys(url, opts.keys, f, sleepImpl) : saveAnonymous(url, f)),
        { sleepImpl, now },
      )
    } catch (e) {
      last = e as Error
    }
  }
  throw new Error(`${last.message}, after ${retryDelays.length + 1} tries`)
}
