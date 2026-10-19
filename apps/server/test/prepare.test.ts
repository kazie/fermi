import { describe, expect, it } from 'vitest'
import { prepareDraft, type PrepareDeps } from '../src/questions/prepare.ts'
import { quoteExcerpt } from '../src/questions/dedupe.ts'
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
    expect(check.excerpts.s1).toBe(`<p>Fun fact: ${src.quote} Wow.</p>`)
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

describe('quoteExcerpt', () => {
  const page = `${'Intro words. '.repeat(40)}The Tower has 2.5 million rivets, says the operator.${' Outro words.'.repeat(40)}`

  it('cuts the page text around the quote, matching it the way the ingest checks do', () => {
    const excerpt = quoteExcerpt(page, 'the tower has 2.5 MILLION rivets', 20)!
    expect(excerpt).toBe('…s. Intro words. The Tower has 2.5 million rivets, says the operator.…')
  })

  it('accepts a quote that starts or ends mid-word, like the ingest checks', () => {
    expect(quoteExcerpt(page, 'ower has 2.5 million riv', 5)).toBe('…The Tower has 2.5 million rivets, say…')
  })

  it('finds quotes with compatibility characters like the ingest checks do', () => {
    expect(quoteExcerpt('Water boils at 100 ℃ at sea level.', 'boils at 100 ℃ at sea level', 0)).toBe('…boils at 100 ℃ at sea level…')
    expect(quoteExcerpt('Kleenex™ brand tissues', 'Kleenex™ brand', 0)).toBe('Kleenex™ brand…')
  })

  it('shows the page as written', () => {
    expect(quoteExcerpt('An area of 12 km² in total', 'area of 12 km2', 3)).toBe('An area of 12 km² in…')
  })

  it('keeps to the context on text without spaces', () => {
    const table = `${'cell|'.repeat(2000)}The Tower has 2.5 million rivets|${'cell|'.repeat(2000)}`
    expect(quoteExcerpt(table, 'Tower has 2.5 million rivets', 10)).toBe('…|cell|The Tower has 2.5 million rivets|cell|cell…')
  })

  it('returns null when the page lacks the quote', () => {
    expect(quoteExcerpt(page, 'The Tower has 3 million rivets')).toBeNull()
  })
})
