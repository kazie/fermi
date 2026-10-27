import { computed, onUnmounted, ref, shallowRef, type Ref } from 'vue'
import { reactionRest, reactionSent, type ClientMessage, type Reaction, type RoomView, type ServerMessage } from '@fermi/shared'
import { playerKey } from '@/lib/storage'

export type SocketStatus = 'connecting' | 'open' | 'reconnecting' | 'closed'

/** A ping unanswered this long means the socket is dead even if it says OPEN (a phone that slept). */
export const PONG_TIMEOUT_MS = 5000
/** Coming back to the tab: how long to wait for the probe ping's answer before reconnecting. */
export const PROBE_MS = 3000

/** How long a reaction floats on screen (ms). */
export const REACTION_SHOW_MS = 3000

/** How much later than the server's limit a phone sends its next reaction (ms), for clock error. */
const REACT_SLACK_MS = 150

/** A reaction as the floating layer shows it: who, which reaction, and when it arrived (server ms). */
export interface FloatingReaction {
  id: number
  playerId: string
  kind: Reaction
  t: number
}

/** `list` with a reaction that just arrived, dropping those done floating. */
export const addReaction = (list: FloatingReaction[], r: FloatingReaction) => [...list.filter((x) => r.t - x.t < REACTION_SHOW_MS), r]

/** A rest the reaction bar shows (server ms), and when it first showed (`seen`), so its refill can start part-way. */
export interface ReactRest {
  from: number
  until: number
  burst: boolean
  seen: number
}

/**
 * The rest showing at `now`, or null. It stays the same object while it lasts, so the bar redraws only when a rest
 * starts and ends, and the clock isn't even read until there's been a reaction.
 */
export function restShowing(rest: () => { from?: number; until: number; burst: boolean }, now: Ref<number>) {
  let shown: ReactRest | null = null
  return computed(() => {
    const { from, until, burst } = rest()
    if (from === undefined || now.value >= until) return (shown = null)
    if (shown?.from !== from || shown.until !== until) shown = { from, until, burst, seen: now.value }
    return shown
  })
}

/** One websocket per room page. Reconnects with backoff; the server resends a full snapshot each time. */
/** @param opts.screen connect as a big screen (TV): watches only, no player key. */
export function useSocket(code: string, opts: { screen?: boolean } = {}) {
  const room = shallowRef<RoomView | null>(null)
  /** Her voice's clips rendered since the last snapshot (kept apart, so a clip arriving doesn't redraw the room). */
  const voiceReady = shallowRef<string[]>([])
  /** Recent reactions (newest last), for the floating layer. */
  const reactions = shallowRef<FloatingReaction[]>([])
  let reactionId = 0
  /** Called with each reaction as it arrives (sounds, without diffing the list). */
  const reactionListeners: ((r: FloatingReaction) => void)[] = []
  /**
   * When this player last reacted, on the server's clock: from each snapshot (`yourReactions`), then from our own
   * reactions coming back. So the bar rests as long as the server would drop another. A tap waits for its echo (since
   * when: `reactPending`); one the server drops brings the list back instead.
   */
  const reacted = shallowRef<number[]>([])
  const reactPending = ref<number | null>(null)
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
        voiceReady.value = [] // the snapshot lists every ready clip itself
        reacted.value = msg.room.yourReactions ?? []
        reactPending.value = null
      } else if (msg.type === 'reaction') {
        // a short-lived list: each reaction floats up for a few seconds, then it's dropped
        const r = { id: ++reactionId, playerId: msg.playerId, kind: msg.kind, t: Date.now() + offset.value }
        reactions.value = addReaction(reactions.value, r)
        if (msg.playerId === room.value?.you) {
          reacted.value = reactionSent(reacted.value, msg.at)
          reactPending.value = null
        }
        for (const f of reactionListeners) f(r)
      } else if (msg.type === 'reactions') {
        reacted.value = msg.yourReactions
        reactPending.value = null
      } else if (msg.type === 'voice') {
        voiceReady.value = [...voiceReady.value, ...msg.ready]
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

  /**
   * The reaction bar's rest (server ms): from the last reaction until the next is sent; indefinite while one is on its
   * way. It ends a little after the server's limit (our estimate of its clock can be off by part of a round trip), so
   * the bar and `react` agree on when a tap goes out.
   */
  const reactRest = computed(() => {
    if (reactPending.value !== null) return { from: reactPending.value, until: Infinity, burst: false }
    const { until, burst } = reactionRest(reacted.value)
    return { from: reacted.value.at(-1), until: until + REACT_SLACK_MS, burst }
  })
  /** Sends a reaction, unless the bar is resting. */
  function react(kind: Reaction) {
    const now = Date.now() + offset.value
    if (now < reactRest.value.until) return
    reactPending.value = now
    send({ type: 'react', kind })
  }
  const onReaction = (f: (r: FloatingReaction) => void) => reactionListeners.push(f)

  return { room, voiceReady, status, fatal, lastError, offset, send, reactions, onReaction, reactRest, react }
}
