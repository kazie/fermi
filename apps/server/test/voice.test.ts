import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { sentences, speechText, type RevealView, type RoomView, type ServerMessage } from '@fermi/shared'
import { DEADLINE_GRACE_MS, Room, VOICE_READY_BATCH_MS } from '../src/game.ts'
import { startServer } from '../src/index.ts'
import { Voice, type Tier } from '../src/voice/index.ts'
import { clipKey } from '../src/voice/speech.ts'
import { lineSentences, nameSentences } from '../src/voice/sweep.ts'
import type { Renderer } from '../src/voice/worker.ts'
import { loadLinePool } from '@fermi/shared/lines'
import { makeQuestion, seed, testDb, testLineFiles, testLines } from './fixtures.ts'
import { getQuestion } from '../src/questions/repo.ts'
import { WorkerRenderer } from '../src/voice/worker.ts'

const SETTINGS = '{"voice":"test"}'
const key = (sentence: string) => clipKey(JSON.stringify(JSON.parse(SETTINGS)), sentence)

/** Writes empty clips and remembers what it rendered, in order. `hold` keeps renders waiting until released. */
class FakeRenderer implements Renderer {
  rendered: string[] = []
  failNext = 0
  private gate: Promise<void> | null = null
  private open = () => {}
  hold() {
    this.gate = new Promise((r) => (this.open = r))
  }
  release() {
    this.gate = null
    this.open()
  }
  async render(text: string, out: string) {
    if (this.gate) await this.gate
    if (this.failNext > 0) {
      this.failNext--
      throw new Error('boom')
    }
    writeFileSync(`${out}.webm`, '')
    writeFileSync(`${out}.mp3`, '')
    this.rendered.push(text)
  }
  close() {}
}

const dirs: string[] = []
function makeVoice(opts: { now?: () => number; pauseMs?: number } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'fermi-voice-'))
  dirs.push(dir)
  const renderer = new FakeRenderer()
  return { voice: new Voice({ dir, renderer, settings: SETTINGS, ...opts }), renderer, dir }
}
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
})

