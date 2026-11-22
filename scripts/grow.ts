// pnpm grow [--workers 3] [--rounds 4] [--count 15] [topic…]
// Grows the question pool unattended: parallel runs of the question pipeline (scripts/pipeline.ts: Sonnet plans
// ideas, Haiku drafts, a script checks, Sonnet verifies), each on its own topic, so they don't draft the same
// questions. Given topics are worked through as a queue; without topics, every run takes the category with the fewest
// questions that no other worker is on, skipping categories that have recently run dry (.fermi-work/topic-yield.json).
// At a usage limit a worker sleeps until it lifts, unless that's more than 6 hours away (a weekly limit): then it stops,
// so the account can be switched. Any other failed run is retried after a pause. Prints only each run's report line,
// never question texts. Ctrl+C lets the runs in progress finish and starts no new ones (exit code 130); a second
// Ctrl+C stops them at once.
// Runs bill the Claude account in FERMI_CLAUDE_CONFIG_DIR (from .env), never whatever the shell defaults to.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { parseArgs } from 'node:util'
import { CATEGORIES } from '../packages/shared/src/question.ts'
import { pipelineAgents } from './agents.ts'
import { claudeConfigDir, ROOT, runCli, shieldChildren, stopChildren } from './claude.ts'
import { signalExitCode } from './exit.ts'
import { nextLook, resting } from './grow-report.ts'

const configDir = claudeConfigDir()
const agents = pipelineAgents(configDir)
const RETRY_MS = 20 * 60 * 1000
const MAX_FAILURES = 9

/**
 * The first Ctrl+C stops new runs: sleeping workers quit, and running ones quit once their run is done. Their sessions
 * run in their own process groups (shieldChildren), so the terminal's Ctrl+C doesn't kill them mid-run. A second
 * Ctrl+C, Ctrl+\, a SIGTERM or a hang-up stops them and exits; their batches are taken over by a later run. A third
 * Ctrl+C doesn't wait for them to stop (exiting kills them).
 */
const stop = new AbortController()
/** Sleeps, or wakes early once stopping. */
const nap = (ms: number) => sleep(ms, undefined, { signal: stop.signal }).catch(() => {})
const time = (at: number = Date.now()) => new Date(at).toTimeString().slice(0, 5)
let quitting = false
async function quitNow(code: number) {
  if (quitting) process.exit(code)
  quitting = true
  await stopChildren()
  process.exit(code)
}
shieldChildren()
// Output piped into something that quits first (`| tee log` takes Ctrl+C too): carry on without it rather than crash.
process.stdout.on('error', () => {})
process.stderr.on('error', () => {})
process.on('SIGINT', () => {
  if (stop.signal.aborted) {
    console.log(`${time()} stopping now; a later run takes over the unfinished batches`)
    void quitNow(signalExitCode('SIGINT'))
    return
  }
  console.log(`${time()} finishing the runs in progress, then stopping (Ctrl+C again to stop now)`)
  stop.abort()
})
for (const signal of ['SIGTERM', 'SIGHUP', 'SIGQUIT'] as const) process.on(signal, () => void quitNow(signalExitCode(signal)))

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

const log = (w: number, msg: string) => console.log(`${time()} [w${w}] ${msg}`)

async function worker(w: number) {
  let failures = 0
  /** Whether the last limit got a quick look (nextLook), so another limit right after it gets the usual wait. */
  let lookedSoon = false
  const fail = async (msg: string) => {
    if (stop.signal.aborted) {
      log(w, `${msg}; stopping`)
      return false
    }
    if (++failures >= MAX_FAILURES) {
      log(w, `${msg}; giving up after ${failures} failures in a row`)
      return false
    }
    log(w, `${msg}; retrying in ${RETRY_MS / 60000} min`)
    await nap(RETRY_MS)
    return true
  }
  for (let round = 0; !stop.signal.aborted && (auto ? round < rounds : queue.length);) {
    let topic: string | undefined
    try {
      topic = await nextTopic()
    } catch (e) {
      if (await fail((e as Error).message)) continue
      return
    }
    if (!topic) return
    try {
      if (stop.signal.aborted) return
      log(w, `${topic}: running`)
      const { added, report, limit } = await run(topic)
      log(w, `${topic}: ${report}`)
      if (limit) {
        // A usage limit isn't a failure: put the topic back and sleep until it lifts, or stop if that's too far off.
        if (!auto) queue.unshift(topic)
        inUse.delete(topic)
        if (stop.signal.aborted) return // not "sleeping until …": there's no waking up
        const { until: limitUntil, soon } = nextLook(limit, Temporal.Now.instant(), lookedSoon)
        lookedSoon = soon
        if (!limitUntil) {
          log(w, "usage limit won't lift within 6 h; stopping (switch FERMI_CLAUDE_CONFIG_DIR in .env and restart)")
          return
        }
        const mins = Math.round((limitUntil - Date.now()) / 60_000)
        log(w, `usage limit; sleeping until ${time(limitUntil)} (${Math.floor(mins / 60)}h ${mins % 60}m)`)
        await nap(limitUntil - Date.now())
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
      lookedSoon = false
      round++
      recordYield(topic, added)
    } finally {
      inUse.delete(topic)
    }
  }
}

await categoryCounts() // fail fast if the server is down
console.log(`account: ${configDir.replace(homedir(), '~')} · ${workers} workers · topics: ${auto ? 'auto' : positionals.join(', ')}`)
await Promise.all(Array.from({ length: workers }, (_, i) => nap(i * 30_000).then(() => worker(i + 1))))
const counts = await categoryCounts().catch(() => null)
if (counts) console.log(`pool: ${[...counts.values()].reduce((a, b) => a + b, 0)} active · spent $${spent.toFixed(2)}`)
// Stopped by Ctrl+C: not a finished run, so `pnpm grow && …` doesn't carry on.
if (stop.signal.aborted) process.exitCode = signalExitCode('SIGINT')
