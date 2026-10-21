// Quality review of questions already in the pool, cheapest first:
//   1. Haiku screens many questions per call, seeing only what a player sees (category, question, unit).
//   2. Sonnet looks at the flagged ones, with their sources, and decides: keep, reword (same fact) or retire.
//   3. This script applies the decisions through `pnpm q` and flags every finished question `reviewed:v1`, so the
//      next run only looks at new ones.
// Both model calls are tool-less and return JSON. Only ids, issue codes, counts and cost are ever printed.

import { quoteContainsNumber } from '../apps/server/src/questions/numbers.ts'

/** Bump the version when the rules change enough that the whole pool should be looked at again. */
export const REVIEW_FLAG = 'reviewed:v1'
/** A decision that couldn't be applied (the server refused the reword, say): skipped until `--retry-unresolved`. */
export const UNRESOLVED_FLAG = 'review-unresolved:v1'
export const SCREEN_CHUNK = 40
/** A screener's note is cut to this many characters: it's a hint for the editor, not a place for instructions. */
export const MAX_NOTE_CHARS = 200
export const EDIT_CHUNK = 6
/** A reworded question longer than this isn't applied (left unresolved), however good the model thought it was. */
export const MAX_REWORD_WORDS = 25

export interface PoolQuestion {
  id: string
  question: string
  unit: string
  category: string
  answer: number
  explanation: string
  sources: { title: string; publisher: string; quote: string }[]
  _status: string
  _flags: string[]
}

export interface AskResult {
  text: string
  costUsd: number
  limit: string | null
}

export interface ReviewDeps {
  /** One tool-less model call. */
  ask(model: 'haiku' | 'sonnet', system: string, prompt: string): Promise<AskResult>
  /** `pnpm q <args>`; stdout. */
  cli(args: string[]): Promise<string>
  /** Every question with `_status` and `_flags` (`pnpm q export`). */
  pool(): Promise<PoolQuestion[]>
}

export interface ReviewOptions {
  /** QUESTION_RULES.md §1, so the review judges by the same rules generators write by. */
  rules: string
  /** Screen at most this many unreviewed questions. */
  limit?: number
  /** Decide, but change nothing. */
  dryRun?: boolean
  /** Also look again at questions flagged UNRESOLVED_FLAG. */
  retryUnresolved?: boolean
  /** Progress after each model call: counts only, never question text. */
  onProgress?: (msg: string) => void
}

type Decision = { id: string; action: 'keep' | 'reword' | 'retire'; question?: string; unit?: string; reason: string }

export interface ReviewResult {
  screened: number
  passed: number
  kept: string[]
  reworded: { id: string; newId: string; issue: string }[]
  retired: { id: string; issue: string }[]
  /** Every flagged question's wording and decision, for `--show` (spoils the wording, never the answer). */
  details: { id: string; issue: string; note: string; action: string; before: string; after?: string; reason?: string }[]
  /**
   * Flagged but not finished. `no-decision` (bad or missing model output) is looked at again next run; the others are
   * flagged UNRESOLVED_FLAG, so they aren't paid for again on every run.
   */
  unresolved: { id: string; why: 'no-decision' | 'too-long' | 'reveals-answer' | 'refused' }[]
  cost: { haiku: number; sonnet: number }
  limit: string | null
  /** Questions whose flag couldn't be saved (server unreachable, say): they're simply screened again next run. */
  flagFailures: number
}

/** The "What makes a good question" section of QUESTION_RULES.md, without the category table. */
export function rulesSection(md: string) {
  const start = md.indexOf('## 1.')
  const end = md.indexOf('### Categories')
  return md.slice(start, end > start ? end : undefined).trim()
}

/**
 * The JSON array in a model reply. Models sometimes wrap it in a code fence or in prose that has brackets of its own
 * ("Flagged [2 questions]: […]"), so try a fenced block first, then each `[` from the left against each `]` from the
 * right.
 */
export function parseJsonArray<T>(text: string): T[] | null {
  const tryParse = (s: string) => {
    try {
      const v = JSON.parse(s)
      return Array.isArray(v) ? (v as T[]) : null
    } catch {
      return null
    }
  }
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)?.[1]
  const fromFence = fenced === undefined ? null : tryParse(fenced.trim())
  if (fromFence) return fromFence
  const starts = [...text.matchAll(/\[/g)].map((m) => m.index)
  const ends = [...text.matchAll(/\]/g)].map((m) => m.index).reverse()
  for (const a of starts)
    for (const b of ends)
      if (b > a) {
        const v = tryParse(text.slice(a, b + 1))
        if (v) return v
      }
  return null
}