describe('Voice', () => {
  it('splits a line into sentence clips and renders each once', async () => {
    const { voice, renderer } = makeVoice()
    const keys = voice.request('**Hello** there. You were 2.4× off.')
    expect(keys).toEqual([key('Hello there.'), key('You were 2 point 4 times off.')])
    voice.request('Hello there.')
    await voice.idle()
    expect(renderer.rendered).toEqual(['Hello there.', 'You were 2 point 4 times off.'])
    expect(keys.every((k) => voice.has(k))).toBe(true)
    voice.request('Hello there.')
    await voice.idle()
    expect(renderer.rendered).toHaveLength(2)
  })

  it('finds clips already on disk, from an earlier run or another machine', async () => {
    const { voice, dir } = makeVoice()
    voice.request('Kept.')
    await voice.idle()
    const again = new Voice({ dir, renderer: new FakeRenderer(), settings: SETTINGS })
    expect(again.has(key('Kept.'))).toBe(true)
    expect(again.status().rendered).toBe(1)
  })

  it('renders live lines first, earliest first, then ahead, then the sweep', async () => {
    const now = 1000
    const { voice, renderer } = makeVoice({ now: () => now })
    renderer.hold()
    voice.request('Busy.', { tier: 'sweep' }) // takes the worker while the rest queue up
    voice.requestSentences(['Swept.'])
    voice.request('Ahead.', { tier: 'ahead' })
    voice.request('Later.', { at: 3000 })
    voice.request('Sooner.', { at: 2000 })
    voice.request('Swept.', { at: 2500 }) // asked for live now: moves up
    voice.request('Later.', { tier: 'sweep' }) // asking again never lowers a clip
    expect(voice.status().queued).toEqual({ live: 3, ahead: 1, sweep: 0 })
    renderer.release()
    await voice.idle()
    expect(renderer.rendered).toEqual(['Busy.', 'Sooner.', 'Swept.', 'Later.', 'Ahead.'])
  })

  it("doesn't let a request too late to be heard take over a clip waiting to be swept", async () => {
    const { voice, renderer } = makeVoice({ now: () => 60_000 })
    renderer.hold()
    voice.request('Busy.')
    voice.requestSentences(['Waiting.'])
    voice.request('Waiting.', { at: 0 }) // a broadcast long after this was due
    expect(voice.status().queued).toMatchObject({ live: 0, sweep: 1 })
    renderer.release()
    await voice.idle()
    expect(renderer.rendered).toEqual(['Busy.', 'Waiting.'])
  })

  it('drops live clips that are too late to matter, so a backlog clears itself', async () => {
    let now = 0
    const { voice, renderer } = makeVoice({ now: () => now })
    renderer.hold()
    voice.request('First.')
    voice.request('Stale.', { at: 0 })
    voice.request('Kept ahead.', { tier: 'ahead', at: 0 })
    now = 60_000
    renderer.release()
    await voice.idle()
    expect(renderer.rendered).toEqual(['First.', 'Kept ahead.'])
    expect(voice.status().expired).toBe(1)
  })

  it('gives a clip needed again, after its last need passed, a fresh deadline', async () => {
    let now = 0
    const { voice, renderer } = makeVoice({ now: () => now })
    renderer.hold()
    voice.request('Busy.')
    voice.request('Again.', { at: 0 })
    now = 40_000
    voice.request('Again.', { at: 40_000 })
    renderer.release()
    await voice.idle()
    expect(renderer.rendered).toEqual(['Busy.', 'Again.'])
  })

  it('sees clips copied into the folder while running, and renders deleted ones again', async () => {
    const { voice, renderer, dir } = makeVoice()
    const k = key('Copied in.')
    writeFileSync(join(dir, `${k}.webm`), '')
    writeFileSync(join(dir, `${k}.mp3`), '')
    voice.request('Copied in.')
    await voice.idle()
    expect(voice.has(k)).toBe(true)
    expect(renderer.rendered).toEqual([])
    rmSync(join(dir, `${k}.webm`))
    rmSync(join(dir, `${k}.mp3`))
    voice.forget(k)
    voice.request('Copied in.')
    await voice.idle()
    expect(renderer.rendered).toEqual(['Copied in.'])
  })

  it('rests a while when rendering keeps failing, then goes on with the queue', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fermi-voice-'))
    dirs.push(dir)
    const renderer = new FakeRenderer()
    const voice = new Voice({ dir, renderer, settings: SETTINGS, pauseMs: 1, brokenMs: 100 })
    renderer.failNext = 10
    voice.requestSentences(Array.from({ length: 30 }, (_, i) => `Sentence ${i}.`))
    await vi.waitFor(() => expect(voice.status().broken).toBe('boom'))
    expect(voice.status().queued.sweep).toBe(20) // nothing thrown away: the startup sweep isn't lost
    await voice.idle()
    expect(voice.status()).toMatchObject({ failed: 10, broken: null })
    expect(renderer.rendered).toHaveLength(20)
  })

  it("caps how much speculative work can wait, so name renders from many rooms can't pile up forever", () => {
    const { voice, renderer } = makeVoice()
    renderer.hold()
    voice.requestSentences(Array.from({ length: 20_100 }, (_, i) => `Name ${i}.`))
    expect(voice.status().queued.sweep).toBeLessThanOrEqual(20_000)
    voice.request('Said now.')
    expect(voice.status().queued.live).toBe(1) // what she says always gets in
  })

  it('without the sweep, renders only what is said', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fermi-voice-'))
    dirs.push(dir)
    const renderer = new FakeRenderer()
    const voice = new Voice({ dir, renderer, settings: SETTINGS, sweep: false })
    voice.requestSentences(['Speculative.'])
    voice.request('A question.', { tier: 'sweep' })
    voice.request('Said.')
    voice.request('Picked ahead.', { tier: 'ahead' })
    await voice.idle()
    expect(renderer.rendered).toEqual(['Said.', 'Picked ahead.'])
  })

  it('counts failures and goes on with the next clip', async () => {
    const { voice, renderer } = makeVoice()
    renderer.failNext = 1
    voice.request('Broken. Fine.')
    await voice.idle()
    expect(renderer.rendered).toEqual(['Fine.'])
    expect(voice.status()).toMatchObject({ failed: 1, rendered: 1 })
  })
})

