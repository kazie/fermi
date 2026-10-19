// Mechanical draft preparation — no LLM: archive sources, confirm quotes on the live page or snapshot,
// and dry-run the ingest checks. The verifier agent then only does the judgement calls.

import { quoteExcerpt } from './dedupe.ts'

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
  /** The page text around each found quote, so the verifier can judge its meaning without fetching the page. */
  excerpts: Record<string, string>
  ingest: string
  problems: string[]
  similar?: { id: string; question: string; reasons: string[] }[]
  /** How many `prepare` calls have tried to archive this draft's sources (failed archiving is retried a few times). */
  archiveTries?: number
}

type DraftSource = { id: string; url: string; quote: string; archiveUrl?: string; archivedAt?: string }
type Draft = { id?: string; sources?: DraftSource[] } & Record<string, unknown>

export async function prepareDraft(draft: Draft, deps: PrepareDeps): Promise<{ draft: Draft; check: DraftCheck }> {
  const problems: string[] = []
  const quotes: DraftCheck['quotes'] = {}
  const excerpts: DraftCheck['excerpts'] = {}
  for (const s of draft.sources ?? []) {
    if (!s.archiveUrl || !s.archivedAt) {
      try {
        Object.assign(s, await deps.archive(s.url))
      } catch (e) {
        problems.push(`source ${s.id}: could not archive (${(e as Error).message})`)
      }
    }
    quotes[s.id] = 'missing'
    for (const [where, url] of [
      ['live', s.url],
      ['archive', s.archiveUrl],
    ] as const) {
      const excerpt = url ? quoteExcerpt(await deps.pageText(url), s.quote) : null
      if (excerpt === null) continue
      quotes[s.id] = where
      excerpts[s.id] = excerpt
      break
    }
    if (quotes[s.id] === 'missing') problems.push(`source ${s.id}: quote not found on the live page or the snapshot`)
  }
  const check = withDryRun({ id: String(draft.id ?? '?'), quotes, excerpts, problems }, await deps.dryRun(draft))
  return { draft, check }
}

/** Folds an ingest dry run into a check: its problems, its status and any similar questions (replacing older ones). */
export function withDryRun(
  check: Omit<DraftCheck, 'ok' | 'ingest' | 'similar'> & { similar?: unknown },
  res: Awaited<ReturnType<PrepareDeps['dryRun']>>,
): DraftCheck {
  const { similar: _, ...rest } = check
  const problems = [...rest.problems]
  if (res.status === 'invalid') problems.push(...(res.errors ?? []))
  if (res.status === 'duplicate') problems.push('duplicate of an existing question')
  return {
    ...rest,
    ok: problems.length === 0 && (res.status === 'valid' || res.status === 'needs_review'),
    ingest: res.status,
    problems,
    ...(res.matches?.length ? { similar: res.matches.map(({ id, question, reasons }) => ({ id, question, reasons })) } : {}),
  }
}
