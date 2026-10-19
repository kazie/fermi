import { existsSync, mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { batchName, createBatch, sweepLeftovers } from '../batch.ts'

const now = new Date(2026, 9, 19, 15, 7)
const day = 24 * 60 * 60 * 1000

function draft(batch: string, id: string, ageDays = 0, verified = false, checkOk = true) {
  mkdirSync(join(batch, 'drafts'), { recursive: true })
  mkdirSync(join(batch, 'verified'), { recursive: true })
  const path = join(batch, 'drafts', `${id}.json`)
  writeFileSync(path, '{}')
  writeFileSync(join(batch, 'drafts', `${id}.check.json`), JSON.stringify({ ok: checkOk }))
  const t = new Date(now.getTime() - ageDays * day)
  utimesSync(path, t, t)
  if (verified) writeFileSync(join(batch, 'verified', `${id}.json`), '{}')
  return path
}

describe('question batches', () => {
  it('names batches by local minute', () => {
    expect(batchName(now)).toBe('b-20261019-1507')
  })

  it('creates drafts and verified directories', () => {
    const work = mkdtempSync(join(tmpdir(), 'fermi-work-'))
    const dir = createBatch(work, now)
    expect(existsSync(join(dir, 'drafts'))).toBe(true)
    expect(existsSync(join(dir, 'verified'))).toBe(true)
  })

  it('counts unverified drafts as leftovers and deletes stale ones', () => {
    const work = mkdtempSync(join(tmpdir(), 'fermi-work-'))
    const a = join(work, 'b-a')
    const b = join(work, 'b-b')
    draft(a, 'fresh', 2)
    draft(a, 'done', 2, true)
    draft(a, 'failed', 2, false, false)
    const stale = draft(b, 'stale', 8)
    const current = createBatch(work, now)
    draft(current, 'mine')

    expect(sweepLeftovers(work, now, current)).toEqual({ deleted: 1, leftovers: [{ dir: a, pending: 1 }] })
    expect(existsSync(stale)).toBe(false)
    expect(existsSync(stale.replace('.json', '.check.json'))).toBe(false)
  })
})
