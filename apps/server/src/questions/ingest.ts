// The single path questions take into the database: validate → dedupe → insert.

import { evaluateSheet, QuestionSchema, type Question } from '@fermi/shared'
import { tx, type DB } from '../db.ts'
import { findMatches, normalizeText, normalizeUrl, type Candidate, type Match } from './dedupe.ts'
import { quoteContainsNumber } from './numbers.ts'
import { getQuestion, insertQuestion, loadCandidates, setFlags, setStatus, type QuestionStatus } from './repo.ts'

export const FORMULA_TOLERANCE = 0.001
export const ARCHIVE_MAX_DAYS = 7
/** Time-sensitive facts must be at most this many years old. */
export const MAX_DATA_AGE_YEARS = 5

export type IngestResult =
  | { status: 'added'; id: string }
  | { status: 'invalid'; id?: string; errors: string[] }
  | { status: 'duplicate'; id: string; matches: Match[] }
  | { status: 'needs_review'; id: string; matches: Match[] }
  /** Dry run: everything passed, nothing was written. */
  | { status: 'valid'; id: string }
  /** Import only: the id is already in this database. */
  | { status: 'exists'; id: string }

export interface IngestOptions {
  batchId?: string
  /** Insert as a corrected version of this question and retire the old one. */
  replaces?: string
  now?: Date
  /** Run every check but write nothing. */
  dryRun?: boolean
  /** Preloaded duplicate candidates (shared across a batch; inserted questions are appended). */
  candidates?: Candidate[]
  /** Merging from another database: keep status/flags/replacement, skip known ids, don't refuse overdue rechecks. */
  import?: { status?: QuestionStatus; flags?: string[]; replacedBy?: string }
  /**
   * A new wording of `replaces` (`pnpm q reword`): the same fact and data, so the rules that judge the data (overdue
   * recheck, data age, locale) aren't applied again, and only an active question can be reworded.
   */
  reword?: boolean
}

const DAY = 86_400_000

// Players are mostly outside the US: questions use metric units and don't ask about US-wide figures.
// Only the question and its unit are checked; sources and derived inputs keep the source's own units.
const NON_METRIC =
  /\b(?:gallons?|quarts?|pints?|fluid ounces?|fl\.? ?oz|ounces?|oz|lbs?|miles?|mph|feet|(?<!on )foot|ft|inch(?:es)?|yards?|acres?|(?:short )?tons?|fahrenheit)\b|°F\b|\bpounds?\b(?! sterling)/i
const US_WIDE =
  /(?<![\w.])(?:U\.S\.(?:A\.)?|USA|US|United States|(?<!(?:North|South|Central|Latin) )Americans?)(?!\w)(?!\s*(?:dollars?|\$))|\b(?:penny|pennies|dimes?)\b/

/** Locale and freshness rules from QUESTION_RULES.md §1. Messages name the matched term only, never the question. */
export function localeIssues(q: Question, now = new Date()): string[] {
  const errors: string[] = []
  for (const [field, text] of [
    ['question', q.question],
    ['unit', q.unit],
  ] as const) {
    const unit = NON_METRIC.exec(text)
    if (unit) errors.push(`${field} uses a non-metric unit ("${unit[0]}"): use metric (litres, kg, km, °C…)`)
    const us = US_WIDE.exec(text)
    if (us) errors.push(`${field} is about US-wide figures ("${us[0]}"): ask about the world, or name a famous place or thing instead`)
  }
  const minYear = now.getUTCFullYear() - MAX_DATA_AGE_YEARS
  const year = Number(q.validAsOf.slice(0, 4))
  if (q.timeSensitive && year < minYear) {
    errors.push(`validAsOf ${q.validAsOf} is too old for a time-sensitive fact: use data from ${minYear} or later`)
  }
  return errors
}