/** Digits in model-written reasons are masked before printing: the editor saw the answer. */
export const maskNumbers = (s: string) => s.replace(/\d[\d.,]*/g, '#')

export const wordCount = (s: string) => s.trim().split(/\s+/).length

/** Issue codes are printed, so only short kebab-case words get through. */
export const issueCode = (s: unknown) => (typeof s === 'string' && /^[a-z][a-z-]{0,23}$/.test(s) ? s : 'other')

export const screenSystem = (rules: string) => `You screen quiz questions for "Fermi", a party game where friends estimate numbers.
Players see ONLY the category, the question and the unit. They never see sources.

The project's rules for questions:

${rules}

Flag every question where a typical adult player couldn't tell what to estimate or would have nothing to reason
from: it needs context the question doesn't give (e.g. a fictional thing without naming its work, an unexplained
term or acronym), it's unclear what is being counted or measured, it is ambiguous, it is recall rather than
estimation (a fixed fact people either remember or don't), the unit doesn't fit, or it breaks another rule above.
Don't judge whether facts are true: you can't see answers or sources.
An unfamiliar subject is fine when the question is plain: players reason from what they know (people, shares,
rates, sizes). Not knowing the number is the point of the game. When unsure, flag it: an editor checks every flag.

Reply with ONLY a JSON array with one object per flagged question:
{"id": "<id>", "issue": "<needs-context | unclear | ambiguous | recall | unit | other>", "note": "<short reason>"}
Reply [] if every question is fine.`

export const editSystem = (
  rules: string,
) => `You are the editor of the question pool for "Fermi", a party game where friends estimate numbers.
Players see ONLY the category, the question and the unit; never sources or explanations.

The project's rules for questions:

${rules}

A screener flagged each question below. You see its sources and explanation. Decide for each:
- "keep": it is fine for a player as it is (the flag was wrong).
- "reword": a short rewording fixes it. The new question asks about exactly the same fact, so the answer, the
  unit's meaning and what the sources measure stay the same. Typical fixes: name the work or franchise, spell out an
  acronym, use a plain word for a technical one. Keep it short: at most ${MAX_REWORD_WORDS} words, one question, at
  most a few words of setup, never a definition or a list of what counts. Never reveal or hint at the answer. Give
  "unit" only if it must change.
- "retire": the question only makes sense after its terms are explained (a statistical category, a specialist
  counting method), players can't tell what is being counted, it's ambiguous at heart, or there's nothing to reason
  from (a fixed fact people either remember or don't). If a fix would need a definition or more than a few words
  of setup, retire it.
Never retire just because the subject is unfamiliar: if most adults understand what is asked and can reason toward
it (people × share × rate…), it's a good estimation question, even when nobody knows the exact number. Data age, sources and number accuracy were checked when
the question was added; don't retire for those.

Reply with ONLY a JSON array, one object per question:
{"id": "<id>", "action": "keep" | "reword" | "retire", "question": "<new wording, for reword>", "unit": "<only if changed>", "reason": "<short, no numbers>"}`

/** What a player sees of a question; all the screen is shown. */
export type ScreenItem = Pick<PoolQuestion, 'id' | 'category' | 'question' | 'unit'>
export type Flagged = { id: string; issue: string; note: string }

/**
 * Screens questions as a player sees them (Haiku, one call). Returns the flagged ones among `items`, or null when
 * the call failed or its reply couldn't be read. Used by `pnpm review` and by the grow pipeline on new drafts.
 */
export async function screenQuestions(
  ask: (system: string, prompt: string) => Promise<string | null>,
  rules: string,
  items: ScreenItem[],
): Promise<Flagged[] | null> {
  const text = await ask(screenSystem(rules), items.map(screenLine).join('\n'))
  const flags = text === null ? null : parseJsonArray<Flagged>(text)
  if (!flags) return null
  const ids = new Set(items.map((q) => q.id))
  const hits = new Map(
    flags
      .filter((f) => ids.has(f?.id))
      .map((f) => [f.id, { id: f.id, issue: issueCode(f.issue), note: String(f.note ?? '').slice(0, MAX_NOTE_CHARS) }]),
  )
  return [...hits.values()]
}

