import { describe, expect, it } from 'vitest'
import { formatReport, parseAgentOutput, parseBatch, parsePrepare, runPipeline, type AgentName, type PipelineDeps } from '../pipeline.ts'

/**
 * A fake pool, CLI and agents. Generators write 5 drafts each; `prepare` fails every draft whose number is divisible
 * by `failEvery`; verifiers add every draft they get except those in `rejectIds`.
 */
function world(opts: { failEvery?: number; rejectIds?: string[]; limitAfter?: number; leftovers?: string[] } = {}) {
  const pool = new Map<string, string>([['old-1', 'food']])
  const drafts = new Map<string, string[]>() // batch dir → draft ids
  const verified = new Set<string>()
  const calls: { agent: AgentName; brief: string }[] = []
  let running = 0
  let peak = 0
  let n = 0
  for (const dir of opts.leftovers ?? []) drafts.set(dir, [`${dir}-left`])
  const deps: PipelineDeps = {
    async cli([cmd, arg]) {
      if (cmd === 'batch') return `batch .fermi-work/b-new\n${(opts.leftovers ?? []).map((d) => `leftover ${d} 1 pending\n`).join('')}`
      if (cmd === 'list') return [...pool].map(([id, c]) => `${id}\t${c}\tactive\n`).join('')
      if (cmd === 'prepare') {
        const dir = arg.replace(/\/drafts$/, '')
        return (drafts.get(dir) ?? [])
          .filter((id) => !verified.has(id))
          .map((id) => (opts.failEvery && Number(id.split('-').pop()) % opts.failEvery === 0 ? `✗ ${id}: 1 problem(s)` : `✓ ${id}`))
          .join('\n')
      }
      throw new Error(`unexpected cli ${cmd}`)
    },
    async runAgent(agent, brief) {
      calls.push({ agent, brief })
      peak = Math.max(peak, ++running)
      await new Promise((r) => setTimeout(r, 1))
      running--
      if (opts.limitAfter !== undefined && calls.length > opts.limitAfter) {
        return { costUsd: 0, limit: "You've hit your session limit · resets 4:20am (Europe/Stockholm)" }
      }
      if (agent === 'fermi-generator') {
        const dir = /`([^`]+)\/drafts\/`/.exec(brief)![1]
        const ids = Array.from({ length: 5 }, () => `d-${++n}`)
        drafts.set(dir, [...(drafts.get(dir) ?? []), ...ids])
        return { costUsd: 0.1, limit: null }
      }
      for (const [, dir, id] of brief.matchAll(/`([^`]+)\/drafts\/([^`]+)\.json`/g)) {
        verified.add(id)
        if (!opts.rejectIds?.includes(id)) pool.set(id, dir.includes('left') ? 'history' : 'food')
      }
      return { costUsd: 0.2, limit: null }
    },
  }
  return { deps, calls, pool, peak: () => peak }
}

describe('pipeline parsing', () => {
  it('reads the batch and its leftovers', () => {
    expect(parseBatch('batch .fermi-work/b-1\nleftover .fermi-work/b-0 3 pending\n')).toEqual({
      batch: '.fermi-work/b-1',
      leftovers: ['.fermi-work/b-0'],
    })
  })
  it('reads passed and failed drafts, ignoring ones not ready', () => {
    const out = '✓ a\n✓ b (needs_review)\n✗ c: 2 problem(s)\n… d: not ready (SyntaxError), checked on a later call\n\n2/3 drafts passed'
    expect(parsePrepare(out)).toEqual({ passed: ['a', 'b'], failed: ['c'] })
  })
  it('reads cost and limits from a session result', () => {
    expect(parseAgentOutput('{"total_cost_usd":0.42,"result":"done"}')).toEqual({ text: 'done', costUsd: 0.42, limit: null })
    expect(parseAgentOutput('{"is_error":true,"result":"You\'ve hit your session limit · resets 4:20am"}').limit).toMatch(/resets 4:20am/)
    expect(parseAgentOutput('not json')).toEqual({ text: '', costUsd: 0, limit: null })
  })
  it('takes a short limit-only result for a limit, even when it is not marked as an error', () => {
    const r = parseAgentOutput(JSON.stringify({ is_error: false, result: 'Claude AI usage limit reached|1792461600' }))
    expect(r.limit).toBe('Claude AI usage limit reached|1792461600')
    expect(r.text).toBe('')
  })
  it('does not mistake a reply that mentions a limit for a usage limit', () => {
    const reply = JSON.stringify({ result: '[{"note":"unclear which speed limit resets at the border"}]', total_cost_usd: 0.01 })
    expect(parseAgentOutput(reply).limit).toBeNull()
  })
})

describe('runPipeline', () => {
  it('drafts with spare, checks, verifies in chunks and counts from the pool', async () => {
    const w = world({ failEvery: 4, rejectIds: ['d-1'] })
    const r = await runPipeline('food', 10, w.deps)
    const generators = w.calls.filter((c) => c.agent === 'fermi-generator')
    expect(generators.length).toBeGreaterThanOrEqual(3) // ceil(10 × 1.1 / 5)
    expect(generators[0].brief).toContain('Topic: food.')
    for (const v of w.calls.filter((c) => c.agent === 'fermi-verifier')) {
      expect(v.brief.match(/\.json`/g)!.length).toBeLessThanOrEqual(5)
    }
    // every ✓ draft is sent to a verifier exactly once
    const sent = w.calls.flatMap((c) => [...c.brief.matchAll(/drafts\/([^`]+)\.json/g)].map((m) => m[1]))
    expect(new Set(sent).size).toBe(sent.length)
    expect(r.added).toBe([...w.pool.keys()].length - 1)
    expect(r.added).toBeGreaterThanOrEqual(10)
    expect(r.byCategory).toEqual({ food: r.added })
    expect(r.rejected).toBe(1)
    expect(r.failedChecks).toBeGreaterThan(0)
    expect(r.cost['fermi-generator']).toBeCloseTo(generators.length * 0.1)
    expect(w.peak()).toBeLessThanOrEqual(8) // 4 generators + 4 verifiers
  })
  it('drafts a second round when the first falls short, and no third', async () => {
    const w = world({ failEvery: 2 })
    await runPipeline('food', 10, w.deps)
    const generators = w.calls.filter((c) => c.agent === 'fermi-generator').length
    expect(generators).toBeGreaterThan(3)
    expect(generators).toBeLessThanOrEqual(6)
  })
  it('verifies leftover batches too', async () => {
    const w = world({ leftovers: ['.fermi-work/b-left'] })
    const r = await runPipeline('food', 5, w.deps)
    expect(r.byCategory.history).toBe(1)
  })
  it('stops starting sessions at a usage limit and reports it', async () => {
    const w = world({ limitAfter: 2 })
    const r = await runPipeline('food', 25, w.deps)
    expect(r.limit).toMatch(/resets 4:20am/)
    expect(w.calls.length).toBeLessThanOrEqual(2 + 4) // the ones already running may finish
  })
})

describe('formatReport', () => {
  it('prints counts, categories and cost only', () => {
    const line = formatReport({
      added: 4,
      byCategory: { food: 3, history: 1 },
      failedChecks: 2,
      rejected: 1,
      cost: { 'fermi-generator': 0.4, 'fermi-verifier': 0.8 },
      limit: null,
    })
    expect(line).toBe(
      '+4 added (food 3, history 1) · 2 failed checks · 1 rejected · $1.20 (drafting $0.40, verifying $0.80), $0.30 per question',
    )
  })
})
