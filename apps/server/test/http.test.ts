import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ServerMessage } from '@fermi/shared'
import { startServer } from '../src/index.ts'
import { makeQuestion, testDb, testLines } from './fixtures.ts'

let base = ''
let srv: ReturnType<typeof startServer>
const TOKEN = 'test-token'
const KEY_A = 'a'.repeat(43)
const KEY_B = 'b'.repeat(43)
const auth = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }

beforeAll(async () => {
  srv = startServer({
    port: 0,
    host: '127.0.0.1',
    db: testDb(),
    lines: testLines,
    adminToken: TOKEN,
    staticDir: '/nonexistent',
    rateLimits: { rooms: { max: 1000, windowMs: 60_000 }, disputes: { max: 1000, windowMs: 60_000 } },
  })
  base = `127.0.0.1:${await srv.ready}`
})
afterAll(() => srv.close())

const post = (path: string, body: unknown, headers: Record<string, string> = auth) =>
  fetch(`http://${base}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })

describe('admin API', () => {
  it('requires the token', async () => {
    expect((await fetch(`http://${base}/api/admin/questions`)).status).toBe(401)
  })

  it('adds questions while running, reports duplicates, lists texts without answers', async () => {
    const q = makeQuestion({ id: 'http-eiffel' })
    const r1 = await post('/api/admin/questions', { questions: [q], batchId: 'b1' })
    expect(r1.status).toBe(201)
    const r2 = await post('/api/admin/questions', { questions: [makeQuestion({ id: 'http-eiffel-2' })] })
    expect(r2.status).toBe(409)
    expect(((await r2.json()) as any).results[0].status).toBe('duplicate')
    const list = (await (await fetch(`http://${base}/api/admin/questions`, { headers: auth })).json()) as any
    expect(list.questions.map((x: { id: string }) => x.id)).toContain('http-eiffel')
    expect(JSON.stringify(list)).not.toContain('2500000')
    const health = (await (await fetch(`http://${base}/api/health`)).json()) as any
    expect(health.questions).toBe(1)
  })

  it('invalid questions get 422 with reasons', async () => {
    const r = await post('/api/admin/questions', { questions: [{ id: 'nope' }] })
    expect(r.status).toBe(422)
    expect(((await r.json()) as any).results[0].errors.length).toBeGreaterThan(0)
  })

  it('records rejections and exposes stats', async () => {
    expect(
      (await post('/api/admin/rejections', { question: 'How many grains of sand on Earth?', reason: 'no citable source' })).status,
    ).toBe(201)
    const stats = (await (await fetch(`http://${base}/api/admin/stats`, { headers: auth })).json()) as any
    expect(stats.rejections).toBe(1)
  })

  it('adds and removes flags on many questions, skipping unknown ids', async () => {
    const r = await post('/api/admin/questions/flags', { ids: ['http-eiffel', 'nope'], add: ['reviewed:v1', 'x'] })
    expect(await r.json()).toEqual({ updated: 1, missing: ['nope'] })
    await post('/api/admin/questions/flags', { ids: ['http-eiffel'], remove: ['x'] })
    const q = (await (await fetch(`http://${base}/api/admin/questions/http-eiffel`, { headers: auth })).json()) as any
    expect(q.flags).toEqual(['reviewed:v1'])
  })

  it('previews a purge unless confirmed', async () => {
    const r = await post('/api/admin/questions/purge', {})
    expect(((await r.json()) as any).deleted).toBe(false)
  })

  it('hides unplayed questions from the public lookup', async () => {
    expect((await fetch(`http://${base}/api/questions/http-eiffel`)).status).toBe(404)
  })
})

function openSocket(code: string, key: string) {
  const ws = new WebSocket(`ws://${base}/ws?room=${code}&key=${key}`)
  const messages: ServerMessage[] = []
  ws.addEventListener('message', (ev) => messages.push(JSON.parse(String(ev.data))))
  const waitFor = async (pred: (m: ServerMessage) => boolean, timeout = 3000) => {
    const t0 = Date.now()
    for (;;) {
      const hit = [...messages].reverse().find(pred)
      if (hit) return hit
      if (Date.now() - t0 > timeout) throw new Error('timed out waiting for message')
      await new Promise((r) => setTimeout(r, 20))
    }
  }
  const opened = new Promise((r) => ws.addEventListener('open', r))
  return { ws, messages, waitFor, opened, send: (m: unknown) => ws.send(JSON.stringify(m)) }
}
type Snap = Extract<ServerMessage, { type: 'snapshot' }>

