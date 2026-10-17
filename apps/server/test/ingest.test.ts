import { describe, expect, it } from 'vitest'
import { ingestQuestion, checkQuestion } from '../src/questions/ingest.ts'
import { extractNumbers, quoteContainsNumber } from '../src/questions/numbers.ts'
import { normalizeText, textSimilarity } from '../src/questions/dedupe.ts'
import { addRejection, getQuestion } from '../src/questions/repo.ts'
import { derivedQuestion, makeQuestion, testDb } from './fixtures.ts'

const NOW = new Date('2026-10-17T00:00:00Z')

describe('number extraction from quotes', () => {
  it.each([
    ['held together by 2,500,000 rivets', 2_500_000],
    ['about 2.5 million rivets', 2_500_000],
    ['2 500 000 rivets', 2_500_000],
    ['2.500.000 Nieten', 2_500_000],
    ['8.1 billion people', 8.1e9],
    ['8.1bn people', 8.1e9],
    ['384,400 km away', 384_400],
    ['about 1.2 × 10^9 years', 1.2e9],
    ['roughly 3e8 m/s', 3e8],
    ['10⁹ stars', 1e9],
    ['a million steps', 1e6],
    ['two billion heartbeats', 2e9],
    ['1,665 steps', 1665],
    ['330 m tall', 330],
  ])('%s → %d', (quote, n) => {
    expect(quoteContainsNumber(quote, n)).toBe(true)
  })
  it('accepts unit-prefix conversions (km in the quote, m in the input)', () => {
    expect(quoteContainsNumber('384,400 km', 384_400_000)).toBe(true)
    expect(quoteContainsNumber('70% of the surface', 0.7)).toBe(true)
  })
  it('rejects quotes without the number', () => {
    expect(quoteContainsNumber('millions of rivets', 2_500_000)).toBe(false)
    expect(quoteContainsNumber('1,665 steps', 1700)).toBe(false)
  })
  it('extracts multiple numbers', () => {
    expect(extractNumbers('18,038 parts and 2,500,000 rivets')).toEqual(expect.arrayContaining([18038, 2_500_000]))
  })
})

describe('checkQuestion', () => {
  it('accepts a good direct question', () => {
    expect(checkQuestion(makeQuestion(), NOW)).toEqual([])
  })
  it('accepts a good derived question', () => {
    expect(checkQuestion(derivedQuestion(), NOW)).toEqual([])
  })
  it('rejects a direct question whose quote lacks the number', () => {
    const q = makeQuestion()
    q.sources[0].quote = 'The tower is held together by millions of rivets.'
    expect(checkQuestion(q, NOW).join()).toMatch(/no source quote contains the answer/)
  })
  it('rejects a derived formula that does not match the answer', () => {
    const errs = checkQuestion(derivedQuestion({ answer: 99 }), NOW)
    expect(errs.join()).toMatch(/formula evaluates to/)
  })
  it('rejects an input that the formula does not set', () => {
    const q = derivedQuestion()
    q.formula = 'people = 8.1 billion\n1.7 * people / 384_400_000'
    expect(checkQuestion(q, NOW).join()).toMatch(/input height is not defined/)
  })
  it('rejects an input whose cited quote lacks it', () => {
    const q = derivedQuestion()
    q.sources[1].quote = 'People are reasonably tall.'
    expect(checkQuestion(q, NOW).join()).toMatch(/input height = 1.7: none of its cited quotes/)
  })
  it('rejects a snapshot far from the access date', () => {
    const q = makeQuestion()
    q.sources[0].archiveUrl = 'https://web.archive.org/web/20200101000000/https://www.toureiffel.paris/'
    q.sources[0].archivedAt = '2020-01-01T00:00:00Z'
    expect(checkQuestion(q, NOW).join()).toMatch(/more than 7 days from the access date/)
  })
  it('rejects mismatched archivedAt', () => {
    const q = makeQuestion()
    q.sources[0].archivedAt = '2026-09-01T00:00:00Z'
    expect(checkQuestion(q, NOW).join()).toMatch(/archivedAt does not match/)
  })
  it('rejects future access dates', () => {
    const q = makeQuestion()
    q.sources[0].accessed = '2027-01-01'
    q.sources[0].archiveUrl = 'https://web.archive.org/web/20270101000000/https://x.org/'
    q.sources[0].archivedAt = '2027-01-01T00:00:00Z'
    expect(checkQuestion(q, NOW).join()).toMatch(/in the future/)
  })
})

