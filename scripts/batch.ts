// Batch directories for /fermi-questions: `.fermi-work/b-<stamp>/{drafts,verified}`.
// Plain file work so the skill's setup is a single `pnpm q batch` call (headless runs can't approve shell glue).

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

const STALE_MS = 7 * 24 * 60 * 60 * 1000

/** `b-YYYYMMDD-HHMM` in local time. */
export function batchName(now: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `b-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`
}

export function createBatch(workDir: string, now: Date) {
  const dir = join(workDir, batchName(now))
  mkdirSync(join(dir, 'drafts'), { recursive: true })
  mkdirSync(join(dir, 'verified'), { recursive: true })
  return dir
}

/** Drafts in `<batch>/drafts` with no same-named file in `<batch>/verified`, skipping ones that failed `prepare`. */
function pendingDrafts(batch: string) {
  const drafts = join(batch, 'drafts')
  if (!existsSync(drafts)) return []
  const verified = join(batch, 'verified')
  return readdirSync(drafts)
    .filter((f) => f.endsWith('.json') && !f.endsWith('.check.json'))
    .filter((f) => !existsSync(join(verified, f)) && !failedCheck(join(drafts, f.replace(/\.json$/, '.check.json'))))
}

function failedCheck(path: string) {
  try {
    return JSON.parse(readFileSync(path, 'utf8')).ok === false
  } catch {
    return false
  }
}

/**
 * Deletes pending drafts older than 7 days (their access dates are stale) and returns the batches that still have
 * pending drafts, so the skill finishes those before generating new ones.
 */
export function sweepLeftovers(workDir: string, now: Date, except?: string) {
  if (!existsSync(workDir)) return { deleted: 0, leftovers: [] as { dir: string; pending: number }[] }
  let deleted = 0
  const leftovers: { dir: string; pending: number }[] = []
  for (const name of readdirSync(workDir).sort()) {
    const batch = join(workDir, name)
    if (batch === except || !statSync(batch).isDirectory()) continue
    let pending = 0
    for (const f of pendingDrafts(batch)) {
      const path = join(batch, 'drafts', f)
      if (now.getTime() - statSync(path).mtimeMs > STALE_MS) {
        rmSync(path)
        rmSync(path.replace(/\.json$/, '.check.json'), { force: true })
        deleted++
      } else pending++
    }
    if (pending) leftovers.push({ dir: batch, pending })
  }
  return { deleted, leftovers }
}