/** Two more players, so a game can start (it needs MIN_PLAYERS). Call `leave` once it has: they never answer. */
async function benchPlayers(code: string) {
  const bench = ['x', 'y'].map((k) => openSocket(code, k.repeat(43)))
  for (const [i, b] of bench.entries()) {
    await b.opened
    b.send({ type: 'join', name: `Bench ${i + 1}` })
    await b.waitFor((m) => m.type === 'snapshot' && m.room.you !== '')
  }
  return { leave: () => bench.forEach((b) => b.ws.close()) }
}

describe('identity and abuse protection', () => {
  it('a public id is not a credential: other players never see keys, and a copied id gets you nowhere', async () => {
    const { code } = (await (await post('/api/rooms', {}, {})).json()) as any
    const a = openSocket(code, KEY_A)
    await a.opened
    a.send({ type: 'join', name: 'Alice' })
    const snapA = (await a.waitFor((m) => m.type === 'snapshot' && m.room.players.length === 1)) as Snap
    const aliceId = snapA.room.you
    expect(snapA.room.hostId).toBe(aliceId)
    expect(JSON.stringify(snapA)).not.toContain(KEY_A)

    // Bob knows Alice's public id but not her key
    const b = openSocket(code, KEY_B)
    await b.opened
    b.send({ type: 'join', name: 'Bob' })
    const snapB = (await b.waitFor((m) => m.type === 'snapshot' && m.room.players.length === 2)) as Snap
    expect(snapB.room.you).not.toBe(aliceId)
    expect(JSON.stringify(snapB)).not.toContain(KEY_A)
    b.send({ type: 'start' })
    expect(await b.waitFor((m) => m.type === 'error')).toMatchObject({ message: /Only the host/ })

    // Alice reconnecting with her key is Alice again
    a.ws.close()
    const a2 = openSocket(code, KEY_A)
    await a2.opened
    expect(((await a2.waitFor((m) => m.type === 'snapshot')) as Snap).room.you).toBe(aliceId)
    // a non-key is refused outright
    const bad = openSocket(code, 'not-a-key')
    expect(await bad.waitFor((m) => m.type === 'error')).toMatchObject({ fatal: true })
    for (const s of [a2, b, bad]) s.ws.close()
  })

  it('hides a question while it is being played, and needs two reporters to disable it', async () => {
    const q = makeQuestion({ id: 'live-q', question: 'How many lamp posts line a fictional test avenue?', unit: 'posts', answer: 777 })
    q.sources[0] = { ...q.sources[0], url: 'https://example.org/lamps', quote: 'There are 777 lamp posts.' }
    expect((await post('/api/admin/questions', { questions: [q] })).status).toBe(201)
    srv.db.prepare("INSERT OR IGNORE INTO played_questions VALUES ('live-q', '2026-01-01')").run()
    // pause every other question so this room must pick live-q
    const paused = (srv.db.prepare("SELECT id FROM questions WHERE id != 'live-q' AND status = 'active'").all() as { id: string }[]).map(
      (r) => r.id,
    )
    for (const id of paused) srv.db.prepare("UPDATE questions SET status = 'retired' WHERE id = ?").run(id)

    const { code } = (await (await post('/api/rooms', {}, {})).json()) as any
    const p = openSocket(code, 'c'.repeat(43))
    await p.opened
    p.send({ type: 'join', name: 'Cleo' })
    await p.waitFor((m) => m.type === 'snapshot' && m.room.players.length === 1)
    const bench = await benchPlayers(code)
    p.send({ type: 'start' })
    const snap = (await p.waitFor((m) => m.type === 'snapshot' && m.room.phase === 'question')) as Snap
    bench.leave()
    expect(snap.room.round!.question.id).toBe('live-q')
    expect((await fetch(`http://${base}/api/questions/live-q`)).status).toBe(404) // no peeking mid-round
    p.send({ type: 'lock', text: '700' })
    await p.waitFor((m) => m.type === 'snapshot' && m.room.phase === 'reveal')
    expect((await fetch(`http://${base}/api/questions/live-q`)).status).toBe(200)
    p.ws.close()

    const dispute = (key: string) =>
      post('/api/questions/live-q/dispute', { message: 'This looks wrong to me', key }, { 'content-type': 'application/json' })
    expect((await dispute(KEY_A)).status).toBe(201)
    expect((await dispute(KEY_A)).status).toBe(200) // same reporter again: no effect
    const status = () => (srv.db.prepare("SELECT status FROM questions WHERE id = 'live-q'").get() as { status: string }).status
    expect(status()).toBe('active')
    expect((await dispute(KEY_B)).status).toBe(201)
    expect(status()).toBe('disputed')
    for (const id of paused) srv.db.prepare("UPDATE questions SET status = 'active' WHERE id = ?").run(id)
    srv.db.prepare("UPDATE questions SET status = 'retired' WHERE id = 'live-q'").run()
  })

  it('rate-limits room creation per client', async () => {
    const limited = startServer({ port: 0, host: '127.0.0.1', db: testDb(), lines: testLines, staticDir: '/nonexistent' })
    const url = `http://127.0.0.1:${await limited.ready}/api/rooms`
    const statuses: number[] = []
    for (let i = 0; i < 12; i++) statuses.push((await fetch(url, { method: 'POST' })).status)
    await limited.close()
    expect(statuses.slice(0, 10).every((s) => s === 201)).toBe(true)
    expect(statuses.slice(10)).toEqual([429, 429])
  })
})

