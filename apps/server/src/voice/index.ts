// FerMEANie's voice (see content/VOICE.md). Every line is split into sentences; each sentence is one clip, rendered
// once by the worker and kept in a folder (FERMI_VOICE_DIR) under a key from the voice settings and its text, so a
// clip rendered anywhere is valid everywhere. Clips are rendered in order of need:
//   live:  lines being said now, earliest first; dropped unrendered once too late, so a backlog clears itself
//   ahead: lines picked early (the next question's line, the final lines), and questions added while running
//   lobby: her lobby chatter, below anything a game needs; dropped unrendered once too late, like live
//   sweep: the questions, every sentence that needs no variables, then players' names

import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { sentences, speechText } from '@fermi/shared'
import { clipKey } from './speech.ts'
import { voiceFingerprint, WorkerRenderer, type Renderer } from './worker.ts'

export type Tier = 'live' | 'ahead' | 'lobby' | 'sweep'
/** The tiers, most urgent first. */
const TIERS: readonly Tier[] = ['live', 'ahead', 'lobby', 'sweep']
const RANK = Object.fromEntries(TIERS.map((t, i) => [t, i])) as Record<Tier, number>
/** Tiers whose clips are only worth rendering while they can still be heard. */
const EXPIRES: ReadonlySet<Tier> = new Set(['live', 'lobby'])
/** How urgent a request is: its tier (live by default), and when it's needed (now by default). */
export interface When {
  tier?: Tier
  at?: number
}

const EXPIRE_MS = 10_000
/** After a few failures in a row, rendering pauses briefly; after many, the voice is taken as broken for a while. */
const FAILURES_BEFORE_PAUSE = 3
const PAUSE_MS = 5_000
const FAILURES_BEFORE_BROKEN = 10
const BROKEN_MS = 5 * 60_000
/** At most this many clips waiting in the sweep tier: names from many rooms can't make it grow forever. */
const MAX_SWEEP_QUEUE = 20_000

interface Job {
  key: string
  text: string
  tier: Tier
  /** When it's needed (server ms); sweep jobs run in the order they came. */
  at: number
  seq: number
  /** A tier that doesn't expire (ahead, sweep) it was also asked for: where it goes back to, rather than being dropped. */
  keep?: Tier
}

/** The more urgent of two tiers. */
const higher = (a: Tier | undefined, b: Tier) => (a && RANK[a] < RANK[b] ? a : b)

/** The job in a tier that goes first: the earliest deadline, then the earliest request. */
function earliest(tier: Map<string, Job>): Job | undefined {
  let best: Job | undefined
  for (const job of tier.values()) if (!best || (job.at - best.at || job.seq - best.seq) < 0) best = job
  return best
}

export interface VoiceStatus {
  enabled: true
  rendered: number
  queued: Record<Tier, number>
  rendering: boolean
  /** Since the server started. */
  renderedNow: number
  expired: number
  failed: number
  avgRenderMs: number | null
  /** Why rendering stopped (the worker keeps failing: no uv, no ffmpeg, no model…); it tries again later. */
  broken: string | null
}

export interface VoiceOptions {
  dir: string
  renderer: Renderer
  /** What shapes her sound (voiceFingerprint: voice.json and the engine's locked versions); part of every clip's key. */
  settings?: string
  now?: () => number
  /** The pauses after a few failures in a row, and after many (tests shorten them). */
  pauseMs?: number
  brokenMs?: number
  /** Render ahead speculatively (the sweep tier: every sentence she knows, players' names). Off for tests. */
  sweep?: boolean
}

export class Voice {
  readonly dir: string
  private settings: string
  private renderer: Renderer
  private now: () => number
  private pauseMs: number
  private brokenMs: number
  private sweepOn: boolean
  /** Keys with a clip on disk. */
  private done = new Set<string>()
  /** Clips to render, by tier. The sweep tier is in request order already (a Map keeps insertion order). */
  private tiers = Object.fromEntries(TIERS.map((t) => [t, new Map<string, Job>()])) as Record<Tier, Map<string, Job>>
  private seq = 0
  private running = false
  private closed = false
  private failuresInARow = 0
  /** After failures, rendering rests until then (and why, once it's taken as broken); a timer wakes it up. */
  private rest: { until: number; broken: string | null; timer: ReturnType<typeof setTimeout> } | null = null
  private idleWaiters: (() => void)[] = []
  private listeners = new Set<(key: string) => void>()
  private textParts = new Map<string, { sentences: string[]; keys: string[] }>()
  private stats = { rendered: 0, expired: 0, failed: 0, renderMs: 0 }

