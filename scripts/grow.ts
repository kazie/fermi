// pnpm grow [--workers 3] [--rounds 4] [--count 15] [topic…]
// Grows the question pool unattended: parallel headless `/fermi-questions` runs, each on its own topic, so they don't
// draft the same questions. Given topics are worked through as a queue; without topics, every run takes the category
// with the fewest questions that no other worker is on. A run that fails (the usage limit, say) is retried after a
// pause; one that reports `+0 added` has run out of new questions there, so the worker moves on. Prints only each
// run's report line, never question texts.
// Runs bill the Claude account in FERMI_CLAUDE_CONFIG_DIR (from .env), never whatever the shell defaults to.

import { execFile, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

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
/** The categories in content/QUESTION_RULES.md; `stats` only lists categories that already have questions. */
const CATEGORIES = [
  'space',
  'geography',
  'biology',
  'human-body',
  'engineering',
  'food',
  'history',
  'economy',
  'sport',
  'technology',
  'animals',
  'everyday-life',
  'nature',
  'culture',
]
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
const workers = Number(values.workers)
const rounds = Number(values.rounds)
const count = Number(values.count)
const queue = [...positionals]
const inUse = new Set<string>()
/** Topics whose run came back with `+0 added`: nothing new left there for now. */
const exhausted = new Set<string>()

function categoryCounts(): Promise<Map<string, number>> {
  return new Promise((resolve, reject) =>
    execFile('node', ['scripts/questions-cli.ts', 'stats', '--categories'], { cwd: ROOT }, (err, stdout) => {
      if (err) return reject(new Error('pnpm q stats failed: is the server running?'))
      const counts = new Map(CATEGORIES.map((c) => [c, 0]))
      for (const line of stdout.trim().split('\n')) {
        const [n, category] = line.split('\t')
        if (category) counts.set(category, Number(n))
      }
      resolve(counts)
    }),
  )
}

/** Picks and marks a topic in one synchronous step, so two workers can't take the same one. */
async function nextTopic(): Promise<string | undefined> {
  const counts = positionals.length ? null : await categoryCounts()
  const topic = counts ? [...counts].filter(([c]) => !inUse.has(c) && !exhausted.has(c)).sort((a, b) => a[1] - b[1])[0]?.[0] : queue.shift()
  if (topic) inUse.add(topic)
  return topic
}

/**
 * One headless run; returns how many questions it added, or null if it failed or reported nothing. While it runs, a
 * heartbeat file is touched every minute; its batch records the path, so other runs know it's alive (scripts/batch.ts).
 */
function run(topic: string): Promise<{ added: number | null; report: string }> {
  const aliveDir = join(ROOT, '.fermi-work', '.alive')
  mkdirSync(aliveDir, { recursive: true })
  const heartbeat = join(aliveDir, `${process.pid}-${randomBytes(3).toString('hex')}`)
  writeFileSync(heartbeat, '')
  const beat = setInterval(() => utimesSync(heartbeat, new Date(), new Date()), 60_000)
  return new Promise<{ added: number | null; report: string }>((resolve) => {
    const child = spawn(
      'claude',
      [
        '-p',
        '--model',
        'sonnet',
        '--effort',
        'low',
        '--permission-mode',
        'dontAsk',
        '--output-format',
        'json',
        `/fermi-questions ${count} ${topic}`,
      ],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, CLAUDE_CONFIG_DIR: configDir, FERMI_HEARTBEAT: heartbeat } },
    )
    let out = ''
    child.stdout.on('data', (d) => (out += d))
    child.on('error', (e) => resolve({ added: null, report: `could not start claude (${e.message})` }))
    child.on('close', () => {
      let json: { is_error?: boolean; subtype?: string; result?: string } = {}
      try {
        json = JSON.parse(out)
      } catch {
        /* no JSON: the run died */
      }
      // Only the report line may be printed: anything else in the result could hold question texts.
      const report = (json.result ?? '').split('\n').find((l) => /^\+\d+ added/.test(l.trim()))
      if (json.is_error || !report) {
        resolve({ added: null, report: `no report (${json.is_error ? 'error' : (json.subtype ?? 'no output')})` })
      } else resolve({ added: Number(/^\+(\d+)/.exec(report.trim())![1]), report: report.trim() })
    })
  }).finally(() => {
    clearInterval(beat)
    rmSync(heartbeat, { force: true })
  })
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
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
  for (let round = 0; positionals.length ? queue.length : round < rounds;) {
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
      const { added, report } = await run(topic)
      log(w, `${topic}: ${report}`)
      if (added === null) {
        // Failed or limited: put the topic back so it's retried (by whichever worker gets to it first).
        if (positionals.length) queue.unshift(topic)
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
console.log(
  `account: ${configDir.replace(homedir(), '~')} · ${workers} workers · topics: ${positionals.length ? positionals.join(', ') : 'auto'}`,
)
await Promise.all(Array.from({ length: workers }, (_, i) => sleep(i * 30_000).then(() => worker(i + 1))))
const counts = await categoryCounts().catch(() => null)
if (counts) console.log(`pool: ${[...counts.values()].reduce((a, b) => a + b, 0)} active`)
