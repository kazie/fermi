import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { PROBE_MS, useSocket } from '../src/composables/useSocket'
import { lobbyRoom } from '../src/fixtures/rooms'

class FakeWS {
  static OPEN = 1
  static CLOSED = 3
  static all: FakeWS[] = []
  readyState = 0
  sent: unknown[] = []
  url: string
  onopen?: () => void
  onclose?: () => void
  onmessage?: (e: { data: string }) => void
  constructor(url: string) {
    this.url = url
    FakeWS.all.push(this)
  }
  send(d: string) {
    this.sent.push(JSON.parse(d))
  }
  close() {
    this.readyState = 3
    this.onclose?.()
  }
  open() {
    this.readyState = 1
    this.onopen?.()
  }
}

// unmount every test's component, so its listeners (tab visibility) can't react in later tests
const mounted: { unmount(): void }[] = []
const mountSocket = (setup: () => () => unknown) => mounted.push(mount(defineComponent({ setup })))

afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount())
  vi.useRealTimers()
  vi.unstubAllGlobals()
  FakeWS.all = []
})

describe('useSocket', () => {
  it('connects with the private key, never a public id', () => {
    vi.stubGlobal('WebSocket', FakeWS)
    mountSocket(() => (useSocket('ABCD'), () => h('div')))
    expect(FakeWS.all[0].url).toMatch(/[?&]key=[A-Za-z0-9_-]{43}/)
    expect(FakeWS.all[0].url).not.toMatch(/player=/)
  })

  it("adds her voice's clips rendered since the snapshot to the room's view", () => {
    vi.stubGlobal('WebSocket', FakeWS)
    let api!: ReturnType<typeof useSocket>
    mountSocket(() => ((api = useSocket('ABCD')), () => h('div')))
    const ws = FakeWS.all[0]
    ws.open()
    const room = { ...lobbyRoom(), voice: { lines: { 'Hello. There.': ['k1', 'k2'] }, pending: ['k2'] } }
    ws.onmessage?.({ data: JSON.stringify({ type: 'snapshot', room, serverNow: Date.now() }) })
    ws.onmessage?.({ data: JSON.stringify({ type: 'voice', ready: ['k2'] }) })
    expect(api.room.value!.voice).toEqual(room.voice) // the room isn't rebuilt for it
    expect(api.voiceReady.value).toEqual(['k2'])
    ws.onmessage?.({ data: JSON.stringify({ type: 'snapshot', room, serverNow: Date.now() }) })
    expect(api.voiceReady.value).toEqual([]) // a snapshot lists what's ready itself
  })

  it('keeps the latest draft typed while offline and sends it first on reconnect', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', FakeWS)
    let api!: ReturnType<typeof useSocket>
    mountSocket(() => ((api = useSocket('ABCD')), () => h('div')))
    FakeWS.all[0].open()
    FakeWS.all[0].close() // connection drops
    api.send({ type: 'draft', text: 'people = 8' })
    api.send({ type: 'draft', text: 'people = 8 billion' })
    vi.advanceTimersByTime(10_000)
    const next = FakeWS.all[1]
    next.open()
    const drafts = next.sent.filter((m) => (m as { type: string }).type === 'draft')
    expect(drafts).toEqual([{ type: 'draft', text: 'people = 8 billion' }])
    expect((next.sent[0] as { type: string }).type).toBe('draft')
  })

  it('drops a socket that says OPEN but stopped answering pings, and reconnects', () => {
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', FakeWS)
    mountSocket(() => (useSocket('ABCD'), () => h('div')))
    FakeWS.all[0].open() // pings once; nothing ever answers
    vi.advanceTimersByTime(15_000) // the next ping finds the first one unanswered for too long
    expect(FakeWS.all).toHaveLength(2)
  })

  it('checks the connection when the tab comes back, and reconnects if nobody answers', () => {
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', FakeWS)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    mountSocket(() => (useSocket('ABCD'), () => h('div')))
    const ws = FakeWS.all[0]
    ws.open()
    ws.onmessage?.({ data: JSON.stringify({ type: 'pong', t: Date.now(), serverNow: Date.now() }) })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(ws.sent.filter((m) => (m as { type: string }).type === 'ping')).toHaveLength(2)
    vi.advanceTimersByTime(PROBE_MS + 1)
    expect(FakeWS.all).toHaveLength(2)
  })

  it('keeps a socket that answers the probe', () => {
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', FakeWS)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    mountSocket(() => (useSocket('ABCD'), () => h('div')))
    const ws = FakeWS.all[0]
    ws.open()
    document.dispatchEvent(new Event('visibilitychange'))
    ws.onmessage?.({ data: JSON.stringify({ type: 'pong', t: Date.now(), serverNow: Date.now() }) })
    vi.advanceTimersByTime(PROBE_MS + 1)
    expect(FakeWS.all).toHaveLength(1)
  })
})