describe('what is rendered ahead', () => {
  it('every sentence without variables, and the ones that only count players', () => {
    const list = lineSentences(testLines)
    expect(list.length).toBeGreaterThan(5)
    expect(list.some((s) => s.includes('{$'))).toBe(false)
    expect(list).toContain('Welcome, 4 specimens.') // intro: "Welcome, { $count } specimens."
  })
  it('fills a name in before splitting sentences, as the game does', () => {
    const pool = loadLinePool([
      ...testLineFiles.filter((f) => f.path !== 'human_bullseye.ftl'),
      { path: 'human_bullseye.ftl', source: 'human-bullseye-1 = Nice try. { $name } wins.\n' },
    ])
    // a lower-case name doesn't start a new sentence; a capitalised one does
    expect(nameSentences(pool, 'kazie')).toContain('Nice try. kazie wins.')
    expect(nameSentences(pool, 'Kazie')).toContain('Kazie wins.')
  })
  it('renders the player counts every line can be said with, from none to a full room', () => {
    expect(lineSentences(testLines)).toEqual(expect.arrayContaining(['Welcome, 0 specimens.', 'Welcome, 30 specimens.']))
  })

  it("every sentence that only names a player, with the player's name", () => {
    const list = nameSentences(testLines, 'Zed')
    expect(list.length).toBeGreaterThan(0)
    expect(list.every((s) => s.includes('Zed') && !s.includes('{$'))).toBe(true)
  })
})

class FakeConn {
  messages: ServerMessage[] = []
  send(m: ServerMessage) {
    this.messages.push(m)
  }
  get last(): RoomView {
    return (this.messages.filter((m) => m.type === 'snapshot').at(-1) as Extract<ServerMessage, { type: 'snapshot' }>).room
  }
  /** The reveal, once the call at its start has closed (the fake clock is moved past it first). */
  get reveal(): RevealView {
    const call = this.last.call
    if (call) vi.advanceTimersByTime(call.endsAt - Date.now())
    return this.last.reveal!
  }
}

