import { onUnmounted, ref, shallowRef } from 'vue'
import type { ClientMessage, RoomView, ServerMessage } from '@fermi/shared'
import { playerKey } from '@/lib/storage'

export type SocketStatus = 'connecting' | 'open' | 'reconnecting' | 'closed'

/** A ping unanswered this long means the socket is dead even if it says OPEN (a phone that slept). */
export const PONG_TIMEOUT_MS = 5000
/** Coming back to the tab: how long to wait for the probe ping's answer before reconnecting. */
export const PROBE_MS = 3000

/** One websocket per room page. Reconnects with backoff; the server resends a full snapshot each time. */
/** @param opts.screen connect as a big screen (TV): watches only, no player key. */
export function useSocket(code: string, opts: { screen?: boolean } = {}) {
  const room = shallowRef<RoomView | null>(null)
  const status = ref<SocketStatus>('connecting')
  const fatal = ref<string | null>(null)
  const lastError = ref<string | null>(null)
  /** serverTime ≈ Date.now() + offset */
  const offset = ref(0)
  let bestRtt = Infinity
  let ws: WebSocket | null = null
  let retry = 0
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let pingTimer: ReturnType<typeof setInterval> | undefined
  let probeTimer: ReturnType<typeof setTimeout> | undefined
  /** When the oldest unanswered ping went out, or null. */
  let pingSentAt: number | null = null
  let stopped = false
  const queue: ClientMessage[] = []
  /** The latest draft typed while offline; sent first on reconnect so the server never scores a stale sheet. */
  let pendingDraft: ClientMessage | null = null
  /**
   * Sent since the server last answered: a socket that turns out to be dead may have swallowed these, so a restart
   * sends them again. Any pong confirms them (the socket delivers in order). Drafts only count as the latest one.
   */
  let unconfirmed: ClientMessage[] = []
  let unconfirmedDraft: ClientMessage | null = null
  /** A socket being replaced: kept open until the new one is, so the server never sees this player leave. */
  let replacing: WebSocket | null = null

  const url = () => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const who = opts.screen ? 'screen=1' : `key=${encodeURIComponent(playerKey())}`
    return `${proto}://${location.host}/ws?room=${encodeURIComponent(code)}&${who}`
  }

  function connect() {
    ws = new WebSocket(url())
    ws.onopen = () => {
      status.value = 'open'
      retry = 0
      replacing?.close()
      replacing = null
      unconfirmed = []
      unconfirmedDraft = null
      // a new connection may take a new route (wifi → mobile data): measure the clock offset afresh
      bestRtt = Infinity
      pingSentAt = null
      if (pendingDraft) ws!.send(JSON.stringify(pendingDraft))
      pendingDraft = null
      while (queue.length) ws!.send(JSON.stringify(queue.shift()))
      ping()
      clearInterval(pingTimer)
      pingTimer = setInterval(ping, 15_000)
    }
    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data)) as ServerMessage
      if (msg.type === 'snapshot') {
        if (bestRtt === Infinity) offset.value = msg.serverNow - Date.now()
        room.value = msg.room
      } else if (msg.type === 'pong') {
        pingSentAt = null
        unconfirmed = []
        unconfirmedDraft = null
        const now = Date.now()
        const rtt = now - msg.t
        if (rtt < 0) return // the device clock jumped: this measurement means nothing
        // (at least 1 ms, so a 0 ms LAN round trip can't freeze the offset)
        if (rtt <= Math.max(bestRtt, 1) * 1.5) {
          bestRtt = Math.max(1, Math.min(bestRtt, rtt))
          offset.value = msg.serverNow - (msg.t + rtt / 2)
        } else {
          bestRtt *= 1.25 // the route got slower for good: let later pongs back in
        }
      } else if (msg.type === 'error') {
        if (msg.fatal) {
          fatal.value = msg.message
          stopped = true
        } else {
          lastError.value = msg.message
          setTimeout(() => {
            if (lastError.value === msg.message) lastError.value = null
          }, 4000)
        }
      }
    }
    ws.onclose = () => {
      clearInterval(pingTimer)
      clearTimeout(probeTimer)
      if (stopped) {
        status.value = 'closed'
        return
      }
      status.value = 'reconnecting'
      const delay = Math.min(8000, 300 * 2 ** retry++) + Math.random() * 300
      retryTimer = setTimeout(connect, delay)
    }
  }

  function ping() {
    if (pingSentAt !== null && Date.now() - pingSentAt > PONG_TIMEOUT_MS) return restart()
    if (ws?.readyState !== WebSocket.OPEN) return
    const t = Date.now()
    pingSentAt ??= t
    ws.send(JSON.stringify({ type: 'ping', t }))
  }

  /**
   * Replaces a socket that stopped answering, without waiting for TCP to notice (which takes minutes). The old one stays
   * open until the new one is, so a false alarm never looks like this player leaving; what it may have swallowed goes
   * out again on the new one.
   */
  function restart() {
    if (!ws || stopped) return
    const old = ws
    old.onopen = old.onmessage = old.onclose = null
    replacing?.close()
    replacing = old
    clearInterval(pingTimer)
    clearTimeout(probeTimer)
    if (unconfirmedDraft) queueOffline(unconfirmedDraft)
    for (const m of unconfirmed) queueOffline(m)
    unconfirmed = []
    unconfirmedDraft = null
    status.value = 'reconnecting'
    connect()
  }

  function send(msg: ClientMessage) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
      if (msg.type === 'draft') unconfirmedDraft = msg
      else if (msg.type !== 'ping') unconfirmed.push(msg)
    } else queueOffline(msg)
  }

  function queueOffline(msg: ClientMessage) {
    if (msg.type === 'draft') pendingDraft = msg
    else if (msg.type !== 'ping') {
      if (msg.type === 'lock') pendingDraft = null // the lock carries the latest text itself
      queue.push(msg)
    }
  }

  connect()
  // After a phone sleeps, its socket often still says OPEN but is dead: ask, and reconnect if nobody answers.
  const onVisible = () => {
    if (document.visibilityState !== 'visible' || stopped || !ws) return
    if (ws.readyState === WebSocket.CLOSED) {
      clearTimeout(retryTimer)
      connect()
    } else if (ws.readyState === WebSocket.OPEN) {
      const before = ws
      ping()
      if (ws !== before) return // already found dead and replaced
      clearTimeout(probeTimer)
      probeTimer = setTimeout(() => pingSentAt !== null && restart(), PROBE_MS)
    }
  }
  document.addEventListener('visibilitychange', onVisible)

  onUnmounted(() => {
    stopped = true
    clearTimeout(retryTimer)
    clearInterval(pingTimer)
    clearTimeout(probeTimer)
    document.removeEventListener('visibilitychange', onVisible)
    replacing?.close()
    ws?.close()
  })

  return { room, status, fatal, lastError, offset, send }
}
