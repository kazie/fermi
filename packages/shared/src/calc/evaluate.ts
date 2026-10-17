// Evaluates a whole answer sheet (multi-line text) the same way on client and server.

import { FUNCTIONS, isFunction, parseLine, type Line, type Node } from './parser.ts'
import { CalcError, suffixName, tokenize, type Token } from './tokenizer.ts'
import { formatNumber } from './format.ts'

export const LIMITS = { maxLines: 60, maxLineLength: 240, maxChars: 6000 } as const

export const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  π: Math.PI,
  hundred: 1e2,
  thousand: 1e3,
  million: 1e6,
  billion: 1e9,
  trillion: 1e12,
  quadrillion: 1e15,
}

export const isConstant = (name: string) => Object.hasOwn(CONSTANTS, name)

const RESERVED = new Set([...Object.keys(FUNCTIONS), ...Object.keys(CONSTANTS), 'ans', 'x'])

export interface LineError {
  message: string
  start: number
  end: number
  /** Suggested replacement text for [start, end). */
  fix?: string
}

export type HighlightClass = 'num' | 'var' | 'const' | 'fn' | 'op' | 'paren' | 'comment' | 'name' | 'unknown'

export interface Highlight {
  start: number
  end: number
  cls: HighlightClass
}

export interface LineResult {
  index: number
  raw: string
  kind: 'blank' | 'comment' | 'expr' | 'assign' | 'error'
  name?: string
  value?: number
  error?: LineError
  /** Normalised rendering of how the line was read, e.g. `2 × (3 + 4) × days`. */
  echo?: string
  /** True when the echo shows something the raw text doesn't make obvious (implicit ×, `x`, suffix clash…). */
  echoNotable?: boolean
  hints: string[]
  highlights: Highlight[]
  comment?: string
}

export interface SheetResult {
  lines: LineResult[]
  /** Value of the last non-blank, non-comment line; null if that line has an error or there is none. */
  answer: number | null
  answerLine: number | null
  /** Variables defined, in definition order (for autocomplete chips). */
  variables: { name: string; value: number; line: number }[]
  tooLong?: boolean
}

export function evaluateSheet(text: string): SheetResult {
  const tooLong = text.length > LIMITS.maxChars
  const rawLines = text.slice(0, LIMITS.maxChars).split(/\r?\n/).slice(0, LIMITS.maxLines)
  const env = new Map<string, { value: number; line: number }>()
  const broken = new Map<string, number>() // variable name → line index whose definition failed
  const lines: LineResult[] = []
  let ans: number | undefined
  let answer: number | null = null
  let answerLine: number | null = null

  rawLines.forEach((raw0, index) => {
    const raw = raw0.length > LIMITS.maxLineLength ? raw0.slice(0, LIMITS.maxLineLength) : raw0
    const res: LineResult = { index, raw, kind: 'blank', hints: [], highlights: [] }
    lines.push(res)
    try {
      res.highlights = highlight(raw, env)
    } catch {
      res.highlights = []
    }
    if (raw0.length > LIMITS.maxLineLength) {
      res.kind = 'error'
      res.error = {
        message: `Line is too long (max ${LIMITS.maxLineLength} characters)`,
        start: LIMITS.maxLineLength - 1,
        end: LIMITS.maxLineLength,
      }
      answer = null
      answerLine = index
      return
    }
    let line: Line
    try {
      line = parseLine(raw)
    } catch (e) {
      fail(res, e, raw)
      const m = /^\s*([\p{L}_][\p{L}\p{N}_]*)\s*=/u.exec(raw)
      if (m) broken.set(m[1], index)
      answer = null
      answerLine = index
      return
    }
    res.comment = line.comment
    if (line.kind === 'blank') {
      res.kind = line.comment !== undefined ? 'comment' : 'blank'
      return
    }
    try {
      if (line.kind === 'assign') {
        if (RESERVED.has(line.name)) {
          throw new CalcError(
            line.name === 'x'
              ? '`x` is reserved for multiplication (3 x 4). Pick another name'
              : `“${line.name}” is a built-in name. Pick another one`,
            line.nameStart,
            line.nameEnd,
          )
        }
        if (/^(k|K|M|B|bn|T)$/.test(line.name)) {
          res.hints.push(
            `Note: ${line.name} right after a number (like 2${line.name}) still means ${suffixName(line.name)}. Write 2*${line.name} to use your variable.`,
          )
        }
      }
      const ctx: EvalCtx = { env, broken, ans, hints: res.hints, notable: false }
      const value = evalNode(line.expr, ctx)
      if (!Number.isFinite(value)) {
        throw new CalcError(
          Number.isNaN(value) ? "That doesn't give a real number" : 'That is infinitely large. Even FerMEANie can’t count that high',
          line.expr.start,
          line.expr.end,
        )
      }
      res.value = value
      res.echo = render(line.expr)
      res.echoNotable =
        ctx.notable ||
        res.hints.length > 0 ||
        normalizeForCompare(raw.slice(line.expr.start, line.expr.end)) !== normalizeForCompare(res.echo)
      if (line.kind === 'assign') {
        res.kind = 'assign'
        res.name = line.name
        env.set(line.name, { value, line: index })
        broken.delete(line.name)
      } else {
        res.kind = 'expr'
      }
      ans = value
      answer = value
      answerLine = index
    } catch (e) {
      fail(res, e, raw)
      if (line.kind === 'assign') {
        broken.set(line.name, index)
        env.delete(line.name)
      }
      answer = null
      answerLine = index
    }
  })

  const variables = [...env.entries()].map(([name, v]) => ({ name, value: v.value, line: v.line }))
  return { lines, answer, answerLine, variables, ...(tooLong ? { tooLong } : {}) }
}

