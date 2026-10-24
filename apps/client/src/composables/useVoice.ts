// FerMEANie's voice on this device: off until the player turns it on (browsers only play sound after a tap, and a
// room full of phones talking at once is a lot). When the server has a voice, each snapshot lists the clips for what
// she says (`room.voice`: text → one clip per sentence) and which are rendered; the server pushes the rest as they're
// rendered. A clip is fetched the moment it's ready, never before (no requests for clips that aren't there), and each
// line plays as she starts typing it, one line at a time. A clip that isn't there in time is skipped, never played
// late.

import { computed, inject, onUnmounted, provide, ref, watch, type InjectionKey, type Ref } from 'vue'
import type { RoomView } from '@fermi/shared'
import { SPEECH_GAP_MS } from '@fermi/shared'
import { savedSound, saveSound } from '@/lib/storage'

export interface VoicePlayer {
  /** The server has a voice: her lines (in bubbles on the server clock) are paced to it, sound on or off. */
  readonly voiced: boolean
  /** A line's clips, if the server has a voice. */
  keys(text: string): string[] | undefined
  /**
   * Plays a line after whatever is playing. `id`: which utterance this is (its start time and place), so a bubble
   * that remounts doesn't say it again. `late`: how long ago it should have started; a line more than a moment late (a
   * remount, a reconnect) is skipped. An `aside` is skipped when she's already talking. `patience`: how long its first
   * clip may take to arrive (a question on screen can be read out a little late; her chat can't).
   */
  say(keys: string[], opts: { id: string; late?: number; aside?: boolean; patience?: number }): void
}

export const VOICE: InjectionKey<VoicePlayer> = Symbol('voice')
/** The voice in this page (Room or Screen set it up); null in stories, tests and other pages, which stay silent. */
export const useVoicePlayer = () => inject(VOICE, null)

/** How late a line may start. */
const MAX_LATE_MS = 1500
/** How long the first clip of a line may take to arrive once it's her turn; later sentences get a little less. */
const FIRST_CLIP_WAIT_MS = 1500
const NEXT_CLIP_WAIT_MS = 1000
/** A question stays on screen, so reading it out a little late is fine (a clip just rendered for this round). */
const QUESTION_PATIENCE_MS = 4000
/** A line still waiting behind others after this long is dropped (the bubble has moved on). */
const MAX_QUEUE_MS = 12_000
/** A clip that hasn't reported its end this long after it should have is taken as over. */
const CLIP_SLACK_MS = 1000
/** Clips are kept encoded (a few KB each) and decoded when played. */
const CACHE_MAX = 300

interface Line {
  keys: string[]
  queuedAt: number
  patience: number
  /** Lines from before the tab was hidden (or sound turned off) are dropped. */
  epoch: number
}

