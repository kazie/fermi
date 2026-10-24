// Runs the Python voice worker (apps/server/voice/worker.py) and talks to it over stdin/stdout: one sentence in, one
// pair of clips (<out>.webm, <out>.mp3) out. Started on the first job, restarted after it dies.

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
/** The worker's Python project: pyproject.toml, and uv.lock with the exact versions every build uses. */
const VOICE_PROJECT = `${ROOT}apps/server/voice`
const WORKER_SCRIPT = `${VOICE_PROJECT}/worker.py`
const VOICE_LOCK = `${VOICE_PROJECT}/uv.lock`
const VOICE_CONFIG = `${ROOT}content/voice/voice.json`
const DEFAULT_MODELS_DIR = `${ROOT}.fermi-work/voice-models`

/** The version uv.lock pins for each package (its `[[package]]` blocks: name, then version; the first if several). */
export function lockedVersions(lock: string): Map<string, string> {
  const versions = new Map<string, string>()
  for (const [, name, version] of lock.matchAll(/^\[\[package\]\]\nname = "([^"]+)"\nversion = "([^"]+)"/gm))
    if (!versions.has(name)) versions.set(name, version)
  return versions
}

/**
 * Everything that shapes how she sounds, as one string for clip keys: voice.json (her settings and the model files'
 * checksums) and the locked versions of the packages it lists as `engineDeps`. Change any of it (an edit, a new model,
 * Dependabot's voice-engine PR) and every clip gets a new key, so the sweep renders her again instead of mixing old
 * and new audio. Other packages' versions don't count. A listed package the lock doesn't have (a newer engine dropped
 * it) counts as absent: the key still changes, and nothing breaks before voice.json is tidied up.
 */
export function voiceFingerprint(config = readFileSync(VOICE_CONFIG, 'utf8'), lock = readFileSync(VOICE_LOCK, 'utf8')): string {
  const settings = JSON.parse(config) as { engineDeps?: string[] }
  const locked = lockedVersions(lock)
  const engine = Object.fromEntries((settings.engineDeps ?? []).map((name) => [name, locked.get(name) ?? null]))
  return JSON.stringify({ settings, engine })
}

/** Renders one sentence into `<out>.webm` and `<out>.mp3`. */
export interface Renderer {
  render(text: string, out: string): Promise<void>
  close(): void
}

/** How long a sentence may take, and how long the worker may take to start (uv, and the model on first use). */
const JOB_TIMEOUT_MS = 60_000
const START_TIMEOUT_MS = 10 * 60_000

export class WorkerRenderer implements Renderer {
  private proc: ChildProcessWithoutNullStreams | null = null
  private ready: Promise<void> | null = null
  private notReady: ((e: Error) => void) | null = null
  private pending = new Map<string, { resolve: () => void; reject: (e: Error) => void }>()
  private nextId = 0
  private command: string[]

  private startTimeoutMs: number

  constructor({
    modelsDir = DEFAULT_MODELS_DIR,
    command,
    startTimeoutMs = START_TIMEOUT_MS,
  }: { modelsDir?: string; command?: string[]; startTimeoutMs?: number } = {}) {
    // --frozen: exactly what uv.lock says; a lock out of date with pyproject.toml fails instead of resolving anew
    this.command = command ?? [
      'uv',
      'run',
      '--project',
      VOICE_PROJECT,
      '--frozen',
      'python',
      WORKER_SCRIPT,
      '--config',
      VOICE_CONFIG,
      '--models',
      modelsDir,
    ]
    this.startTimeoutMs = startTimeoutMs
  }

  private start(): Promise<void> {
    const [cmd, ...args] = this.command
    const proc = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] })
    this.proc = proc
    this.ready = new Promise((resolve, reject) => {
      this.notReady = reject
      // Everything below belongs to this process: once it's replaced, its late events must not touch the next one.
      const current = () => this.proc === proc
      const timer = setTimeout(() => fail(new Error('voice worker did not start in time')), this.startTimeoutMs)
      const fail = (e: Error) => {
        clearTimeout(timer)
        if (current()) this.stop(e)
      }
      const started = () => {
        clearTimeout(timer)
        if (!current()) return
        this.notReady = null
        resolve()
      }
      proc.on('error', fail)
      proc.on('exit', (code) => fail(new Error(`voice worker exited (${code})`)))
      // a worker that died between two jobs: the next write fails (EPIPE), which must not crash the server
      proc.stdin.on('error', fail)
      createInterface({ input: proc.stdout }).on('line', (line) => {
        let msg: { ready?: boolean; versions?: Record<string, string | null>; id?: string; ok?: boolean; error?: string }
        try {
          msg = JSON.parse(line)
        } catch {
          return
        }
        if (msg.ready) {
          if (msg.versions) warnIfNotLocked(msg.versions)
          return started()
        }
        const job = msg.id !== undefined ? this.pending.get(msg.id) : undefined
        if (!job) return
        this.pending.delete(msg.id!)
        if (msg.ok) job.resolve()
        else job.reject(new Error(msg.error ?? 'render failed'))
      })
      createInterface({ input: proc.stderr }).on('line', (line) => {
        if (!/^\s*(Installed|Downloading|Downloaded|Resolved|Prepared|Audited)\b/.test(line)) console.error(`[voice] ${line}`)
      })
    })
    this.ready.catch(() => {}) // a failed start rejects the jobs waiting on it
    return this.ready
  }

  /** The worker is gone (or must go): fail everything in flight; the next job starts a new one. */
  private stop(e: Error) {
    if (!this.proc) return
    const proc = this.proc
    this.proc = null
    this.ready = null
    this.notReady?.(e)
    this.notReady = null
    if (proc.exitCode === null) proc.kill()
    for (const job of this.pending.values()) job.reject(e)
    this.pending.clear()
  }

  async render(text: string, out: string) {
    await (this.proc ? this.ready : this.start())
    const proc = this.proc
    if (!proc) throw new Error('voice worker stopped')
    const id = String(this.nextId++)
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.proc === proc) this.stop(new Error('voice worker timed out'))
      }, JOB_TIMEOUT_MS)
      this.pending.set(id, {
        resolve: () => {
          clearTimeout(timer)
          resolve()
        },
        reject: (e) => {
          clearTimeout(timer)
          reject(e)
        },
      })
      proc.stdin.write(JSON.stringify({ id, text, out }) + '\n')
    })
  }

  close() {
    this.stop(new Error('voice worker closed'))
  }
}

/** A local environment out of step with uv.lock (an old .venv) would render clips under the wrong key: say so. */
function warnIfNotLocked(installed: Record<string, string | null>) {
  const locked = lockedVersions(readFileSync(VOICE_LOCK, 'utf8'))
  for (const [name, version] of Object.entries(installed))
    if ((locked.get(name) ?? null) !== version)
      console.error(
        `[voice] ${name} ${version ?? '(none)'} is installed but uv.lock says ${locked.get(name) ?? '(none)'}: run uv sync --project apps/server/voice`,
      )
}