describe('Room with a voice', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  function setup() {
    const db = testDb()
    seed(db, 6)
    const { voice, renderer } = makeVoice()
    const asked: { text: string; tier: Tier }[] = []
    const request = voice.request.bind(voice)
    voice.request = (text, opts) => {
      asked.push({ text, tier: opts?.tier ?? 'live' })
      return request(text, opts)
    }
    const named: string[][] = []
    const requestSentences = voice.requestSentences.bind(voice)
    voice.requestSentences = (list, when) => {
      named.push(list)
      return requestSentences(list, when)
    }
    const room = new Room('ABCD', { db, lines: testLines, rand: () => 0, voice })
    const players = ['Ada', 'Bob', 'Cyd'].map((name, i) => {
      const id = `player-${i}-xxxxxxxx`
      const conn = new FakeConn()
      room.connect(id, conn)
      room.handle(id, { type: 'join', name }, conn)
      return { id, conn }
    })
    room.handle(players[0].id, { type: 'settings', rounds: 5, timerSec: 60, breakSec: 0, intro: 'off' }, players[0].conn)
    return { db, room, players, voice, renderer, asked, named }
  }

  it('renders the names of players as they join', () => {
    const { named } = setup()
    expect(named).toHaveLength(3)
    expect(named[2].every((s) => s.includes('Cyd'))).toBe(true)
  })

  it('sends the clips for what she says and reads out, and asks for them in time', () => {
    const { room, players, voice, asked } = setup()
    const [a, b, c] = players
    expect(a.conn.last.voice).toEqual({ lines: {}, pending: [] })
    room.handle(a.id, { type: 'start' }, a.conn)
    const round = a.conn.last.round!
    expect(a.conn.last.voice!.lines).toEqual({
      [round.question.question]: voice.keys(round.question.question),
      [round.line]: voice.keys(round.line),
    })
    expect(asked.slice(-2).map((x) => x.text)).toEqual([round.question.question, round.line]) // the question is read first

    for (const p of [a, b, c]) room.handle(p.id, { type: 'lock', text: '1' }, p.conn)
    const rv = a.conn.reveal
    expect(a.conn.last.voice!.lines[rv.lines.verdict]).toEqual(voice.keys(rv.lines.verdict))
    // the next question's line was picked during the reveal, so her voice could render it ahead
    const ahead = asked.filter((x) => x.tier === 'ahead').map((x) => x.text)
    vi.advanceTimersByTime(rv.timeline.endsAt - Date.now() + DEADLINE_GRACE_MS)
    expect(a.conn.last.phase).toBe('question')
    expect(ahead).toContain(a.conn.last.round!.line)
  })

  it('renders a limited number of names, however often someone renames', () => {
    const { room, players, named } = setup()
    for (let i = 0; i < 200; i++) room.handle(players[0].id, { type: 'rename', name: `Name ${i}` }, players[0].conn)
    expect(named.length).toBeLessThanOrEqual(60)
  })

  it('drops a line picked ahead whose names no longer apply', () => {
    const { db, room, players } = setup()
    const [a, b, c] = players
    room.handle(a.id, { type: 'start' }, a.conn)
    const truth = getQuestion(db, a.conn.last.round!.question.id)!.question.answer
    room.handle(a.id, { type: 'lock', text: `${truth}` }, a.conn)
    room.handle(b.id, { type: 'lock', text: `${truth} * 3` }, b.conn)
    room.handle(c.id, { type: 'lock', text: `${truth} * 1000` }, c.conn)
    const rv = a.conn.reveal
    room.disconnect(c.id, c.conn) // Cyd was last, but isn't here to be mocked any more
    vi.advanceTimersByTime(rv.timeline.endsAt - Date.now() + DEADLINE_GRACE_MS)
    expect(a.conn.last.phase).toBe('question')
    expect(a.conn.last.round!.line).not.toContain('Cyd')
  })

  it('tells the room when its clips are rendered, in one message, and lists them in later snapshots', async () => {
    const { room, players, voice } = setup()
    const [a] = players
    room.handle(a.id, { type: 'start' }, a.conn)
    const view = a.conn.last.voice!
    const keys = Object.values(view.lines).flat()
    expect(view.pending.length).toBeGreaterThan(0)
    await vi.waitFor(() => expect(keys.every((k) => voice.has(k))).toBe(true))
    vi.advanceTimersByTime(VOICE_READY_BATCH_MS)
    const pushed = a.conn.messages.filter((m) => m.type === 'voice')
    expect(pushed).toHaveLength(1)
    const ready = (pushed[0] as Extract<ServerMessage, { type: 'voice' }>).ready
    expect(ready.toSorted()).toEqual(view.pending.toSorted()) // only this view's clips
    room.handle(a.id, { type: 'draft', text: '1' }, a.conn) // any later snapshot
    expect(a.conn.last.voice!.pending).toEqual([])
  })

  it('snapshots never bring back lines too late to be heard', async () => {
    const { room, players, voice, renderer } = setup()
    const [a] = players
    renderer.hold() // the renderer is stuck on the first clip
    room.handle(a.id, { type: 'start' }, a.conn)
    const round = a.conn.last.round!
    const due = [round.question.question, round.line].flatMap((t) => sentences(speechText(t)))
    vi.advanceTimersByTime(20_000) // the question and her line are long past due
    const broadcast = () => {
      const screen = new FakeConn()
      room.connectScreen(screen)
      room.disconnectScreen(screen)
    }
    broadcast()
    renderer.release()
    await vi.waitFor(() => expect(voice.status().rendering).toBe(false))
    broadcast()
    expect(renderer.rendered.filter((t) => due.includes(t))).toEqual([]) // busy until they were too late, and never again
    expect(voice.status().queued.live).toBe(0)
  })

  it('picks the final lines during the last reveal', () => {
    const { room, players, asked } = setup()
    const [a, b, c] = players
    room.handle(a.id, { type: 'start' }, a.conn)
    for (let i = 0; i < 5; i++) {
      for (const p of [a, b, c]) room.handle(p.id, { type: 'lock', text: '1' }, p.conn)
      vi.advanceTimersByTime(a.conn.reveal.timeline.endsAt - Date.now() + DEADLINE_GRACE_MS)
    }
    const final = a.conn.last.final!
    expect(a.conn.last.phase).toBe('final')
    expect(asked.filter((x) => x.tier === 'ahead').map((x) => x.text)).toContain(final.line)
  })

  it('picks the award lines during the last reveal, so the ceremony has its clips', () => {
    const { room, players, asked } = setup()
    const [a, b, c] = players
    room.handle(a.id, { type: 'start' }, a.conn)
    const sheets = ['x = 10\ny = 20\nz = x * y\nz * 5', '1000', '9e9']
    for (let i = 0; i < 5; i++) {
      ;[a, b, c].forEach((p, n) => room.handle(p.id, { type: 'lock', text: sheets[n] }, p.conn))
      vi.advanceTimersByTime(a.conn.reveal.timeline.endsAt - Date.now() + DEADLINE_GRACE_MS)
    }
    const { awards } = a.conn.last.final!
    expect(awards.length).toBeGreaterThan(0)
    const ahead = asked.filter((x) => x.tier === 'ahead').map((x) => x.text)
    for (const w of awards) expect(ahead).toContain(w.line)
  })
})

