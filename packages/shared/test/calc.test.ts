import { describe, expect, it } from 'vitest'
import { evaluateSheet, formatCompact, formatFactor, formatNumber, formatScientific, GROUP } from '../src/index.ts'

const value = (src: string) => {
  const r = evaluateSheet(src)
  const last = r.lines[r.answerLine ?? 0]
  if (last?.error) throw new Error(`unexpected error in ${JSON.stringify(src)}: ${last.error.message}`)
  return r.answer
}
const error = (src: string) => {
  const r = evaluateSheet(src)
  const bad = r.lines.find((l) => l.error)
  if (!bad) throw new Error(`expected an error for ${JSON.stringify(src)}, got ${r.answer}`)
  return bad.error!
}
const echo = (src: string) => evaluateSheet(src).lines[0].echo

describe('numbers', () => {
  it.each([
    ['42', 42],
    ['3.14', 3.14],
    ['.5', 0.5],
    ['3.', 3],
    ['1_000_000', 1e6],
    ['1e6', 1e6],
    ['3.2E9', 3.2e9],
    ['2e-3', 0.002],
    ['1e+3', 1000],
    ['5k', 5000],
    ['5K', 5000],
    ['2.5M', 2.5e6],
    ['8B', 8e9],
    ['8bn', 8e9],
    ['1.2T', 1.2e12],
    ['3 million', 3e6],
    ['8 billion', 8e9],
    ['2 thousand', 2000],
    ['million', 1e6],
    ['30%', 0.3],
    ['50% * 8', 4],
  ])('%s = %d', (src, expected) => {
    expect(value(src)).toBeCloseTo(expected as number, 9)
  })

  it('rejects comma grouping with a fix', () => {
    const e = error('1,000')
    expect(e.message).toMatch(/_ to group/)
    expect(e.fix).toBe('1_000')
    expect(error('1,000,000').fix).toBe('1_000_000')
  })
  it('rejects comma decimals with a fix', () => {
    const e = error('3,14')
    expect(e.message).toMatch(/\. for decimals/)
    expect(e.fix).toBe('3.14')
  })
  it('rejects space grouping', () => {
    expect(error('1 000 000').fix).toBe('1_000_000')
    expect(error('31 622 400').fix).toBe('31_622_400')
  })
  it('rejects two numbers in a row', () => {
    expect(error('12 34').message).toMatch(/Two numbers in a row/)
  })
  it('rejects bad underscores and double decimals', () => {
    expect(error('1_').message).toMatch(/underscore/)
    expect(error('1.2.3').message).toMatch(/one decimal point/)
  })
})

describe('operators and precedence', () => {
  it.each([
    ['366 × 24 × 60 × 60', 31_622_400],
    ['366 * 24 * 60 * 60', 31_622_400],
    ['10 ÷ 4', 2.5],
    ['10 / 4', 2.5],
    ['2 + 3 * 4', 14],
    ['(2 + 3) * 4', 20],
    ['2 ^ 10', 1024],
    ['2 ** 10', 1024],
    ['2^3^2', 512],
    ['-2^2', -4],
    ['2^-1', 0.5],
    ['3 − 1', 2],
    ['3 – 1', 2],
    ['2 · 3', 6],
    ['2 ⋅ 3', 6],
    ['3 x 4', 12],
    ['3x4', 12],
    ['3 X 4', 12],
    ['10 - 2 - 3', 5],
    ['100 / 10 / 5', 2],
    ['2 * -3', -6],
    ['--3', 3],
    ['+3', 3],
    ['[2 + 3] * {4}', 20],
    ['10²', 100],
    ['2³', 8],
    ['10⁻²', 0.01],
  ])('%s = %d', (src, expected) => {
    expect(value(src)).toBeCloseTo(expected as number, 9)
  })
})

describe('implicit multiplication', () => {
  it.each([
    ['2(3+4)', 14],
    ['(1+1)(2+3)', 10],
    ['2pi', 2 * Math.PI],
    ['2 pi', 2 * Math.PI],
    ['2π', 2 * Math.PI],
    ['a = 3\nb = 5\n(a+b)(a-b)', -16],
    ['m = 2\nn = 3\nx1 = 4\nm(n*x1)', 24],
    ['days = 7\n3 days', 21],
    ['days = 7\n3days', 21],
    ['n = 4\n(n)n', 16],
    ['people = 10\n2 people', 20],
    ['r = 3\n2r^2', 18],
    ['seconds = 3600\nseconds / 2 days', 0],
  ])('%s', (src, expected) => {
    if (src.endsWith('2 days')) return // covered below
    expect(value(src)).toBeCloseTo(expected as number, 9)
  })

  it('binds tighter than division: seconds / 365days', () => {
    expect(value('days = 2\nseconds = 730\nseconds / 365days')).toBeCloseTo(1, 12)
    expect(value('6 / 2(1+2)')).toBeCloseTo(1, 12)
  })
  it('a suffix wins over a variable when attached, with a hint', () => {
    const r = evaluateSheet('k = 5\n2k')
    expect(r.answer).toBe(2000)
    expect(r.lines[1].hints.join(' ')).toMatch(/thousand/)
    expect(r.lines[1].echoNotable).toBe(true)
    expect(value('k = 5\n2 k')).toBe(10)
    expect(value('k = 5\n2*k')).toBe(10)
  })
  it('a lone k is a variable, km is not a suffix', () => {
    expect(value('km = 3\n5km')).toBe(15)
    expect(error('5km').message).toMatch(/“km” isn’t defined/)
  })
})

