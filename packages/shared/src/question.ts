import { z } from 'zod'

const partialDate = z.string().regex(/^\d{4}(-\d{2}(-\d{2})?)?$/, 'YYYY, YYYY-MM or YYYY-MM-DD')
const fullDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')

export const SourceSchema = z.object({
  id: z.string().min(1).max(40),
  url: z.url(),
  title: z.string().min(1).max(300),
  publisher: z.string().min(1).max(200),
  /** Verbatim excerpt from the source; must contain the number it backs. */
  quote: z.string().min(5).max(1500),
  /** The source's own publication or last-updated date, when it states one. */
  published: partialDate.optional(),
  /** When we read it. */
  accessed: fullDate,
  /** Wayback Machine snapshot taken around the access date. */
  archiveUrl: z.url().regex(/^https?:\/\/web\.archive\.org\/web\/\d{8,14}/, 'must be a web.archive.org/web/<timestamp>/… snapshot'),
  archivedAt: z.iso.datetime(),
})

export const InputSchema = z.object({
  name: z.string().regex(/^[\p{L}_][\p{L}\p{N}_]*$/u, 'a calculator variable name'),
  value: z.number().finite(),
  unit: z.string().min(1).max(60),
  description: z.string().max(300).optional(),
  sourceIds: z.array(z.string()).min(1),
})

export const QuestionSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'kebab-case')
      .max(80),
    question: z.string().min(10).max(300),
    /** Shown with the question: what to answer in, e.g. "km", "rivets", "seconds". */
    unit: z.string().min(1).max(60),
    category: z
      .string()
      .regex(/^[a-z]+(-[a-z]+)*$/)
      .max(40),
    difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    kind: z.enum(['direct', 'derived']),
    answer: z.number().finite().positive(),
    /** Trivia and reasoning shown at the reveal. */
    explanation: z.string().min(10).max(1200),
    validAsOf: partialDate,
    timeSensitive: z.boolean(),
    recheckAfter: fullDate.optional(),
    formula: z.string().max(2000).optional(),
    inputs: z.array(InputSchema).optional(),
    sources: z.array(SourceSchema).min(1),
    verification: z.object({
      verifiedAt: z.iso.datetime(),
      verdict: z.literal('approved'),
      notes: z.string().max(2000),
    }),
    /** Template questions share a shape and differ only in the slot ("visitors per year" × "Antarctica"). */
    template: z
      .object({
        id: z
          .string()
          .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'kebab-case')
          .max(60),
        slot: z.string().min(1).max(120),
      })
      .optional(),
    /** IDs of existing questions the verifier judged distinct despite similarity. */
    distinctFrom: z.array(z.string()).optional(),
    distinctReason: z.string().max(500).optional(),
  })
  .superRefine((q, ctx) => {
    if (q.kind === 'derived') {
      if (!q.formula) ctx.addIssue({ code: 'custom', path: ['formula'], message: 'derived questions need a formula' })
      if (!q.inputs?.length) ctx.addIssue({ code: 'custom', path: ['inputs'], message: 'derived questions need cited inputs' })
    }
    const ids = new Set(q.sources.map((s) => s.id))
    if (ids.size !== q.sources.length) ctx.addIssue({ code: 'custom', path: ['sources'], message: 'source ids must be unique' })
    for (const [i, input] of (q.inputs ?? []).entries()) {
      for (const sid of input.sourceIds) {
        if (!ids.has(sid)) ctx.addIssue({ code: 'custom', path: ['inputs', i, 'sourceIds'], message: `unknown source id ${sid}` })
      }
    }
    if (q.timeSensitive && !q.recheckAfter) {
      ctx.addIssue({ code: 'custom', path: ['recheckAfter'], message: 'time-sensitive questions need a recheckAfter date' })
    }
    if (q.distinctFrom?.length && !q.distinctReason) {
      ctx.addIssue({ code: 'custom', path: ['distinctReason'], message: 'explain why it is distinct' })
    }
  })

export type Question = z.infer<typeof QuestionSchema>
export type Source = z.infer<typeof SourceSchema>

/** What players see during a round: no answer, no sources. */
export interface PublicQuestion {
  id: string
  question: string
  unit: string
  category: string
}

/** Everything shown at the reveal / recap. */
export type RevealedQuestion = Omit<Question, 'verification' | 'distinctFrom' | 'distinctReason'>

export function toRevealed(q: Question): RevealedQuestion {
  const { verification: _v, distinctFrom: _d, distinctReason: _r, ...rest } = q
  return rest
}
