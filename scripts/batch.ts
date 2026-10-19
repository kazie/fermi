// Batch directories for /fermi-questions: `.fermi-work/b-<stamp>-<rand>/{drafts,verified}`.
// Plain file work so the skill's setup is a single `pnpm q batch` call (headless runs can't approve shell glue).
// Several runs may work at once, so a run only takes over another batch once that batch's run is gone, and claims it
// first. The creator holds `claim-0`, and each takeover writes the next number; the highest claim owns the batch. Under
// `pnpm grow` a claim holds the run's heartbeat file (FERMI_HEARTBEAT), which grow keeps fresh while the run lives: the
// batch is busy exactly while it's fresh. Manual runs have none; their batches count as
// abandoned once no file in them has changed for 45 minutes.

import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const STALE_MS = 7 * 24 * 60 * 60 * 1000
/** A batch without a heartbeat and with no file changes for this long belongs to a run that died. */
export const IDLE_MS = 45 * 60 * 1000
/** `pnpm grow` touches heartbeats every minute; one older than this belongs to a dead run. */
export const HEARTBEAT_MS = 3 * 60 * 1000

/** `b-YYYYMMDD-HHMM-xxxx` in local time; the random suffix keeps same-minute runs apart. */
export function batchName(now: Date, suffix = randomBytes(2).toString('hex')) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `b-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}-${suffix}`
}

export function createBatch(workDir: string, now: Date, heartbeat = '') {
  const dir = join(workDir, batchName(now))
  mkdirSync(join(dir, 'drafts'), { recursive: true })
  mkdirSync(join(dir, 'verified'), { recursive: true })
  writeFileSync(join(dir, 'claim-0'), heartbeat)
  return dir
}

/** mtime, or undefined if the file is gone (another run's sweep, or an editor's temp file, may delete it any time). */
export const mtime = (path: string) => statSync(path, { throwIfNoEntry: false })?.mtimeMs

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

/** Newest mtime of any file in the batch, claims included. Directories don't count: the sweep's own deletes touch them. */
function lastActivity(dir: string): number {
  let newest = 0
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, e.name)
    newest = Math.max(newest, (e.isDirectory() ? lastActivity(path) : mtime(path)) ?? 0)
  }
  return newest
}

/** The highest claim number in the batch, or -1 for batches from before claims existed. */
function latestClaim(batch: string) {
  return Math.max(-1, ...readdirSync(batch).map((f) => Number(/^claim-(\d+)$/.exec(f)?.[1] ?? -1)))
}

/** Is the run that owns the batch (its latest claim) still alive? */
function busy(batch: string, latest: number, now: Date) {
  const heartbeat = latest < 0 ? '' : readFileSync(join(batch, `claim-${latest}`), 'utf8').trim()
  if (heartbeat) return now.getTime() - (mtime(heartbeat) ?? 0) < HEARTBEAT_MS
  return now.getTime() - lastActivity(batch) < IDLE_MS
}

/**
 * Claims are numbered files created with `wx`, so exactly one run wins each number. The number is read before the busy
 * check: a run that claimed in between makes the batch busy or takes our number.
 */
function claim(batch: string, heartbeat: string, now: Date) {
  const latest = latestClaim(batch)
  const next = latest + 1
  if (busy(batch, latest, now)) return false
  try {
    writeFileSync(join(batch, `claim-${next}`), heartbeat, { flag: 'wx' })
    return true
  } catch {
    return false
  }
}

/**
 * Deletes pending drafts older than 7 days (their access dates are stale), then claims the abandoned batches that
 * still have pending drafts, so this run finishes those before generating new ones. Busy batches belong to live runs.
 */
export function sweepLeftovers(workDir: string, now: Date, runDir: string, heartbeat = '') {
  if (!existsSync(workDir)) return { deleted: 0, leftovers: [] as { dir: string; pending: number }[] }
  let deleted = 0
  const leftovers: { dir: string; pending: number }[] = []
  for (const name of readdirSync(workDir).sort()) {
    const batch = join(workDir, name)
    if (batch === runDir || name.startsWith('.') || !statSync(batch).isDirectory()) continue
    let pending = 0
    for (const f of pendingDrafts(batch)) {
      const path = join(batch, 'drafts', f)
      const t = mtime(path)
      if (t === undefined) continue
      if (now.getTime() - t > STALE_MS) {
        rmSync(path, { force: true })
        rmSync(path.replace(/\.json$/, '.check.json'), { force: true })
        deleted++
      } else pending++
    }
    if (pending && claim(batch, heartbeat, now)) leftovers.push({ dir: batch, pending })
  }
  return { deleted, leftovers }
}