  constructor({
    dir,
    renderer,
    settings = voiceFingerprint(),
    now = Date.now,
    pauseMs = PAUSE_MS,
    brokenMs = BROKEN_MS,
    sweep = true,
  }: VoiceOptions) {
    this.dir = dir
    this.renderer = renderer
    this.settings = JSON.stringify(JSON.parse(settings)) // whitespace in the file doesn't change the voice
    this.now = now
    this.pauseMs = pauseMs
    this.brokenMs = brokenMs
    this.sweepOn = sweep
    mkdirSync(dir, { recursive: true })
    const files = new Set(readdirSync(dir))
    for (const f of files) if (f.endsWith('.webm') && files.has(`${f.slice(0, -5)}.mp3`)) this.done.add(f.slice(0, -5))
  }

  /** A line's sentences (as speech) and their clip keys. */
  private parts(text: string) {
    let parts = this.textParts.get(text)
    if (!parts) {
      const list = sentences(speechText(text))
      parts = { sentences: list, keys: list.map((s) => clipKey(this.settings, s)) }
      if (this.textParts.size >= 5000) this.textParts.delete(this.textParts.keys().next().value!) // the oldest
      this.textParts.set(text, parts)
    }
    return parts
  }

  /** The clip keys for a line, sentence by sentence (nothing is rendered). */
  keys(text: string): string[] {
    return this.parts(text).keys
  }

  /** Makes sure a line will be rendered; returns its clip keys. Asking again never lowers a clip's priority. */
  request(text: string, when: When = {}): string[] {
    const { sentences, keys } = this.parts(text)
    this.queue(
      sentences.map((s, i) => ({ text: s, key: keys[i] })),
      when,
    )
    return keys
  }

  /** Queues sentences that are already speech text (the sweep's, players' names): by default, at the lowest priority. */
  requestSentences(list: string[], { tier = 'sweep', at }: When = {}) {
    this.queue(
      list.map((s) => ({ text: s, key: clipKey(this.settings, s) })),
      { tier, at },
    )
  }

  private queue(list: { text: string; key: string }[], { tier = 'live', at = this.now() }: When) {
    if (this.closed || (tier === 'sweep' && !this.sweepOn)) return
    // a live request already too late to be heard asks for nothing (and mustn't take over a clip waiting in a lower tier)
    if (this.tooLate(tier, at)) return
    for (const { text, key } of list) {
      if (this.done.has(key)) continue
      const job = this.find(key)
      if (job) {
        // a need that lasts (ahead, the sweep's) outlives a passing one: an expired lobby or live need falls back to it
        for (const t of [tier, job.tier]) if (!EXPIRES.has(t)) job.keep = higher(job.keep, t)
        // a higher tier, or a fresh need for a clip whose last one passed: that's the deadline now
        if (RANK[tier] < RANK[job.tier] || this.tooLate(job.tier, job.at)) this.move(job, tier, at)
        else if (tier === job.tier) job.at = Math.min(job.at, at)
        continue
      }
      if (tier === 'sweep' && this.tiers.sweep.size >= MAX_SWEEP_QUEUE) continue
      if (this.onDisk(key)) continue
      this.tiers[tier].set(key, { key, text, tier, at, seq: this.seq++ })
    }
    void this.pump()
  }

  private find(key: string) {
    for (const t of TIERS) {
      const job = this.tiers[t].get(key)
      if (job) return job
    }
  }

  private move(job: Job, tier: Tier, at: number) {
    this.tiers[job.tier].delete(job.key)
    Object.assign(job, { tier, at })
    this.tiers[tier].set(job.key, job)
  }

  private get queued() {
    return TIERS.reduce((n, t) => n + this.tiers[t].size, 0)
  }

  /** Whether a clip is rendered (as far as this server knows: see onDisk). */
  has(key: string) {
    return this.done.has(key)
  }

  /** Checks the folder for a clip this server didn't render (copied in while it runs): asked once per clip queued. */
  private onDisk(key: string) {
    if (!existsSync(join(this.dir, `${key}.webm`)) || !existsSync(join(this.dir, `${key}.mp3`))) return false
    this.done.add(key)
    return true
  }

  /** A clip that turned out to be missing (deleted from the folder): it can be rendered again. */
  forget(key: string) {
    this.done.delete(key)
  }