describe('ingestQuestion', () => {
  it('adds a valid question', () => {
    const db = testDb()
    const q = makeQuestion()
    expect(ingestQuestion(db, q, { now: NOW })).toEqual({ status: 'added', id: q.id })
    expect(getQuestion(db, q.id)?.status).toBe('active')
  })

  it('rejects schema errors: missing validAsOf, missing snapshot', () => {
    const db = testDb()
    const { validAsOf: _, ...noDate } = makeQuestion()
    const r1 = ingestQuestion(db, noDate, { now: NOW })
    expect(r1.status).toBe('invalid')
    expect(JSON.stringify(r1)).toMatch(/validAsOf/)
    const q = makeQuestion()
    const { archiveUrl: _a, ...src } = q.sources[0]
    const r2 = ingestQuestion(db, { ...q, sources: [src] }, { now: NOW })
    expect(JSON.stringify(r2)).toMatch(/archiveUrl/)
  })

  it('rejects an id that already exists', () => {
    const db = testDb()
    const q = makeQuestion()
    ingestQuestion(db, q, { now: NOW })
    expect(
      ingestQuestion(db, { ...q, question: 'A totally different question about elephants and their weight' }, { now: NOW }).status,
    ).toBe('invalid')
  })

  it('catches exact duplicates and paraphrases', () => {
    const db = testDb()
    ingestQuestion(db, makeQuestion(), { now: NOW })
    const exact = ingestQuestion(db, makeQuestion(), { now: NOW })
    expect(exact.status).toBe('duplicate')
    const para = ingestQuestion(db, makeQuestion({ question: 'How many rivets are holding the Eiffel tower together?' }), { now: NOW })
    expect(para.status).toBe('duplicate')
  })

  it('catches the rivets/bolts paraphrase via the same answer', () => {
    const db = testDb()
    ingestQuestion(db, makeQuestion(), { now: NOW })
    const q = makeQuestion({ question: 'How many bolts are in the Eiffel Tower?', unit: 'bolts' })
    q.sources[0].url = 'https://example.com/eiffel-facts'
    q.sources[0].quote = 'There are 2.5 million rivets in the structure.'
    const r = ingestQuestion(db, q, { now: NOW })
    expect(r.status).toBe('duplicate')
    if (r.status === 'duplicate') expect(r.matches[0].reasons.join()).toMatch(/same answer/)
  })

  it('catches the same passage of the same source, even with other wording', () => {
    const db = testDb()
    ingestQuestion(db, makeQuestion(), { now: NOW })
    const q = makeQuestion({ question: 'What is the number of small metal fasteners in Paris’s iron landmark?', answer: 2_500_000 * 1.0 })
    const r = ingestQuestion(db, q, { now: NOW })
    expect(r.status).toBe('duplicate')
  })

  it('lets independent questions with the same answer through', () => {
    const db = testDb()
    ingestQuestion(db, makeQuestion(), { now: NOW })
    const q = makeQuestion({ question: 'How many litres of water does an Olympic swimming pool hold?', unit: 'litres', category: 'sport' })
    q.sources[0] = { ...q.sources[0], url: 'https://example.org/pool', quote: 'An Olympic pool holds 2,500,000 litres of water.' }
    expect(ingestQuestion(db, q, { now: NOW }).status).toBe('added')
  })

  it('grey zone → 409 needs_review, then distinctFrom clears it', () => {
    const db = testDb()
    const base = makeQuestion({
      id: 'eiffel-steps',
      question: 'How many steps lead to the top of the Eiffel Tower?',
      unit: 'steps',
      answer: 1665,
    })
    base.sources[0] = { ...base.sources[0], url: 'https://example.org/steps', quote: 'There are 1,665 steps to the top.' }
    expect(ingestQuestion(db, base, { now: NOW }).status).toBe('added')

    const near = makeQuestion({
      id: 'eiffel-steps-2nd',
      question: 'How many steps lead to the second floor of the Eiffel Tower?',
      unit: 'steps',
      answer: 674,
    })
    near.sources[0] = { ...near.sources[0], url: 'https://example.org/steps2', quote: 'The second floor is 674 steps up.' }
    const r = ingestQuestion(db, near, { now: NOW })
    expect(r.status).toBe('needs_review')
    if (r.status === 'needs_review') {
      expect(r.matches[0].id).toBe('eiffel-steps')
      expect(JSON.stringify(r.matches)).not.toMatch(/1665|1,665/) // never leaks answers
    }
    const ok = ingestQuestion(
      db,
      { ...near, distinctFrom: ['eiffel-steps'], distinctReason: 'Second floor vs the top: different counts.' },
      { now: NOW },
    )
    expect(ok.status).toBe('added')
  })

  it('hard duplicates cannot be overridden with distinctFrom', () => {
    const db = testDb()
    const a = makeQuestion({ id: 'a-one' })
    ingestQuestion(db, a, { now: NOW })
    const r = ingestQuestion(db, makeQuestion({ id: 'a-two', distinctFrom: ['a-one'], distinctReason: 'trust me' }), { now: NOW })
    expect(r.status).toBe('duplicate')
  })

  it('remembers rejections', () => {
    const db = testDb()
    addRejection(db, 'How many rivets hold the Eiffel Tower together?', 'dead source')
    const r = ingestQuestion(db, makeQuestion(), { now: NOW })
    expect(r.status).toBe('needs_review')
    if (r.status === 'needs_review') expect(r.matches[0].rejectionReason).toBe('dead source')
  })

  it('replaces retires the old version and skips dedupe against it', () => {
    const db = testDb()
    const old = makeQuestion({ id: 'old-version' })
    ingestQuestion(db, old, { now: NOW })
    const fixed = makeQuestion({ id: 'new-version', explanation: 'Corrected explanation: 2.5 million rivets, 18,038 parts.' })
    expect(ingestQuestion(db, fixed, { now: NOW, replaces: 'old-version' }).status).toBe('added')
    expect(getQuestion(db, 'old-version')?.status).toBe('retired')
  })

  it('normalises text for comparison', () => {
    expect(normalizeText('How many Rivets are in the Eiffel Tower?')).toBe('rivet eiffel tower')
    expect(textSimilarity(normalizeText('How many cats live in Paris?'), normalizeText('How tall is Mount Everest?'))).toBeLessThan(0.2)
  })
})

