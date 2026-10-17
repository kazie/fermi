// Finds the numbers a source quote states, in the many ways people write them,
// so ingest can check that a quote really backs the number it is cited for.

const SCALE_WORDS: Record<string, number> = {
  thousand: 1e3,
  k: 1e3,
  million: 1e6,
  millions: 1e6,
  mn: 1e6,
  m: 1e6,
  billion: 1e9,
  billions: 1e9,
  bn: 1e9,
  b: 1e9,
  trillion: 1e12,
  trillions: 1e12,
  tn: 1e12,
  quadrillion: 1e15,
  hundred: 1e2,
  lakh: 1e5,
  crore: 1e7,
}

const WORD_NUMBERS: Record<string, number> = {
  a: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  hundred: 100,
  dozen: 12,
}

const SUP: Record<string, string> = {
  '⁰': '0',
  '¹': '1',
  '²': '2',
  '³': '3',
  '⁴': '4',
  '⁵': '5',
  '⁶': '6',
  '⁷': '7',
  '⁸': '8',
  '⁹': '9',
  '⁻': '-',
}

export function extractNumbers(text: string): number[] {
  const out: number[] = []
  const t = text.replace(/[\u00A0\u202F\u2009]/g, ' ').replace(/[\u2212\u2013]/g, '-')
  const numRe =
    /(\d{1,3}(?:[, ]\d{3})+(?:\.\d+)?|\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)(\s*(?:[×x*]\s*10\s*(?:\^|\*\*)?\s*([-⁻]?[\d⁰¹²³⁴⁵⁶⁷⁸⁹]+)|e([-+]?\d+)))?(?:\s*-?\s*([a-zA-Z]+))?/g
  for (const m of t.matchAll(numRe)) {
    const [, numText, , expA, expB, word] = m
    const bases = interpretations(numText)
    let mult = 1
    const expText = expA ?? expB
    if (expText) {
      const e = Number(
        expText
          .split('')
          .map((c) => SUP[c] ?? c)
          .join(''),
      )
      if (Number.isFinite(e)) mult *= 10 ** e
    }
    const w = word?.toLowerCase()
    const scale = w && SCALE_WORDS[w] ? SCALE_WORDS[w] : 1
    for (const b of bases) {
      out.push(b * mult)
      if (scale !== 1) out.push(b * mult * scale)
    }
  }
  // superscript powers: 10⁹
  for (const m of t.matchAll(/10([⁻]?[⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g)) {
    out.push(
      10 **
        Number(
          m[1]
            .split('')
            .map((c) => SUP[c])
            .join(''),
        ),
    )
  }
  // "a million", "two billion", "a dozen"
  for (const m of t.toLowerCase().matchAll(/\b([a-z]+)[\s-]+(hundred|thousand|million|billion|trillion|dozen)\b/g)) {
    const n = WORD_NUMBERS[m[1]]
    if (n !== undefined) out.push(n * (m[2] === 'dozen' ? 12 : SCALE_WORDS[m[2]]))
  }
  return out
}

function interpretations(s: string): number[] {
  const res = new Set<number>()
  if (/^\d{1,3}(?:[, ]\d{3})+(?:\.\d+)?$/.test(s)) res.add(Number(s.replace(/[, ]/g, '')))
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(s)) res.add(Number(s.replace(/\./g, '').replace(',', '.')))
  if (/^\d+(?:[.,]\d+)?$/.test(s)) {
    res.add(Number(s.replace(',', '.')))
    if (/^\d+,\d{3}$/.test(s)) res.add(Number(s.replace(',', '')))
    if (/^\d+\.\d{3}$/.test(s)) res.add(Number(s.replace('.', '')))
  }
  return [...res].filter(Number.isFinite)
}

/** Unit-prefix and percent conversions that don't change what the number says (km ↔ m, % ↔ fraction). */
const SCALES = [1, 1e-2, 1e2, 1e3, 1e-3, 1e6, 1e-6, 1e9, 1e-9, 1e12, 1e-12]

export function quoteContainsNumber(quote: string, target: number, tolerance = 0.005): boolean {
  if (!(target > 0)) return false
  const nums = extractNumbers(quote)
  return nums.some((n) => n > 0 && SCALES.some((s) => Math.abs(n * s - target) / target <= tolerance))
}
