// pnpm harvest <url> <category> [--count 15]
// Many questions from one table page (a cited Wikipedia list, an official statistics table): the page is fetched once,
// its table rows become candidate quotes (a row's text is found verbatim by the quote check), and one Sonnet call
// picks the rows that make good questions and words them. The drafts then go through the usual pipeline
// (scripts/pipeline.ts): prepare (archives the page once, the rest reuse the snapshot), the screen, the verifiers.
// The page must be plain HTML: the quote check doesn't run JavaScript. Prints only the report line, never texts.

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { htmlToText } from '../apps/server/src/questions/html.ts'
import { CATEGORIES } from '../packages/shared/src/question.ts'
import { pipelineAgents } from './agents.ts'
import { askModel, claudeConfigDir, ROOT } from './claude.ts'
import { parseJsonArray } from './review.ts'

/** Longest quote the schema takes. */
const MAX_QUOTE = 1500
/** Rows shown to the picker; a longer table is cut, so long lists are best harvested a section at a time. */
const MAX_ROWS = 150

const clean = (s: string) =>
  htmlToText(s)
    .replace(/\[\s*(?:\d+|[a-z]|note \d+)\s*\]/gi, ' ') // footnote markers
    .replace(/\s+/g, ' ')
    .trim()

/** The page's title and its table rows that hold a number, as plain text (each row's cells joined by spaces). */
export function tableRows(html: string): { title: string; rows: string[] } {
  const title = clean(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '').slice(0, 300) || 'Untitled'
  const rows = [...html.matchAll(/<tr[\s\S]*?<\/tr>/gi)]
    .map((m) => clean(m[0]))
    .filter((r) => /\d/.test(r) && r.length >= 10 && r.length <= MAX_QUOTE)
  return { title, rows: [...new Set(rows)] }
}

export interface Pick {
  row: number
  id: string
  question: string
  unit: string
  answer: number
  difficulty: 1 | 2 | 3
  explanation: string
  validAsOf: string
  timeSensitive: boolean
  recheckAfter?: string
  published?: string
  template?: { id: string; slot: string }
}

export function pickPrompt(category: string, count: number, page: { url: string; title: string; rows: string[] }, existing: string[]) {
  const list = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x}`).join('\n') : '(none)')
  return (
    `Page: ${page.title} (${page.url})\nCategory: "${category}"\n\n` +
    `Rows of the page's tables, numbered:\n${page.rows
      .slice(0, MAX_ROWS)
      .map((r, i) => `${i}: ${r}`)
      .join('\n')}\n\n` +
    `Existing questions in "${category}" (don't repeat their facts):\n${list(existing)}\n\n` +
    `Pick up to ${count} rows that make good questions, each a different fact a player would enjoy estimating, ` +
    `and well known enough to reason about. The row is the question's only source and its quote, so the answer must ` +
    `be a number written in that row, in the row's own units (or exactly that number scaled, e.g. "3.2 million" ` +
    `→ 3200000), and the question must ask exactly what the column measures, for exactly that row's subject and ` +
    `year. Skip rows whose number needs the table's context to make sense. Where the picks share a shape, use a ` +
    `template from the rules' templates file, or name a new one.\n\n` +
    `Reply with only a JSON array: [{"row": 0, "id": "kebab-case-id", "question": "…", "unit": "…", "answer": 0, ` +
    `"difficulty": 1|2|3, "explanation": "trivia and reasoning for the reveal, no other numbers than the row's", ` +
    `"validAsOf": "YYYY or YYYY-MM-DD", "timeSensitive": true|false, "recheckAfter": "YYYY-MM-DD (when ` +
    `timeSensitive)", "published": "the page's or table's date if it states one", "template": {"id": "…", ` +
    `"slot": "…"}}]. Leave out keys that don't apply.`
  )
}

