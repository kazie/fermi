// pnpm review [--limit N] [--dry-run] [--show] [--retry-unresolved]
// Reviews the questions in the pool for quality as a player sees them (scripts/review.ts): Haiku screens, Sonnet
// decides on what was flagged, this script rewords or retires. Prints only ids, issue codes, counts and cost, unless
// --show asks for the flagged questions' wording (a spoiler for those questions; answers are never printed).

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { claudeConfigDir, ROOT, runClaude, runCli } from './claude.ts'
import { parseAgentOutput } from './pipeline.ts'
import { formatReview, maskNumbers, reviewPool, rulesSection, type PoolQuestion } from './review.ts'

const { values } = parseArgs({
  options: {
    limit: { type: 'string' },
    'dry-run': { type: 'boolean' },
    show: { type: 'boolean' },
    'retry-unresolved': { type: 'boolean' },
  },
})
const limit = values.limit ? Number(values.limit) : undefined
if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) {
  console.error('✗ --limit takes a positive whole number')
  process.exit(1)
}
const configDir = claudeConfigDir()

const result = await reviewPool(
  {
    async ask(model, system, prompt) {
      const args = ['-p', '--model', model, '--tools', '', '--system-prompt', system, '--no-session-persistence', '--output-format', 'json']
      return parseAgentOutput(await runClaude([...args, prompt], configDir))
    },
    cli: (args) => runCli(args),
    // The export holds answers: it's read from the command's output, never written to disk or printed.
    pool: async () => (JSON.parse(await runCli(['export'])) as { questions: PoolQuestion[] }).questions,
  },
  {
    rules: rulesSection(readFileSync(join(ROOT, 'content', 'QUESTION_RULES.md'), 'utf8')),
    limit,
    dryRun: values['dry-run'],
    retryUnresolved: values['retry-unresolved'],
    onProgress: (msg) => console.error(`${new Date().toTimeString().slice(0, 8)} ${msg}`),
  },
)
if (values.show) {
  for (const d of result.details) {
    console.log(`\n${d.id} · ${d.issue} → ${d.action}`)
    console.log(`  flagged: ${d.note}`)
    console.log(`  before:  ${d.before}`)
    if (d.after) console.log(`  after:   ${d.after}`)
    if (d.reason) console.log(`  why:     ${maskNumbers(d.reason)}`)
  }
  console.log('')
}
for (const line of formatReview(result, values['dry-run'])) console.log(line)