function fail(res: LineResult, e: unknown, raw: string) {
  res.kind = 'error'
  if (e instanceof CalcError) {
    res.error = { message: e.message, start: e.start, end: e.end, ...(e.fix !== undefined ? { fix: e.fix } : {}) }
  } else {
    res.error = { message: 'Could not read this line', start: 0, end: raw.length }
  }
}

interface EvalCtx {
  env: Map<string, { value: number; line: number }>
  broken: Map<string, number>
  ans: number | undefined
  hints: string[]
  notable: boolean
}

function evalNode(node: Node, ctx: EvalCtx): number {
  switch (node.kind) {
    case 'num':
      if (node.suffix && ctx.env.has(node.suffix)) {
        const hint = `${node.raw} = ${formatNumber(node.value)} (${suffixName(node.suffix)}). Write ${node.raw.slice(0, -node.suffix.length)}*${node.suffix} to use your variable ${node.suffix}.`
        if (!ctx.hints.includes(hint)) ctx.hints.push(hint)
      }
      return node.value
    case 'var': {
      if (node.name === 'ans') {
        if (ctx.ans === undefined) throw new CalcError('`ans` is the previous line’s result, but there is none yet', node.start, node.end)
        return ctx.ans
      }
      const v = ctx.env.get(node.name)
      if (v) return v.value
      if (isConstant(node.name)) return CONSTANTS[node.name]
      const brokenAt = ctx.broken.get(node.name)
      if (brokenAt !== undefined) {
        throw new CalcError(`${node.name} depends on line ${brokenAt + 1}, which has a problem`, node.start, node.end)
      }
      if (node.name === 'x') {
        throw new CalcError('`x` means multiply between two numbers (3 x 4). Use * or × here', node.start, node.end, '×')
      }
      const suggestion = closest(node.name, [...ctx.env.keys(), ...Object.keys(CONSTANTS)])
      throw new CalcError(
        suggestion
          ? `“${node.name}” isn’t defined. Did you mean ${suggestion}?`
          : `“${node.name}” isn’t defined. Define it on an earlier line, like ${node.name} = 42`,
        node.start,
        node.end,
        suggestion,
      )
    }
    case 'neg':
      return -evalNode(node.expr, ctx)
    case 'percent':
      return evalNode(node.expr, ctx) / 100
    case 'group':
      return evalNode(node.expr, ctx)
    case 'call': {
      const args = node.args.map((a) => evalNode(a, ctx))
      return FUNCTIONS[node.fn].fn(...args)
    }
    case 'bin': {
      if (node.implicit) ctx.notable = true
      const l = evalNode(node.left, ctx)
      const r = evalNode(node.right, ctx)
      switch (node.op) {
        case '+':
          return l + r
        case '-':
          return l - r
        case '*':
          return l * r
        case '/':
          if (r === 0) throw new CalcError('Division by zero', node.right.start, node.right.end)
          return l / r
        case '^':
          return Math.pow(l, r)
      }
    }
  }
}

