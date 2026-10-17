// Tokenizer for a single calculator line.
// Forgiving on input (unicode operators, `x` as multiply between numbers, superscripts)
// but strict on locale-ambiguous numbers: `1,000` and `1 000` are errors with a hint.

export type TokenType =
  | 'num'
  | 'ident'
  | 'op' // + - * / ^
  | 'percent'
  | 'lparen'
  | 'rparen'
  | 'comma'
  | 'assign'
  | 'comment'

export interface Token {
  type: TokenType
  /** The text as typed. */
  raw: string
  start: number
  end: number
  /** Normalised operator (`*`, `/`, `+`, `-`, `^`) for op tokens. */
  op?: '+' | '-' | '*' | '/' | '^'
  /** For num tokens. */
  value?: number
  /** For num tokens with an attached suffix like `k` or `bn`. */
  suffix?: string
  /** True when this op token is a `x` written between numbers. */
  xMul?: boolean
}

export class CalcError extends Error {
  start: number
  end: number
  fix?: string
  constructor(message: string, start: number, end: number, fix?: string) {
    super(message)
    this.start = start
    this.end = end
    this.fix = fix
  }
}

export const SUFFIXES: Record<string, number> = {
  k: 1e3,
  K: 1e3,
  M: 1e6,
  B: 1e9,
  bn: 1e9,
  T: 1e12,
}

const SUFFIX_NAMES: Record<string, string> = {
  k: 'thousand',
  K: 'thousand',
  M: 'million',
  B: 'billion',
  bn: 'billion',
  T: 'trillion',
}

export function suffixName(suffix: string): string {
  return SUFFIX_NAMES[suffix] ?? suffix
}

const SUPERSCRIPTS: Record<string, string> = {
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
}

const MUL_CHARS = new Set(['*', '×', '·', '⋅', '∙', '✕', '✖'])
const DIV_CHARS = new Set(['/', '÷', '∕'])
const MINUS_CHARS = new Set(['-', '−', '–', '—'])

const isDigit = (c: string | undefined) => c !== undefined && c >= '0' && c <= '9'
const isIdentStart = (c: string | undefined) => c !== undefined && /[\p{L}_]/u.test(c)
const isIdentPart = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}_]/u.test(c)
const isSpace = (c: string | undefined) => c !== undefined && /\s/.test(c)

export function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const n = src.length

  const prevSignificant = () => tokens[tokens.length - 1]

  while (i < n) {
    const c = src[i]

    if (isSpace(c)) {
      i++
      continue
    }

    if (c === '#') {
      tokens.push({ type: 'comment', raw: src.slice(i), start: i, end: n })
      break
    }

    if (isDigit(c) || (c === '.' && isDigit(src[i + 1]))) {
      tokens.push(readNumber(src, i))
      i = tokens[tokens.length - 1].end
      continue
    }

    if (isIdentStart(c)) {
      let j = i + 1
      const prev = prevSignificant()
      // `3x4` / `3 x 4`: an `x` right after a number, followed by a number, is multiplication.
      if ((c === 'x' || c === 'X') && prev?.type === 'num') {
        let k = i + 1
        while (isSpace(src[k])) k++
        if (isDigit(src[k]) || (src[k] === '.' && isDigit(src[k + 1]))) {
          tokens.push({ type: 'op', raw: c, op: '*', start: i, end: i + 1, xMul: true })
          i++
          continue
        }
      }
      while (isIdentPart(src[j])) j++
      tokens.push({ type: 'ident', raw: src.slice(i, j), start: i, end: j })
      i = j
      continue
    }

    if (c in SUPERSCRIPTS || c === '⁻') {
      // `r²` → `r ^ 2`
      let j = i
      let digits = ''
      if (src[j] === '⁻') {
        digits = '-'
        j++
      }
      while (src[j] in SUPERSCRIPTS) {
        digits += SUPERSCRIPTS[src[j]]
        j++
      }
      if (digits === '' || digits === '-') throw new CalcError('A lone superscript minus needs digits after it', i, j)
      tokens.push({ type: 'op', raw: '', op: '^', start: i, end: i })
      tokens.push({ type: 'num', raw: src.slice(i, j), value: Number(digits), start: i, end: j })
      i = j
      continue
    }

    if (c === '*' && src[i + 1] === '*') {
      tokens.push({ type: 'op', raw: '**', op: '^', start: i, end: i + 2 })
      i += 2
      continue
    }
    if (MUL_CHARS.has(c)) {
      tokens.push({ type: 'op', raw: c, op: '*', start: i, end: i + 1 })
      i++
      continue
    }
    if (DIV_CHARS.has(c)) {
      tokens.push({ type: 'op', raw: c, op: '/', start: i, end: i + 1 })
      i++
      continue
    }
    if (MINUS_CHARS.has(c)) {
      tokens.push({ type: 'op', raw: c, op: '-', start: i, end: i + 1 })
      i++
      continue
    }
    if (c === '+') {
      tokens.push({ type: 'op', raw: c, op: '+', start: i, end: i + 1 })
      i++
      continue
    }
    if (c === '^') {
      tokens.push({ type: 'op', raw: c, op: '^', start: i, end: i + 1 })
      i++
      continue
    }
    if (c === '%') {
      tokens.push({ type: 'percent', raw: c, start: i, end: i + 1 })
      i++
      continue
    }
    if (c === '(' || c === '[' || c === '{') {
      tokens.push({ type: 'lparen', raw: c, start: i, end: i + 1 })
      i++
      continue
    }
    if (c === ')' || c === ']' || c === '}') {
      tokens.push({ type: 'rparen', raw: c, start: i, end: i + 1 })
      i++
      continue
    }
    if (c === ',' || c === ';') {
      tokens.push({ type: 'comma', raw: c, start: i, end: i + 1 })
      i++
      continue
    }
    if (c === '=') {
      tokens.push({ type: 'assign', raw: c, start: i, end: i + 1 })
      i++
      continue
    }

    throw new CalcError(`I don't know what “${c}” means here`, i, i + 1)
  }

  checkSeparators(src, tokens)
  return tokens
}

