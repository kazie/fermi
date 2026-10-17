// Pratt parser for one calculator line.
//
// Precedence (low → high):
//   + -                        10
//   * /  (explicit)            20
//   implicit multiplication    25   `seconds / 365days` = seconds / (365 × days)
//   unary minus                30   `-2^2` = -(2^2)
//   ^                          40   right associative
//   %  (postfix)               50

import { CalcError, tokenize, type Token } from './tokenizer.ts'

export type Node =
  | { kind: 'num'; value: number; raw: string; suffix?: string; start: number; end: number }
  | { kind: 'var'; name: string; start: number; end: number }
  | { kind: 'neg'; expr: Node; start: number; end: number }
  | { kind: 'percent'; expr: Node; start: number; end: number }
  | { kind: 'group'; expr: Node; start: number; end: number }
  | { kind: 'bin'; op: '+' | '-' | '*' | '/' | '^'; implicit: boolean; left: Node; right: Node; start: number; end: number }
  | { kind: 'call'; fn: string; args: Node[]; start: number; end: number }

export type Line =
  | { kind: 'blank'; comment?: string }
  | { kind: 'expr'; expr: Node; comment?: string }
  | { kind: 'assign'; name: string; nameStart: number; nameEnd: number; expr: Node; comment?: string }

export const FUNCTIONS: Record<string, { arity: [number, number]; fn: (...a: number[]) => number; label?: string }> = {
  sqrt: { arity: [1, 1], fn: Math.sqrt },
  cbrt: { arity: [1, 1], fn: Math.cbrt },
  log10: { arity: [1, 1], fn: Math.log10 },
  log: { arity: [1, 1], fn: Math.log10, label: 'log10' },
  ln: { arity: [1, 1], fn: Math.log },
  log2: { arity: [1, 1], fn: Math.log2 },
  exp: { arity: [1, 1], fn: Math.exp },
  abs: { arity: [1, 1], fn: Math.abs },
  round: { arity: [1, 1], fn: Math.round },
  floor: { arity: [1, 1], fn: Math.floor },
  ceil: { arity: [1, 1], fn: Math.ceil },
  min: { arity: [1, 99], fn: Math.min },
  max: { arity: [1, 99], fn: Math.max },
}

/** Own-property check, so `toString`, `constructor`… aren't mistaken for built-ins. */
export const isFunction = (name: string) => Object.hasOwn(FUNCTIONS, name)

const BP = { add: 10, mul: 20, implicit: 25, unary: 30, pow: 40, postfix: 50 } as const

export function parseLine(src: string): Line {
  const tokens = tokenize(src)
  let comment: string | undefined
  if (tokens.length && tokens[tokens.length - 1].type === 'comment') {
    comment = tokens.pop()!.raw.slice(1).trim()
  }
  if (tokens.length === 0) return { kind: 'blank', comment }

  if (tokens.length >= 2 && tokens[0].type === 'ident' && tokens[1].type === 'assign') {
    const nameTok = tokens[0]
    if (tokens.length === 2) {
      throw new CalcError(`What should ${nameTok.raw} be? Put a number or calculation after the =`, nameTok.start, tokens[1].end)
    }
    const p = new Parser(tokens.slice(2), src)
    const expr = p.parseAll()
    return { kind: 'assign', name: nameTok.raw, nameStart: nameTok.start, nameEnd: nameTok.end, expr, comment }
  }
  if (tokens[0].type === 'assign') {
    throw new CalcError('Results show up on the right automatically, so no need to start a line with =', tokens[0].start, tokens[0].end)
  }

  const p = new Parser(tokens, src)
  return { kind: 'expr', expr: p.parseAll(), comment }
}

class Parser {
  private pos = 0
  private tokens: Token[]
  private src: string
  constructor(tokens: Token[], src: string) {
    this.tokens = tokens
    this.src = src
  }