  /** A live clip still unrendered this long after it was due is dropped: by then nobody is waiting for it. */
  private tooLate(tier: Tier, at: number) {
    return EXPIRES.has(tier) && this.now() - at > EXPIRE_MS
  }

  /**
   * The most urgent job: a live one (earliest first, dropping those too late to matter), else one picked ahead, else
   * the sweep's next. Live and ahead hold a game's worth of clips at most; the sweep, which can hold thousands, is
   * never scanned.
   */
  private next(): Job | undefined {
    for (const tier of EXPIRES)
      for (const job of this.tiers[tier].values()) {
        if (!this.tooLate(tier, job.at)) continue
        if (job.keep) {
          this.move(job, job.keep, job.at)
          job.keep = undefined
          continue
        }
        this.tiers[tier].delete(job.key)
        this.stats.expired++
      }
    for (const t of TIERS) {
      // the sweep runs in the order it was asked for (and is never scanned); the others by deadline
      const job = t === 'sweep' ? this.tiers.sweep.values().next().value : earliest(this.tiers[t])
      if (job) return job
    }
  }

  /** After failures in a row: rest a moment, or (clearly broken: no uv, no ffmpeg, no model…) a while, then go on. */
  private restAfter(error: string) {
    const broken = this.failuresInARow >= FAILURES_BEFORE_BROKEN
    if (this.failuresInARow < FAILURES_BEFORE_PAUSE) return
    if (broken) {
      console.error(`[voice] rendering failed ${this.failuresInARow} times in a row; resting:`, error)
      this.failuresInARow = 0
    }
    const ms = broken ? this.brokenMs : this.pauseMs
    const timer = setTimeout(() => {
      this.rest = null
      void this.pump()
    }, ms)
    timer.unref?.()
    this.rest = { until: this.now() + ms, broken: broken ? error : null, timer }
  }

  private async pump() {
    if (this.running || this.rest) return
    this.running = true
    try {
      for (let job = this.next(); job && !this.closed && !this.rest; job = this.next()) {
        this.tiers[job.tier].delete(job.key)
        if (this.done.has(job.key)) continue
        const t0 = this.now()
        try {
          await this.renderer.render(job.text, join(this.dir, job.key))
          this.done.add(job.key)
          for (const listener of this.listeners) listener(job.key)
          this.stats.rendered++
          this.stats.renderMs += this.now() - t0
          this.failuresInARow = 0
        } catch (e) {
          this.stats.failed++
          this.failuresInARow++
          this.restAfter((e as Error).message)
        }
      }
    } finally {
      this.running = false
      if (!this.queued) for (const resolve of this.idleWaiters.splice(0)) resolve()
    }
  }

  /** Resolves once nothing is left to render. */
  idle(): Promise<void> {
    if (!this.queued && !this.running) return Promise.resolve()
    return new Promise((resolve) => this.idleWaiters.push(resolve))
  }

  status(): VoiceStatus {
    const queued = Object.fromEntries(TIERS.map((t) => [t, this.tiers[t].size])) as Record<Tier, number>
    const { rendered, expired, failed, renderMs } = this.stats
    return {
      enabled: true,
      rendered: this.done.size,
      queued,
      rendering: this.running,
      renderedNow: rendered,
      expired,
      failed,
      avgRenderMs: rendered ? Math.round(renderMs / rendered) : null,
      broken: this.rest?.broken ?? null,
    }
  }

  /** Calls `listener` with each clip as it's rendered; returns a function that stops it. */
  onRendered(listener: (key: string) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  close() {
    this.closed = true
    clearTimeout(this.rest?.timer)
    for (const tier of Object.values(this.tiers)) tier.clear()
    this.renderer.close()
    for (const resolve of this.idleWaiters.splice(0)) resolve()
  }
}

/**
 * The voice as the environment sets it up, for the server and `pnpm voice:render` alike: clips in FERMI_VOICE_DIR
 * (default: voice/ next to the database), the model in FERMI_VOICE_MODELS, and FERMI_VOICE_SWEEP=0 to render only
 * what is actually said (no sweep at startup, no names ahead).
 */
export function voiceFromEnv(dbPath: string, dir = process.env.FERMI_VOICE_DIR ?? join(dirname(dbPath), 'voice')) {
  return new Voice({
    dir,
    renderer: new WorkerRenderer({ modelsDir: process.env.FERMI_VOICE_MODELS || undefined }),
    sweep: process.env.FERMI_VOICE_SWEEP !== '0',
  })
}
