import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  chatDelay,
  chatDuration,
  evaluateSheet,
  fermeanieStageMs,
  holdDuration,
  MIN_PLAYERS,
  REACTION_BURST,
  REACTION_GAP_MS,
  stolenCards,
  type RevealView,
  type RoomView,
  type ServerMessage,
} from '@fermi/shared'
import { Room, DEADLINE_GRACE_MS, gameOutcome, HOST_HANDOVER_MS, LOBBY_DROP_MS, LOBBY_LINE_GAP_MS, quipNames } from '../src/game.ts'
import { getQuestion } from '../src/questions/repo.ts'
import { loadExamples } from '../src/intro.ts'
import { makeQuestion, seed, testDb, testLines } from './fixtures.ts'
import { insertQuestion } from '../src/questions/repo.ts'

class FakeConn {
  messages: ServerMessage[] = []
  send(m: ServerMessage) {
    this.messages.push(m)
  }
  get last(): RoomView {
    const snaps = this.messages.filter((m) => m.type === 'snapshot')
    return (snaps[snaps.length - 1] as Extract<ServerMessage, { type: 'snapshot' }>).room
  }
  /** The reveal, once the call at its start has closed (the fake clock is moved past it first). */
  get reveal(): RevealView {
    const call = this.last.call
    if (call) vi.advanceTimersByTime(call.endsAt - Date.now())
    return this.last.reveal!
  }
  get errors() {
    return this.messages.filter((m) => m.type === 'error')
  }
}

/** Connects and names players: Ada, Bob, Cyd… */
/** Joins `count` players, then lets her finish greeting them (so a test can start the game straight away). */
function joinPlayers(room: Room, count: number) {
  const players = Array.from({ length: count }, (_, i) => joinOne(room, `player-${i}-xxxxxxxx`, ['Ada', 'Bob', 'Cyd', 'Dee', 'Eve'][i]))
  if (players[0]) letHerFinish(players[0].conn)
  return players
}

/** Moves the fake clock on until she has said everything in the lobby: the game can't start over her. */
function letHerFinish(conn: FakeConn) {
  const free = () => (conn.last.lobbyLine ? conn.last.lobbyLine.until + LOBBY_LINE_GAP_MS : 0)
  while (Date.now() < free()) vi.advanceTimersByTime(free() - Date.now())
}

/** Connects and joins one more player (no waiting for her). */
function joinOne(room: Room, id: string, name: string) {
  const conn = new FakeConn()
  room.connect(id, conn)
  room.handle(id, { type: 'join', name }, conn)
  return { id, conn }
}

