import { describe, expect, it } from 'vitest'
import {
  formatReview,
  issueCode,
  maskNumbers,
  parseJsonArray,
  REVIEW_FLAG,
  reviewPool,
  rewordProblem,
  rulesSection,
  SCREEN_CHUNK,
  screenFilePath,
  UNRESOLVED_FLAG,
  type PoolQuestion,
  type ReviewDeps,
} from '../review.ts'

const q = (id: string, flags: string[] = [], status = 'active'): PoolQuestion => ({
  id,
  question: `Question ${id}?`,
  unit: 'things',
  category: 'fiction',
  answer: 42,
  explanation: 'Because.',
  sources: [{ title: 't', publisher: 'p', quote: '42 things' }],
  _status: status,
  _flags: flags,
})

/** Haiku flags ids in `flag`; Sonnet answers from `decide`. Records every cli call. */
function fake(pool: PoolQuestion[], flag: Record<string, string>, decide: Record<string, object>, extra: Partial<ReviewDeps> = {}) {
  const cli: string[][] = []
  const asks: { model: string; prompt: string }[] = []
  const deps: ReviewDeps = {
    async pool() {
      return pool
    },
    async cli(args) {
      cli.push(args)
      if (args[0] === 'reword') return `✓ added       ${args[1]}-v2\n\n1 added`
      return '✓'
    },
    async ask(model, _system, prompt) {
      asks.push({ model, prompt })
      const ids = prompt.split('\n').map((l) => JSON.parse(l).id as string)
      if (model === 'haiku') {
        const hits = ids.filter((id) => flag[id]).map((id) => ({ id, issue: flag[id], note: 'why' }))
        return { text: `Here you go:\n\`\`\`json\n${JSON.stringify(hits)}\n\`\`\``, costUsd: 0.01, limit: null }
      }
      return { text: JSON.stringify(ids.map((id) => ({ id, ...decide[id] }))), costUsd: 0.1, limit: null }
    },
    ...extra,
  }
  return { deps, cli, asks }
}

describe('review helpers', () => {
  it('holds a reworded draft to the review limits, naming counts only', () => {
    expect(rewordProblem('How many trees grow in a big city park?', 'trees', 4200)).toBeNull()
    expect(rewordProblem(Array.from({ length: 30 }, () => 'word').join(' '), 'x', 1)).toBe('is 30 words (at most 25)')
    expect(rewordProblem('Of the 4200 trees, how many are oaks?', 'trees', 4200)).toBe('gives away the answer')
    expect(screenFilePath('b/drafts/some-id.json')).toBe('b/drafts/some-id.screen.json')
  })
  it('takes §1 of the rules without the category table', () => {
    const md = '# Rules\nintro\n## 1. What makes a good question\n- stands on its own\n### Categories\n| a |\n## 2. Sources'
    expect(rulesSection(md)).toBe('## 1. What makes a good question\n- stands on its own')
  })
  it('finds a JSON array inside a reply', () => {
    expect(parseJsonArray('```json\n[{"id":"a"}]\n```')).toEqual([{ id: 'a' }])
    expect(parseJsonArray('no array here')).toBeNull()
    expect(parseJsonArray('[broken')).toBeNull()
    expect(parseJsonArray('Flagged [2 questions]:\n[{"id":"a"},{"id":"b"}]\nThat is all [done].')).toEqual([{ id: 'a' }, { id: 'b' }])
  })
  it('masks numbers in model-written reasons', () => {
    expect(maskNumbers('already says about 1,665 steps in 1889')).toBe('already says about # steps in #')
  })
  it('only lets short kebab-case issue codes through', () => {
    expect(issueCode('needs-context')).toBe('needs-context')
    expect(issueCode('How long is the thing?')).toBe('other')
    expect(issueCode(7)).toBe('other')
  })
})