/** Her voice for a page, from its socket: the room's clips, and those announced ready since its last snapshot. */
export function useVoice(socket: { room: Ref<RoomView | null>; voiceReady: Ref<string[]> }) {
  const voiceView = () => socket.room.value?.voice
  /** The player's choice, remembered on this device. */
  const wanted = ref(savedSound())
  /** The browser lets us play (a tap has resumed the audio context). */
  const running = ref(false)

  let ctx: AudioContext | null = null
  /** Opus until this browser fails to decode it; checked on the first clip. */
  let format: 'webm' | 'mp3' = 'webm'
  let formatChecked = false
  const cache = new Map<string, Promise<ArrayBuffer | null>>()
  /** Clips the server has said are rendered, and lines waiting for a clip that isn't yet. */
  const ready = new Set<string>()
  const waiting = new Map<string, (data: ArrayBuffer | null) => void>()
  /** Utterances already said (a remounted bubble asks again). */
  const said = new Set<string>()
  const queue: Line[] = []
  let playing = false
  let epoch = 0
  let source: AudioBufferSourceNode | null = null
  const on = computed(() => wanted.value && running.value)

  function context(): AudioContext | null {
    if (ctx) return ctx
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
    ctx.onstatechange = () => (running.value = ctx?.state === 'running')
    // iOS: play through the silent switch, like a video would
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
    if (session) session.type = 'playback'
    return ctx
  }

  /** Inside a tap: browsers only start audio from a user gesture. */
  function unlock() {
    const c = context()
    if (!c) return
    void c.resume().then(() => (running.value = c.state === 'running'))
    // iOS also wants something played from within the gesture
    const blip = c.createBufferSource()
    blip.buffer = c.createBuffer(1, 1, 22050)
    blip.connect(c.destination)
    blip.start()
  }

  /**
   * The sound button does what the player saw when they pressed it: shown off (off, or on but still locked after a
   * reload) turns it on, shown on turns it off. The same tap may unlock the sound first (below); that doesn't count.
   */
  let shownOn: boolean | null = null
  const onPress = () => (shownOn = on.value)
  function toggle() {
    const wasOn = shownOn ?? on.value
    shownOn = null
    wanted.value = !wasOn
    saveSound(wanted.value)
    if (wasOn) return stop()
    unlock()
    prefetch()
  }

  // After a reload the choice is remembered, but the browser still needs a tap: the first one anywhere will do. Only
  // the end of a touch (or a click or key) counts as one; a touch starting doesn't.
  const PRESS_EVENTS = ['pointerdown', 'keydown'] as const
  const UNLOCK_EVENTS = ['pointerup', 'touchend', 'click', 'keydown'] as const
  const onFirstTap = () => {
    if (wanted.value && !running.value) unlock()
  }
  for (const e of PRESS_EVENTS) document.addEventListener(e, onPress, { capture: true })
  for (const e of UNLOCK_EVENTS) document.addEventListener(e, onFirstTap, { capture: true })

  /** Can this browser decode the clips we fetch? Only asked until the answer is known. */
  async function decodes(data: ArrayBuffer) {
    try {
      await context()!.decodeAudioData(data.slice(0))
      return true
    } catch {
      return false
    }
  }

  /** A rendered clip, in a format this browser decodes (Opus, or MP3 once Opus turns out not to work). */
  async function fetchClip(key: string): Promise<ArrayBuffer | null> {
    for (;;) {
      const fmt = format
      const res = await fetch(`/voice/${key}.${fmt}`).catch(() => null)
      if (!res?.ok) return null
      const data = await res.arrayBuffer()
      if (formatChecked || (await decodes(data))) {
        formatChecked = true
        return data
      }
      if (fmt === 'mp3') return null
      format = 'mp3' // this browser can't decode Opus: MP3 from now on
    }
  }

  /** A clip: fetched now if it's rendered, else as soon as the server says it is. */
  function load(key: string): Promise<ArrayBuffer | null> {
    let p = cache.get(key)
    if (!p) {
      p = ready.has(key) ? fetchClip(key) : new Promise((resolve) => waiting.set(key, resolve))
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!)
      cache.set(key, p)
      void p.then((b) => b || cache.delete(key)) // a failed fetch may work next time it's needed
    }
    return p
  }

  /** New clips are ready: fetch those a line is waiting for, and everything else this view may say. */
  function onReady() {
    const view = voiceView()
    const pending = new Set(view?.pending)
    const listed = Object.values(view?.lines ?? {})
      .flat()
      .filter((k) => !pending.has(k))
    for (const k of [...listed, ...socket.voiceReady.value]) {
      if (ready.has(k)) continue
      ready.add(k)
      const resolve = waiting.get(k)
      waiting.delete(k)
      if (resolve) void fetchClip(k).then(resolve)
    }
    prefetch()
  }

  /** Fetches the rendered clips this view may say. */
  function prefetch() {
    if (!wanted.value || !context()) return
    for (const keys of Object.values(voiceView()?.lines ?? {})) for (const k of keys) if (ready.has(k)) void load(k)
  }
  watch([voiceView, socket.voiceReady], onReady, { immediate: true })

  const within = <T>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))])

  /**
   * Plays a clip until it ends, or until it should have (its length plus a moment): an interrupted audio context (a
   * call, the lock screen on iOS) may hold back the end event, and that must not leave the voice stuck forever.
   */
  function playBuffer(c: AudioContext, b: AudioBuffer): Promise<void> {
    return new Promise((resolve) => {
      const s = c.createBufferSource()
      const done = () => {
        clearTimeout(limit)
        if (source === s) source = null
        resolve()
      }
      const limit = setTimeout(done, b.duration * 1000 + CLIP_SLACK_MS)
      s.buffer = b
      s.connect(c.destination)
      s.onended = done
      source = s
      s.start()
    })
  }

  async function pump() {
    if (playing) return
    playing = true
    try {
      for (let line = queue.shift(); line; line = queue.shift()) {
        if (performance.now() - line.queuedAt > MAX_QUEUE_MS) continue
        for (const [i, key] of line.keys.entries()) {
          const data = await within(load(key), i === 0 ? line.patience : NEXT_CLIP_WAIT_MS)
          const c = context()
          // the rest of a line would make no sense alone; a line from before the tab was hidden is over
          if (!data || !c || line.epoch !== epoch || !running.value) break
          const b = await c.decodeAudioData(data.slice(0)).catch(() => null)
          if (!b || line.epoch !== epoch) break
          if (i > 0) await new Promise((r) => setTimeout(r, SPEECH_GAP_MS))
          await playBuffer(c, b)
        }
      }
    } finally {
      playing = false
    }
  }

  const player: VoicePlayer = {
    get voiced() {
      return voiceView() !== undefined
    },
    keys: (text) => voiceView()?.lines[text],
    say(keys, { id, late = 0, aside = false, patience = FIRST_CLIP_WAIT_MS }) {
      if (!wanted.value || !running.value || document.hidden || !keys.length || late > MAX_LATE_MS || said.has(id)) return
      if (aside && (playing || queue.length)) return
      said.add(id)
      if (said.size > 500) said.delete(said.values().next().value!)
      queue.push({ keys, queuedAt: performance.now() - late, patience, epoch })
      void pump()
    },
  }

  function stop() {
    epoch++
    queue.length = 0
    try {
      source?.stop()
    } catch {
      /* already stopped */
    }
  }
  // A hidden tab drops what it hasn't said: coming back to a backlog of old lines would be worse than silence.
  const onHidden = () => {
    if (document.hidden) stop()
  }
  document.addEventListener('visibilitychange', onHidden)

  onUnmounted(() => {
    stop()
    for (const e of PRESS_EVENTS) document.removeEventListener(e, onPress, { capture: true })
    for (const e of UNLOCK_EVENTS) document.removeEventListener(e, onFirstTap, { capture: true })
    document.removeEventListener('visibilitychange', onHidden)
    void ctx?.close()
  })

  provide(VOICE, player)
  return {
    player,
    /** Sound is on and playing (on but locked shows as off until a tap). */
    on,
    /** For the header's speaker: on or off, or undefined (no button) when the server has no voice. */
    sound: computed(() => (voiceView() ? on.value : undefined)),
    toggle,
  }
}

/** FerMEANie reads the question out as it appears (with sound on), before her line. */
export function useReadQuestion(round: () => { index: number; startedAt: number; question: { question: string } }, now: () => number) {
  const voice = useVoicePlayer()
  watch(
    // a new question starts at a new time (the intro's example and the first question share index 0)
    () => round().startedAt,
    () => {
      const keys = voice?.keys(round().question.question)
      const { startedAt } = round()
      if (keys) voice!.say(keys, { id: `question ${startedAt}`, late: now() - startedAt, patience: QUESTION_PATIENCE_MS })
    },
    { immediate: true },
  )
}
