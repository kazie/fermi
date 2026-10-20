// Re-validates the whole pool, and optionally re-fetches live sources to see whether they still say the same.

import { QuestionSchema } from '@fermi/shared'
import type { DB } from '../db.ts'
import { normalizeText } from './dedupe.ts'
import { fetchPageText } from './html.ts'
import { checkQuestion } from './ingest.ts'
import { addDispute, allQuestions, getQuestion, setFlags } from './repo.ts'

export const LINK_CONCURRENCY = 6

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

export interface CheckReport {
  checked: number
  issues: { id: string; status: string; issues: string[] }[]
  disputed: string[]
}

export async function checkPool(db: DB, opts: { links?: boolean; fetchImpl?: typeof fetch } = {}): Promise<CheckReport> {
  const today = new Date().toISOString().slice(0, 10)
  const report: CheckReport = { checked: 0, issues: [], disputed: [] }
  const all = allQuestions(db).filter((x) => x.status !== 'retired')
  report.checked = all.length
  // Questions are checked LINK_CONCURRENCY at a time; each one's sources are fetched in parallel too.
  await mapLimit(all, LINK_CONCURRENCY, async ({ question: q, status, flags }) => {
    const issues: string[] = []
    const parsed = QuestionSchema.safeParse(q)
    if (!parsed.success) issues.push(...parsed.error.issues.map((i) => `schema ${i.path.join('.')}: ${i.message}`))
    // recheckAfter in the past is expected here: it is what flags a question as due.
    issues.push(...checkQuestion(q, new Date()).filter((e) => !e.startsWith('recheckAfter')))
    // Only check's own flags are recomputed; the rest (e.g. `reviewed:v1`) are kept, read again right before writing.
    const own = (f: string) => f.startsWith('source-changed') || f.startsWith('dead-link') || f === 'recheck-due'
    const newFlags: string[] = []
    if (q.recheckAfter && q.recheckAfter <= today) {
      newFlags.push('recheck-due')
      issues.push(`recheck due since ${q.recheckAfter}`)
    }
    let changed = false
    if (opts.links) {
      const pages = await Promise.all(q.sources.map((s) => fetchPageText(s.url, opts.fetchImpl ?? fetch, 15_000)))
      q.sources.forEach((s, i) => {
        const res = pages[i]
        if (res === null) {
          newFlags.push(`dead-link:${s.id}`)
          issues.push(`source ${s.id}: live link is unreachable (archived copy still backs it)`)
        } else if (!normalizeText(res).includes(normalizeText(s.quote).slice(0, 120))) {
          newFlags.push(`source-changed:${s.id}:${s.accessed}`)
          issues.push(`source ${s.id}: live page no longer contains the quote (source changed since ${s.accessed})`)
          changed = true
        }
      })
    }
    // The link fetches above can take minutes, so other flags may have changed meanwhile: merge with the current ones.
    const current = getQuestion(db, q.id)?.flags ?? flags
    setFlags(db, q.id, [...current.filter((f) => !own(f)), ...newFlags])
    if (status === 'active' && ((changed && q.timeSensitive) || newFlags.includes('recheck-due'))) {
      addDispute(db, q.id, null, changed ? 'auto: time-sensitive source changed' : 'auto: recheck due')
      report.disputed.push(q.id)
    }
    if (issues.length) report.issues.push({ id: q.id, status, issues })
  })
  report.issues.sort((a, b) => a.id.localeCompare(b.id))
  return report
}
