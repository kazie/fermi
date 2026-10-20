// pnpm grow [--workers 3] [--rounds 4] [--count 15] [topic…]
// Grows the question pool unattended: parallel runs of the question pipeline (scripts/pipeline.ts: Haiku drafts,
// a script checks, Sonnet verifies), each on its own topic, so they don't draft the same questions. Given topics are worked through as a queue; without topics, every run takes the category
// with the fewest questions that no other worker is on. A run that fails (the usage limit, say) is retried after a
// pause; one that adds nothing has run out of new questions there, so the worker moves on. Prints only each
// run's report line, never question texts.
// Runs bill the Claude account in FERMI_CLAUDE_CONFIG_DIR (from .env), never whatever the shell defaults to.

import { execFile, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { parseArgs } from 'node:util'
import { CATEGORIES } from '../packages/shared/src/question.ts'
import { limitReset } from './grow-report.ts'
import { formatReport, parseAgentOutput, runPipeline, type AgentName, type AgentResult } from './pipeline.ts'

const ROOT = new URL('../', import.meta.url).pathname
const envFile = new URL('../.env', import.meta.url)
if (existsSync(envFile)) process.loadEnvFile(envFile)

const configDir = process.env.FERMI_CLAUDE_CONFIG_DIR?.replace(/^~(?=\/|$)/, homedir())
if (!configDir) {
  console.error(
    '✗ FERMI_CLAUDE_CONFIG_DIR is not set. Put the Claude config dir of the account these runs should bill in .env,\n' +
      '  e.g. FERMI_CLAUDE_CONFIG_DIR=~/.claude-personal. There is no default, so a run can never bill an account by accident.',
  )
  process.exit(1)
}
if (!existsSync(configDir)) {
  console.error(`✗ FERMI_CLAUDE_CONFIG_DIR points to ${configDir}, which doesn't exist.`)
  process.exit(1)
}
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

function categoryCounts(): Promise<Map<string, number>> {
  return new Promise((resolve, reject) =>
    execFile('node', ['scripts/questions-cli.ts', 'stats', '--categories'], { cwd: ROOT }, (err, stdout) => {
      if (err) return reject(new Error('pnpm q stats failed: is the server running?'))
      // every category, empty ones included, fewest first (the server fills in the empty ones)
      resolve(
        new Map(
          stdout
            .trim()
            .split('\n')
            .map((line) => line.split('\t').reverse() as [string, string])
            .map(([c, n]) => [c, Number(n)]),
        ),
      )
    }),
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
  const [model, effort] = agent === 'fermi-generator' ? ['haiku', ['--effort', 'low']] : ['sonnet', []]
  return new Promise((resolve) => {
    const child = spawn(
      'claude',
      [
        '-p',
        '--agent',
        agent,
        '--model',
        model as string,
        ...(effort as string[]),
        '--permission-mode',
        'dontAsk',
        '--output-format',
        'json',
        brief,
      ],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, CLAUDE_CONFIG_DIR: configDir, FERMI_HEARTBEAT: heartbeat } },
    )
    let out = ''
    child.stdout.on('data', (d) => (out += d))
    child.on('error', () => resolve({ costUsd: 0, limit: null }))
    child.on('close', () => resolve(parseAgentOutput(out)))
  })
}

/** `pnpm q <args>`; its stdout is only parsed for ids, categories and counts. */
function cli(args: string[], heartbeat: string): Promise<string> {
  return new Promise((resolve, reject) =>
    execFile(
      'node',
      ['scripts/questions-cli.ts', ...args],
      { cwd: ROOT, env: { ...process.env, FERMI_HEARTBEAT: heartbeat }, maxBuffer: 64 * 1024 * 1024 },
      (err, stdout) => (err ? reject(new Error(`pnpm q ${args[0]} failed`)) : resolve(stdout)),
    ),
  )
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
      cli: (args) => cli(args, heartbeat),
    })
    spent += r.cost['fermi-generator'] + r.cost['fermi-verifier']
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