// ---------- rendering ("read as") ----------

// Precedence as a reader sees the rendered text: an implicit product is shown as an ordinary ×,
// so it gets ×'s precedence and parens are added wherever the real (tighter) grouping differs.
const PREC: Record<string, number> = { '+': 10, '-': 10, '*': 20, '/': 20, neg: 30, '^': 40 }

function nodePrec(n: Node): number {
  if (n.kind === 'bin') return PREC[n.op]
  if (n.kind === 'neg') return PREC.neg
  return 100
}

/** Render an AST the way it was understood, making implicit grouping explicit. */
export function render(n: Node): string {
  switch (n.kind) {
    case 'num':
      return n.raw.replace(/_/g, '')
    case 'var':
      return n.name
    case 'neg': {
      const inner = render(n.expr)
      return nodePrec(n.expr) < PREC.neg ? `-(${inner})` : `-${inner}`
    }
    case 'percent':
      return `${wrapIf(n.expr, nodePrec(n.expr) < 100)}%`
    case 'group':
      return `(${render(n.expr)})`
    case 'call':
      return `${FUNCTIONS[n.fn].label ?? n.fn}(${n.args.map(render).join(', ')})`
    case 'bin': {
      const p = nodePrec(n)
      const sym = n.op === '*' ? '×' : n.op === '/' ? '÷' : n.op
      let left = render(n.left)
      let right = render(n.right)
      if (n.op === '^') {
        if (nodePrec(n.left) <= PREC['^']) left = `(${left})`
        if (nodePrec(n.right) < PREC['^']) right = `(${right})`
        return `${left}^${right}`
      }
      const lp = nodePrec(n.left)
      const rp = nodePrec(n.right)
      if (lp < p) left = `(${left})`
      if (rp < p || (rp === p && (n.op === '-' || n.op === '/'))) right = `(${right})`
      return `${left} ${sym} ${right}`
    }
  }
}

function normalizeForCompare(s: string) {
  return s
    .replace(/\s+|_/g, '')
    .replace(/\*\*/g, '^')
    .replace(/[*·⋅∙✕✖]/g, '×')
    .replace(/[/∕]/g, '÷')
    .replace(/[−–—]/g, '-')
    .replace(/[[{]/g, '(')
    .replace(/[\]}]/g, ')')
}

function wrapIf(n: Node, cond: boolean) {
  const s = render(n)
  return cond ? `(${s})` : s
}

// ---------- highlighting ----------

function highlight(raw: string, env: Map<string, unknown>): Highlight[] {
  let tokens: Token[]
  try {
    tokens = tokenize(raw)
  } catch {
    return []
  }
  const out: Highlight[] = []
  tokens.forEach((t, i) => {
    let cls: HighlightClass
    switch (t.type) {
      case 'num':
        cls = 'num'
        break
      case 'ident':
        if (i === 0 && tokens[1]?.type === 'assign') cls = 'name'
        else if (isFunction(t.raw)) cls = 'fn'
        else if (env.has(t.raw) || t.raw === 'ans') cls = 'var'
        else if (isConstant(t.raw)) cls = 'const'
        else cls = 'unknown'
        break
      case 'comment':
        cls = 'comment'
        break
      case 'lparen':
      case 'rparen':
        cls = 'paren'
        break
      default:
        cls = 'op'
    }
    if (t.end > t.start) out.push({ start: t.start, end: t.end, cls })
  })
  return out
}

// ---------- suggestions ----------

function closest(name: string, candidates: string[]): string | undefined {
  let best: string | undefined
  let bestD = Infinity
  for (const c of candidates) {
    const d = levenshtein(name.toLowerCase(), c.toLowerCase())
    if (d < bestD) {
      bestD = d
      best = c
    }
  }
  const limit = name.length <= 3 ? 1 : name.length <= 6 ? 2 : 3
  return bestD <= limit ? best : undefined
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return dp[b.length]
}