function setup(playerCount: number, questions = 6) {
  const db = testDb()
  seed(db, questions)
  const room = new Room('ABCD', { db, lines: testLines, rand: () => 0 })
  const players = joinPlayers(room, playerCount)
  // most tests play straight through; the break has its own tests below
  if (players[0]) room.handle(players[0].id, { type: 'settings', rounds: 10, timerSec: 60, breakSec: 0, intro: 'off' }, players[0].conn)
  const answerOf = () => getQuestion(db, players[0].conn.last.round!.question.id)!.question.answer
  return { db, room, players, answerOf }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('Room', () => {
  it('lobby: first joiner hosts, only the host can start', () => {
    const { room, players } = setup(2)
    expect(players[0].conn.last.hostId).toBe(players[0].id)
    room.handle(players[1].id, { type: 'start' }, players[1].conn)
    expect(players[1].conn.errors.at(-1)).toMatchObject({ message: /Only the host/ })
    room.handle(players[0].id, { type: 'settings', rounds: 5, timerSec: 30 }, players[0].conn)
    expect(players[1].conn.last.settings).toEqual({ rounds: 5, timerSec: 30, breakSec: 0, pacing: 'timer', intro: 'off' })
  })

  it('de-duplicates names and reserves FerMEANie', () => {
    const { room, players } = setup(1)
    const c = new FakeConn()
    room.connect('other-player-1234', c)
    room.handle('other-player-1234', { type: 'join', name: 'ada' }, c)
    expect(c.last.players.map((p) => p.name)).toEqual(['Ada', 'ada 2'])
    room.handle(players[0].id, { type: 'rename', name: 'FerMEANie' }, players[0].conn)
    expect(c.last.players[0].name).toBe('FerMEANie 2')
  })

  it('refuses to start with an empty question pool', () => {
    const { room, players } = setup(3, 0)
    room.handle(players[0].id, { type: 'start' }, players[0].conn)
    expect(players[0].conn.errors.at(-1)).toMatchObject({ message: /no questions/ })
  })

  it(`needs ${MIN_PLAYERS} connected players to start, so FerMEANie can play`, () => {
    const { room, players } = setup(3)
    const [a, , c] = players
    room.disconnect(c.id, c.conn)
    room.handle(a.id, { type: 'start' }, a.conn)
    expect(a.conn.errors.at(-1)).toMatchObject({ message: /at least 3 players/ })
    expect(a.conn.last.phase).toBe('lobby')
    room.connect(c.id, c.conn)
    room.handle(a.id, { type: 'start' }, a.conn)
    expect(a.conn.last.phase).toBe('question')
  })

  it('plays a full game: answers hidden until reveal, dunce caps, median switch, steal, final', () => {
    const { db, room, players, answerOf } = setup(4)
    const [a, b, c, d] = players
    room.handle(a.id, { type: 'settings', rounds: 5, timerSec: 60 }, a.conn)
    room.handle(a.id, { type: 'start' }, a.conn)
    expect(a.conn.last.phase).toBe('question')
    expect(a.conn.last.round!.line).toBe('Welcome, 4 specimens.')
    expect(JSON.stringify(a.conn.last)).not.toContain(String(answerOf())) // the truth never leaks early

    // Round 1
    const truth = answerOf()
    room.handle(a.id, { type: 'lock', text: `exact = ${truth}\nexact # SECRET-ADA` }, a.conn)
    room.handle(b.id, { type: 'lock', text: `${truth} * 2` }, b.conn)
    room.handle(c.id, { type: 'lock', text: '1e99' }, c.conn)
    room.handle(d.id, { type: 'draft', text: 'thinking…' }, d.conn)
    const bView = b.conn.last
    expect(JSON.stringify(bView)).not.toContain('SECRET-ADA')
    expect(bView.players.find((p) => p.id === a.id)).toMatchObject({ lockedIn: true })
    expect(bView.players.find((p) => p.id === d.id)).toMatchObject({ lockedIn: false, typing: true })
    expect(bView.yourSheet).toEqual({ text: `${truth} * 2`, locked: true })
    expect(bView.phase).toBe('question') // d hasn't locked

    vi.advanceTimersByTime(60_000 + DEADLINE_GRACE_MS)
    const rv = a.conn.reveal
    expect(a.conn.last.phase).toBe('reveal')
    expect(rv.question.answer).toBe(truth)
    expect(rv.cards.map((x) => x.name)).toEqual(['Dee', 'Cyd', 'Bob', 'Ada']) // furthest → closest
    expect(rv.cards[0].value).toBeNull() // 'thinking…' is not a number
    expect(rv.cards[1].dunce).toBe('cosmic')
    expect(rv.lines.dunce[c.id]).toMatch(/^Cyd was cosmically/)
    expect(rv.crowd!.method).toBe('median')
    expect(rv.crowd!.outlierIds).toEqual([c.id])
    expect(rv.lines.ruleChange).toBe('Cyd forced a rule change.')
    expect(rv.cards[3].bonusKind).toBe('bullseye')
    expect(rv.lines.bullseye).toBe('Ada cheated.')
    expect(rv.cards[3].text).toContain('SECRET-ADA') // working is shown at reveal
    expect(rv.cards.every((x, i, all) => i === 0 || x.at > all[i - 1].at)).toBe(true)
    // Scores apply only after the reveal
    expect(a.conn.last.players[0].score).toBe(0)
    vi.advanceTimersByTime(rv.timeline.endsAt - Date.now())

    // Round 2: the crowd beats everyone → FerMEANie steals
    expect(a.conn.last.phase).toBe('question')
    expect(a.conn.last.round!.line).toBe('Ada leads, Dee trails.') // a quip from the second round on
    expect(a.conn.last.players.find((p) => p.id === a.id)!.score).toBe(rv.scoresAfter[a.id])
    expect(rv.scoresAfter[a.id]).toBe(300 + 100) // rank 1 of 3 answered + bullseye
    const t2 = answerOf()
    room.handle(a.id, { type: 'lock', text: `${t2} * 10` }, a.conn)
    room.handle(b.id, { type: 'lock', text: `${t2} / 10` }, b.conn)
    room.handle(c.id, { type: 'lock', text: `${t2} * 3` }, c.conn)
    room.handle(d.id, { type: 'lock', text: `${t2} * 3.5` }, d.conn) // all locked → ends early
    const rv2 = a.conn.reveal
    expect(rv2.fermeanie!.beatsAll).toBe(true)
    expect(rv2.cards.every((x) => x.points === 0 && x.stolen > 0)).toBe(true)
    // furthest → closest, so the suspense builds towards the best answer
    expect(rv2.cards.every((x, i, all) => i === 0 || x.err! <= all[i - 1].err!)).toBe(true)
    expect(rv2.lines.verdict).toBe(`I take ${rv2.fermeanie!.points}.`)
    vi.advanceTimersByTime(rv2.timeline.endsAt - Date.now())
    expect(a.conn.last.fermeanie.score).toBe(rv2.fermeanie!.points)

    // Rounds 3–5: nobody answers
    for (let i = 0; i < 3; i++) {
      expect(a.conn.last.phase).toBe('question')
      vi.advanceTimersByTime(60_000 + DEADLINE_GRACE_MS)
      expect(a.conn.reveal.lines.verdict).toBe('Only 0 answers. I abstain.')
      vi.advanceTimersByTime(a.conn.reveal.timeline.endsAt - Date.now())
    }
    const final = a.conn.last.final!
    expect(a.conn.last.phase).toBe('final')
    expect(final.ranking[0].name).toBe('Ada')
    expect(final.fermeanieWon).toBe(final.fermeanieScore > final.ranking[0].score)
    const fer = db.prepare('SELECT wins, games_played FROM fermeanie').get() as { wins: number; games_played: number }
    expect(fer.games_played).toBe(1)
    const game = db.prepare('SELECT rounds, final FROM games WHERE id = ?').get(final.gameId) as { rounds: string; final: string }
    expect(JSON.parse(game.rounds)).toHaveLength(5)
    expect(JSON.parse(game.final).gameId).toBe(final.gameId)
    // played questions become publicly viewable
    expect((db.prepare('SELECT COUNT(*) AS n FROM played_questions').get() as { n: number }).n).toBe(5)

    room.handle(a.id, { type: 'play_again' }, a.conn)
    expect(a.conn.last.phase).toBe('lobby')
  })

  /** Plays 5 rounds that FerMEANie's swarm wins (each player 4–10× off, the swarm closer). */
  function fermeanieWinsAGame(wins = 0) {
    const ctx = setup(3)
    const { db, room, players, answerOf } = ctx
    const [a, b, c] = players
    db.prepare('UPDATE fermeanie SET wins = ?, loss_streak = 2').run(wins)
    room.handle(a.id, { type: 'settings', rounds: 5, timerSec: 30 }, a.conn)
    room.handle(a.id, { type: 'start' }, a.conn)
    for (let i = 0; i < 5; i++) {
      const t = answerOf()
      room.handle(a.id, { type: 'lock', text: `${t} * 10` }, a.conn)
      room.handle(b.id, { type: 'lock', text: `${t} / 10` }, b.conn)
      room.handle(c.id, { type: 'lock', text: `${t} * 4` }, c.conn)
      vi.advanceTimersByTime(a.conn.reveal.timeline.endsAt - Date.now())
    }
    return { ...ctx, final: a.conn.last.final!, view: a.conn.last }
  }

  it('FerMEANie gains a pi digit and writes release notes when it wins', () => {
    const { db, final, view } = fermeanieWinsAGame()
    expect(final.fermeanieWon).toBe(true)
    expect(final).toMatchObject({ version: 'v3.141', wins: 1 })
    expect(final.codename).toBeUndefined()
    expect(final.versionLine).toMatch(/^v3\.141: fixed \w+, 1 wins\.$/)
    expect(view.fermeanie.version).toBe('v3.141')
    expect(db.prepare('SELECT wins, loss_streak FROM fermeanie').get()).toEqual({ wins: 1, loss_streak: 0 }) // a win ends the losing streak
  })

  it('every fifth win is a pie release', () => {
    const { final, view } = fermeanieWinsAGame(4)
    expect(final).toMatchObject({ version: 'v3.141592…', wins: 5, codename: 'Apple Pie' })
    expect(final.versionLine).toBe('Apple Pie is out: v3.141592…, 5 wins.')
    expect(view.fermeanie.codename).toBe('Apple Pie')
  })

  /** Plays 5 rounds where only Ada answers (exactly), unless `silent`: then nobody answers. FerMEANie has already lost `lossStreak` in a row. */
  function humansWinAGame({ silent = false, lossStreak = 0 } = {}) {
    const ctx = setup(3)
    const { db, room, players, answerOf } = ctx
    db.prepare('UPDATE fermeanie SET loss_streak = ?').run(lossStreak)
    const [a] = players
    room.handle(a.id, { type: 'settings', rounds: 5, timerSec: 30 }, a.conn)
    room.handle(a.id, { type: 'start' }, a.conn)
    for (let i = 0; i < 5; i++) {
      if (!silent) room.handle(a.id, { type: 'lock', text: String(answerOf()) }, a.conn)
      vi.advanceTimersByTime(30_000 + DEADLINE_GRACE_MS)
      vi.advanceTimersByTime(a.conn.reveal.timeline.endsAt - Date.now())
    }
    return a.conn.last.final!
  }

  it('a tie with FerMEANie is still a loss, with its own line', () => {
    const final = humansWinAGame({ silent: true })
    expect(final.fermeanieWon).toBe(false)
    expect(final.line).toBe('A tie with Ada. v3.14 still loses.')
    expect(final.versionLine).toBeUndefined()
  })

  it('after three losses in a row, FerMEANie eats humble pie', () => {
    expect(humansWinAGame({ lossStreak: 1 }).line).toBe('Ada beat v3.14.') // the second loss in a row
    expect(humansWinAGame({ lossStreak: 2 }).line).toBe('Ada won. 3 losses for v3.14.')
    expect(humansWinAGame({ lossStreak: 4 }).line).toBe('Ada won. 5 losses for v3.14.')
  })
  it('never asks two questions from the same template in one game', () => {
    const db = testDb()
    for (let i = 0; i < 6; i++) {
      const q = makeQuestion({
        id: `tmpl-${i}`,
        question: `Template question slot ${i}?`,
        answer: 1000 + i,
        template: { id: 'visitors-per-year', slot: `place ${i}` },
      })
      insertQuestion(db, q)
    }
    seed(db, 4)
    const room = new Room('TMPL', { db, lines: testLines })
    const players = joinPlayers(room, 3)
    const c = players[0].conn
    room.handle(players[0].id, { type: 'settings', rounds: 5, timerSec: 30, breakSec: 0, intro: 'off' }, c)
    room.handle(players[0].id, { type: 'start' }, c)
    const asked: string[] = []
    for (let i = 0; i < 5; i++) {
      asked.push(c.last.round!.question.id)
      for (const p of players) room.handle(p.id, { type: 'lock', text: '1' }, p.conn)
      vi.advanceTimersByTime(c.reveal.timeline.endsAt - Date.now())
    }
    expect(asked.filter((id) => id.startsWith('tmpl-')).length).toBeLessThanOrEqual(1)
  })

  it('mid-round joiners spectate until the next round', () => {
    const { room, players } = setup(3)
    const [a] = players
    room.handle(a.id, { type: 'start' }, a.conn)
    const late = new FakeConn()
    room.connect('late-player-123', late)
    room.handle('late-player-123', { type: 'join', name: 'Late' }, late)
    expect(late.last.players.find((p) => p.name === 'Late')!.spectating).toBe(true)
    expect(late.last.yourSheet).toBeUndefined()
    room.handle('late-player-123', { type: 'lock', text: '5' }, late) // ignored
    for (const p of players) room.handle(p.id, { type: 'lock', text: '5' }, p.conn)
    expect(late.reveal.cards.map((c) => c.name)).not.toContain('Late')
    vi.advanceTimersByTime(late.reveal.timeline.endsAt - Date.now())
    expect(late.last.players.find((p) => p.name === 'Late')!.spectating).toBe(false)
    expect(late.last.yourSheet).toEqual({ text: '', locked: false })
  })

  it('restores your sheet on reconnect and hands over host after a timeout', () => {
    const { room, players } = setup(3)
    const [a, b] = players
    room.handle(a.id, { type: 'start' }, a.conn)
    room.handle(a.id, { type: 'draft', text: 'people = 8 billion' }, a.conn)
    room.disconnect(a.id, a.conn)
    const again = new FakeConn()
    room.connect(a.id, again)
    expect(again.last.yourSheet).toEqual({ text: 'people = 8 billion', locked: false })
    room.disconnect(a.id, again)
    vi.advanceTimersByTime(HOST_HANDOVER_MS + 1)
    expect(b.conn.last.hostId).toBe(b.id)
  })

  it('a disconnected player no longer blocks the early end', () => {
    const { room, players } = setup(3)
    const [a, b, c] = players
    room.handle(a.id, { type: 'start' }, a.conn)
    room.handle(a.id, { type: 'lock', text: '42' }, a.conn)
    room.handle(b.id, { type: 'lock', text: '43' }, b.conn)
    expect(a.conn.last.phase).toBe('question')
    room.disconnect(c.id, c.conn)
    expect(a.conn.last.phase).toBe('reveal')
  })

  it('unlock lets you edit again', () => {
    const { room, players } = setup(3)
    const [a] = players
    room.handle(a.id, { type: 'start' }, a.conn)
    room.handle(a.id, { type: 'lock', text: '1' }, a.conn)
    room.handle(a.id, { type: 'unlock' }, a.conn)
    room.handle(a.id, { type: 'draft', text: '2' }, a.conn)
    expect(room.view(a.id).yourSheet).toEqual({ text: '2', locked: false })
  })

  it('pauses for a discussion break between rounds, ended by a majority of skip votes', () => {
    const { room, players } = setup(3)
    const [a, b, c] = players
    room.handle(a.id, { type: 'settings', rounds: 5, timerSec: 30, breakSec: 30 }, a.conn)
    room.handle(a.id, { type: 'start' }, a.conn)
    for (const p of players) room.handle(p.id, { type: 'lock', text: '5' }, p.conn)
    const rv = a.conn.reveal
    vi.advanceTimersByTime(rv.timeline.endsAt - Date.now())
    const v = a.conn.last
    expect(v.phase).toBe('break')
    expect(v.reveal).toBeDefined() // the finished round stays visible to talk about
    expect(v.break).toMatchObject({ index: 0, total: 5, line: 'Break.', timed: { votes: 0, needed: 2, youVoted: false } })
    room.handle(a.id, { type: 'next' }, a.conn) // only for host pacing
    expect(a.conn.last.phase).toBe('break')
    expect(v.players.find((p) => p.id === a.id)!.score).toBe(rv.scoresAfter[a.id]) // scores already applied
    room.handle(a.id, { type: 'skip_break' }, a.conn)
    room.handle(a.id, { type: 'skip_break' }, a.conn) // a second vote from the same player doesn't count
    expect(b.conn.last.break!.timed).toMatchObject({ votes: 1, youVoted: false })
    expect(a.conn.last.break!.timed!.youVoted).toBe(true)
    room.handle(b.id, { type: 'skip_break' }, b.conn)
    expect(c.conn.last.phase).toBe('question')
    expect(c.conn.last.round!.index).toBe(1)
  })

  it('the break ends by itself when the countdown runs out, and never follows the last round', () => {
    const { room, players } = setup(3)
    const [a] = players
    room.handle(a.id, { type: 'settings', rounds: 5, timerSec: 30, breakSec: 15 }, a.conn)
    room.handle(a.id, { type: 'start' }, a.conn)
    for (let i = 0; i < 5; i++) {
      for (const p of players) room.handle(p.id, { type: 'lock', text: '5' }, p.conn)
      vi.advanceTimersByTime(a.conn.reveal.timeline.endsAt - Date.now())
      if (i < 4) {
        expect(a.conn.last.phase).toBe('break')
        vi.advanceTimersByTime(15_000)
        expect(a.conn.last.phase).toBe('question')
      }
    }
    expect(a.conn.last.phase).toBe('final')
  })

  it('a disconnected player no longer counts towards the skip majority', () => {
    const { room, players } = setup(3)
    const [a, b, c] = players
    room.handle(a.id, { type: 'settings', rounds: 5, timerSec: 30, breakSec: 60 }, a.conn)
    room.handle(a.id, { type: 'start' }, a.conn)
    for (const p of players) room.handle(p.id, { type: 'lock', text: '5' }, p.conn)
    vi.advanceTimersByTime(a.conn.reveal.timeline.endsAt - Date.now())
    room.handle(a.id, { type: 'skip_break' }, a.conn)
    expect(a.conn.last.phase).toBe('break')
    room.disconnect(c.id, c.conn) // now 2 connected: 1 of 2 is not yet a majority…
    expect(a.conn.last.break!.timed!.needed).toBe(2)
    room.handle(b.id, { type: 'skip_break' }, b.conn)
    expect(a.conn.last.phase).toBe('question')
  })

  it('host pacing: the break lasts until the host taps Next, and never follows the last round', () => {
    const { room, players } = setup(3)
    const [a, b] = players
    room.handle(a.id, { type: 'settings', rounds: 5, timerSec: 30, breakSec: 0, pacing: 'host' }, a.conn)
    room.handle(a.id, { type: 'start' }, a.conn)
    for (let i = 0; i < 5; i++) {
      for (const p of players) room.handle(p.id, { type: 'lock', text: '5' }, p.conn)
      vi.advanceTimersByTime(a.conn.reveal.timeline.endsAt - Date.now())
      if (i === 4) break
      expect(a.conn.last.break!.line).toMatch(/Ada/) // a new line each break, naming the host
      expect(a.conn.last.break!.timed).toBeUndefined()
      vi.advanceTimersByTime(10 * 60_000)
      room.handle(b.id, { type: 'skip_break' }, b.conn) // no votes with host pacing
      room.handle(a.id, { type: 'skip_break' }, a.conn)
      room.handle(b.id, { type: 'next' }, b.conn)
      expect(b.conn.errors.at(-1)).toMatchObject({ message: /Only the host/ })
      expect(a.conn.last.phase).toBe('break')
      room.handle(a.id, { type: 'next' }, a.conn)
      expect(a.conn.last.round!.index).toBe(i + 1)
    }
    expect(a.conn.last.phase).toBe('final')
  })

  it('host pacing: a new host is named while everyone waits', () => {
    const { room, players } = setup(3)
    const [a, b] = players
    room.handle(a.id, { type: 'settings', rounds: 5, timerSec: 30, pacing: 'host' }, a.conn)
    room.handle(a.id, { type: 'start' }, a.conn)
    for (const p of players) room.handle(p.id, { type: 'lock', text: '5' }, p.conn)
    vi.advanceTimersByTime(a.conn.reveal.timeline.endsAt - Date.now())
    room.disconnect(a.id, a.conn)
    vi.advanceTimersByTime(HOST_HANDOVER_MS)
    expect(b.conn.last.break!.line).toBe('Waiting for Bob.')
    room.handle(b.id, { type: 'next' }, b.conn)
    expect(b.conn.last.phase).toBe('question')
  })

  it('a host who took over an empty lobby still gets the grace period', () => {
    const { room, players } = setup(3)
    const [, b, c] = players
    for (const p of players) room.disconnect(p.id, p.conn)
    vi.advanceTimersByTime(LOBBY_DROP_MS) // everyone is dropped
    room.connect(b.id, b.conn)
    room.handle(b.id, { type: 'join', name: 'Bob' }, b.conn)
    expect(b.conn.last.hostId).toBe(b.id)
    room.disconnect(b.id, b.conn) // a phone sleeping for a moment
    room.connect(c.id, c.conn)
    room.handle(c.id, { type: 'join', name: 'Cyd' }, c.conn)
    expect(c.conn.last.hostId).toBe(b.id)
    vi.advanceTimersByTime(HOST_HANDOVER_MS)
    expect(c.conn.last.hostId).toBe(c.id)
  })

  it('a dropped host who looks in without joining leaves the host role to whoever comes back', () => {
    const { room, players } = setup(2)
    const [a, b] = players
    room.disconnect(a.id, a.conn)
    vi.advanceTimersByTime(30_000)
    room.disconnect(b.id, b.conn)
    vi.advanceTimersByTime(30_000) // Ada is dropped; Bob still has 30 s
    room.connect(a.id, a.conn) // the name form, then gone again
    room.disconnect(a.id, a.conn)
    room.connect(b.id, b.conn)
    expect(b.conn.last.hostId).toBe(b.id)
  })

  it('host pacing: when nobody was around to take over, the next player back hosts', () => {
    const { room, players } = setup(3)
    const [a, b, c] = players
    room.handle(a.id, { type: 'settings', rounds: 5, timerSec: 30, pacing: 'host' }, a.conn)
    room.handle(a.id, { type: 'start' }, a.conn)
    for (const p of players) room.handle(p.id, { type: 'lock', text: '5' }, p.conn)
    vi.advanceTimersByTime(a.conn.reveal.timeline.endsAt - Date.now())
    for (const p of [b, c, a]) room.disconnect(p.id, p.conn)
    vi.advanceTimersByTime(HOST_HANDOVER_MS) // nobody to hand over to
    room.connect(c.id, c.conn)
    expect(c.conn.last.hostId).toBe(c.id)
    expect(c.conn.last.break!.line).toBe('Waiting for Cyd.')
    room.handle(c.id, { type: 'rename', name: 'Cy' }, c.conn)
    expect(c.conn.last.break!.line).toBe('Waiting for Cy.') // the same line, with the new name
    room.handle(c.id, { type: 'next' }, c.conn)
    expect(c.conn.last.phase).toBe('question')
  })

  it('FerMEANie remarks on early lock-ins, identical answers, lead changes and the final round', () => {
    const { room, players, answerOf } = setup(3)
    const [a, b, c] = players
    room.handle(a.id, { type: 'settings', rounds: 5, timerSec: 30 }, a.conn)
    room.handle(a.id, { type: 'start' }, a.conn)
    // Round 1: Ada is exact; Bob and Cyd give the same answer, all with time to spare
    let t = answerOf()
    room.handle(a.id, { type: 'lock', text: String(t) }, a.conn)
    room.handle(b.id, { type: 'lock', text: `${t} * 1000` }, b.conn)
    room.handle(c.id, { type: 'lock', text: `${t} * 1000` }, c.conn)
    let rv = a.conn.reveal
    expect(rv.lines.everyone).toBe('Everyone locked in early.')
    expect(rv.lines.twins).toBe('Bob and Cyd said the same.')
    vi.advanceTimersByTime(rv.timeline.endsAt - Date.now())
    expect(a.conn.last.round!.line).toBe('Carry on.') // Ada leads, but Bob and Cyd tie for last

    // Round 2: Bob is exact and overtakes Ada; answers at the deadline, all different
    t = answerOf()
    room.handle(a.id, { type: 'draft', text: `${t} * 100` }, a.conn)
    room.handle(b.id, { type: 'draft', text: String(t) }, b.conn)
    room.handle(c.id, { type: 'draft', text: `${t} * 1.5` }, c.conn)
    vi.advanceTimersByTime(30_000 + DEADLINE_GRACE_MS)
    rv = a.conn.reveal
    expect(rv.lines.everyone).toBeUndefined()
    expect(rv.lines.twins).toBeUndefined()
    vi.advanceTimersByTime(rv.timeline.endsAt - Date.now())
    expect(a.conn.last.round!.line).toBe('Bob took the lead from Ada.')

    for (let i = 2; i < 4; i++) {
      vi.advanceTimersByTime(30_000 + DEADLINE_GRACE_MS)
      vi.advanceTimersByTime(a.conn.reveal.timeline.endsAt - Date.now())
    }
    expect(a.conn.last.round!.line).toMatch(/^Last one, double points\. Bob leads, \w+ trails\.$/)
  })

  it('does not say everyone locked in when a disconnected player never answered', () => {
    const { room, players } = setup(3)
    const [a, b, c] = players
    room.handle(a.id, { type: 'start' }, a.conn)
    room.disconnect(c.id, c.conn)
    room.handle(a.id, { type: 'lock', text: '5' }, a.conn)
    room.handle(b.id, { type: 'lock', text: '7' }, b.conn)
    expect(a.conn.last.phase).toBe('reveal') // the connected players were done
    expect(a.conn.reveal.lines.everyone).toBeUndefined()
  })

  it('a big screen watches but never plays or sees any sheet', () => {
    const { room, players } = setup(3)
    const [a, b] = players
    const tv = new FakeConn()
    room.connectScreen(tv)
    expect(a.conn.last.screens).toBe(1)
    expect(tv.last).toMatchObject({ viewer: 'screen', you: '' })
    expect(tv.last.players).toHaveLength(3)
    room.handle(a.id, { type: 'start' }, a.conn)
    room.handle(a.id, { type: 'draft', text: 'SECRET-SHEET' }, a.conn)
    room.handle(b.id, { type: 'lock', text: '42' }, b.conn)
    expect(tv.last.phase).toBe('question')
    expect(tv.last.yourSheet).toBeUndefined()
    expect(JSON.stringify(tv.last)).not.toContain('SECRET-SHEET')
    expect(tv.last.round!.question).toBeDefined()
    room.disconnectScreen(tv)
    expect(a.conn.last.screens).toBe(0)
  })
})

describe('the final round', () => {
  it('counts double, and says so; earlier rounds count once', () => {
    const { db, room, players } = setup(3)
    const [a] = players
    room.handle(a.id, { type: 'settings', rounds: 5, timerSec: 30, breakSec: 0, intro: 'off' }, a.conn)
    room.handle(a.id, { type: 'start' }, a.conn)
    const texts = ['1000', '5000', '20000']
    for (let i = 0; i < 5; i++) {
      const round = a.conn.last.round!
      expect(round.multiplier).toBe(i === 4 ? 2 : undefined)
      players.forEach((p, n) => room.handle(p.id, { type: 'lock', text: texts[n] }, p.conn))
      const rv = a.conn.reveal
      expect(rv.multiplier).toBe(i === 4 ? 2 : undefined)
      // every card's points are its rank points and bonus, doubled in the last round
      for (const c of rv.cards) expect(c.basePoints % (i === 4 ? 200 : 100)).toBe(0)
      vi.advanceTimersByTime(rv.timeline.endsAt - Date.now())
    }
    expect(a.conn.last.phase).toBe('final')
    const { rounds } = db.prepare('SELECT rounds FROM games').get() as { rounds: string }
    expect(JSON.parse(rounds).map((r: { multiplier?: number }) => r.multiplier)).toEqual([undefined, undefined, undefined, undefined, 2])
  })

  it('the break before the final question says it counts double', () => {
    const { room, players } = setup(3)
    const [a] = players
    room.handle(a.id, { type: 'settings', rounds: 5, timerSec: 30, breakSec: 30, intro: 'off' }, a.conn)
    room.handle(a.id, { type: 'start' }, a.conn)
    for (let i = 0; i < 4; i++) {
      for (const p of players) room.handle(p.id, { type: 'lock', text: '5' }, p.conn)
      vi.advanceTimersByTime(a.conn.reveal.timeline.endsAt - Date.now())
      expect(a.conn.last.break!.nextMultiplier).toBe(i === 3 ? 2 : undefined)
      for (const p of players) room.handle(p.id, { type: 'skip_break' }, p.conn)
    }
  })
})

describe('the call and reactions', () => {
  it('takes calls until the truth is near, sends nothing about the truth meanwhile, and keeps calls hidden until then', () => {
    const { room, players } = setup(3)
    const [a, b, c] = players
    room.handle(a.id, { type: 'start' }, a.conn)
    room.handle(a.id, { type: 'lock', text: '5' }, a.conn)
    room.handle(b.id, { type: 'lock', text: '50' }, b.conn)
    room.handle(c.id, { type: 'lock', text: '0' }, c.conn) // not positive: can't call
    const call = a.conn.last.call!
    expect(a.conn.last.phase).toBe('reveal')
    expect(a.conn.last.reveal).toBeUndefined() // the truth stays on the server
    expect(JSON.stringify(a.conn.last)).not.toContain('"answer"')
    expect(call).toMatchObject({ values: [5, 50], yours: 5, made: 0 })
    expect(c.conn.last.call!.yours).toBeUndefined()
    room.handle(a.id, { type: 'call', call: 'higher' }, a.conn)
    room.handle(b.id, { type: 'call', call: 'lower' }, b.conn)
    room.handle(c.id, { type: 'call', call: 'lower' }, c.conn) // ignored
    expect(c.conn.last.call!.made).toBe(2)
    expect(a.conn.last.yourCall).toBe('higher')
    expect(c.conn.last.yourCall).toBeUndefined()
    vi.advanceTimersByTime(call.endsAt - Date.now())
    room.handle(c.id, { type: 'call', call: 'lower' }, c.conn) // too late anyway
    expect(c.conn.last.call).toBeUndefined()
    expect(c.conn.last.reveal!.calls).toEqual({ [a.id]: 'higher', [b.id]: 'lower' })
  })

  it('passes reactions on to everyone, at most one per player every moment, and only in the reveal or break', () => {
    const { room, players } = setup(3)
    const [a, b] = players
    room.handle(a.id, { type: 'react', kind: 'fire' }, a.conn) // the lobby: no
    room.handle(a.id, { type: 'start' }, a.conn)
    for (const p of players) room.handle(p.id, { type: 'lock', text: '5' }, p.conn)
    room.handle(a.id, { type: 'react', kind: 'fire' }, a.conn)
    room.handle(a.id, { type: 'react', kind: 'dead' }, a.conn) // too soon after the first
    vi.advanceTimersByTime(REACTION_GAP_MS)
    room.handle(a.id, { type: 'react', kind: 'rocket' }, a.conn)
    const seen = b.conn.messages.filter((m) => m.type === 'reaction')
    expect(seen).toEqual([
      { type: 'reaction', playerId: a.id, kind: 'fire', at: expect.any(Number) },
      { type: 'reaction', playerId: a.id, kind: 'rocket', at: expect.any(Number) },
    ])
  })
  it('cools a spammer down, and tells a reloaded phone when it last reacted', () => {
    const { room, players } = setup(3)
    const [a, b] = players
    room.handle(a.id, { type: 'start' }, a.conn)
    for (const p of players) room.handle(p.id, { type: 'lock', text: '5' }, p.conn)
    for (let i = 0; i < REACTION_BURST + 1; i++) {
      room.handle(a.id, { type: 'react', kind: 'fire' }, a.conn)
      vi.advanceTimersByTime(REACTION_GAP_MS)
    }
    // the last one came inside the window after a full burst: dropped
    expect(b.conn.messages.filter((m) => m.type === 'reaction')).toHaveLength(REACTION_BURST)
    // the dropped one brought its sender the truth
    expect(a.conn.messages.at(-1)).toMatchObject({ type: 'reactions', yourReactions: { length: REACTION_BURST } })
    // a reload: the new connection's first snapshot carries the cooldown
    const reloaded = new FakeConn()
    room.connect(a.id, reloaded)
    expect(reloaded.last.yourReactions).toHaveLength(REACTION_BURST)
    expect(b.conn.last.yourReactions).toBeUndefined()
  })
})

describe('awards', () => {
  it('reads out up to three awards before the crown, each to a different player, and saves them', () => {
    const { db, room, players } = setup(3)
    const [a, b, c] = players
    room.handle(a.id, { type: 'settings', rounds: 5, timerSec: 30, breakSec: 0, intro: 'off' }, a.conn)
    room.handle(a.id, { type: 'start' }, a.conn)
    for (let i = 0; i < 5; i++) {
      // Ada answers at once with long working; Bob and Cyd take their time, Cyd wildly off
      room.handle(a.id, { type: 'lock', text: 'x = 1000\ny = 2\nz = x * y\nz / 2' }, a.conn)
      vi.advanceTimersByTime(10_000)
      room.handle(b.id, { type: 'lock', text: '3000' }, b.conn)
      room.handle(c.id, { type: 'lock', text: '9e9' }, c.conn)
      const rv = a.conn.reveal
      expect(rv.cards.find((card) => card.playerId === a.id)!.lockMs).toBe(0)
      expect(rv.cards.find((card) => card.playerId === b.id)!.lockMs).toBe(10_000)
      vi.advanceTimersByTime(rv.timeline.endsAt - Date.now())
    }
    const final = a.conn.last.final!
    expect(final.awards.length).toBeGreaterThan(0)
    expect(final.awards.length).toBeLessThanOrEqual(3)
    expect(new Set(final.awards.map((w) => w.playerId)).size).toBe(final.awards.length)
    for (const w of final.awards) expect(w.line).toMatch(new RegExp(`^${w.kind.toUpperCase()} ${w.name} `))
    const times = [final.startedAt, ...final.awards.map((w) => w.at), final.crownAt]
    expect(times).toEqual([...times].sort((x, y) => x - y))
    expect(final.crownAt).toBeGreaterThan(final.startedAt)
    const saved = JSON.parse((db.prepare('SELECT final FROM games').get() as { final: string }).final)
    expect(saved.awards).toEqual(final.awards)
  })
})

describe('the intro', () => {
  const count = (db: ReturnType<typeof testDb>, table: string) =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n

  /** Three players in a room with the given intro, started. */
  function started(intro: 'full' | 'short') {
    const ctx = setup(3)
    const [a] = ctx.players
    ctx.room.handle(a.id, { type: 'settings', rounds: 5, timerSec: 30, breakSec: 0, intro }, a.conn)
    ctx.room.handle(a.id, { type: 'start' }, a.conn)
    return ctx
  }

  it('full: hello, every player in join order, the rules, an unscored example, then the first real question', () => {
    const { db, room, players } = started('full')
    const [a, b, c] = players
    const intro = a.conn.last.intro!
    expect(a.conn.last.phase).toBe('intro')
    expect(intro.steps.map((s) => (s.kind === 'player' ? s.name : s.kind === 'rule' ? s.rule : s.kind))).toEqual([
      'hello',
      'Ada',
      'Bob',
      'Cyd',
      'sheet',
      'times_off',
      'points',
      'call',
      'swarm',
    ])
    expect(intro.steps[0].line).toBe('HELLO 3.')
    expect(intro.steps[1].line).toBe('NEW Ada.')
    expect(intro.steps.every((s, i) => i === 0 || s.at > intro.steps[i - 1].at)).toBe(true)
    expect(intro.skip).toEqual({ votes: 0, needed: 2, youVoted: false })

    vi.advanceTimersByTime(intro.endsAt - Date.now())
    const practice = a.conn.last
    expect(practice.phase).toBe('question')
    expect(practice.round).toMatchObject({ practice: true, line: 'PRACTICE QUESTION.' })
    expect(practice.round!.question.id).toMatch(/^practice-/)
    expect(practice.intro).toBeDefined() // the vote to skip runs on

    room.handle(a.id, { type: 'lock', text: '1' }, a.conn) // wildly off: a dunce cap, but only as a demonstration
    for (const p of [b, c]) room.handle(p.id, { type: 'lock', text: '100000' }, p.conn)
    const rv = a.conn.reveal
    expect(rv.practice).toBe(true)
    expect(rv.lines).toMatchObject({ guide: 'PRACTICE GUIDE.', lesson: 'PRACTICE LESSON.' })
    expect(rv.cards.some((card) => card.points > 0)).toBe(true) // what it would have scored

    vi.advanceTimersByTime(rv.timeline.endsAt - Date.now())
    const real = a.conn.last
    expect(real.phase).toBe('question')
    expect(real.round).toMatchObject({ index: 0, line: 'FOR REAL AFTER PRACTICE.' })
    expect(real.round!.practice).toBeUndefined()
    expect(real.intro).toBeUndefined()
    expect(real.players.map((p) => [p.score, p.dunces])).toEqual([
      [0, 0],
      [0, 0],
      [0, 0],
    ])
    expect(count(db, 'played_questions')).toBe(0)
    expect(count(db, 'player_seen')).toBe(3) // only the real question
    // Ada's dunce cap in the example used up no insult she'd otherwise hear later
    expect((db.prepare("SELECT COUNT(*) AS n FROM player_lines WHERE line_key LIKE 'dunce%'").get() as { n: number }).n).toBe(0)
    expect(rv.lines.dunce[a.id]).toBeDefined()
    const { rounds } = db.prepare('SELECT rounds FROM games').get() as { rounds: string }
    expect(JSON.parse(rounds)).toEqual([])
  })

  it('the host skips it at once; anyone else votes, and a majority skips it, even during the example', () => {
    const { room, players } = started('full')
    const [a, b, c] = players
    room.handle(a.id, { type: 'skip_intro' }, a.conn)
    expect(c.conn.last.round).toMatchObject({ index: 0, line: 'FOR REAL AFTER SKIP.' })

    const other = started('full')
    const [, y, z] = other.players
    vi.advanceTimersByTime(other.players[0].conn.last.intro!.endsAt - Date.now())
    expect(z.conn.last.round!.practice).toBe(true)
    other.room.handle(y.id, { type: 'skip_intro' }, y.conn)
    other.room.handle(y.id, { type: 'skip_intro' }, y.conn) // one vote each
    expect(z.conn.last.intro!.skip).toMatchObject({ votes: 1, needed: 2, youVoted: false })
    expect(y.conn.last.intro!.skip.youVoted).toBe(true)
    other.room.handle(z.id, { type: 'skip_intro' }, z.conn)
    expect(z.conn.last.round).toMatchObject({ index: 0, line: 'FOR REAL AFTER SKIP.' })
    expect(z.conn.last.round!.practice).toBeUndefined()
    void b
  })

  it('short: hello and the roll call only; off: straight to the question with the usual greeting', () => {
    const { players } = started('short')
    const a = players[0]
    const intro = a.conn.last.intro!
    expect(intro.steps.map((s) => s.kind)).toEqual(['hello', 'player', 'player', 'player'])
    vi.advanceTimersByTime(intro.endsAt - Date.now())
    expect(a.conn.last.round).toMatchObject({ index: 0, line: 'FOR REAL AFTER INTRO.' })
    expect(a.conn.last.round!.practice).toBeUndefined()

    const { room, players: others } = setup(3)
    room.handle(others[0].id, { type: 'start' }, others[0].conn)
    expect(others[0].conn.last.phase).toBe('question')
    expect(others[0].conn.last.round!.line).toMatch(/^Welcome/)
  })

  it('remembers returning players for the roll call, and Play again makes the next intro short', () => {
    const { db, room, players } = setup(3)
    const [a, b, c] = players
    room.handle(a.id, { type: 'settings', rounds: 5, timerSec: 30, breakSec: 0, intro: 'full' }, a.conn)
    room.handle(a.id, { type: 'skip_intro' }, a.conn) // no intro running: ignored
    room.handle(a.id, { type: 'start' }, a.conn)
    expect(a.conn.last.intro!.steps[1].line).toBe('NEW Ada.')
    room.handle(a.id, { type: 'skip_intro' }, a.conn)
    for (let i = 0; i < 5; i++) {
      for (const p of players) room.handle(p.id, { type: 'lock', text: '5' }, p.conn)
      if (i === 4) joinPlayers(room, 4).slice(3) // Dee joins during the last reveal and never plays
      vi.advanceTimersByTime(a.conn.reveal.timeline.endsAt - Date.now())
    }
    expect(a.conn.last.phase).toBe('final')
    expect(a.conn.last.players).toHaveLength(4)
    expect(count(db, 'player_games')).toBe(3) // Dee has no game to remember

    room.handle(a.id, { type: 'play_again' }, a.conn)
    expect(a.conn.last.settings.intro).toBe('short')
    letHerFinish(a.conn)
    room.handle(a.id, { type: 'start' }, a.conn)
    const steps = a.conn.last.intro!.steps
    expect(steps.map((s) => s.kind)).toEqual(['hello', 'player', 'player', 'player', 'player'])
    expect(steps[0].line).toBe('AGAIN 4.') // a welcome back, not another introduction
    expect(steps[1].line).toBe('BACK Ada AFTER 1.')
    expect(steps[4].line).toBe('NEW Dee.')
    void [b, c]
  })
})

describe('the intro, in detail', () => {
  /** A room of three where Ada has finished games before, with this history; `rand` steps through `rolls`. */
  function withHistory(history: { dunces: number; fermeanieWon: number }[], rolls: number[]) {
    const db = testDb()
    seed(db, 6)
    let i = 0
    const room = new Room('HIST', { db, lines: testLines, rand: () => rolls[i++ % rolls.length] })
    const players = joinPlayers(room, 3)
    const insert = db.prepare(
      'INSERT INTO player_games (player_id, game_id, finished_at, score, dunces, fermeanie_won) VALUES (?, ?, ?, ?, ?, ?)',
    )
    history.forEach((g, n) => insert.run(players[0].id, `old-${n}`, '2026-10-01T00:00:00Z', 100, g.dunces, g.fermeanieWon))
    room.handle(players[0].id, { type: 'settings', rounds: 5, timerSec: 30, breakSec: 0, intro: 'short' }, players[0].conn)
    room.handle(players[0].id, { type: 'start' }, players[0].conn)
    const step = players[0].conn.last.intro!.steps.find((s) => s.kind === 'player' && s.name === 'Ada')!
    return { line: step.line, other: players[0].conn.last.intro!.steps.find((s) => s.kind === 'player' && s.name === 'Bob')!.line }
  }

  it('roll call: caps and losses join the pool of a returning player, never forced, never invented', () => {
    // without caps or losses on record, every roll gives a general welcome back
    for (const r of [0, 0.5, 0.99]) expect(withHistory([{ dunces: 0, fermeanieWon: 0 }], [r]).line).toBe('BACK Ada AFTER 1.')
    // with both, the three pools share the draw (one line each in the test files)
    const both = [
      { dunces: 2, fermeanieWon: 1 },
      { dunces: 0, fermeanieWon: 0 },
    ]
    expect(withHistory(both, [0.1]).line).toBe('BACK Ada AFTER 2.')
    expect(withHistory(both, [0.5]).line).toBe('CAPPED Ada 2.')
    expect(withHistory(both, [0.9]).line).toBe('BEATEN Ada 1 OF 2.')
    // with losses only, a cap line is never possible
    expect(withHistory([{ dunces: 0, fermeanieWon: 1 }], [0.99]).line).toBe('BEATEN Ada 1 OF 1.')
    expect(withHistory([{ dunces: 0, fermeanieWon: 1 }], [0.1]).line).toBe('BACK Ada AFTER 1.')
    // a newcomer is always new
    expect(withHistory([], [0.5]).other).toBe('NEW Bob.')
  })

  it('the example: the number line waits for the guide; no swarm lesson without a swarm', () => {
    const { room, players } = setup(3)
    const [a, b] = players
    room.handle(a.id, { type: 'settings', rounds: 5, timerSec: 30, breakSec: 0, intro: 'full' }, a.conn)
    room.handle(a.id, { type: 'start' }, a.conn)
    vi.advanceTimersByTime(a.conn.last.intro!.endsAt - Date.now())
    room.handle(a.id, { type: 'lock', text: '100000' }, a.conn)
    room.handle(b.id, { type: 'lock', text: '50000' }, b.conn)
    vi.advanceTimersByTime(46_000) // the third never answers: two answers, no swarm
    const rv = a.conn.reveal
    expect(rv.practice).toBe(true)
    expect(rv.fermeanie).toBeNull()
    expect(rv.lines.guide).toBe('PRACTICE GUIDE.')
    expect(rv.lines.lesson).toBeUndefined()
    const guideMs = chatDuration([rv.lines.guide!]) + holdDuration(rv.lines.guide!, true)
    expect(rv.timeline.truthAt - rv.timeline.startedAt).toBeGreaterThanOrEqual(guideMs)
  })
})

describe('the example questions', () => {
  it('each worked sheet comes out at its answer', () => {
    for (const e of loadExamples()) expect(evaluateSheet(e.sheet).answer, e.id).toBeCloseTo(e.answer, 6)
  })
})

describe('quipNames', () => {
  const p = (name: string, score: number, fromStart = true, here = true) => ({ name, score, fromStart, here })

  it('names the leader and the last when the scores single them out', () => {
    expect(quipNames([p('Bob', 100), p('Ada', 300), p('Cy', 200)], 0)).toEqual({ leader: 'Ada', last: 'Bob' })
  })

  it('names nobody on a tie, or when there is no one else to compare with', () => {
    expect(quipNames([p('Ada', 300), p('Bob', 300), p('Cy', 100), p('Dee', 100)], 0)).toEqual({ leader: undefined, last: undefined })
    expect(quipNames([p('Ada', 300)], 0)).toEqual({ leader: undefined, last: undefined })
  })

  it('names no leader while FerMEANie is ahead', () => {
    expect(quipNames([p('Ada', 300), p('Bob', 100)], 300).leader).toBeUndefined()
    expect(quipNames([p('Ada', 300), p('Bob', 100)], 299).leader).toBe('Ada')
  })

  it('does not call a newcomer the last', () => {
    expect(quipNames([p('Ada', 300), p('Bob', 100), p('Cy', 0, false)], 0).last).toBeUndefined()
  })

  it('does not call someone who left the last, but a leader who is away still leads', () => {
    expect(quipNames([p('Ada', 500, true, false), p('Bob', 300), p('Cy', 100, true, false)], 200)).toEqual({
      leader: 'Ada',
      last: undefined,
    })
  })
})

describe('Room robustness', () => {
  it('a step that throws sends only this room back to the lobby, with a message, and the server keeps going', () => {
    const { room, players } = setup(3)
    const [a] = players
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    room.handle(a.id, { type: 'start' }, a.conn)
    expect(a.conn.last.phase).toBe('question')
    vi.spyOn(room as unknown as { endRound(): void }, 'endRound').mockImplementation(() => {
      throw new Error('a bug in endRound')
    })
    expect(() => vi.advanceTimersByTime(60_000 + DEADLINE_GRACE_MS)).not.toThrow()
    expect(a.conn.last.phase).toBe('lobby')
    expect(a.conn.errors.at(-1)).toMatchObject({ message: /went back to the lobby/ })
    expect(quiet).toHaveBeenCalled()
    quiet.mockRestore()
  })

  it('guard catches a throwing message handler too', () => {
    const { room, players } = setup(3)
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() =>
      room.guard('test', () => {
        throw new Error('boom')
      }),
    ).not.toThrow()
    expect(players[0].conn.errors.at(-1)).toMatchObject({ message: /Something broke/ })
    quiet.mockRestore()
  })

  it('lets a player whose phone locked during the break answer the question when they come back', () => {
    const { room, players } = setup(4)
    const [a, , , d] = players
    room.handle(a.id, { type: 'settings', rounds: 5, timerSec: 60, breakSec: 15 }, a.conn)
    room.handle(a.id, { type: 'start' }, a.conn)
    vi.advanceTimersByTime(60_000 + DEADLINE_GRACE_MS) // reveal
    while (a.conn.last.phase === 'reveal') vi.advanceTimersByTime(1000)
    expect(a.conn.last.phase).toBe('break')
    room.disconnect(d.id, d.conn) // d's phone locks during the break
    vi.advanceTimersByTime(15_000) // the break ends, the question starts without d connected
    expect(a.conn.last.phase).toBe('question')
    const fresh = new FakeConn()
    room.connect(d.id, fresh) // back before the deadline
    expect(fresh.last.yourSheet).toEqual({ text: '', locked: false })
    room.handle(d.id, { type: 'lock', text: '42' }, fresh)
    expect(a.conn.last.players.find((p) => p.id === d.id)).toMatchObject({ lockedIn: true })
  })

  it("makes FerMEANie's reveal stage long enough for everything she says", () => {
    const { room, players } = setup(3)
    const [a] = players
    room.handle(a.id, { type: 'start' }, a.conn)
    vi.advanceTimersByTime(60_000 + DEADLINE_GRACE_MS)
    const rv = a.conn.reveal
    const stolen = stolenCards(rv.fermeanie, rv.cards)
    expect(rv.timeline.chatAt - rv.timeline.fermeanieAt).toBe(chatDelay(stolen))
    expect(rv.timeline.scoreboardAt - rv.timeline.fermeanieAt).toBe(fermeanieStageMs(rv.lines, stolen))
  })

  it('keeps her chat at full length in sped-up games, since clients type at normal speed', () => {
    const db = testDb()
    seed(db, 6)
    const room = new Room('FAST', { db, lines: testLines, rand: () => 0, timeScale: 0.25 })
    const [a] = joinPlayers(room, 3)
    room.handle(a.id, { type: 'settings', rounds: 5, timerSec: 60, breakSec: 0, intro: 'off' }, a.conn)
    room.handle(a.id, { type: 'start' }, a.conn)
    vi.advanceTimersByTime(60_000 + DEADLINE_GRACE_MS) // the question timer itself is never sped up
    const rv = a.conn.reveal
    // only the minimum shrinks; the steal and her chat take their real time
    const real = fermeanieStageMs(rv.lines, stolenCards(rv.fermeanie, rv.cards), 0)
    expect(rv.timeline.scoreboardAt - rv.timeline.fermeanieAt).toBeGreaterThanOrEqual(real)
  })
})