/**
 * `<id>.screen.json`, written next to a draft that `pnpm grow`'s screen flagged: what the screen saw and its note.
 * The verifier reads it as data, and `pnpm q approve` holds a reworded question to the limits `pnpm review` uses.
 */
export interface ScreenFile {
  issue: string
  note: string
  question: string
  unit: string
}
export const screenFilePath = (draftPath: string) => draftPath.replace(/\.json$/, '.screen.json')

/** Why a reworded question can't be used, or null. Mentions counts only, never the question. */
export function rewordProblem(question: string, unit: string, answer: number): string | null {
  const words = wordCount(question)
  if (words > MAX_REWORD_WORDS) return `is ${words} words (at most ${MAX_REWORD_WORDS})`
  if (quoteContainsNumber(`${question} ${unit}`, answer)) return 'gives away the answer'
  return null
}

const screenLine = (q: ScreenItem) => JSON.stringify({ id: q.id, category: q.category, question: q.question, unit: q.unit })
const editBlock = (q: PoolQuestion, f: Flagged) =>
  JSON.stringify({
    id: q.id,
    category: q.category,
    question: q.question,
    unit: q.unit,
    answer: q.answer,
    explanation: q.explanation,
    sources: q.sources.map(({ title, publisher, quote }) => ({ title, publisher, quote })),
    flagged: { issue: f.issue, note: f.note },
  })

