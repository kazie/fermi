// The game's sound effects, synthesised with Web Audio: no files, so the game stays fully self-hosted. The style is a
// test chamber: clinical bleeps, sonar pings, alarms and the occasional ominous drone. Each cue is a few oscillators
// or a burst of filtered noise with a short envelope.

import type { Cue } from './sound'

/** Every cue, for the soundboard story: a record, so a new cue can't be left out. */
const ALL: Record<Cue, true> = {
  join: true,
  intro: true,
  rollCall: true,
  yourTurn: true,
  question: true,
  lock: true,
  youLocked: true,
  tenLeft: true,
  tick: true,
  timesUp: true,
  truth: true,
  flip: true,
  yourCard: true,
  bullseye: true,
  dunce: true,
  steal: true,
  defeated: true,
  fermeanieWins: true,
  humansWin: true,
}
export const CUES = Object.keys(ALL) as Cue[]

interface Tone {
  type?: OscillatorType
  freq: number
  /** Slide to this frequency over the tone. */
  to?: number
  /** Start, after the cue begins (s). */
  at?: number
  dur: number
  gain?: number
}

function tone(c: BaseAudioContext, out: AudioNode, t0: number, { type = 'sine', freq, to, at = 0, dur, gain = 0.3 }: Tone) {
  const o = c.createOscillator()
  const g = c.createGain()
  const start = t0 + at
  o.type = type
  o.frequency.setValueAtTime(freq, start)
  if (to) o.frequency.exponentialRampToValueAtTime(to, start + dur)
  // a quick attack and an exponential release, so nothing clicks
  g.gain.setValueAtTime(0.0001, start)
  g.gain.exponentialRampToValueAtTime(gain, start + Math.min(0.01, dur / 4))
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  o.connect(g).connect(out)
  o.start(start)
  o.stop(start + dur + 0.02)
}

/** A burst of filtered noise: a whoosh (bandpass sweeping up) or a thud (lowpass). */
interface Noise {
  at?: number
  dur: number
  gain?: number
  /** The filter's frequency sweep. */
  from?: number
  to?: number
  kind?: BiquadFilterType
}

function noise(
  c: BaseAudioContext,
  out: AudioNode,
  t0: number,
  { at = 0, dur, gain = 0.2, from = 800, to = 3000, kind = 'bandpass' }: Noise,
) {
  const start = t0 + at
  const src = c.createBufferSource()
  src.buffer = noiseBuffer(c)
  const f = c.createBiquadFilter()
  f.type = kind
  f.frequency.setValueAtTime(from, start)
  f.frequency.exponentialRampToValueAtTime(to, start + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(gain, start)
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  src.connect(f).connect(g).connect(out)
  src.start(start, 0, dur)
}

/** One second of white noise per audio context, made once: a reveal flips a card every few seconds. */
const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>()
function noiseBuffer(c: BaseAudioContext) {
  let buf = noiseBuffers.get(c)
  if (!buf) {
    buf = c.createBuffer(1, c.sampleRate, c.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    noiseBuffers.set(c, buf)
  }
  return buf
}

const notes = (c: BaseAudioContext, out: AudioNode, t0: number, freqs: number[], step: number, t: Omit<Tone, 'freq'>) =>
  freqs.forEach((freq, i) => tone(c, out, t0, { ...t, freq, at: (t.at ?? 0) + i * step }))

/** Plays a cue into `out` now. `n`: for `tick`, the seconds left (the tick rises as the deadline nears). */
export function playCue(c: BaseAudioContext, out: AudioNode, cue: Cue, n = 0) {
  const t = c.currentTime + 0.01
  switch (cue) {
    case 'join':
      return notes(c, out, t, [880, 1320], 0.07, { dur: 0.12, gain: 0.15 })
    case 'intro':
      tone(c, out, t, { freq: 180, to: 900, dur: 0.7, gain: 0.18, type: 'triangle' })
      return notes(c, out, t, [1320, 1760], 0.12, { at: 0.65, dur: 0.25, gain: 0.15 })
    case 'rollCall':
      return tone(c, out, t, { type: 'square', freq: 660, dur: 0.06, gain: 0.06 })
    case 'yourTurn':
      return notes(c, out, t, [990, 1320], 0.08, { dur: 0.15, gain: 0.2 })
    case 'question':
      return notes(c, out, t, [523, 659, 784], 0.09, { type: 'triangle', dur: 0.22, gain: 0.18 })
    case 'lock':
      return tone(c, out, t, { freq: 1200, dur: 0.04, gain: 0.1 })
    case 'youLocked':
      return notes(c, out, t, [700, 1050], 0.06, { dur: 0.12, gain: 0.2 })
    case 'tenLeft':
      return
    case 'tick':
      return tone(c, out, t, { freq: 800 + (6 - n) * 90, dur: 0.07, gain: 0.14 })
    case 'timesUp':
      for (let i = 0; i < 3; i++) {
        tone(c, out, t, { type: 'square', freq: 440, at: i * 0.2, dur: 0.1, gain: 0.13 })
        tone(c, out, t, { type: 'square', freq: 330, at: i * 0.2 + 0.1, dur: 0.1, gain: 0.13 })
      }
      return
    case 'truth':
      tone(c, out, t, { freq: 120, to: 50, dur: 0.45, gain: 0.35 })
      noise(c, out, t, { dur: 0.25, gain: 0.12, from: 400, to: 120, kind: 'lowpass' })
      return tone(c, out, t, { freq: 1760, at: 0.08, dur: 0.6, gain: 0.08 })
    case 'flip':
      return noise(c, out, t, { dur: 0.14, gain: 0.2 })
    case 'yourCard':
      return tone(c, out, t, { freq: 1320, at: 0.05, dur: 0.3, gain: 0.15 })
    case 'bullseye':
      return notes(c, out, t, [1046, 1318, 1568, 2093], 0.06, { type: 'triangle', dur: 0.25, gain: 0.15 })
    case 'dunce':
      // a small comic "boop-boop": an easter egg, never a fanfare
      return notes(c, out, t, [620, 410], 0.13, { type: 'triangle', dur: 0.12, gain: 0.12 })
    case 'steal':
      tone(c, out, t, { type: 'sawtooth', freq: 220, to: 70, dur: 1.1, gain: 0.12 })
      tone(c, out, t, { type: 'sine', freq: 55, dur: 1.4, gain: 0.25 })
      return
    case 'defeated':
      return tone(c, out, t, { freq: 520, to: 180, dur: 0.8, gain: 0.15 })
    case 'fermeanieWins':
      for (const freq of [110, 131, 165]) tone(c, out, t, { type: 'sawtooth', freq, dur: 1.6, gain: 0.06 })
      return tone(c, out, t, { freq: 55, dur: 1.8, gain: 0.2 })
    case 'humansWin':
      return notes(c, out, t, [523, 659, 784, 1046], 0.1, { type: 'triangle', dur: 0.4, gain: 0.16 })
  }
}
