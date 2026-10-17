import { describe, expect, it } from 'vitest'
import { htmlToText } from '../src/questions/html.ts'
import { normalizeText } from '../src/questions/dedupe.ts'
import { checkPool } from '../src/questions/check.ts'
import { ingestQuestion } from '../src/questions/ingest.ts'
import { makeQuestion, testDb } from './fixtures.ts'

describe('htmlToText', () => {
  it('decodes named and numeric entities and strips markup', () => {
    expect(htmlToText('<p>don&#8217;t &amp; can&rsquo;t &#x2019; 2&nbsp;500&thinsp;000</p><script>x()</script>')).toBe(
      ' don’t & can’t ’ 2 500 000  ',
    )
  })
  it('check --links and prepare agree on entity-encoded pages', async () => {
    const db = testDb()
    const q = makeQuestion({ id: 'entity-q', timeSensitive: true, recheckAfter: '2030-01-01' })
    q.sources[0].quote = 'The tower’s 2,500,000 rivets don’t rust.'
    ingestQuestion(db, q, { now: new Date('2026-10-17T00:00:00Z') })
    const page = '<p>The tower&#8217;s 2,500,000 rivets don&rsquo;t rust.</p>'
    expect(normalizeText(htmlToText(page)).includes(normalizeText(q.sources[0].quote))).toBe(true)
    const report = await checkPool(db, { links: true, fetchImpl: (async () => new Response(page)) as typeof fetch })
    expect(report.disputed).toEqual([])
    expect(report.issues).toEqual([])
  })
})