function readNumber(src: string, start: number): Token {
  let i = start
  let text = ''
  const digits = () => {
    let d = ''
    while (isDigit(src[i]) || (src[i] === '_' && isDigit(src[i + 1]) && d !== '')) {
      if (src[i] !== '_') d += src[i]
      i++
    }
    return d
  }
  text += digits()
  if (src[i] === '_') {
    throw new CalcError('An underscore must sit between digits, like 1_000', i, i + 1)
  }
  if (src[i] === '.' && isDigit(src[i + 1])) {
    i++
    text += '.' + digits()
  } else if (src[i] === '.' && !isIdentStart(src[i + 1])) {
    // `3.` is fine: means 3
    i++
  }
  if (
    (src[i] === 'e' || src[i] === 'E') &&
    (isDigit(src[i + 1]) || ((src[i + 1] === '+' || src[i + 1] === '-' || src[i + 1] === '−') && isDigit(src[i + 2])))
  ) {
    i++
    let exp = ''
    if (src[i] === '+' || src[i] === '-' || src[i] === '−') {
      exp = src[i] === '+' ? '' : '-'
      i++
    }
    while (isDigit(src[i])) exp += src[i++]
    text += 'e' + exp
  }
  if (src[i] === '.' && isDigit(src[i + 1])) {
    throw new CalcError('A number can only have one decimal point', i, i + 1)
  }
  let value = Number(text)
  let suffix: string | undefined
  // An attached suffix (`5k`, `2.5bn`) must be a whole word: `5km` is 5 × km.
  for (const s of ['bn', 'k', 'K', 'M', 'B', 'T']) {
    if (src.startsWith(s, i) && !isIdentPart(src[i + s.length])) {
      suffix = s
      value *= SUFFIXES[s]
      i += s.length
      break
    }
  }
  return { type: 'num', raw: src.slice(start, i), value, suffix, start, end: i }
}

/** Reject `1,000` / `1,5` / `1 000` style numbers, which mean different things in different locales. */
function checkSeparators(src: string, tokens: Token[]) {
  for (let t = 0; t < tokens.length - 1; t++) {
    const a = tokens[t]
    const b = tokens[t + 1]
    if (a.type === 'num' && !a.suffix && b.type === 'comma' && b.start === a.end) {
      const next = tokens[t + 2]
      if (next?.type === 'num' && next.start === b.end) {
        // Collect `1,000,000`: only while each comma and the number after it touch.
        const groups = [a.raw]
        let last = t
        while (
          tokens[last + 1]?.type === 'comma' &&
          tokens[last + 1].start === tokens[last].end &&
          tokens[last + 2]?.type === 'num' &&
          tokens[last + 2].start === tokens[last + 1].end
        ) {
          groups.push(tokens[last + 2].raw)
          last += 2
        }
        const looksGrouped = groups.slice(1).every((g) => /^\d{3}$/.test(g))
        // `1,5` is probably a decimal; `1,2,3` is anyone's guess, so no automatic fix for it.
        const fix = looksGrouped ? groups.join('_') : groups.length === 2 ? `${groups[0]}.${groups[1]}` : undefined
        throw new CalcError(
          looksGrouped
            ? `Use _ to group digits (commas mean different things in different countries): ${fix}`
            : fix
              ? `Use . for decimals: ${fix}. To separate function arguments, add a space after the comma.`
              : 'Commas inside numbers are ambiguous: use . for decimals, _ to group digits, or “, ” between function arguments.',
          a.start,
          tokens[last].end,
          fix,
        )
      }
    }
    if (a.type === 'num' && b.type === 'num' && !b.raw.match(/^[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]/)) {
      const between = src.slice(a.end, b.start)
      if (/^\s+$/.test(between) && /^\d{3}(\.\d+)?$/.test(b.raw) && /^\d{1,3}$/.test(a.raw)) {
        let k = t + 1
        const groups = [a.raw, b.raw]
        while (
          tokens[k + 1]?.type === 'num' &&
          /^\d{3}(\.\d+)?$/.test(tokens[k + 1].raw) &&
          /^\s+$/.test(src.slice(tokens[k].end, tokens[k + 1].start))
        ) {
          groups.push(tokens[k + 1].raw)
          k++
        }
        const fix = groups.join('_')
        throw new CalcError(`Use _ to group digits (spaces are ambiguous): ${fix}`, a.start, tokens[k].end, fix)
      }
      throw new CalcError(`Two numbers in a row: did you mean ${a.raw} * ${b.raw}?`, a.start, b.end, `${a.raw} * ${b.raw}`)
    }
  }
}