  /** Fixes replace their error range, so an auto-close fix is the rest of the line plus `)`. */
  private closeFix(start: number): string | undefined {
    const rest = this.src.slice(start)
    return /#/.test(rest) ? undefined : rest.trimEnd() + ')'
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos]
  }
  private next(): Token {
    return this.tokens[this.pos++]
  }

  parseAll(): Node {
    const node = this.expr(0)
    const t = this.peek()
    if (t) {
      if (t.type === 'rparen') throw new CalcError('This ) has no matching (', t.start, t.end)
      if (t.type === 'assign') {
        throw new CalcError('Only one = per line, as in `name = calculation`', t.start, t.end)
      }
      if (t.type === 'comma') throw new CalcError('Commas only go between function arguments, like max(1, 2)', t.start, t.end)
      throw new CalcError(`Unexpected “${t.raw}”`, t.start, t.end)
    }
    return node
  }

  private expr(minBp: number): Node {
    let left = this.prefix()
    for (;;) {
      const t = this.peek()
      if (!t) break
      if (t.type === 'percent') {
        if (BP.postfix < minBp) break
        this.next()
        left = { kind: 'percent', expr: left, start: left.start, end: t.end }
        continue
      }
      if (t.type === 'op') {
        const op = t.op!
        const [lbp, rbp] =
          op === '+' || op === '-' ? [BP.add, BP.add + 1] : op === '*' || op === '/' ? [BP.mul, BP.mul + 1] : [BP.pow, BP.pow] // ^ is right assoc
        if (lbp < minBp) break
        this.next()
        if (!this.peek()) {
          throw new CalcError(`Something is missing after “${t.raw || '^'}”`, t.start, t.end)
        }
        // allow `2^-1` and `2 * -3`
        const right = this.expr(rbp)
        left = { kind: 'bin', op, implicit: false, left, right, start: left.start, end: right.end }
        continue
      }
      if (t.type === 'num' || t.type === 'ident' || t.type === 'lparen') {
        // implicit multiplication: `2(3+4)`, `2pi`, `3 days`, `(a)(b)`
        if (BP.implicit < minBp) break
        const right = this.expr(BP.implicit + 1)
        left = { kind: 'bin', op: '*', implicit: true, left, right, start: left.start, end: right.end }
        continue
      }
      break
    }
    return left
  }

  private prefix(): Node {
    const t = this.next()
    if (!t) {
      const end = this.src.length
      throw new CalcError('Something is missing at the end', end, end)
    }
    switch (t.type) {
      case 'num':
        return { kind: 'num', value: t.value!, raw: t.raw, suffix: t.suffix, start: t.start, end: t.end }
      case 'ident': {
        const nxt = this.peek()
        if (isFunction(t.raw)) {
          if (!nxt || nxt.type !== 'lparen') {
            throw new CalcError(`${t.raw} needs parentheses, like ${t.raw}(2)`, t.start, t.end)
          }
          this.next()
          const args: Node[] = []
          if (this.peek()?.type === 'rparen') {
            throw new CalcError(`${t.raw}() needs something inside`, t.start, this.peek()!.end)
          }
          for (;;) {
            args.push(this.expr(0))
            const sep = this.peek()
            if (sep?.type === 'comma') {
              this.next()
              continue
            }
            if (sep?.type === 'rparen') {
              this.next()
              const [lo, hi] = FUNCTIONS[t.raw].arity
              if (args.length < lo || args.length > hi) {
                throw new CalcError(`${t.raw} takes ${lo === hi ? lo : `${lo} or more`} argument${hi === 1 ? '' : 's'}`, t.start, sep.end)
              }
              return { kind: 'call', fn: t.raw, args, start: t.start, end: sep.end }
            }
            throw new CalcError(`Missing ) to close ${t.raw}(`, t.start, this.src.length, this.closeFix(t.start))
          }
        }
        return { kind: 'var', name: t.raw, start: t.start, end: t.end }
      }
      case 'op':
        if (t.op === '-') {
          const expr = this.expr(BP.unary)
          return { kind: 'neg', expr, start: t.start, end: expr.end }
        }
        if (t.op === '+') {
          return this.expr(BP.unary)
        }
        throw new CalcError(`“${t.raw}” needs a number before it`, t.start, t.end)
      case 'lparen': {
        if (this.peek()?.type === 'rparen') {
          throw new CalcError('Empty parentheses', t.start, this.peek()!.end)
        }
        const expr = this.expr(0)
        const close = this.peek()
        if (!close || close.type !== 'rparen') {
          if (close?.type === 'comma')
            throw new CalcError('Commas only go between function arguments, like max(1, 2)', close.start, close.end)
          throw new CalcError('Missing ) to close this (', t.start, this.src.length, this.closeFix(t.start))
        }
        this.next()
        return { kind: 'group', expr, start: t.start, end: close.end }
      }
      case 'rparen':
        throw new CalcError('This ) has no matching (', t.start, t.end)
      case 'percent':
        throw new CalcError('% goes after a number, like 30%', t.start, t.end)
      case 'comma':
        throw new CalcError('Commas only go between function arguments, like max(1, 2)', t.start, t.end)
      case 'assign':
        throw new CalcError('Only one = per line, as in `name = calculation`', t.start, t.end)
      default:
        throw new CalcError(`Unexpected “${t.raw}”`, t.start, t.end)
    }
  }
}