describe('export → import merge', () => {
  it('keeps statuses and flags, skips known ids, merges rejections, and is safe to repeat', async () => {
    const other = startServer({ port: 0, host: '127.0.0.1', db: testDb(), lines: testLines, adminToken: TOKEN, staticDir: '/nonexistent' })
    const otherBase = `http://127.0.0.1:${await other.ready}`
    try {
      // a retired, overdue question in the source db
      const overdue = makeQuestion({
        id: 'merge-overdue',
        question: 'How many lighthouses guard the coast of an imaginary test country?',
        unit: 'lighthouses',
        answer: 1234,
        validAsOf: '2025',
        timeSensitive: true,
        recheckAfter: '2026-11-01',
      })
      overdue.sources[0] = { ...overdue.sources[0], url: 'https://example.org/lighthouses', quote: 'There are 1,234 lighthouses.' }
      expect((await post('/api/admin/questions', { questions: [overdue] })).status).toBe(201)
      expect((await post('/api/admin/questions/merge-overdue/status', { status: 'retired' })).status).toBe(200)
      srv.db.prepare("UPDATE questions SET data = json_set(data, '$.recheckAfter', '2026-01-01') WHERE id = 'merge-overdue'").run()

      const exp = (await (await fetch(`http://${base}/api/admin/questions/export`, { headers: auth })).json()) as any
      expect(exp.rejections.length).toBeGreaterThan(0)
      const importOnce = async () =>
        (await (
          await fetch(`${otherBase}/api/admin/questions`, {
            method: 'POST',
            headers: auth,
            body: JSON.stringify({ questions: exp.questions, import: true }),
          })
        ).json()) as any

      const first = await importOnce()
      expect(first.results.find((r: any) => r.id === 'merge-overdue').status).toBe('added')
      const retired = (await (await fetch(`${otherBase}/api/admin/questions/merge-overdue`, { headers: auth })).json()) as any
      expect(retired.status).toBe('retired')
      expect(retired.flags).toContain('recheck-due')

      const second = await importOnce()
      expect(second.results.every((r: any) => r.status === 'exists')).toBe(true)

      for (const r of exp.rejections) {
        await fetch(`${otherBase}/api/admin/rejections`, { method: 'POST', headers: auth, body: JSON.stringify(r) })
        await fetch(`${otherBase}/api/admin/rejections`, { method: 'POST', headers: auth, body: JSON.stringify(r) })
      }
      const stats = (await (await fetch(`${otherBase}/api/admin/stats`, { headers: auth })).json()) as any
      expect(stats.rejections).toBe(exp.rejections.length) // repeated merges don't pile up
    } finally {
      await other.close()
    }
  })
})

