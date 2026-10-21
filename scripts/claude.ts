// Headless `claude` sessions for the question scripts (`pnpm grow`, `pnpm review`). They always bill the account in
// FERMI_CLAUDE_CONFIG_DIR (from .env), never whatever the shell defaults to. Output is returned for parsing only and
// never printed: it could hold question texts.

import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
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

/** Runs `claude <args>` in the repo and resolves with its stdout (empty if it couldn't start). */
export function runClaude(args: string[], configDir: string, env: Record<string, string> = {}): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn('claude', args, {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, ...env, CLAUDE_CONFIG_DIR: configDir },
    })
    let out = ''
    child.stdout.on('data', (d) => (out += d))
    child.on('error', () => resolve(''))
    child.on('close', () => resolve(out))
  })
}

/** One tool-less model call with its own system prompt: its reply, cost and any usage limit (never printed). */
export async function askModel(model: 'haiku' | 'sonnet', system: string, prompt: string, configDir: string) {
  const args = ['-p', '--model', model, '--tools', '', '--system-prompt', system, '--no-session-persistence', '--output-format', 'json']
  return parseAgentOutput(await runClaude([...args, prompt], configDir))
}

/** `pnpm q <args>`; resolves with stdout, rejects if it exits non-zero. */
export function runCli(args: string[], env: Record<string, string> = {}): Promise<string> {
  return new Promise((resolve, reject) =>
    execFile(
      'node',
      ['scripts/questions-cli.ts', ...args],
      { cwd: ROOT, env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024 },
      (err, stdout) => (err ? reject(new Error(`pnpm q ${args[0]} failed`)) : resolve(stdout)),
    ),
  )
}