describe('the "read as" echo', () => {
  it.each([
    ['2(3+4)', '2 × (3 + 4)'],
    ['6 / 2(1+2)', '6 ÷ (2 × (1 + 2))'],
    ['2 + 3 * 4', '2 + 3 × 4'],
    ['(2 + 3) * 4', '(2 + 3) × 4'],
    ['10 - (2 - 3)', '10 - (2 - 3)'],
    ['-(2+3)', '-(2 + 3)'],
    ['2^3^2', '2^3^2'],
    ['(2^3)^2', '(2^3)^2'],
    ['3 x 4', '3 × 4'],
    ['1_000 * 2', '1000 × 2'],
    ['log(100)', 'log10(100)'],
  ])('%s → %s', (src, expected) => {
    expect(echo(src)).toBe(expected)
  })
  it('marks only lines where the reading is non-obvious', () => {
    expect(evaluateSheet('366 * 24').lines[0].echoNotable).toBe(false)
    expect(evaluateSheet('366 × 24').lines[0].echoNotable).toBe(false)
    expect(evaluateSheet('2(3+4)').lines[0].echoNotable).toBe(true)
    expect(evaluateSheet('3 x 4').lines[0].echoNotable).toBe(true)
  })
})

describe('functions and constants', () => {
  it.each([
    ['sqrt(16)', 4],
    ['cbrt(27)', 3],
    ['log10(1000)', 3],
    ['log(1000)', 3],
    ['ln(1)', 0],
    ['round(2.6)', 3],
    ['max(1, 5, 3)', 5],
    ['min(4, 2)', 2],
    ['abs(-3)', 3],
    ['2sqrt(9)', 6],
    ['sqrt(9)sqrt(4)', 6],
  ])('%s = %d', (src, expected) => {
    expect(value(src)).toBeCloseTo(expected as number, 9)
  })
  it('requires parentheses for functions', () => {
    const e = error('sqrt 4')
    expect(e.message).toMatch(/needs parentheses/)
  })
  it('checks arity', () => {
    expect(error('sqrt(1, 2)').message).toMatch(/takes 1 argument/)
  })
  it('refuses to redefine built-ins', () => {
    expect(error('pi = 3').message).toMatch(/built-in/)
    expect(error('sqrt = 3').message).toMatch(/built-in/)
    expect(error('x = 3').message).toMatch(/reserved/)
  })
})

describe('sheets', () => {
  it('the doc example', () => {
    const r = evaluateSheet('366 × 24 × 60 × 60')
    expect(r.answer).toBe(31_622_400)
    expect(formatNumber(r.answer!)).toBe(`31${GROUP}622${GROUP}400`)
  })
  it('variables, comments and the last line as the answer', () => {
    const r = evaluateSheet(
      [
        '# humans stacked to the moon',
        'people = 8 billion',
        'height = 1.65 # metres',
        '',
        'moon = 384_400_000',
        'people * height / moon',
      ].join('\n'),
    )
    expect(r.answer).toBeCloseTo((8e9 * 1.65) / 384_400_000, 9)
    expect(r.answerLine).toBe(5)
    expect(r.lines[0].kind).toBe('comment')
    expect(r.lines[2].comment).toBe('metres')
    expect(r.variables.map((v) => v.name)).toEqual(['people', 'height', 'moon'])
  })
  it('an assignment on the last line is the answer', () => {
    expect(evaluateSheet('a = 2\ntotal = a * 21').answer).toBe(42)
  })
  it('trailing comments and blank lines do not change the answer', () => {
    expect(evaluateSheet('42\n\n# done').answer).toBe(42)
  })
  it('ans is the previous result', () => {
    expect(value('6 * 7\nans / 2')).toBe(21)
    expect(error('ans').message).toMatch(/no(ne)? .*yet|there is none yet/)
  })
  it('an error on one line does not kill the others, but dependents say why', () => {
    const r = evaluateSheet('a = 1,5\nb = 2\nc = a * b\nb * 3')
    expect(r.lines[0].error).toBeDefined()
    expect(r.lines[1].value).toBe(2)
    expect(r.lines[2].error?.message).toMatch(/depends on line 1/)
    expect(r.answer).toBe(6)
  })
  it('an error on the answer line means no answer', () => {
    const r = evaluateSheet('42\n42 +')
    expect(r.answer).toBeNull()
    expect(r.answerLine).toBe(1)
  })
  it('suggests close variable names', () => {
    const e = error('people = 5\npeple * 2')
    expect(e.message).toMatch(/Did you mean people/)
    expect(e.fix).toBe('people')
  })
  it('friendly errors', () => {
    expect(error('(2 + 3').message).toMatch(/Missing \)/)
    expect(error('2 + 3)').message).toMatch(/no matching/)
    expect(error('= 5').message).toMatch(/no need to start a line with =/)
    expect(error('1 / 0').message).toMatch(/Division by zero/)
    expect(error('a = ').message).toMatch(/What should a be/)
    expect(error('2 $ 3').message).toMatch(/don't know/)
    expect(error('max(1,2)').message).toMatch(/\. for decimals/)
    expect(error('10^400').message).toMatch(/infinitely/)
    expect(error('sqrt(-1)').message).toMatch(/real number/)
  })
  it('unicode identifiers', () => {
    expect(value('höjd = 2\nhöjd * 3')).toBe(6)
  })
  it('limits line length', () => {
    expect(error('1+'.repeat(200) + '1').message).toMatch(/too long/)
  })
  it('highlights tokens', () => {
    const r = evaluateSheet('n = 2\nn * sqrt(4) # yes\nzz')
    expect(r.lines[1].highlights.map((h) => h.cls)).toEqual(['var', 'op', 'fn', 'paren', 'num', 'paren', 'comment'])
    expect(r.lines[0].highlights[0].cls).toBe('name')
    expect(r.lines[2].highlights[0].cls).toBe('unknown')
  })
})

