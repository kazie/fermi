// Headless `claude` sessions for the question scripts (`pnpm grow`, `pnpm review`). They always bill the account in
// FERMI_CLAUDE_CONFIG_DIR (from .env), never whatever the shell defaults to. Output is returned for parsing only and
// never printed: it could hold question texts.

import { type ChildProcess, spawn } from 'node:child_process'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { setTimeout as sleep } from 'node:timers/promises'
import { onExit } from './exit.ts'
import { parseAgentOutput } from './grow-report.ts'

export const ROOT = new URL('../', import.meta.url).pathname
const envFile = new URL('../.env', import.meta.url)
if (existsSync(envFile)) process.loadEnvFile(envFile)

/** The Claude config dir runs bill, or exit with a hint. There's no default, so nothing bills an account by accident. */
export function claudeConfigDir(): string {
  const dir = process.env.FERMI_CLAUDE_CONFIG_DIR?.replace(/^~(?=\/|$)/, homedir())
  if (!dir) {
    console.error(
      '✗ FERMI_CLAUDE_CONFIG_DIR is not set. Put the Claude config dir of the account these runs should bill in .env,\n' +
        '  e.g. FERMI_CLAUDE_CONFIG_DIR=~/.claude-personal. There is no default, so a run can never bill an account by accident.',
    )
    process.exit(1)
  }
  if (!existsSync(dir)) {
    console.error(`✗ FERMI_CLAUDE_CONFIG_DIR points to ${dir}, which doesn't exist.`)
    process.exit(1)
  }
  return dir
}

/**
 * Shielded children run in their own process group, so a Ctrl+C in the terminal doesn't reach them and the script
 * decides what happens to them (`pnpm grow` lets them finish). Only a script that calls shieldChildren() gets this;
 * anything else is stopped by Ctrl+C as usual. Since the terminal can't reach them, this process passes on what it
 * would have: they're killed whenever it exits (a crash too), and paused and resumed with it (Ctrl+Z, `fg`).
 */
let shielded = false
const children = new Set<ChildProcess>()
function signalChildren(signal: NodeJS.Signals) {
  for (const child of children) {
    try {
      process.kill(-child.pid!, signal)
    } catch {
      // already gone
    }
  }
}
export function shieldChildren() {
  shielded = true
  onExit(() => signalChildren('SIGKILL'))
  process.on('SIGTSTP', () => {
    signalChildren('SIGSTOP')
    process.kill(process.pid, 'SIGSTOP')
  })
  process.on('SIGCONT', () => signalChildren('SIGCONT'))
}
/** Stops shielded children with their process groups: SIGTERM, then SIGKILL for any still running after `graceMs`. */
export async function stopChildren(graceMs = 5000) {
  const closed = Promise.all([...children].map((child) => once(child, 'close'))).catch(() => {})
  signalChildren('SIGTERM')
  await Promise.race([closed, sleep(graceMs)])
  signalChildren('SIGKILL')
}

/** Runs `cmd` in the repo (shielded and tracked if shieldChildren() was called) and collects its stdout. */
function collect(cmd: string, args: string[], env: NodeJS.ProcessEnv): Promise<{ out: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], env, detached: shielded })
    if (shielded && child.pid !== undefined) {
      children.add(child)
      child.on('close', () => children.delete(child))
    }
    let out = ''
    child.stdout.setEncoding('utf8').on('data', (d: string) => (out += d))
    child.on('error', reject)
    child.on('close', (code) => resolve({ out, code }))
  })
}

/** Runs `claude <args>` in the repo and resolves with its stdout (empty if it couldn't start). */
export function runClaude(args: string[], configDir: string, env: Record<string, string> = {}): Promise<string> {
  return collect('claude', args, { ...process.env, ...env, CLAUDE_CONFIG_DIR: configDir }).then(
    (r) => r.out,
    () => '',
  )
}

/** One tool-less model call with its own system prompt: its reply, cost and any usage limit (never printed). */
export async function askModel(model: 'haiku' | 'sonnet', system: string, prompt: string, configDir: string) {
  const args = ['-p', '--model', model, '--tools', '', '--system-prompt', system, '--no-session-persistence', '--output-format', 'json']
  return parseAgentOutput(await runClaude([...args, prompt], configDir))
}

/** `pnpm q <args>`; resolves with stdout, rejects if it exits non-zero. */
export async function runCli(args: string[], env: Record<string, string> = {}): Promise<string> {
  const r = await collect('node', ['scripts/questions-cli.ts', ...args], { ...process.env, ...env }).catch(() => null)
  if (r?.code !== 0) throw new Error(`pnpm q ${args[0]} failed`)
  return r.out
}