describe('the voice over HTTP', () => {
  const TOKEN = 'test-token'
  let base = ''
  let srv: ReturnType<typeof startServer>
  let voice: Voice
  beforeAll(async () => {
    voice = makeVoice().voice
    srv = startServer({ port: 0, host: '127.0.0.1', db: testDb(), lines: testLines, adminToken: TOKEN, staticDir: '/nonexistent', voice })
    base = `http://127.0.0.1:${await srv.ready}`
  })
  afterAll(() => srv.close())

  it('serves rendered clips for good, and 404 until then', async () => {
    const [k] = voice.request('Served.')
    await voice.idle()
    const res = await fetch(`${base}/voice/${k}.webm`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('audio/webm')
    expect(res.headers.get('cache-control')).toContain('immutable')
    expect((await fetch(`${base}/voice/${k}.mp3`)).headers.get('content-type')).toBe('audio/mpeg')
    expect((await fetch(`${base}/voice/${'0'.repeat(32)}.webm`)).status).toBe(404)
    expect((await fetch(`${base}/voice/..%2Fsecret.webm`)).status).toBe(404)
  })

  it('reports counts only, and renders new questions as they are added', async () => {
    const auth = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }
    const q = makeQuestion({ question: 'How many fake things are there in this test?' })
    const added = await fetch(`${base}/api/admin/questions`, { method: 'POST', headers: auth, body: JSON.stringify({ questions: [q] }) })
    expect(added.status).toBe(201)
    await voice.idle()
    expect(voice.keys(q.question).every((k) => voice.has(k))).toBe(true)
    const status = await (await fetch(`${base}/api/admin/voice`, { headers: auth })).json()
    expect(status).toMatchObject({ enabled: true, questionsMissing: 0, expired: 0 })
    expect(JSON.stringify(status)).not.toContain('fake things')
  })
})

describe('the worker process', () => {
  const fake = (script: string, opts = {}) => new WorkerRenderer({ command: ['node', '-e', script], ...opts })
  const READY = 'console.log(JSON.stringify({ ready: true }))'

  it('fails the job, without taking the server down, when the worker dies', async () => {
    const r = fake(`${READY}; process.stdin.once('data', () => process.exit(1))`)
    await expect(r.render('One.', '/nonexistent/x')).rejects.toThrow(/exited/)
    await expect(r.render('Two.', '/nonexistent/y')).rejects.toThrow(/exited/) // started again
    r.close()
  })

  it('fails the job when the worker exits before it is written to', async () => {
    const r = fake(`${READY}; process.exit(0)`)
    await expect(r.render('One.', '/nonexistent/x')).rejects.toThrow()
    r.close()
  })

  it("doesn't let a failed start's timeout stop the worker that replaced it", async () => {
    const marker = join(mkdtempSync(join(tmpdir(), 'fermi-voice-')), 'started')
    dirs.push(dirname(marker))
    // the first start dies at once; the next one works, taking half a second a job
    const reply = `(l) => setTimeout(() => console.log(JSON.stringify({ id: JSON.parse(l).id, ok: true })), 500)`
    const healthy = `${READY}; require('readline').createInterface({ input: process.stdin }).on('line', ${reply})`
    const script = `const fs = require('fs'); if (!fs.existsSync(${JSON.stringify(marker)})) { fs.writeFileSync(${JSON.stringify(marker)}, ''); process.exit(1) } ${healthy}`
    const r = fake(script, { startTimeoutMs: 300 })
    await expect(r.render('One.', '/nonexistent/x')).rejects.toThrow(/exited/)
    // its job is still rendering when the first start's timeout comes round
    await expect(r.render('Two.', '/nonexistent/y')).resolves.toBeUndefined()
    r.close()
  })

  it('gives up on a worker that never starts', async () => {
    const r = fake('setInterval(() => {}, 1000)', { startTimeoutMs: 200 })
    await expect(r.render('One.', '/nonexistent/x')).rejects.toThrow(/did not start/)
    r.close()
  })
})

// The real worker needs uv, ffmpeg and the model (about 90 MB, downloaded on first use): FERMI_VOICE_TEST=1 to run.
describe.skipIf(!process.env.FERMI_VOICE_TEST)('the real voice worker', () => {
  it('renders a sentence to Opus and MP3', { timeout: 300_000 }, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fermi-voice-'))
    dirs.push(dir)
    const voice = new Voice({ dir, renderer: new WorkerRenderer() })
    const keys = voice.request('I am FerMEANie. You were 2.4× off.')
    await voice.idle()
    voice.close()
    expect(voice.status()).toMatchObject({ failed: 0 })
    expect(keys.every((k) => voice.has(k))).toBe(true)
  })
})
