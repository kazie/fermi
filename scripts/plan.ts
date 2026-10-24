// The planner of `pnpm grow` (scripts/pipeline.ts): one tool-less Sonnet call per round lists distinct question ideas
// for a topic, so each generator gets ideas of its own instead of the same vague topic. It sees the topic's existing
// question texts, to steer clear of them; nothing it writes is ever printed (spoilers).

import type { Idea } from './pipeline.ts'
import { parseJsonArray } from './review.ts'

export function planSystem(rules: string, templates: string) {
  return (
    `You plan questions for "Fermi", a party game where players estimate numbers. You don't write the questions: ` +
    `you list ideas, and a writer with web search sources and drafts each one. Follow the question rules below. ` +
    `Ideas fail most often because they repeat an existing question, have no source that states the number, need ` +
    `the source to make sense, or rest on a US-only figure, so avoid those.\n\n` +
    `<rules>\n${rules}\n</rules>\n\n<templates>\n${templates}\n</templates>`
  )
}

export function planPrompt(topic: string, n: number, existing: string[], tried: string[]) {
  const list = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x}`).join('\n') : '(none)')
  return (
    `List ${n} ideas for the category "${topic}".\n\n` +
    `Each idea is one fact a player would enjoy estimating, worded the way a player would see it, with the unit. ` +
    `Make every idea a different fact from the existing questions and the ideas already tried below, and from each ` +
    `other: a different subject or a different measure, not a rewording. Prefer facts a credible, international or ` +
    `European source states outright (statistics offices, UN agencies, operators, record books, reputable press), ` +
    `recent ones for anything that changes. Where a template fits, use it for some ideas (each with a different, ` +
    `well-known slot not already asked).\n\n` +
    `Existing questions in "${topic}":\n${list(existing)}\n\nIdeas already tried in this run:\n${list(tried)}\n\n` +
    `Reply with only a JSON array: [{"id": "kebab-case-id-naming-the-fact", "idea": "the question as a player sees ` +
    `it, with its unit", "source": "where the number is likely published", "template": {"id": "…", "slot": "…"}}]. ` +
    `Leave "template" out unless the idea uses one.`
  )
}

/** The ideas in a planner reply, or null if it has none. Entries without an id or an idea are dropped. */
export function parseIdeas(text: string): Idea[] | null {
  const raw = parseJsonArray<Record<string, unknown>>(text)
  if (!raw) return null
  const ideas = raw.flatMap((r): Idea[] => {
    if (!r || typeof r.id !== 'string' || typeof r.idea !== 'string') return []
    const t = r.template as { id?: unknown; slot?: unknown } | undefined
    return [
      {
        id: r.id.trim().toLowerCase(),
        idea: r.idea.trim(),
        ...(typeof r.source === 'string' && r.source.trim() ? { source: r.source.trim() } : {}),
        ...(t && typeof t.id === 'string' && typeof t.slot === 'string' ? { template: { id: t.id, slot: t.slot } } : {}),
      },
    ]
  })
  return ideas.length ? ideas : null
}
