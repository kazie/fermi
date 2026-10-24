import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref, shallowRef } from 'vue'
import { mount } from '@vue/test-utils'
import { leadDuration, messageStarts, type RoomView } from '@fermi/shared'
import FermeanieSays from '../src/components/FermeanieSays.vue'
import { useVoice, VOICE, type VoicePlayer } from '../src/composables/useVoice'

describe('FermeanieSays and her voice', () => {
  const msgs = ['First message here. Two sentences.', 'Second one.']
  const fakeVoice = () => {
    const said: { keys: string[]; late: number; aside: boolean }[] = []
    const player: VoicePlayer = {
      voiced: true,
      keys: (text) => ({ [msgs[0]]: ['k1', 'k2'], [msgs[1]]: ['k3'] })[text],
      say: (keys, { late = 0, aside = false }) => void said.push({ keys, late, aside }),
    }
    return { player, said }
  }
  const at = (player: VoicePlayer, now: number, props: Record<string, unknown> = {}) =>
    mount(FermeanieSays, { props: { messages: msgs, startAt: 0, now, ...props }, global: { provide: { [VOICE as symbol]: player } } })

  it('says each message as she starts typing it, once', async () => {
    const { player, said } = fakeVoice()
    const w = at(player, 0)
    const starts = messageStarts(msgs, { paced: true })
    await w.setProps({ now: starts[0] + 50 })
    await w.setProps({ now: starts[0] + 400 })
    // late: 50 ms by the clock, plus up to SMOOTH_MAX_MS of real time the bubble smooths in between ticks
    expect(said).toEqual([{ keys: ['k1', 'k2'], late: expect.any(Number), aside: false }])
    expect(said[0].late).toBeGreaterThanOrEqual(50)
    expect(said[0].late).toBeLessThan(50 + 250)
    await w.setProps({ now: starts[1] + 20 })
    expect(said.map((s) => s.keys)).toEqual([['k1', 'k2'], ['k3']])
  })

  it('stays quiet for a message it mounts in the middle of, and for recaps', async () => {
    const { player, said } = fakeVoice()
    at(player, messageStarts(msgs, { paced: true })[0] + 500)
    mount(FermeanieSays, { props: { messages: msgs, instant: true }, global: { provide: { [VOICE as symbol]: player } } })
    await nextTick()
    expect(said).toEqual([])
  })

  it('marks remarks on the side', async () => {
    const { player, said } = fakeVoice()
    const w = at(player, 0, { messages: undefined, text: msgs[1], aside: true })
    await w.setProps({ now: leadDuration(msgs[1].length) + 10 })
    expect(said).toEqual([{ keys: ['k3'], late: expect.any(Number), aside: true }])
    expect(said[0].late).toBeGreaterThanOrEqual(10)
    expect(said[0].late).toBeLessThan(10 + 250)
  })

  it('never voices (or paces) a bubble on its own clock: the lobby, recaps', async () => {
    const { player, said } = fakeVoice()
    const w = mount(FermeanieSays, { props: { messages: msgs }, global: { provide: { [VOICE as symbol]: player } } })
    await new Promise((r) => setTimeout(r, leadDuration(msgs[0].length) + 100))
    await nextTick()
    expect(w.text()).toContain('First')
    expect(said).toEqual([])
  })

  it('is silent without a voice (stories, other pages)', () => {
    expect(() => mount(FermeanieSays, { props: { messages: msgs, startAt: 0, now: 5000 } })).not.toThrow()
  })
})

/** A browser with Web Audio: clips "play" until `finish()` is called. */
class FakeAudio {
  static last: FakeAudio
  state: AudioContextState = 'suspended'
  onstatechange: (() => void) | null = null
  destination = {}
  played: string[] = []
  ending: (() => void)[] = []
  /** For the next contexts: which clips this "browser" can't decode. */
  static failing = (_: ArrayBuffer) => false
  decodeFails = FakeAudio.failing
  constructor() {
    FakeAudio.last = this
  }
  async resume() {
    this.state = 'running'
    this.onstatechange?.()
  }
  async close() {}
  createBuffer() {
    return {}
  }
  createBufferSource() {
    const src = {
      buffer: null as unknown,
      onended: null as (() => void) | null,
      connect() {},
      start: () => {
        const name = (src.buffer as { name?: string } | null)?.name
        if (!name) return
        this.played.push(name)
        this.ending.push(() => src.onended?.())
      },
      stop() {},
    }
    return src
  }
  async decodeAudioData(data: ArrayBuffer) {
    const name = new TextDecoder().decode(data)
    if (this.decodeFails(data)) throw new Error('cannot decode')
    return { name, duration: 10 } // seconds: long enough that only finish() ends a clip
  }
  finish() {
    for (const end of this.ending.splice(0)) end()
  }
}

