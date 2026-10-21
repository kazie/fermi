// pnpm grow [--workers 3] [--rounds 4] [--count 15] [topic…]
// Grows the question pool unattended: parallel runs of the question pipeline (scripts/pipeline.ts: Haiku drafts,
// a script checks, Sonnet verifies), each on its own topic, so they don't draft the same questions. Given topics are worked through as a queue; without topics, every run takes the category
// with the fewest questions that no other worker is on. A run that fails (the usage limit, say) is retried after a
// pause; one that adds nothing has run out of new questions there, so the worker moves on. Prints only each
// run's report line, never question texts.
// Runs bill the Claude account in FERMI_CLAUDE_CONFIG_DIR (from .env), never whatever the shell defaults to.

import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { parseArgs } from 'node:util'
import { CATEGORIES } from '../packages/shared/src/question.ts'
import { askModel, claudeConfigDir, ROOT, runClaude, runCli } from './claude.ts'
import { limitReset, parseAgentOutput } from './grow-report.ts'
import { formatReport, runPipeline, type AgentName, type AgentResult, type ScreenResult } from './pipeline.ts'
import { rulesSection, screenFilePath, screenQuestions, type ScreenFile, type ScreenItem } from './review.ts'

const configDir = claudeConfigDir()
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
/** Topics whose run came back with `+0 added`: nothing new left there for now. */
const exhausted = new Set<string>()

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
  const topic = counts ? [...counts.keys()].find((c) => !inUse.has(c) && !exhausted.has(c)) : queue.shift()
  if (topic) inUse.add(topic)
  return topic
}

/** One headless agent session; its output is only read for cost and usage limits, never printed. */
function runAgent(agent: AgentName, brief: string, heartbeat: string): Promise<AgentResult> {
  const model = agent === 'fermi-generator' ? ['--model', 'haiku', '--effort', 'low'] : ['--model', 'sonnet']
  const args = ['-p', '--agent', agent, ...model, '--permission-mode', 'dontAsk', '--output-format', 'json', brief]
  return runClaude(args, configDir, { FERMI_HEARTBEAT: heartbeat }).then(parseAgentOutput)
}

const rules = rulesSection(readFileSync(join(ROOT, 'content', 'QUESTION_RULES.md'), 'utf8'))

/**
 * The player-view screen of `pnpm review`, on drafts before they're verified. Each flagged draft gets a `.screen.json`
 * with what the screen saw and its note, for the verifier and `pnpm q approve`. Drafts that can't be read are left out.
 */
async function screenDrafts(dir: string, ids: string[]): Promise<ScreenResult> {
  const items: ScreenItem[] = []
  const draftPath = (id: string) => join(ROOT, dir, 'drafts', `${id}.json`)
  for (const id of ids) {
    try {
      const d = JSON.parse(readFileSync(draftPath(id), 'utf8'))
      items.push({ id, category: String(d.category), question: String(d.question), unit: String(d.unit) })
    } catch {
      // still being written or broken: prepare passed it, so this is rare; screen the rest
    }
  }
  const r: ScreenResult = { flags: {}, costUsd: 0, limit: null }
  if (!items.length) return r
  const hits = await screenQuestions(
    async (system, prompt) => {
      const a = await askModel('haiku', system, prompt, configDir)
      r.costUsd += a.costUsd
      r.limit ??= a.limit
      return a.limit ? null : a.text
    },
    rules,
    items,
  )
  if (!hits) return { ...r, failed: !r.limit }
  for (const f of hits) {
    const item = items.find((q) => q.id === f.id)!
    const file: ScreenFile = { issue: f.issue, note: f.note, question: item.question, unit: item.unit }
    writeFileSync(screenFilePath(draftPath(f.id)), JSON.stringify(file, null, 2))
    r.flags[f.id] = f.issue
  }
  return r
}

/** Total spent by all runs, for the closing line. */
let spent = 0

/**
 * One batch for one topic (scripts/pipeline.ts). Returns how many questions it added, or null if it failed. While it
 * runs, a heartbeat file is touched every minute; its batch records the path, so other runs know it's alive
 * (scripts/batch.ts).
 */
async function run(topic: string): Promise<{ added: number | null; report: string; limitUntil?: number | null }> {
  const aliveDir = join(ROOT, '.fermi-work', '.alive')
  mkdirSync(aliveDir, { recursive: true })
  const heartbeat = join(aliveDir, `${process.pid}-${randomBytes(3).toString('hex')}`)
  writeFileSync(heartbeat, '')
  const beat = setInterval(() => utimesSync(heartbeat, new Date(), new Date()), 60_000)
  try {
    const r = await runPipeline(topic, count, {
      runAgent: (agent, brief) => runAgent(agent, brief, heartbeat),
      cli: (args) => runCli(args, { FERMI_HEARTBEAT: heartbeat }),
      screen: screenDrafts,
    })
    spent += r.cost['fermi-generator'] + r.cost.screen + r.cost['fermi-verifier']
    if (r.limit) {
      return { added: null, report: `${formatReport(r)} · stopped: ${r.limit}`, limitUntil: limitReset(r.limit, new Date()) }
    }
    return { added: r.added, report: formatReport(r) }
  } catch (e) {
    return { added: null, report: (e as Error).message }
  } finally {
    clearInterval(beat)
    rmSync(heartbeat, { force: true })
  }
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
        log(w, `usage limit; sleeping until ${new Date(limitUntil).toTimeString().slice(0, 5)}`)
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
      if (added === 0) exhausted.add(topic)
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
