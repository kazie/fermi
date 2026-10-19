import { existsSync, mkdirSync, mkdtempSync, readdirSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { batchName, createBatch, sweepLeftovers } from '../batch.ts'

const now = new Date()
const minute = 60 * 1000
const day = 24 * 60 * minute

function draft(batch: string, id: string, verified = false, checkOk = true) {
  mkdirSync(join(batch, 'drafts'), { recursive: true })
  mkdirSync(join(batch, 'verified'), { recursive: true })
  const path = join(batch, 'drafts', `${id}.json`)
  writeFileSync(path, '{}')
  writeFileSync(join(batch, 'drafts', `${id}.check.json`), JSON.stringify({ ok: checkOk }))
  if (verified) writeFileSync(join(batch, 'verified', `${id}.json`), '{}')
  return path
}

/** Sets every file under `dir` to `ms` ago. */
function age(dir: string, ms: number) {
  const t = new Date(now.getTime() - ms)
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, e.name)
    if (e.isDirectory()) age(path, ms)
    else utimesSync(path, t, t)
  }
}

function work() {
  const dir = mkdtempSync(join(tmpdir(), 'fermi-work-'))
  return { dir, run: createBatch(dir, now) }
}

describe('question batches', () => {
  it('names batches by local minute plus a suffix', () => {
    expect(batchName(new Date(2026, 9, 19, 15, 7), '3fa1')).toBe('b-20261019-1507-3fa1')
    expect(batchName(now)).toMatch(/^b-\d{8}-\d{4}-[0-9a-f]{4}$/)
  })

  it('creates drafts and verified directories', () => {
    const { run } = work()
    expect(existsSync(join(run, 'drafts'))).toBe(true)
    expect(existsSync(join(run, 'verified'))).toBe(true)
  })

  it('claims quiet batches with unverified drafts, ignoring verified and failed ones', () => {
    const { dir, run } = work()
    const a = join(dir, 'b-a')
    draft(a, 'fresh')
    draft(a, 'done', true)
    draft(a, 'failed', false, false)
    age(a, 50 * minute)
    expect(sweepLeftovers(dir, now, run)).toEqual({ deleted: 0, leftovers: [{ dir: a, pending: 1 }] })
    expect(existsSync(join(a, 'claim-1'))).toBe(true)
  })

  it('leaves batches alone while a run is still working on them', () => {
    const { dir, run } = work()
    const a = join(dir, 'b-a')
    draft(a, 'fresh')
    age(a, 50 * minute)
    writeFileSync(join(a, 'drafts', 'new.json'), '{}')
    expect(sweepLeftovers(dir, now, run).leftovers).toEqual([])
  })

  it('gives a quiet batch to one run only', () => {
    const { dir, run } = work()
    const a = join(dir, 'b-a')
    draft(a, 'fresh')
    age(a, 50 * minute)
    expect(sweepLeftovers(dir, now, run).leftovers).toHaveLength(1)
    expect(sweepLeftovers(dir, now, createBatch(dir, now)).leftovers).toEqual([])
  })

  it('takes over a claim that went quiet', () => {
    const { dir, run } = work()
    const a = join(dir, 'b-a')
    draft(a, 'fresh')
    writeFileSync(join(a, 'claim-1'), 'dead run')
    age(a, 50 * minute)
    expect(sweepLeftovers(dir, now, run).leftovers).toHaveLength(1)
    expect(existsSync(join(a, 'claim-2'))).toBe(true)
  })

  it('leaves a quiet batch alone while its run has a fresh heartbeat', () => {
    const { dir, run } = work()
    const heartbeat = join(dir, '.alive-1')
    writeFileSync(heartbeat, '')
    const a = createBatch(dir, now, heartbeat)
    draft(a, 'fresh')
    age(a, 50 * minute)
    expect(sweepLeftovers(dir, now, run).leftovers).toEqual([])
  })

  it('takes over at once from a run whose heartbeat stopped', () => {
    const { dir, run } = work()
    const heartbeat = join(dir, '.alive-1')
    writeFileSync(heartbeat, '')
    const a = createBatch(dir, now, heartbeat)
    draft(a, 'fresh')
    age(dir, 5 * minute)
    expect(sweepLeftovers(dir, now, run).leftovers).toHaveLength(1)
  })

  it('judges a claimed batch by its latest claimer', () => {
    const { dir, run } = work()
    const a = createBatch(dir, now, join(dir, '.dead'))
    draft(a, 'fresh')
    const heartbeat = join(dir, '.alive-2')
    writeFileSync(heartbeat, '')
    expect(sweepLeftovers(dir, now, run, heartbeat).leftovers).toHaveLength(1)
    expect(sweepLeftovers(dir, now, createBatch(dir, now)).leftovers).toEqual([])
  })

  it('deletes drafts older than a week', () => {
    const { dir, run } = work()
    const stale = draft(join(dir, 'b-a'), 'stale')
    age(join(dir, 'b-a'), 8 * day)
    expect(sweepLeftovers(dir, now, run)).toEqual({ deleted: 1, leftovers: [] })
    expect(existsSync(stale)).toBe(false)
    expect(existsSync(stale.replace('.json', '.check.json'))).toBe(false)
    expect(statSync(join(dir, 'b-a', 'drafts')).isDirectory()).toBe(true)
  })
})