/** Picks that point at a real row and carry what a draft needs. */
export function parsePicks(text: string, rows: number): Pick[] {
  return (parseJsonArray<Pick>(text) ?? []).filter(
    (p) =>
      p &&
      Number.isInteger(p.row) &&
      p.row >= 0 &&
      p.row < rows &&
      typeof p.id === 'string' &&
      /^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.id) &&
      typeof p.question === 'string' &&
      typeof p.unit === 'string' &&
      typeof p.answer === 'number' &&
      p.answer > 0,
  )
}

/** A draft from a pick: the row's text is the verbatim quote; `prepare` adds the snapshot. */
export function draftFromPick(p: Pick, category: string, page: { url: string; title: string; rows: string[] }, today: string) {
  const publisher = new URL(page.url).hostname.replace(/^www\./, '')
  return {
    id: p.id,
    question: p.question,
    unit: p.unit,
    category,
    difficulty: [1, 2, 3].includes(p.difficulty) ? p.difficulty : 2,
    kind: 'direct',
    answer: p.answer,
    explanation: p.explanation,
    validAsOf: p.validAsOf,
    timeSensitive: !!p.timeSensitive,
    ...(p.recheckAfter ? { recheckAfter: p.recheckAfter } : {}),
    sources: [
      {
        id: 's1',
        url: page.url,
        title: page.title,
        publisher,
        ...(p.published ? { published: p.published } : {}),
        accessed: today,
        quote: page.rows[p.row],
      },
    ],
    ...(p.template ? { template: p.template } : {}),
    verification: { verifiedAt: new Date().toISOString(), verdict: 'approved', notes: 'UNVERIFIED DRAFT (harvest)' },
  }
}

if (import.meta.main) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { count: { type: 'string', default: '15' } } })
  const [url, category] = positionals
  const count = Number(values.count)
  if (!url || !category || !Number.isInteger(count) || count < 1) {
    console.error('usage: pnpm harvest <url> <category> [--count 15]')
    process.exit(1)
  }
  if (!(CATEGORIES as readonly string[]).includes(category)) {
    console.error(`✗ not a category: ${category}. Categories:\n  ${CATEGORIES.join(', ')}`)
    process.exit(1)
  }
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (fermi source check)' }, redirect: 'follow' }).catch(() => null)
  if (!res?.ok) {
    console.error(`✗ couldn't fetch ${url}${res ? ` (${res.status})` : ''}`)
    process.exit(1)
  }
  const page = { url, ...tableRows(await res.text()) }
  if (!page.rows.length) {
    console.error('✗ no table rows with numbers on that page (is it rendered by JavaScript?)')
    process.exit(1)
  }
  const configDir = claudeConfigDir()
  const agents = pipelineAgents(configDir)
  const system =
    `You turn rows of a table into questions for "Fermi", a party game where players estimate numbers. Follow the ` +
    `question rules and templates below.\n\n<rules>\n${agents.allRules}\n</rules>\n\n<templates>\n${agents.templates}\n</templates>`
  const today = new Date().toISOString().slice(0, 10)
  const r = await agents.run(category, count, {
    async draft(batch, topic, need, existing) {
      const a = await askModel('sonnet', system, pickPrompt(topic, need, page, existing), configDir)
      if (a.limit) return { ideas: 0, costUsd: a.costUsd, limit: a.limit }
      const picks = parsePicks(a.text, Math.min(page.rows.length, MAX_ROWS))
      const ids = new Set<string>()
      for (const p of picks) {
        if (ids.has(p.id)) continue
        ids.add(p.id)
        writeFileSync(join(ROOT, batch, 'drafts', `${p.id}.json`), JSON.stringify(draftFromPick(p, topic, page, today), null, 2))
      }
      return { ideas: ids.size, costUsd: a.costUsd, limit: null }
    },
  })
  console.log(`${new Date().toTimeString().slice(0, 5)} harvest ${category} (${page.rows.length} rows): ${r.report}`)
}
