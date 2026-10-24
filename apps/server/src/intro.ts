// The intro's example questions: a small static pool in content/intro/examples.json, never in the database, never
// scored. Each one is fully worked out, so the reveal can show how a human might have done it.

import { readFileSync } from 'node:fs'
import { z } from 'zod'
import type { Question } from '@fermi/shared'

const EXAMPLES_FILE = new URL('../../../content/intro/examples.json', import.meta.url)

const ExampleSchema = z.object({
  id: z.string().regex(/^practice-[a-z0-9-]+$/),
  question: z.string().min(10).max(300),
  unit: z.string().min(1).max(60),
  answer: z.number().finite().positive(),
  explanation: z.string().min(10).max(1200),
  /** A worked answer sheet in calculator syntax: its last line is the answer. */
  sheet: z.string().min(1).max(2000),
})
export type Example = z.infer<typeof ExampleSchema>

let cached: Example[] | undefined
/** Every example, checked; throws if the file is wrong. */
export function loadExamples(): Example[] {
  cached ??= z
    .array(ExampleSchema)
    .min(1)
    .parse(JSON.parse(readFileSync(EXAMPLES_FILE, 'utf8')))
  return cached
}

/** An example as a question the round and reveal code can play. It has no sources: the sheet is its working. */
export function exampleQuestion(e: Example): Question {
  return {
    id: e.id,
    question: e.question,
    unit: e.unit,
    category: 'everyday-life',
    difficulty: 1,
    kind: 'derived',
    answer: e.answer,
    explanation: e.explanation,
    validAsOf: '2026',
    timeSensitive: false,
    formula: e.sheet,
    inputs: [],
    sources: [],
    verification: { verifiedAt: '2026-10-24T00:00:00Z', verdict: 'approved', notes: 'intro example' },
  }
}
