import { describe, expect, it } from 'vitest'
import { prepareDraft, type PrepareDeps } from '../src/questions/prepare.ts'
import { ingestQuestion } from '../src/questions/ingest.ts'
import { makeQuestion, testDb } from './fixtures.ts'

const NOW = new Date('2026-10-17T00:00:00Z')

function deps(pages: Record<string, string | null>, db = testDb()): PrepareDeps & { archived: string[] } {
  const archived: string[] = []
  return {
    archived,
    pageText: async (url) => pages[url] ?? null,
    archive: async (url) => {
      archived.push(url)
      return { archiveUrl: `https://web.archive.org/web/20261001120000/${url}`, archivedAt: '2026-10-01T12:00:00Z' }
    },
    dryRun: async (d) => ingestQuestion(db, d, { now: NOW, dryRun: true }),
  }
}

describe('prepareDraft', () => {
  it('archives missing snapshots, confirms quotes and dry-runs ingest', async () => {
    const q = makeQuestion({ id: 'prep-ok' })
    const { archiveUrl: _a, archivedAt: _b, ...src } = q.sources[0]
    const draft = { ...q, sources: [src] }
    const d = deps({ [src.url]: `<p>Fun fact: ${src.quote} Wow.</p>` })
    const { draft: out, check } = await prepareDraft(draft as never, d)
    expect(d.archived).toEqual([src.url])
    expect((out.sources as { archiveUrl: string }[])[0].archiveUrl).toMatch(/web\.archive\.org/)
    expect(check).toMatchObject({ id: 'prep-ok', ok: true, quotes: { s1: 'live' }, ingest: 'valid', problems: [] })
  })

  it('falls back to the snapshot when the live page blocks us', async () => {
    const q = makeQuestion({ id: 'prep-archive' })
    const d = deps({ [q.sources[0].archiveUrl]: q.sources[0].quote })
    const { check } = await prepareDraft(q as never, d)
    expect(check.quotes.s1).toBe('archive')
    expect(check.ok).toBe(true)
  })

  it('flags quotes that are nowhere to be found and ingest problems', async () => {
    const q = makeQuestion({ id: 'prep-bad', answer: 99 })
    const { check } = await prepareDraft(q as never, deps({}))
    expect(check.ok).toBe(false)
    expect(check.quotes.s1).toBe('missing')
    expect(check.problems.join()).toMatch(/no source quote contains the answer/)
  })
})
