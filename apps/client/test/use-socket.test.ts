import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { useSocket } from '../src/composables/useSocket'

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

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  FakeWS.all = []
})

describe('useSocket', () => {
  it('connects with the private key, never a public id', () => {
    vi.stubGlobal('WebSocket', FakeWS)
    mount(defineComponent({ setup: () => (useSocket('ABCD'), () => h('div')) }))
    expect(FakeWS.all[0].url).toMatch(/[?&]key=[A-Za-z0-9_-]{43}/)
    expect(FakeWS.all[0].url).not.toMatch(/player=/)
  })

  it('keeps the latest draft typed while offline and sends it first on reconnect', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', FakeWS)
    let api!: ReturnType<typeof useSocket>
    mount(defineComponent({ setup: () => ((api = useSocket('ABCD')), () => h('div')) }))
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
})