describe('template questions', () => {
  const tq = (slot: string, n: number, extra: Partial<ReturnType<typeof makeQuestion>> = {}) => {
    const q = makeQuestion({
      id: `visitors-${slot.toLowerCase().replace(/\W+/g, '-')}`,
      question: `How many tourists visited ${slot} in 2025?`,
      unit: 'tourists',
      category: 'geography',
      answer: n,
      template: { id: 'visitors-per-year', slot },
      ...extra,
    })
    q.sources[0] = { ...q.sources[0], url: 'https://example.org/tourism-table', quote: `${slot}: ${n.toLocaleString('en-US')} visitors` }
    return q
  }

  it('siblings with different slots are not duplicates, the same slot is', () => {
    const db = testDb()
    expect(ingestQuestion(db, tq('Antarctica', 80_000), { now: NOW }).status).toBe('added')
    expect(ingestQuestion(db, tq('Iceland', 2_200_000), { now: NOW }).status).toBe('added')
    const again = ingestQuestion(db, tq('antarctica', 81_000, { id: 'visitors-antarctica-2' }), { now: NOW })
    expect(again.status).toBe('duplicate')
  })

  it('a non-template paraphrase of a template question is still caught by wording', () => {
    const db = testDb()
    ingestQuestion(db, tq('Antarctica', 80_000), { now: NOW })
    const q = makeQuestion({
      id: 'loose-antarctica',
      question: 'How many tourists visited Antarctica in 2025?',
      unit: 'tourists',
      answer: 80_000,
    })
    q.sources[0] = { ...q.sources[0], url: 'https://example.org/other', quote: 'Antarctica had 80,000 visitors.' }
    expect(ingestQuestion(db, q, { now: NOW }).status).toBe('duplicate')
  })

  it('dry run checks everything but writes nothing', () => {
    const db = testDb()
    const q = tq('Norway', 6_000_000)
    expect(ingestQuestion(db, q, { now: NOW, dryRun: true })).toEqual({ status: 'valid', id: q.id })
    expect(getQuestion(db, q.id)).toBeUndefined()
    expect(ingestQuestion(db, { ...q, answer: 5 }, { now: NOW, dryRun: true }).status).toBe('invalid')
  })
})
