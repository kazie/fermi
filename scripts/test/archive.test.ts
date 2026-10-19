import { mkdtempSync, readdirSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { archive, SLOT_STALE_MS, withSlot, type ArchiveOptions } from '../archive.ts'

const NOW = Date.parse('2026-10-19T12:00:00Z')
const slotDir = () => join(mkdtempSync(join(tmpdir(), 'fermi-slots-')), '.archive-slots')
const noSleep = async () => {}

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>
/** A fake fetch that records each call. Responses get `url` set, like a followed redirect. */
function fakeFetch(handler: Handler) {
  const calls: { url: string; init?: RequestInit }[] = []
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })
    return handler(url, init)
  }) as typeof fetch
  return { f, calls }
}
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
const redirectedTo = (url: string) => {
  const r = new Response('ok')
  Object.defineProperty(r, 'url', { value: url })
  return r
}
const noRecent = json({ archived_snapshots: {} })
const opts = (f: typeof fetch, extra: Partial<ArchiveOptions> = {}): ArchiveOptions => ({
  slotDir: slotDir(),
  slots: 2,
  fetchImpl: f,
  sleepImpl: noSleep,
  now: () => NOW,
  ...extra,
})

describe('withSlot', () => {
  it('never runs more than `slots` at once, across callers', async () => {
    const dir = slotDir()
    let running = 0
    let peak = 0
    const job = () =>
      withSlot(
        dir,
        2,
        async () => {
          peak = Math.max(peak, ++running)
          await new Promise((r) => setTimeout(r, 5))
          running--
        },
        { sleepImpl: (ms) => new Promise((r) => setTimeout(r, ms / 500)) },
      )
    await Promise.all(Array.from({ length: 6 }, job))
    expect(peak).toBe(2)
    expect(readdirSync(dir)).toEqual([])
  })
  it('takes over a slot left behind by a crashed process', async () => {
    const dir = slotDir()
    await withSlot(dir, 1, async () => {}) // creates the dir
    const stale = join(dir, 'slot-0')
    writeFileSync(stale, '999999')
    const old = new Date(Date.now() - SLOT_STALE_MS - 1000)
    utimesSync(stale, old, old)
    expect(await withSlot(dir, 1, async () => 'ran', { sleepImpl: noSleep })).toBe('ran')
  })
})

describe('archive', () => {
  it('reuses a snapshot from the last week without capturing', async () => {
    const { f, calls } = fakeFetch(() =>
      json({
        archived_snapshots: {
          closest: { available: true, url: 'http://web.archive.org/web/20261018000000/https://x.org/', timestamp: '20261018000000' },
        },
      }),
    )
    expect(await archive('https://x.org/', opts(f))).toEqual({
      archiveUrl: 'https://web.archive.org/web/20261018000000/https://x.org/',
      archivedAt: '2026-10-18T00:00:00Z',
    })
    expect(calls).toHaveLength(1)
  })
  it('retries a refused anonymous capture', async () => {
    let saves = 0
    const { f } = fakeFetch((url) => {
      if (url.includes('/wayback/available')) return noRecent
      return ++saves < 3 ? new Response('busy', { status: 429 }) : redirectedTo('https://web.archive.org/web/20261019120000/https://x.org/')
    })
    const snap = await archive('https://x.org/', opts(f))
    expect(snap.archivedAt).toBe('2026-10-19T12:00:00Z')
    expect(saves).toBe(3)
  })
  it('gives up after the last retry, saying how many tries it took', async () => {
    const { f } = fakeFetch((url) => (url.includes('/wayback/available') ? noRecent : new Response('busy', { status: 429 })))
    await expect(archive('https://x.org/', opts(f, { retryDelays: [1, 1] }))).rejects.toThrow(/HTTP 429.*after 3 tries/)
  })
  it('uses the logged-in SPN2 API when keys are set', async () => {
    let polls = 0
    const { f, calls } = fakeFetch((url) => {
      if (url.includes('/wayback/available')) return noRecent
      if (url === 'https://web.archive.org/save') return json({ url: 'https://x.org/', job_id: 'spn2-abc' })
      if (url.endsWith('/save/status/spn2-abc'))
        return json(
          ++polls < 2 ? { status: 'pending' } : { status: 'success', timestamp: '20261019120500', original_url: 'https://x.org/' },
        )
      throw new Error(`unexpected ${url}`)
    })
    expect(await archive('https://x.org/', opts(f, { keys: 'acc:sec' }))).toEqual({
      archiveUrl: 'https://web.archive.org/web/20261019120500/https://x.org/',
      archivedAt: '2026-10-19T12:05:00Z',
    })
    const post = calls.find((c) => c.url === 'https://web.archive.org/save')!
    expect(post.init?.method).toBe('POST')
    expect((post.init?.headers as Record<string, string>).authorization).toBe('LOW acc:sec')
  })
  it('retries a failed SPN2 job', async () => {
    let jobs = 0
    const { f } = fakeFetch((url) => {
      if (url.includes('/wayback/available')) return noRecent
      if (url === 'https://web.archive.org/save') return json({ job_id: `job-${++jobs}` })
      if (url.endsWith('/job-1')) return json({ status: 'error', status_ext: 'error:too-many-daily-captures' })
      return json({ status: 'success', timestamp: '20261019120500', original_url: 'https://x.org/' })
    })
    expect((await archive('https://x.org/', opts(f, { keys: 'acc:sec' }))).archivedAt).toBe('2026-10-19T12:05:00Z')
    expect(jobs).toBe(2)
  })
})