describe('players who leave, kicks and her lobby lines', () => {
  /** Locks everyone given in and moves on to the next question (or the final). */
  function playRound(room: Room, lockers: { id: string; conn: FakeConn }[], text: (i: number) => string) {
    const before = lockers[0].conn.last.round!.index
    lockers.forEach((p, i) => room.handle(p.id, { type: 'lock', text: text(i) }, p.conn))
    while (lockers[0].conn.last.phase !== 'final' && lockers[0].conn.last.round?.index === before) vi.advanceTimersByTime(1000)
    while (!['question', 'final'].includes(lockers[0].conn.last.phase)) vi.advanceTimersByTime(1000)
  }

  it('offline for a whole question: gone, ranked last and never the winner; back in on reconnecting', () => {
    const { room, players, answerOf } = setup(3)
    const [a, b, c] = players
    room.handle(a.id, { type: 'settings', rounds: 5, timerSec: 60, breakSec: 0, intro: 'off' }, a.conn)
    room.handle(a.id, { type: 'start' }, a.conn)
    const truth = answerOf()
    playRound(room, [a, b, c], (i) => (i === 2 ? `${truth}` : '1e99')) // Cyd leads
    room.disconnect(c.id, c.conn) // and leaves during round 2
    playRound(room, [a, b], () => '1')
    expect(a.conn.last.players.find((p) => p.id === c.id)!.gone).toBe(false) // was there as it started: not gone yet

    playRound(room, [a, b], () => '1') // missed round 3 from start to end
    expect(a.conn.last.players.find((p) => p.id === c.id)!.gone).toBe(true)

    // a reconnect clears it; leaving again for a whole question brings it back
    const back = new FakeConn()
    room.connect(c.id, back)
    expect(a.conn.last.players.find((p) => p.id === c.id)!.gone).toBe(false)
    room.disconnect(c.id, back)
    while (a.conn.last.phase !== 'final') playRound(room, [a, b], () => '1')

    const final = a.conn.last.final!
    expect(final.ranking.at(-1)).toMatchObject({ playerId: c.id, gone: true })
    expect(final.ranking.filter((x) => x.gone)).toHaveLength(1)
    expect(final.winnerId).not.toBe(c.id)
    expect(final.awards.map((x) => x.playerId)).not.toContain(c.id)

    // play again: everyone starts fresh, and she has a line for the lobby
    room.handle(a.id, { type: 'play_again' }, a.conn)
    expect(a.conn.last.phase).toBe('lobby')
    expect(a.conn.last.lobbyLine!.text).toMatch(/^BACK/)
  })

  it('who won: the best player who stayed; when the whole room left, she wins by default', () => {
    const stayed = [
      { playerId: 'b', name: 'Bob', score: 200 },
      { playerId: 'a', name: 'Ada', score: 900, gone: true as const },
    ]
    expect(gameOutcome(stayed, 300)).toMatchObject({ winnerId: 'b', fermeanieWon: true })
    const allGone = [
      { playerId: 'a', name: 'Ada', score: 900, gone: true as const },
      { playerId: 'b', name: 'Bob', score: 200, gone: true as const },
    ]
    expect(gameOutcome(allGone, 300)).toEqual({ winnerId: null, winner: 'Ada', fermeanieWon: true, tied: false })
  })

  it('kick: only the host, only in the lobby, never themselves; the kicked player can join again', () => {
    const { room, players } = setup(3)
    const [a, b, c] = players
    room.handle(b.id, { type: 'kick', playerId: c.id }, b.conn)
    expect(b.conn.errors.at(-1)).toMatchObject({ message: /Only the host/ })
    room.handle(a.id, { type: 'kick', playerId: a.id }, a.conn)
    expect(a.conn.last.players.map((p) => p.name)).toEqual(['Ada', 'Bob', 'Cyd'])

    room.handle(a.id, { type: 'kick', playerId: c.id }, a.conn)
    expect(a.conn.last.players.map((p) => p.name)).toEqual(['Ada', 'Bob'])
    expect(c.conn.errors.at(-1)).toMatchObject({ message: /sent you back/ })
    expect(c.conn.last.players.some((p) => p.id === c.id)).toBe(false) // the name screen again
    room.handle(c.id, { type: 'join', name: 'Cyd' }, c.conn)
    expect(a.conn.last.players.map((p) => p.name)).toEqual(['Ada', 'Bob', 'Cyd'])

    letHerFinish(a.conn)
    room.handle(a.id, { type: 'start' }, a.conn)
    room.handle(a.id, { type: 'kick', playerId: b.id }, a.conn)
    expect(a.conn.last.players).toHaveLength(3) // not mid-game
  })

  it('her lobby line: as the room opens and as someone joins; a rename edits her greeting without saying it again', () => {
    const db = testDb()
    seed(db, 6)
    const room = new Room('ABCD', { db, lines: testLines, rand: () => 0 })
    const { conn } = joinOne(room, 'player-0-xxxxxxxx', 'Ada')
    expect(conn.last.lobbyLine!.text).toBe('EMPTY.') // the room has only just opened: she's still saying that
    letHerFinish(conn)
    const joined = conn.last.lobbyLine!
    expect(joined.text).toBe('JOIN Ada.')
    vi.advanceTimersByTime(1000)
    room.handle('player-0-xxxxxxxx', { type: 'rename', name: 'Ava' }, conn)
    expect(conn.last.lobbyLine).toEqual({ ...joined, text: 'JOIN Ava.' }) // same moment: not said again
  })

  it('her lobby line: never over the one she is saying; a burst of joins gets one line, naming up to four', () => {
    const { room, players } = setup(3)
    const [a] = players
    expect(a.conn.last.lobbyLine!.text).toBe('JOINS Ada, Bob and Cyd.') // they joined while the room's line was said
    joinOne(room, 'player-3-xxxxxxxx', 'Dee')
    const dee = a.conn.last.lobbyLine!
    expect(dee.text).toBe('JOIN Dee.') // she was quiet: said at once
    joinOne(room, 'player-4-xxxxxxxx', 'Eve')
    joinOne(room, 'player-5-xxxxxxxx', 'Fay')
    expect(a.conn.last.lobbyLine).toEqual(dee) // not while she's talking
    vi.advanceTimersByTime(dee.until - Date.now())
    expect(a.conn.last.lobbyLine).toEqual(dee) // nor straight after
    vi.advanceTimersByTime(LOBBY_LINE_GAP_MS)
    expect(a.conn.last.lobbyLine!.text).toBe('JOINS 2 AFTER 4.') // the naming line was used already: no repeats while there's another
    letHerFinish(a.conn)
    for (const [i, name] of ['Gus', 'Hal', 'Ida', 'Jo', 'Kim'].entries()) joinOne(room, `player-${6 + i}-xxxxxxxx`, name)
    expect(a.conn.last.lobbyLine!.text).toBe('JOIN Gus.')
    letHerFinish(a.conn)
    expect(a.conn.last.lobbyLine!.text).toBe('JOINS Hal, Ida, Jo and Kim.')
  })

  it('her lobby line: five or more at once are only counted', () => {
    const { room, players } = setup(3)
    joinOne(room, 'player-3-xxxxxxxx', 'Dee')
    for (const [i, name] of ['Eve', 'Fay', 'Gus', 'Hal', 'Ida'].entries()) joinOne(room, `player-${4 + i}-xxxxxxxx`, name)
    letHerFinish(players[0].conn)
    expect(players[0].conn.last.lobbyLine!.text).toBe('JOINS 5 AFTER 4.')
  })

  it('her lobby line: a joiner kicked before her turn is never greeted; the latest name is used', () => {
    const { room, players } = setup(3)
    const [a] = players
    joinOne(room, 'player-3-xxxxxxxx', 'Dee')
    const eve = joinOne(room, 'player-4-xxxxxxxx', 'Eve')
    const fay = joinOne(room, 'player-5-xxxxxxxx', 'Fay')
    room.handle(a.id, { type: 'kick', playerId: eve.id }, a.conn)
    room.handle(fay.id, { type: 'rename', name: 'Flo' }, fay.conn)
    letHerFinish(a.conn)
    expect(a.conn.last.lobbyLine!.text).toBe('JOIN Flo.')
    // the only joiner gone again before her turn: she remarks on the leaving instead
    joinOne(room, 'player-6-xxxxxxxx', 'Gus')
    const gus = joinOne(room, 'player-7-xxxxxxxx', 'Hal')
    expect(a.conn.last.lobbyLine!.text).toBe('JOIN Gus.')
    room.handle(a.id, { type: 'kick', playerId: gus.id }, a.conn)
    letHerFinish(a.conn)
    expect(a.conn.last.lobbyLine!.text).toBe('LEAVE.')
  })

  it('her lobby line: a group greeting follows a rename too', () => {
    const { room, players } = setup(3)
    const [a, b] = players
    expect(a.conn.last.lobbyLine!.text).toBe('JOINS Ada, Bob and Cyd.')
    room.handle(b.id, { type: 'rename', name: 'Bo' }, b.conn)
    expect(a.conn.last.lobbyLine!.text).toBe('JOINS Ada, Bo and Cyd.')
  })

  it('her lobby line: a rename that shortens her greeting brings her next line forward', () => {
    const { room, players } = setup(3)
    const [a] = players
    const long = joinOne(room, 'player-3-xxxxxxxx', 'Bartholomew-Maximilian the Third')
    joinOne(room, 'player-4-xxxxxxxx', 'Eve') // waits for her turn
    room.handle(long.id, { type: 'rename', name: 'Bo' }, long.conn)
    const bo = a.conn.last.lobbyLine!
    expect(bo.text).toBe('JOIN Bo.')
    vi.advanceTimersByTime(bo.until + LOBBY_LINE_GAP_MS - Date.now())
    expect(a.conn.last.lobbyLine!.text).toBe('JOIN Eve.')
  })

  it('a start while she is talking waits for her to finish; what she had left to say is dropped', () => {
    const { room, players } = setup(3)
    const [a] = players
    joinOne(room, 'player-3-xxxxxxxx', 'Dee')
    const dee = a.conn.last.lobbyLine!
    room.handle(a.id, { type: 'start' }, a.conn)
    expect(a.conn.errors).toEqual([])
    expect(a.conn.last).toMatchObject({ phase: 'lobby', starting: true })
    joinOne(room, 'player-4-xxxxxxxx', 'Eve') // waits for her turn, which never comes
    vi.advanceTimersByTime(dee.until - Date.now())
    expect(a.conn.last.phase).not.toBe('lobby')
    vi.advanceTimersByTime(LOBBY_LINE_GAP_MS)
    expect(a.conn.last.lobbyLine).toBeUndefined()
  })

  it('a queued start is called off if too few players are left when she finishes', () => {
    const { room, players } = setup(3)
    const [a, , c] = players
    joinOne(room, 'player-3-xxxxxxxx', 'Dee')
    const dee = a.conn.last.lobbyLine!
    room.handle(a.id, { type: 'start' }, a.conn)
    room.handle(a.id, { type: 'kick', playerId: c.id }, a.conn)
    room.handle(a.id, { type: 'kick', playerId: 'player-3-xxxxxxxx' }, a.conn)
    vi.advanceTimersByTime(dee.until - Date.now())
    expect(a.conn.last.phase).toBe('lobby')
    expect(a.conn.last.starting).toBeUndefined() // Start is back for the host
  })

  it('her lobby line: someone leaving gets a remark, and an emptied room goes back to the empty-room line', () => {
    const { room, players } = setup(3)
    const [a, b, c] = players
    room.handle(a.id, { type: 'kick', playerId: c.id }, a.conn)
    expect(a.conn.last.lobbyLine!.text).toBe('LEAVE.') // never 'JOIN Cyd.' any more
    room.disconnect(b.id, b.conn)
    vi.advanceTimersByTime(LOBBY_DROP_MS)
    expect(a.conn.last.lobbyLine!.text).toBe('LEAVE.')
    room.disconnect(a.id, a.conn)
    vi.advanceTimersByTime(LOBBY_DROP_MS)
    const watcher = new FakeConn()
    room.connect('watcher-xxxxxxxxxxxx', watcher)
    expect(watcher.last.lobbyLine!.text).toBe('EMPTY.')
  })

  it('back just after the deadline: too late for that question, but not gone', () => {
    const { room, players } = setup(3)
    const [a, b, c] = players
    room.handle(a.id, { type: 'settings', rounds: 5, timerSec: 60, breakSec: 0, intro: 'off' }, a.conn)
    room.handle(a.id, { type: 'start' }, a.conn)
    playRound(room, [a, b, c], () => '1')
    room.disconnect(c.id, c.conn)
    playRound(room, [a, b], () => '1') // c was in this one as it started
    // round 3: c is away from the start, and comes back in the grace period after the deadline
    room.handle(a.id, { type: 'lock', text: '1' }, a.conn)
    room.handle(b.id, { type: 'draft', text: '1' }, b.conn)
    vi.advanceTimersByTime(60_000 + DEADLINE_GRACE_MS / 2)
    const back = new FakeConn()
    room.connect(c.id, back)
    vi.advanceTimersByTime(DEADLINE_GRACE_MS)
    expect(back.last.phase).toBe('reveal')
    expect(back.last.players.find((p) => p.id === c.id)!.gone).toBe(false)
  })

  it('a leader who leaves is never named, and nobody overtook them: no lead change', () => {
    const { room, players, answerOf } = setup(3)
    const [a, b, c] = players
    room.handle(a.id, { type: 'settings', rounds: 10, timerSec: 60, breakSec: 0, intro: 'off' }, a.conn)
    room.handle(a.id, { type: 'start' }, a.conn)
    const truth = answerOf()
    playRound(room, [a, b, c], (i) => (i === 2 ? `${truth}` : '1e99')) // Cyd leads
    room.disconnect(c.id, c.conn)
    playRound(room, [a, b], () => '1e99') // Cyd was here as it started, and still leads
    // Cyd misses this whole question (gone as it ends) while Ada scores: Ada now leads the players still here
    playRound(room, [a, b], (i) => (i === 0 ? `${answerOf()}` : '1e99'))
    const line = a.conn.last.round!.line
    expect(line).not.toContain('Cyd')
    expect(line).not.toMatch(/took the lead/)
  })
})
