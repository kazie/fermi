import { onUnmounted, ref, shallowRef } from 'vue'
import type { ClientMessage, RoomView, ServerMessage } from '@fermi/shared'
import { playerKey } from '@/lib/storage'

export type SocketStatus = 'connecting' | 'open' | 'reconnecting' | 'closed'

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
  let stopped = false
  const queue: ClientMessage[] = []
  /** The latest draft typed while offline; sent first on reconnect so the server never scores a stale sheet. */
  let pendingDraft: ClientMessage | null = null

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
        const now = Date.now()
        const rtt = now - msg.t
        if (rtt <= bestRtt * 1.5) {
          bestRtt = Math.min(bestRtt, rtt)
          offset.value = msg.serverNow - (msg.t + rtt / 2)
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
    send({ type: 'ping', t: Date.now() })
  }

  function send(msg: ClientMessage) {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
    else if (msg.type === 'draft') pendingDraft = msg
    else if (msg.type !== 'ping') {
      if (msg.type === 'lock') pendingDraft = null // the lock carries the latest text itself
      queue.push(msg)
    }
  }

  connect()
  const onVisible = () => {
    if (document.visibilityState === 'visible' && ws?.readyState === WebSocket.CLOSED && !stopped) {
      clearTimeout(retryTimer)
      connect()
    }
  }
  document.addEventListener('visibilitychange', onVisible)

  onUnmounted(() => {
    stopped = true
    clearTimeout(retryTimer)
    clearInterval(pingTimer)
    document.removeEventListener('visibilitychange', onVisible)
    ws?.close()
  })

  return { room, status, fatal, lastError, offset, send }
}
