import { existsSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer, type Server } from 'node:http'
import { getRequestListener } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { WebSocketServer, type WebSocket } from 'ws'
import { ClientMessageSchema, KEY_RE, ROOM_CODE_RE, type ServerMessage } from '@fermi/shared'
import { createApp, type AppDeps } from './app.ts'
import { defaultDbPath, openDb, type DB } from './db.ts'
import { loadLines, type LinePool } from './lines.ts'
import { RoomRegistry } from './rooms.ts'
import { hashKey } from './keys.ts'
import { voiceFromEnv, type Voice } from './voice/index.ts'
import { CLIP_KEY_RE } from './voice/speech.ts'
import { sweep } from './voice/sweep.ts'

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "connect-src 'self'", // includes the same-origin websocket
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'", // Vue :style bindings
  "script-src 'self'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))

export interface StartOptions {
  port?: number
  host?: string
  dbPath?: string
  db?: DB
  lines?: LinePool
  adminToken?: string
  staticDir?: string
  rateLimits?: AppDeps['rateLimits']
  /** FerMEANie's voice; by default on with FERMI_VOICE=1. */
  voice?: Voice
}

const VOICE_TYPES = { webm: 'audio/webm', mp3: 'audio/mpeg' } as const

export function startServer(opts: StartOptions = {}) {
  const dbPath = opts.dbPath ?? defaultDbPath()
  const db = opts.db ?? openDb(dbPath)
  const lines = opts.lines ?? loadLines()
  const voice = opts.voice ?? (process.env.FERMI_VOICE === '1' ? voiceFromEnv(dbPath) : undefined)
  // After the server is up: the sweep works out a few thousand clip keys and checks the folder for each (unless the
  // voice renders only what is said: FERMI_VOICE_SWEEP=0).
  if (voice && !opts.voice) setImmediate(() => sweep(voice, lines, db))
  const rooms = new RoomRegistry({ db, lines, voice, timeScale: Number(process.env.FERMI_TIME_SCALE ?? 1) || 1 })
  const app = createApp({
    db,
    rooms,
    lines,
    voice,
    adminToken: opts.adminToken ?? process.env.FERMI_ADMIN_TOKEN,
    rateLimits: opts.rateLimits,
  })

  // Her voice's clips. A key names its content for good, so browsers may keep a clip forever; one not rendered yet is
  // a 404 the client tries again.
  if (voice)
    app.get('/voice/:file', async (c) => {
      const [key, ext] = c.req.param('file').split('.')
      const type = VOICE_TYPES[ext as keyof typeof VOICE_TYPES]
      const body = CLIP_KEY_RE.test(key) && type ? await readFile(join(voice.dir, `${key}.${ext}`)).catch(() => null) : null
      if (!body) {
        if (type) voice.forget(key) // not rendered yet, or deleted from the folder: rendered when it's next needed
        return c.body(null, 404, { 'Cache-Control': 'no-store' })
      }
      return c.body(body, 200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable' })
    })

  const staticDir = opts.staticDir ?? `${ROOT}apps/client/dist`
  if (existsSync(staticDir)) {
    const indexHtml = readFileSync(`${staticDir}/index.html`, 'utf8')
    // The game is fully self-served: browsers refuse anything from another origin (CDNs, fonts, trackers).
    app.use('/*', async (c, next) => {
      await next()
      if (!c.req.path.startsWith('/api/')) c.header('Content-Security-Policy', CONTENT_SECURITY_POLICY)
    })
    app.use('/*', serveStatic({ root: staticDir }))
    app.get('*', (c) => c.html(indexHtml))
  }

  const server: Server = createServer(getRequestListener(app.fetch))
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 })

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://x')
    if (url.pathname !== '/ws') return socket.destroy()
    wss.handleUpgrade(req, socket, head, (ws) => onSocket(ws, url))
  })

  function onSocket(ws: WebSocket, url: URL) {
    const send = (msg: ServerMessage) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg))
    }
    const code = (url.searchParams.get('room') ?? '').toUpperCase()
    const room = ROOM_CODE_RE.test(code) ? rooms.get(code) : undefined
    // A big screen (TV) only watches: no key, never a player, never sends anything but pings.
    if (room && url.searchParams.get('screen') === '1') {
      const conn = { send }
      room.connectScreen(conn)
      ws.on('message', (data) => {
        try {
          const m = JSON.parse(String(data))
          if (m?.type === 'ping' && typeof m.t === 'number') send({ type: 'pong', t: m.t, serverNow: Date.now() })
        } catch {
          /* ignore */
        }
      })
      ws.on('close', () => room.disconnectScreen(conn))
      return
    }
    const key = url.searchParams.get('key') ?? ''
    if (!room || !KEY_RE.test(key)) {
      send({ type: 'error', message: room ? 'Bad player key' : 'That room doesn’t exist (any more). Ask for a new link!', fatal: true })
      ws.close(4004)
      return
    }
    const keyHash = hashKey(key)
    const playerId = room.idForKey(keyHash)
    const conn = { send }
    room.connect(playerId, conn, keyHash)

    let alive = true
    ws.on('pong', () => (alive = true))
    const heartbeat = setInterval(() => {
      if (!alive) return ws.terminate()
      alive = false
      ws.ping()
    }, 20_000)

    ws.on('message', (data) => {
      let parsed
      try {
        parsed = ClientMessageSchema.safeParse(JSON.parse(String(data)))
      } catch {
        return send({ type: 'error', message: 'Malformed message' })
      }
      if (!parsed.success) return send({ type: 'error', message: parsed.error.issues[0]?.message ?? 'Invalid message' })
      room.handle(playerId, parsed.data, conn)
    })
    ws.on('close', () => {
      clearInterval(heartbeat)
      room.disconnect(playerId, conn)
    })
  }

  const port = opts.port ?? Number(process.env.PORT ?? 3000)
  const host = opts.host ?? process.env.HOST ?? '0.0.0.0'
  const ready = new Promise<number>((resolve) => {
    server.listen(port, host, () => {
      const addr = server.address()
      resolve(typeof addr === 'object' && addr ? addr.port : port)
    })
  })

  const close = async () => {
    rooms.dispose()
    if (!opts.voice) voice?.close()
    for (const c of wss.clients) c.terminate()
    await new Promise<void>((r) => server.close(() => r()))
    if (!opts.db) db.close()
  }
  return { server, db, rooms, voice, ready, close }
}

if (import.meta.main) {
  const envFile = `${ROOT}.env`
  if (existsSync(envFile)) process.loadEnvFile(envFile)
  const s = startServer()
  s.ready.then((port) => {
    // Rooms catch their own errors (Room.guard). A stray rejected promise is only logged; a true uncaught exception
    // still crashes, so a supervisor restarts the server in a known state. Only once listening, so a startup failure
    // (port taken) crashes too.
    process.on('unhandledRejection', (e) => console.error('[fermi] unhandled rejection', e))
    console.log(`[fermi] listening on http://localhost:${port}`)
    if (!process.env.FERMI_ADMIN_TOKEN) console.log('[fermi] FERMI_ADMIN_TOKEN not set: the question admin API is disabled')
    if (s.voice) console.log(`[fermi] FerMEANie's voice is on: clips in ${s.voice.dir}`)
  })
  const stop = () => s.close().then(() => process.exit(0))
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}