function archiveDate(url: string): Date | null {
  const m = /web\.archive\.org\/web\/(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/.exec(url)
  if (!m) return null
  const [, y, mo, d, h = '00', mi = '00', s = '00'] = m
  return new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`)
}

/** Content checks beyond the schema. Pure: no DB access. */
export function checkQuestion(q: Question, now = new Date()): string[] {
  const errors = localeIssues(q, now)

  for (const s of q.sources) {
    const accessed = new Date(`${s.accessed}T00:00:00Z`)
    if (accessed.getTime() > now.getTime() + DAY) errors.push(`source ${s.id}: accessed date is in the future`)
    const snap = archiveDate(s.archiveUrl)
    if (!snap) {
      errors.push(`source ${s.id}: archiveUrl has no snapshot timestamp`)
    } else {
      if (Math.abs(snap.getTime() - accessed.getTime()) > (ARCHIVE_MAX_DAYS + 1) * DAY) {
        errors.push(
          `source ${s.id}: archive snapshot (${snap.toISOString().slice(0, 10)}) is more than ${ARCHIVE_MAX_DAYS} days from the access date (${s.accessed})`,
        )
      }
      if (Math.abs(new Date(s.archivedAt).getTime() - snap.getTime()) > DAY) {
        errors.push(`source ${s.id}: archivedAt does not match the snapshot timestamp`)
      }
    }
    if (s.published && s.published > s.accessed) errors.push(`source ${s.id}: published after it was accessed`)
  }

  if (q.kind === 'direct') {
    if (!q.sources.some((s) => quoteContainsNumber(s.quote, q.answer))) {
      errors.push('no source quote contains the answer (direct questions must be stated verbatim by a source)')
    }
  }

  if (q.kind === 'derived' && q.formula) {
    const sheet = evaluateSheet(q.formula)
    const bad = sheet.lines.find((l) => l.error)
    if (bad) errors.push(`formula line ${bad.index + 1}: ${bad.error!.message}`)
    if (sheet.answer === null) {
      errors.push('formula has no result')
    } else if (Math.abs(sheet.answer - q.answer) / q.answer > FORMULA_TOLERANCE) {
      errors.push(`formula evaluates to ${sheet.answer}, not the stated answer ${q.answer}`)
    }
    const vars = new Map(sheet.variables.map((v) => [v.name, v.value]))
    for (const input of q.inputs ?? []) {
      const v = vars.get(input.name)
      if (v === undefined) {
        errors.push(`input ${input.name} is not defined in the formula (expected a line like \`${input.name} = ${input.value}\`)`)
      } else if (Math.abs(v - input.value) > Math.abs(input.value) * FORMULA_TOLERANCE) {
        errors.push(`input ${input.name} is ${input.value} but the formula sets it to ${v}`)
      }
      const cited = q.sources.filter((s) => input.sourceIds.includes(s.id))
      if (!cited.some((s) => quoteContainsNumber(s.quote, Math.abs(input.value)))) {
        errors.push(
          `input ${input.name} = ${input.value}: none of its cited quotes contain that number (use the source's own units; convert in the formula)`,
        )
      }
    }
  }

  if (q.recheckAfter && q.recheckAfter <= now.toISOString().slice(0, 10)) errors.push('recheckAfter is already in the past')
  return errors
}

export function ingestQuestion(db: DB, input: unknown, opts: IngestOptions = {}): IngestResult {
  const parsed = QuestionSchema.safeParse(input)
  const rawId = typeof input === 'object' && input && 'id' in input ? String((input as { id: unknown }).id) : undefined
  if (!parsed.success) {
    return { status: 'invalid', id: rawId, errors: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) }
  }
  const q = parsed.data
  // Imports and rewordings keep questions that predate a rule (overdue rechecks, locale rules); `pnpm q check` still
  // flags them.
  const keepsData = opts.import || opts.reword
  const legacy = new Set(keepsData ? ['recheckAfter is already in the past', ...localeIssues(q, opts.now)] : [])
  const errors = checkQuestion(q, opts.now).filter((e) => !legacy.has(e))
  if (errors.length) return { status: 'invalid', id: q.id, errors }

  return tx(db, () => {
    const existing = getQuestion(db, q.id)
    if (existing && opts.import) return { status: 'exists', id: q.id } as const
    if (existing)
      return {
        status: 'invalid',
        id: q.id,
        errors: [`id ${q.id} already exists${opts.replaces ? '' : ' (pick another id, or pass replaces)'}`],
      } as const
    const replaced = opts.replaces ? getQuestion(db, opts.replaces) : undefined
    if (opts.replaces && !replaced) return { status: 'invalid', id: q.id, errors: [`replaces: unknown question ${opts.replaces}`] } as const
    if (opts.reword && replaced?.status !== 'active')
      return {
        status: 'invalid',
        id: q.id,
        errors: [`reword: ${opts.replaces ?? '(no replaces)'} is ${replaced?.status ?? 'missing'}; only active questions can be reworded`],
      } as const

    const candidates = (opts.candidates ?? loadCandidates(db)).filter((c) => c.id !== opts.replaces)
    const incoming = {
      normText: normalizeText(q.question),
      answer: q.answer,
      unit: q.unit,
      sources: q.sources.map((s) => ({ urlNorm: normalizeUrl(s.url), quoteNorm: normalizeText(s.quote) })),
      template: q.template,
    }
    const matches = findMatches(incoming, candidates)
    const hard = matches.filter((m) => m.hard)
    if (hard.length) return { status: 'duplicate', id: q.id, matches: hard } as const
    const cleared = new Set(q.distinctFrom ?? [])
    const grey = matches.filter((m) => !cleared.has(m.id))
    if (grey.length) return { status: 'needs_review', id: q.id, matches: grey } as const

    if (opts.dryRun) return { status: 'valid', id: q.id } as const
    insertQuestion(db, q, opts.batchId)
    // A replaced version isn't a duplicate candidate (see loadCandidates), so its replacement can follow it in.
    if (!(opts.import?.status === 'retired' && opts.import.replacedBy))
      opts.candidates?.push({ id: q.id, question: q.question, status: opts.import?.status ?? 'active', ...incoming })
    if (opts.import) {
      const flags = [...(opts.import.flags ?? [])]
      if (q.recheckAfter && q.recheckAfter <= (opts.now ?? new Date()).toISOString().slice(0, 10) && !flags.includes('recheck-due'))
        flags.push('recheck-due')
      if (flags.length) setFlags(db, q.id, flags)
      if (opts.import.status && opts.import.status !== 'active') setStatus(db, q.id, opts.import.status, opts.import.replacedBy)
    }
    if (opts.replaces) setStatus(db, opts.replaces, 'retired', q.id)
    return { status: 'added', id: q.id } as const
  })
}
