// The game's sound effects and vibration on this device: what lib/sound.ts says is due, played with lib/synth.ts.
// Room and Screen set it up; views never play sounds themselves.

import { watch, type Ref } from 'vue'
import type { RoomView } from '@fermi/shared'
import { audible, cuesBetween, reactionCues, soundRoute, VIBRATE, type CueEvent } from '@/lib/sound'
import { playCue } from '@/lib/synth'
import type { FloatingReaction } from './useSocket'

/** Effects play under her voice: quieter while she talks. */
const LEVEL = 0.8
const DUCKED = 0.3

export function useGameSfx(
  room: Ref<RoomView | null>,
  now: Ref<number>,
  voice: { audio: () => AudioContext | null; talking: Ref<boolean> },
  onReaction: (f: (r: FloatingReaction) => void) => void,
) {
  let out: GainNode | null = null
  let outCtx: AudioContext | null = null
  /** The effects' volume knob, on the page's audio (created with it, so one tap unlocks both). */
  function output(c: AudioContext) {
    if (!out || outCtx !== c) {
      out = c.createGain()
      out.gain.value = voice.talking.value ? DUCKED : LEVEL
      out.connect(c.destination)
      outCtx = c
    }
    return out
  }
  watch(voice.talking, (t) => {
    if (out && outCtx) out.gain.setTargetAtTime(t ? DUCKED : LEVEL, outCtx.currentTime, 0.08)
  })

  /** Plays what this device plays of `events`; a hidden tab keeps quiet, as her voice does. */
  function play(events: CueEvent[]) {
    const c = voice.audio()
    if (c?.state === 'running' && !document.hidden) for (const e of events) playCue(c, output(c), e)
  }

  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches
  let prev: RoomView | null = null
  /** Where the clock was at the last pass (server ms); unset until the first snapshot has synced the clock. */
  let last: number | null = null
  // One pass per clock tick and per snapshot: what came due since the last pass.
  watch([room, now], ([r, t]) => {
    if (!r) return
    // The first pass only starts the clock: before the first snapshot it ran on this device's own time. A clock that
    // a resync moved back doesn't replay what already played.
    if (last === null || t < last) {
      last ??= t
      prev = r
      return
    }
    const events = cuesBetween(prev, r, last, t)
    prev = r
    last = t
    if (!events.length) return
    play(audible(events, soundRoute(r)))
    // phones buzz for their own moments; ten seconds left only matters to someone still answering
    if (!r.viewer && !reduced()) {
      for (const e of events) {
        if (e.cue === 'tenLeft' && (!r.yourSheet || r.yourSheet.locked)) continue
        const pattern = VIBRATE[e.cue]
        if (pattern) navigator.vibrate?.(pattern)
      }
    }
  })

  // Reactions come as their own messages, not in snapshots: each may be heard (see reactionCues).
  const heard = { last: -Infinity }
  onReaction((x) => {
    const r = room.value
    // spaced on this device's own steady clock: the server clock's estimate jumps on a reconnect
    if (r) play(audible(reactionCues(x, r.you, performance.now(), heard), soundRoute(r)))
  })
}
