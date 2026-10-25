// pnpm grow [--workers 3] [--rounds 4] [--count 15] [topic…]
// Grows the question pool unattended: parallel runs of the question pipeline (scripts/pipeline.ts: Sonnet plans
// ideas, Haiku drafts, a script checks, Sonnet verifies), each on its own topic, so they don't draft the same
// questions. Given topics are worked through as a queue; without topics, every run takes the category with the fewest
// questions that no other worker is on, skipping categories that have recently run dry (.fermi-work/topic-yield.json).
// A run that fails (the usage limit, say) is retried after a pause. Prints only each run's report line, never question
// texts.
// Runs bill the Claude account in FERMI_CLAUDE_CONFIG_DIR (from .env), never whatever the shell defaults to.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { parseArgs } from 'node:util'
import { CATEGORIES } from '../packages/shared/src/question.ts'
import { pipelineAgents } from './agents.ts'
import { claudeConfigDir, ROOT, runCli } from './claude.ts'
import { resting } from './grow-report.ts'

const configDir = claudeConfigDir()
const agents = pipelineAgents(configDir)
const RETRY_MS = 20 * 60 * 1000
const MAX_FAILURES = 9

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    workers: { type: 'string', default: '3' },
    rounds: { type: 'string', default: '4' },
    count: { type: 'string', default: '15' },
  },
})
const [workers, rounds, count] = [values.workers, values.rounds, values.count].map(Number)
if (![workers, rounds, count].every((n) => Number.isInteger(n) && n > 0)) {
  console.error('✗ --workers, --rounds and --count take positive whole numbers')
  process.exit(1)
}
/** Auto mode picks the emptiest free category per run; otherwise the given topics are worked through as a queue. */
const auto = positionals.length === 0
const queue = [...positionals]
const unknown = positionals.filter((t) => !(CATEGORIES as readonly string[]).includes(t))
if (unknown.length) {
  console.error(`✗ not a category: ${unknown.join(', ')}. Topics must be categories:\n  ${CATEGORIES.join(', ')}`)
  process.exit(1)
}
const inUse = new Set<string>()

/** Recent runs per category, kept across invocations, so categories that keep coming up dry get a rest. */
const yieldFile = join(ROOT, '.fermi-work', 'topic-yield.json')
type YieldLog = Record<string, { at: string; added: number }[]>
const readYield = (): YieldLog => {
  try {
    return existsSync(yieldFile) ? JSON.parse(readFileSync(yieldFile, 'utf8')) : {}
  } catch {
    return {}
  }
}
function recordYield(topic: string, added: number) {
  const log = readYield()
  log[topic] = [...(log[topic] ?? []), { at: new Date().toISOString(), added }].slice(-5)
  mkdirSync(join(ROOT, '.fermi-work'), { recursive: true })
  writeFileSync(yieldFile, JSON.stringify(log, null, 2))
}

async function categoryCounts(): Promise<Map<string, number>> {
  const out = await runCli(['stats', '--categories']).catch(() => {
    throw new Error('pnpm q stats failed: is the server running?')
  })
  // every category, empty ones included, fewest first (the server fills in the empty ones)
  return new Map(
    out
      .trim()
      .split('\n')
      .map((line) => line.split('\t').reverse() as [string, string])
      .map(([c, n]) => [c, Number(n)]),
  )
}

/** Picks and marks a topic in one synchronous step, so two workers can't take the same one. */
async function nextTopic(): Promise<string | undefined> {
  const counts = auto ? await categoryCounts() : null
  const log = readYield()
  const topic = counts ? [...counts.keys()].find((c) => !inUse.has(c) && !resting(log[c])) : queue.shift()
  if (topic) inUse.add(topic)
  return topic
}

/** Total spent by all runs, for the closing line. */
let spent = 0

async function run(topic: string) {
  const r = await agents.run(topic, count)
  spent += r.spent
  return r
}

const log = (w: number, msg: string) => console.log(`${new Date().toTimeString().slice(0, 5)} [w${w}] ${msg}`)

async function worker(w: number) {
  let failures = 0
  const fail = async (msg: string) => {
    if (++failures >= MAX_FAILURES) {
      log(w, `${msg}; giving up after ${failures} failures in a row`)
      return false
    }
    log(w, `${msg}; retrying in ${RETRY_MS / 60000} min`)
    await sleep(RETRY_MS)
    return true
  }
  for (let round = 0; auto ? round < rounds : queue.length;) {
    let topic: string | undefined
    try {
      topic = await nextTopic()
    } catch (e) {
      if (await fail((e as Error).message)) continue
      return
    }
    if (!topic) return
    try {
      log(w, `${topic}: running`)
      const { added, report, limitUntil } = await run(topic)
      log(w, `${topic}: ${report}`)
      if (limitUntil) {
        // A usage limit isn't a failure: put the topic back and sleep until it lifts.
        if (!auto) queue.unshift(topic)
        inUse.delete(topic)
        const mins = Math.round((limitUntil - Date.now()) / 60_000)
        log(w, `usage limit; sleeping until ${new Date(limitUntil).toTimeString().slice(0, 5)} (${Math.floor(mins / 60)}h ${mins % 60}m)`)
        await sleep(limitUntil - Date.now())
        continue
      }
      if (added === null) {
        // Failed or limited: put the topic back so it's retried (by whichever worker gets to it first). Released now,
        // not in `finally`, which only runs after fail()'s 20-minute wait.
        if (!auto) queue.unshift(topic)
        inUse.delete(topic)
        if (await fail(`${topic}: no report`)) continue
        return
      }
      failures = 0
      round++
      recordYield(topic, added)
    } finally {
      inUse.delete(topic)
    }
  }
}

await categoryCounts() // fail fast if the server is down
console.log(`account: ${configDir.replace(homedir(), '~')} · ${workers} workers · topics: ${auto ? 'auto' : positionals.join(', ')}`)
await Promise.all(Array.from({ length: workers }, (_, i) => sleep(i * 30_000).then(() => worker(i + 1))))
const counts = await categoryCounts().catch(() => null)
if (counts) console.log(`pool: ${[...counts.values()].reduce((a, b) => a + b, 0)} active · spent $${spent.toFixed(2)}`)