describe('websocket game', () => {
  it('creates a room, joins, plays a round, and allows disputes afterwards', async () => {
    const { code } = (await (await post('/api/rooms', {}, {})).json()) as any
    expect(code).toMatch(/^[A-Z]{4}$/)

    const ws = new WebSocket(`ws://${base}/ws?room=${code}&key=${KEY_A}`)
    const messages: ServerMessage[] = []
    const waitFor = (pred: (m: ServerMessage) => boolean) =>
      new Promise<ServerMessage>((resolve) => {
        const hit = messages.find(pred)
        if (hit) return resolve(hit)
        ws.addEventListener('message', function on(ev) {
          const m = JSON.parse(String(ev.data)) as ServerMessage
          if (pred(m)) {
            ws.removeEventListener('message', on)
            resolve(m)
          }
        })
      })
    ws.addEventListener('message', (ev) => messages.push(JSON.parse(String(ev.data))))
    await new Promise((r) => ws.addEventListener('open', r))
    ws.send(JSON.stringify({ type: 'join', name: 'Solo' }))
    await waitFor((m) => m.type === 'snapshot' && m.room.players.length === 1)
    const bench = await benchPlayers(code)
    ws.send(JSON.stringify({ type: 'start' }))
    const q = (await waitFor((m) => m.type === 'snapshot' && m.room.phase === 'question')) as Extract<ServerMessage, { type: 'snapshot' }>
    bench.leave()
    ws.send(JSON.stringify({ type: 'lock', text: '2.5M' }))
    const rv = (await waitFor((m) => m.type === 'snapshot' && m.room.phase === 'reveal')) as Extract<ServerMessage, { type: 'snapshot' }>
    expect(rv.room.reveal!.cards.find((c) => c.name === 'Solo')!.bonusKind).toBe('bullseye')
    expect(rv.room.reveal!.lines.verdict).toMatch(/abstain/)

    ws.send(JSON.stringify({ type: 'ping', t: 1 }))
    expect(await waitFor((m) => m.type === 'pong')).toMatchObject({ t: 1 })
    ws.send(JSON.stringify({ type: 'bogus' }))
    expect(await waitFor((m) => m.type === 'error')).toBeTruthy()
    ws.close()

    const id = q.room.round!.question.id
    const pub = (await (await fetch(`http://${base}/api/questions/${id}`)).json()) as any
    expect(pub.question.answer).toBe(2_500_000)
    expect(pub.question.verification).toBeUndefined()
    expect(
      (await post(`/api/questions/${id}/dispute`, { message: 'The rivet count looks off to me' }, { 'content-type': 'application/json' }))
        .status,
    ).toBe(201)
    const disputes = (await (await fetch(`http://${base}/api/admin/disputes`, { headers: auth })).json()) as any
    expect(disputes.disputes.map((d: { questionId: string }) => d.questionId)).toContain(id)
  })

  it('a big screen connects without a key and only watches', async () => {
    const { code } = (await (await post('/api/rooms', { screen: true }, {})).json()) as any
    const tv = new WebSocket(`ws://${base}/ws?room=${code}&screen=1`)
    const msg = await new Promise<ServerMessage>((r) => tv.addEventListener('message', (ev) => r(JSON.parse(String(ev.data)))))
    expect(msg).toMatchObject({ type: 'snapshot', room: { viewer: 'screen', you: '', phase: 'lobby', players: [] } })
    const p = openSocket(code, 'd'.repeat(43))
    await p.opened
    p.send({ type: 'join', name: 'Dana' })
    const snap = (await p.waitFor((m) => m.type === 'snapshot' && m.room.players.length === 1)) as Snap
    expect(snap.room.screens).toBe(1)
    expect(snap.room.hostId).toBe(snap.room.you) // the first phone to join hosts, not the TV
    tv.close()
    p.ws.close()
  })

  it('rejects unknown rooms', async () => {
    const ws = new WebSocket(`ws://${base}/ws?room=ZZZZ&key=${KEY_A}`)
    const msg = await new Promise<ServerMessage>((r) => ws.addEventListener('message', (ev) => r(JSON.parse(String(ev.data)))))
    expect(msg).toMatchObject({ type: 'error', fatal: true })
  })
})
