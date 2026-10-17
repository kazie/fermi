// Mechanical draft preparation — no LLM: archive sources, confirm quotes on the live page or snapshot,
// and dry-run the ingest checks. The verifier agent then only does the judgement calls.

import { normalizeText } from './dedupe.ts'

export interface PrepareDeps {
  pageText(url: string): Promise<string | null>
  archive(url: string): Promise<{ archiveUrl: string; archivedAt: string }>
  /** Server-side ingest dry run (schema, numbers, formula, dates, duplicates). */
  dryRun(draft: unknown): Promise<{ status: string; errors?: string[]; matches?: { id: string; question: string; reasons: string[] }[] }>
}

export interface DraftCheck {
  id: string
  ok: boolean
  quotes: Record<string, 'live' | 'archive' | 'missing'>
  ingest: string
  problems: string[]
  similar?: { id: string; question: string; reasons: string[] }[]
}

type DraftSource = { id: string; url: string; quote: string; archiveUrl?: string; archivedAt?: string }
type Draft = { id?: string; sources?: DraftSource[] } & Record<string, unknown>

export async function prepareDraft(draft: Draft, deps: PrepareDeps): Promise<{ draft: Draft; check: DraftCheck }> {
  const problems: string[] = []
  const quotes: DraftCheck['quotes'] = {}
  for (const s of draft.sources ?? []) {
    if (!s.archiveUrl || !s.archivedAt) {
      try {
        Object.assign(s, await deps.archive(s.url))
      } catch (e) {
        problems.push(`source ${s.id}: could not archive (${(e as Error).message})`)
      }
    }
    const want = normalizeText(s.quote)
    const live = await deps.pageText(s.url)
    if (live !== null && normalizeText(live).includes(want)) quotes[s.id] = 'live'
    else if (s.archiveUrl && normalizeText((await deps.pageText(s.archiveUrl)) ?? '').includes(want)) quotes[s.id] = 'archive'
    else {
      quotes[s.id] = 'missing'
      problems.push(`source ${s.id}: quote not found on the live page or the snapshot`)
    }
  }
  const res = await deps.dryRun(draft)
  if (res.status === 'invalid') problems.push(...(res.errors ?? []))
  if (res.status === 'duplicate') problems.push('duplicate of an existing question')
  const check: DraftCheck = {
    id: String(draft.id ?? '?'),
    ok: problems.length === 0 && (res.status === 'valid' || res.status === 'needs_review'),
    quotes,
    ingest: res.status,
    problems,
    ...(res.matches?.length ? { similar: res.matches.map(({ id, question, reasons }) => ({ id, question, reasons })) } : {}),
  }
  return { draft, check }
}