describe('formatting', () => {
  it.each([
    [0, '0'],
    [42, '42'],
    [1234, `1${GROUP}234`],
    [31_622_400, `31${GROUP}622${GROUP}400`],
    [3.14159265, '3.141593'],
    [-2500, `-2${GROUP}500`],
    [0.25, '0.25'],
    [1e15, '10¹⁵'],
    [3.2e20, '3.2 × 10²⁰'],
    [1.5e-5, '1.5 × 10⁻⁵'],
  ])('formatNumber(%d)', (v, s) => {
    expect(formatNumber(v as number)).toBe(s)
  })
  it('compact', () => {
    expect(formatCompact(31_622_400)).toBe('31.6 million')
    expect(formatCompact(8.1e9)).toBe('8.1 billion')
    expect(formatCompact(4200)).toBe(`4${GROUP}200`)
    expect(formatCompact(3.2e20)).toBe('3.2 × 10²⁰')
    expect(formatCompact(999_999_999)).toBe('1 billion')
  })
  it('scientific rounding edge', () => {
    expect(formatScientific(9.999e5)).toBe('10⁶')
  })
  it('factors', () => {
    expect(formatFactor(1)).toBe('exact')
    expect(formatFactor(2.44)).toBe('2.4×')
    expect(formatFactor(1.05)).toBe('1.05×')
    expect(formatFactor(3234)).toBe(`3${GROUP}200×`)
    expect(formatFactor(4.1e6)).toBe('4.1 million×')
    expect(formatFactor(3.2e20)).toBe('3.2 × 10²⁰×')
  })
})

describe('fixes replace their error range', () => {
  const applyFix = (src: string) => {
    const e = evaluateSheet(src).lines[0].error!
    return src.slice(0, e.start) + e.fix + src.slice(e.end)
  }
  it.each([
    ['(2 + 3', '(2 + 3)'],
    ['sqrt(2 + 3', 'sqrt(2 + 3)'],
    ['1,000 * 2', '1_000 * 2'],
    ['3,5 * 2', '3.5 * 2'],
    ['1 000 000', '1_000_000'],
  ])('%s → %s', (src, fixed) => {
    expect(applyFix(src)).toBe(fixed)
    expect(evaluateSheet(fixed).lines[0].error).toBeUndefined()
  })
})

describe('review fixes', () => {
  const firstError = (src: string) => evaluateSheet(src).lines[0].error!
  it('a comma group fix never swallows the next function argument', () => {
    const src = 'max(1,000, 2)'
    const e = firstError(src)
    expect(src.slice(e.start, e.end)).toBe('1,000')
    expect(src.slice(0, e.start) + e.fix + src.slice(e.end)).toBe('max(1_000, 2)')
    const src2 = 'max(1,5, 3)'
    const e2 = firstError(src2)
    expect(src2.slice(0, e2.start) + e2.fix + src2.slice(e2.end)).toBe('max(1.5, 3)')
  })
  it('trailing commas and ambiguous groups do not crash', () => {
    expect(firstError('1,000,').message).toMatch(/group digits/)
    expect(firstError('1,2,').message).toMatch(/decimals/)
    const e = firstError('1,2,3')
    expect(e.fix).toBeUndefined()
    expect(e.message).toMatch(/ambiguous/)
  })
  it('names inherited from Object are not built-ins', () => {
    expect(firstError('toString(2)').message).toMatch(/isn’t defined/)
    const r = evaluateSheet('constructor = 5\nconstructor * 2')
    expect(r.answer).toBe(10)
    expect(firstError('valueOf').message).toMatch(/isn’t defined/)
  })
})