export async function reviewPool(deps: ReviewDeps, opts: ReviewOptions): Promise<ReviewResult> {
  const result: ReviewResult = {
    screened: 0,
    passed: 0,
    kept: [],
    reworded: [],
    retired: [],
    details: [],
    unresolved: [],
    cost: { haiku: 0, sonnet: 0 },
    limit: null,
    flagFailures: 0,
  }
  const ask = async (model: 'haiku' | 'sonnet', system: string, prompt: string) => {
    const r = await deps.ask(model, system, prompt)
    result.cost[model] += r.costUsd
    result.limit ??= r.limit
    return r.limit ? null : r.text
  }
  // A failed flag call only means those questions are looked at again next run: never worth aborting the report for.
  const flag = async (flagName: string, ids: string[]) => {
    if (opts.dryRun || !ids.length) return
    try {
      await deps.cli(['flag', flagName, ...ids])
    } catch {
      result.flagFailures += ids.length
    }
  }

  const done = (q: PoolQuestion) => q._flags.includes(REVIEW_FLAG) || (!opts.retryUnresolved && q._flags.includes(UNRESOLVED_FLAG))
  const todo = (await deps.pool()).filter((q) => q._status === 'active' && !done(q))
  const queue = opts.limit ? todo.slice(0, opts.limit) : todo
  const byId = new Map(queue.map((q) => [q.id, q]))
  const progress = opts.onProgress ?? (() => {})
  progress(`${queue.length} question(s) to review${todo.length > queue.length ? ` (of ${todo.length}; --limit)` : ''}`)

  // 1. Screen (Haiku)
  const flagged: Flagged[] = []
  for (let i = 0; i < queue.length && !result.limit; i += SCREEN_CHUNK) {
    const chunk = queue.slice(i, i + SCREEN_CHUNK)
    const hits = await screenQuestions((system, prompt) => ask('haiku', system, prompt), opts.rules, chunk)
    if (!hits) continue // nothing recorded: screened again next run
    result.screened += chunk.length
    flagged.push(...hits)
    const hitIds = new Set(hits.map((f) => f.id))
    const fine = chunk.filter((q) => !hitIds.has(q.id)).map((q) => q.id)
    result.passed += fine.length
    await flag(REVIEW_FLAG, fine)
    progress(`screened ${Math.min(i + SCREEN_CHUNK, queue.length)}/${queue.length} · ${flagged.length} flagged`)
  }
  if (flagged.length && !result.limit) progress(`deciding on ${flagged.length} flagged question(s)`)

  // 2. Decide (Sonnet) and 3. apply
  for (let i = 0; i < flagged.length; i += EDIT_CHUNK) {
    const chunk = flagged.slice(i, i + EDIT_CHUNK)
    const text = result.limit
      ? null
      : await ask('sonnet', editSystem(opts.rules), chunk.map((f) => editBlock(byId.get(f.id)!, f)).join('\n'))
    const decisions = new Map(((text && parseJsonArray<Decision>(text)) || []).map((d) => [d?.id, d]))
    const reviewed: string[] = []
    const stuck: string[] = []
    for (const f of chunk) {
      const q = byId.get(f.id)!
      const d = decisions.get(f.id)
      const reword = d?.action === 'reword' && typeof d.question === 'string' && d.question ? d.question : null
      const reveals = reword !== null && quoteContainsNumber(`${reword} ${d?.unit ?? ''}`, q.answer)
      result.details.push({
        id: f.id,
        issue: f.issue,
        note: String(f.note ?? ''),
        action: d?.action ?? 'none',
        before: `${q.question} [${q.unit}]`,
        ...(reword ? { after: reveals ? '(hidden: it gave away the answer)' : `${reword} [${d?.unit ?? q.unit}]` } : {}),
        ...(d?.reason ? { reason: String(d.reason) } : {}),
      })
      const reason = `quality review (${f.issue}): ${String(d?.reason ?? '')}`
      try {
        if (d?.action === 'keep') {
          reviewed.push(f.id)
          result.kept.push(f.id)
        } else if (d?.action === 'retire' && d.reason) {
          if (!opts.dryRun) await deps.cli(['status', f.id, 'retired', '--resolution', reason])
          result.retired.push({ id: f.id, issue: f.issue })
        } else if (reword && d?.reason) {
          if (wordCount(reword) > MAX_REWORD_WORDS) {
            result.unresolved.push({ id: f.id, why: 'too-long' })
            stuck.push(f.id)
          } else if (reveals) {
            result.unresolved.push({ id: f.id, why: 'reveals-answer' })
            stuck.push(f.id)
          } else {
            let newId = '(dry run)'
            if (!opts.dryRun) {
              const args = ['reword', f.id, '--question', reword, '--reason', reason]
              const out = await deps.cli(d.unit ? [...args, '--unit', String(d.unit)] : args)
              const added = /^✓ added\s+(\S+)/m.exec(out)?.[1]
              if (!added) throw new Error('reword refused')
              newId = added
              reviewed.push(newId)
            }
            result.reworded.push({ id: f.id, newId, issue: f.issue })
          }
        } else result.unresolved.push({ id: f.id, why: 'no-decision' })
      } catch {
        result.unresolved.push({ id: f.id, why: 'refused' })
        stuck.push(f.id)
      }
    }
    await flag(REVIEW_FLAG, reviewed)
    await flag(UNRESOLVED_FLAG, stuck)
    if (!result.limit)
      progress(
        `decided ${Math.min(i + EDIT_CHUNK, flagged.length)}/${flagged.length} · ${result.kept.length} kept, ` +
          `${result.reworded.length} reworded, ${result.retired.length} retired, ${result.unresolved.length} unresolved`,
      )
  }
  return result
}

/** Lines to print: ids, issue codes, counts and cost only. */
export function formatReview(r: ReviewResult, dryRun = false): string[] {
  const usd = (n: number) => `$${n.toFixed(2)}`
  return [
    ...r.reworded.map((x) => `reworded  ${x.id} → ${x.newId} (${x.issue})`),
    ...r.retired.map((x) => `retired   ${x.id} (${x.issue})`),
    ...r.unresolved.map((u) => `unresolved ${u.id} (${u.why}${u.why === 'no-decision' ? ', looked at again next run' : ''})`),
    `${dryRun ? '[dry run] ' : ''}screened ${r.screened}: ${r.passed} fine, ${r.kept.length} kept after a second look, ` +
      `${r.reworded.length} reworded, ${r.retired.length} retired, ${r.unresolved.length} unresolved · ` +
      `${usd(r.cost.haiku + r.cost.sonnet)} (screening ${usd(r.cost.haiku)}, editing ${usd(r.cost.sonnet)})`,
    ...(r.flagFailures ? [`${r.flagFailures} question(s) couldn't be flagged; they're screened again next run`] : []),
    ...(r.limit ? [`stopped at a usage limit: ${r.limit}`] : []),
  ]
}