describe('useVoice', () => {
  let missing: Set<string>
  /** Every test's voice is unmounted after it, so none is left listening for the next test's taps. */
  const mounted: { unmount(): void }[] = []
  beforeEach(() => {
    localStorage.clear()
    missing = new Set()
    vi.stubGlobal('AudioContext', FakeAudio)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const name = url.split('/').pop()!
        return missing.has(name.split('.')[0]) ? new Response('', { status: 404 }) : new Response(name)
      }),
    )
  })
  afterEach(() => {
    for (const w of mounted.splice(0)) w.unmount()
    vi.unstubAllGlobals()
    vi.useRealTimers()
    FakeAudio.failing = () => false
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
  })

  /** The room's voice view: every clip ready except the `missing` ones (not rendered yet). */
  function setup(clips: Record<string, string[]> | null = { a: ['a1', 'a2'], b: ['b1'] }) {
    const view = clips && {
      lines: clips,
      pending: Object.values(clips)
        .flat()
        .filter((k) => missing.has(k)),
    }
    const room = shallowRef(view && ({ voice: view } as RoomView))
    const pushed = ref<string[]>([])
    let voice!: ReturnType<typeof useVoice>
    const w = mount(
      defineComponent({
        setup() {
          voice = useVoice({ room, voiceReady: pushed })
          return () => h('div')
        },
      }),
    )
    mounted.push(w)
    let n = 0
    /** Says a line as a new utterance (or as `id`, to say the same one again). */
    const say = (keys: string[], opts: { id?: string; late?: number; aside?: boolean } = {}) =>
      voice.player.say(keys, { id: `line ${n++}`, ...opts })
    return { voice, say, pushed, w, room }
  }
  const flush = () => new Promise((r) => setTimeout(r, 0))
  async function settle(times = 10) {
    for (let i = 0; i < times; i++) await flush()
  }

  it('is on, but waits for a tap before it plays; the button is there with or without a voice on the server (effects play either way)', async () => {
    expect(setup(null).voice.sound.value).toBe(true)
    const { voice, say } = setup()
    expect(voice.sound.value).toBe(true)
    expect(voice.on.value).toBe(false)
    say(['a1'])
    voice.enable() // a tap
    await settle()
    expect(voice.on.value).toBe(true)
    expect(FakeAudio.last.played).toEqual([]) // said while off: not queued
    expect(localStorage.getItem('fermi.sound')).toBe('on')
  })

  it('plays a line sentence by sentence, then the next line', async () => {
    const { voice, say } = setup()
    voice.enable()
    await settle()
    say(['a1', 'a2'])
    say(['b1'])
    await settle()
    expect(FakeAudio.last.played).toEqual(['a1.webm'])
    FakeAudio.last.finish()
    await new Promise((r) => setTimeout(r, 200)) // the gap between sentences
    expect(FakeAudio.last.played).toEqual(['a1.webm', 'a2.webm'])
    FakeAudio.last.finish()
    await settle()
    expect(FakeAudio.last.played).toEqual(['a1.webm', 'a2.webm', 'b1.webm'])
  })

  it('at a party (a big screen in the room), only the big screen speaks: a phone stays quiet', async () => {
    const { voice, say, room } = setup()
    room.value = { ...room.value!, screens: 1 }
    voice.enable()
    await settle()
    say(['a1'])
    await settle()
    expect(FakeAudio.last.played).toEqual([])
    room.value = { ...room.value!, viewer: 'screen' }
    say(['b1'])
    await settle()
    expect(FakeAudio.last.played).toEqual(['b1.webm'])
  })

  it('skips a line that is already too late, and remarks while she is talking', async () => {
    const { voice, say } = setup()
    voice.enable()
    await settle()
    say(['a1'], { late: 5000 })
    say(['b1'])
    say(['a2'], { aside: true })
    await settle()
    FakeAudio.last.finish()
    await settle()
    expect(FakeAudio.last.played).toEqual(['b1.webm'])
  })

  it("never asks for a clip that isn't rendered, and fetches it the moment the server says it is", async () => {
    missing.add('a2')
    const { voice, say, pushed } = setup()
    voice.enable()
    await settle()
    say(['a1', 'a2'])
    await settle()
    FakeAudio.last.finish() // a1 done; a2 isn't rendered yet
    await settle()
    const asked = () => (fetch as unknown as { mock: { calls: string[][] } }).mock.calls.map((c) => c[0])
    expect(asked().some((u) => u.includes('a2'))).toBe(false)
    missing.delete('a2')
    pushed.value = ['a2'] // the server's "ready" message
    await new Promise((r) => setTimeout(r, 200)) // the gap between sentences
    expect(FakeAudio.last.played).toEqual(['a1.webm', 'a2.webm'])
    expect(asked().filter((u) => u.includes('a2'))).toEqual(['/voice/a2.webm'])
  })

  it('drops the rest of a line when a sentence never arrives', async () => {
    missing.add('a2')
    const { voice, say } = setup()
    voice.enable()
    await settle()
    say(['a1', 'a2'])
    say(['b1'])
    await settle()
    FakeAudio.last.finish()
    await new Promise((r) => setTimeout(r, 1300)) // the wait for a2 runs out
    await settle()
    expect(FakeAudio.last.played).toEqual(['a1.webm', 'b1.webm'])
  })

  it('is on by default: the first tap starts it, and the nudge goes away', async () => {
    const { voice } = setup()
    expect([voice.silence.value, voice.on.value]).toEqual(['locked', false])
    document.dispatchEvent(new Event('pointerup'))
    await settle()
    expect([voice.silence.value, voice.on.value]).toEqual([null, true])
  })

  it('stays off once turned off, without waiting for a tap', async () => {
    localStorage.setItem('fermi.sound', 'off')
    const { voice } = setup()
    expect(voice.silence.value).toBe('muted')
    document.dispatchEvent(new Event('pointerup'))
    await settle()
    expect(voice.on.value).toBe(false)
  })

  it('never asks for a tap in a browser without Web Audio', () => {
    vi.stubGlobal('AudioContext', undefined)
    expect(setup().voice.silence.value).toBe(null)
  })

  it('on iOS, plays through the silent switch where she speaks, and mixes with music on a party phone', async () => {
    const session = { type: 'auto' }
    Object.defineProperty(navigator, 'audioSession', { value: session, configurable: true })
    const { room } = setup()
    await settle()
    expect(session.type).toBe('playback')
    room.value = { ...room.value!, screens: 1 }
    await settle()
    expect(session.type).toBe('ambient')
    room.value = { ...room.value!, screens: 0 }
    await settle()
    expect(session.type).toBe('playback')
    Reflect.deleteProperty(navigator, 'audioSession')
  })

  it('the speaker shows the setting: on while waiting for a tap, and a press turns it off', async () => {
    const { voice } = setup()
    expect([voice.sound.value, voice.silence.value]).toEqual([true, 'locked'])
    voice.toggle()
    await settle()
    expect([voice.sound.value, voice.silence.value]).toEqual([false, 'muted'])
    expect(localStorage.getItem('fermi.sound')).toBe('off')
    voice.toggle()
    await settle()
    expect([voice.sound.value, voice.on.value]).toEqual([true, true])
  })

  it('says a line once, even when its bubble remounts', async () => {
    const { voice, say } = setup()
    voice.enable()
    await settle()
    say(['b1'], { id: 'the same line' })
    say(['b1'], { id: 'the same line' })
    await settle()
    FakeAudio.last.finish()
    await settle()
    expect(FakeAudio.last.played).toEqual(['b1.webm'])
  })

  it('a hidden tab drops the rest of what she was saying', async () => {
    const { voice, say } = setup()
    voice.enable()
    await settle()
    say(['a1', 'a2'])
    say(['b1'])
    await settle()
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    FakeAudio.last.finish()
    await new Promise((r) => setTimeout(r, 200))
    expect(FakeAudio.last.played).toEqual(['a1.webm'])
  })

  it('switches every clip to MP3 when this browser cannot decode Opus, even ones fetched at the same time', async () => {
    FakeAudio.failing = (data) => new TextDecoder().decode(data).endsWith('.webm')
    const { voice, say } = setup()
    voice.enable() // fetches every clip in the snapshot at once
    await settle(20)
    say(['a1', 'a2'])
    say(['b1'])
    await settle(20)
    FakeAudio.last.finish()
    await new Promise((r) => setTimeout(r, 200))
    FakeAudio.last.finish()
    await settle(20)
    expect(FakeAudio.last.played).toEqual(['a1.mp3', 'a2.mp3', 'b1.mp3'])
  })

  it('switches to MP3 when this browser cannot decode Opus', async () => {
    const { voice, say } = setup({ a: ['a1'] })
    voice.enable()
    FakeAudio.last.decodeFails = (data) => new TextDecoder().decode(data).endsWith('.webm')
    say(['a1'])
    await settle(20)
    expect(FakeAudio.last.played).toEqual(['a1.mp3'])
  })
})