describe('reviewPool', () => {
  it('screens only unreviewed active questions and flags the fine ones reviewed', async () => {
    const pool = [q('a'), q('b', [REVIEW_FLAG]), q('c', [], 'retired'), q('d')]
    const f = fake(pool, {}, {})
    const r = await reviewPool(f.deps, { rules: 'rules' })
    expect(r.screened).toBe(2)
    expect(r.passed).toBe(2)
    expect(f.cli).toEqual([['flag', REVIEW_FLAG, 'a', 'd']])
    expect(f.asks.every((a) => a.model === 'haiku')).toBe(true)
  })

  it('keeps, rewords and retires what Sonnet decides, and shows Haiku only what players see', async () => {
    const pool = [q('keep-me'), q('reword-me'), q('retire-me'), q('fine')]
    const f = fake(
      pool,
      { 'keep-me': 'other', 'reword-me': 'needs-context', 'retire-me': 'unclear' },
      {
        'keep-me': { action: 'keep', reason: 'clear enough' },
        'reword-me': { action: 'reword', question: 'In Star Wars, how long is it?', reason: 'names the work' },
        'retire-me': { action: 'retire', reason: 'too obscure' },
      },
    )
    const r = await reviewPool(f.deps, { rules: 'rules' })
    expect(f.asks[0].prompt).not.toContain('42')
    expect(f.asks[1].prompt).toContain('"answer":42')
    expect(r.kept).toEqual(['keep-me'])
    expect(r.reworded).toEqual([{ id: 'reword-me', newId: 'reword-me-v2', issue: 'needs-context' }])
    expect(r.retired).toEqual([{ id: 'retire-me', issue: 'unclear' }])
    expect(f.cli).toContainEqual(['flag', REVIEW_FLAG, 'fine'])
    expect(f.cli).toContainEqual(['flag', REVIEW_FLAG, 'keep-me', 'reword-me-v2'])
    expect(f.cli.find((c) => c[0] === 'reword')).toEqual([
      'reword',
      'reword-me',
      '--question',
      'In Star Wars, how long is it?',
      '--reason',
      'quality review (needs-context): names the work',
    ])
    expect(f.cli).toContainEqual(['status', 'retire-me', 'retired', '--resolution', 'quality review (unclear): too obscure'])
  })

  it('leaves questions with missing or bad decisions unflagged, for the next run', async () => {
    const f = fake([q('a'), q('b')], { a: 'unclear', b: 'unclear' }, { a: { action: 'reword', reason: 'x' } })
    const r = await reviewPool(f.deps, { rules: 'rules' })
    expect(r.unresolved).toEqual([
      { id: 'a', why: 'no-decision' },
      { id: 'b', why: 'no-decision' },
    ])
    expect(f.cli).toEqual([])
  })

  it('does not apply a reword that is too long or gives away the answer, and skips it next time', async () => {
    const long = `In ${'very '.repeat(30)}long words, how many?`
    const f = fake(
      [q('a'), q('b')],
      { a: 'needs-context', b: 'needs-context' },
      {
        a: { action: 'reword', question: long, reason: 'x' },
        b: { action: 'reword', question: 'Is it about 42 things?', reason: 'x' },
      },
    )
    const r = await reviewPool(f.deps, { rules: 'rules' })
    expect(r.unresolved).toEqual([
      { id: 'a', why: 'too-long' },
      { id: 'b', why: 'reveals-answer' },
    ])
    expect(r.details.find((d) => d.id === 'b')?.after).not.toContain('42')
    expect(f.cli).toEqual([['flag', UNRESOLVED_FLAG, 'a', 'b']])
    // skipped next run, unless asked to retry
    const pool = [q('a', [UNRESOLVED_FLAG])]
    expect((await reviewPool(fake(pool, {}, {}).deps, { rules: 'rules' })).screened).toBe(0)
    expect((await reviewPool(fake(pool, {}, {}).deps, { rules: 'rules', retryUnresolved: true })).screened).toBe(1)
  })

  it('marks a reword the server refuses as unresolved', async () => {
    const f = fake(
      [q('a')],
      { a: 'needs-context' },
      { a: { action: 'reword', question: 'Better?', reason: 'x' } },
      {
        async cli(args) {
          f.cli.push(args)
          return args[0] === 'reword' ? '✗ invalid     a-v2\n    - recheckAfter is already in the past' : '✓'
        },
      },
    )
    const r = await reviewPool(f.deps, { rules: 'rules' })
    expect(r.unresolved).toEqual([{ id: 'a', why: 'refused' }])
    expect(f.cli.at(-1)).toEqual(['flag', UNRESOLVED_FLAG, 'a'])
  })

  it('a failed flag call does not lose the report', async () => {
    const f = fake(
      [q('a')],
      {},
      {},
      {
        async cli() {
          throw new Error('pnpm q flag failed')
        },
      },
    )
    const r = await reviewPool(f.deps, { rules: 'rules' })
    expect(r.passed).toBe(1)
    expect(r.flagFailures).toBe(1)
    expect(formatReview(r).join('\n')).toMatch(/1 question\(s\) couldn't be flagged/)
  })

  it('changes nothing in a dry run', async () => {
    const f = fake([q('a'), q('b')], { a: 'needs-context' }, { a: { action: 'reword', question: 'Better?', reason: 'x' } })
    const r = await reviewPool(f.deps, { rules: 'rules', dryRun: true })
    expect(f.cli).toEqual([])
    expect(r.reworded).toEqual([{ id: 'a', newId: '(dry run)', issue: 'needs-context' }])
  })

  it('reports progress with counts only', async () => {
    const pool = Array.from({ length: SCREEN_CHUNK + 5 }, (_, i) => q(`q${i}`))
    const f = fake(pool, { q3: 'unclear' }, { q3: { action: 'retire', reason: 'x' } })
    const msgs: string[] = []
    await reviewPool(f.deps, { rules: 'rules', onProgress: (m) => msgs.push(m) })
    expect(msgs).toEqual([
      '45 question(s) to review',
      `screened ${SCREEN_CHUNK}/45 · 1 flagged`,
      'screened 45/45 · 1 flagged',
      'deciding on 1 flagged question(s)',
      'decided 1/1 · 0 kept, 0 reworded, 1 retired, 0 unresolved',
    ])
    expect(msgs.join()).not.toContain('Question')
  })

  it('screens in chunks and respects --limit', async () => {
    const pool = Array.from({ length: SCREEN_CHUNK + 5 }, (_, i) => q(`q${i}`))
    const f = fake(pool, {}, {})
    await reviewPool(f.deps, { rules: 'rules' })
    expect(f.asks).toHaveLength(2)
    const g = fake(pool, {}, {})
    expect((await reviewPool(g.deps, { rules: 'rules', limit: 3 })).screened).toBe(3)
  })

  it('stops at a usage limit without flagging anything it did not screen', async () => {
    const f = fake(
      [q('a')],
      {},
      {},
      {
        async ask() {
          return { text: '', costUsd: 0, limit: 'session limit · resets 4:20am' }
        },
      },
    )
    const r = await reviewPool(f.deps, { rules: 'rules' })
    expect(r.limit).toMatch(/resets/)
    expect(r.screened).toBe(0)
    expect(f.cli).toEqual([])
  })

  it('prints ids, codes, counts and cost only', () => {
    const lines = formatReview({
      screened: 10,
      passed: 7,
      kept: ['k'],
      reworded: [{ id: 'a', newId: 'a-v2', issue: 'needs-context' }],
      retired: [{ id: 'b', issue: 'unclear' }],
      details: [],
      unresolved: [{ id: 'c', why: 'refused' }],
      cost: { haiku: 0.02, sonnet: 0.1 },
      limit: null,
      flagFailures: 0,
    })
    expect(lines).toEqual([
      'reworded  a → a-v2 (needs-context)',
      'retired   b (unclear)',
      'unresolved c (refused)',
      'screened 10: 7 fine, 1 kept after a second look, 1 reworded, 1 retired, 1 unresolved · $0.12 (screening $0.02, editing $0.10)',
    ])
  })
})
