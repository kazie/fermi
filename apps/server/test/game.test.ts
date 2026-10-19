import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MIN_PLAYERS, type RoomView, type ServerMessage } from '@fermi/shared'
import { Room, DEADLINE_GRACE_MS, HOST_HANDOVER_MS, quipNames } from '../src/game.ts'
import { getQuestion } from '../src/questions/repo.ts'
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
  get errors() {
    return this.messages.filter((m) => m.type === 'error')
  }
}

function setup(playerCount: number, questions = 6) {
  const db = testDb()
  seed(db, questions)
  const room = new Room('ABCD', { db, lines: testLines, rand: () => 0 })
  const players = Array.from({ length: playerCount }, (_, i) => {
    const id = `player-${i}-xxxxxxxx`
    const conn = new FakeConn()
    room.connect(id, conn)
    room.handle(id, { type: 'join', name: ['Ada', 'Bob', 'Cyd', 'Dee', 'Eve'][i] }, conn)
    return { id, conn }
  })
  // most tests play straight through; the break has its own tests below
  if (players[0]) room.handle(players[0].id, { type: 'settings', rounds: 10, timerSec: 60, breakSec: 0 }, players[0].conn)
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
    expect(players[1].conn.last.settings).toEqual({ rounds: 5, timerSec: 30, breakSec: 0, pacing: 'timer' })
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
    const rv = a.conn.last.reveal!
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
    const rv2 = a.conn.last.reveal!
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
      expect(a.conn.last.reveal!.lines.verdict).toBe('Only 0 answers. I abstain.')
      vi.advanceTimersByTime(a.conn.last.reveal!.timeline.endsAt - Date.now())
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
      vi.advanceTimersByTime(a.conn.last.reveal!.timeline.endsAt - Date.now())
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
      vi.advanceTimersByTime(a.conn.last.reveal!.timeline.endsAt - Date.now())
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
    const players = ['Ada', 'Bob', 'Cyd'].map((name) => {
      const p = { id: `${name}-player-1234`, conn: new FakeConn() }
      room.connect(p.id, p.conn)
      room.handle(p.id, { type: 'join', name }, p.conn)
      return p
    })
    const c = players[0].conn
    room.handle(players[0].id, { type: 'settings', rounds: 5, timerSec: 30, breakSec: 0 }, c)
    room.handle(players[0].id, { type: 'start' }, c)
    const asked: string[] = []
    for (let i = 0; i < 5; i++) {
      asked.push(c.last.round!.question.id)
      for (const p of players) room.handle(p.id, { type: 'lock', text: '1' }, p.conn)
      vi.advanceTimersByTime(c.last.reveal!.timeline.endsAt - Date.now())
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
    expect(late.last.reveal!.cards.map((c) => c.name)).not.toContain('Late')
    vi.advanceTimersByTime(late.last.reveal!.timeline.endsAt - Date.now())
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
    const rv = a.conn.last.reveal!
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
      vi.advanceTimersByTime(a.conn.last.reveal!.timeline.endsAt - Date.now())
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
    vi.advanceTimersByTime(a.conn.last.reveal!.timeline.endsAt - Date.now())
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
      vi.advanceTimersByTime(a.conn.last.reveal!.timeline.endsAt - Date.now())
      if (i === 4) break
      expect(a.conn.last.break).toMatchObject({ line: 'Waiting for Ada.' })
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
    vi.advanceTimersByTime(a.conn.last.reveal!.timeline.endsAt - Date.now())
    room.disconnect(a.id, a.conn)
    vi.advanceTimersByTime(HOST_HANDOVER_MS)
    expect(b.conn.last.break!.line).toBe('Waiting for Bob.')
    room.handle(b.id, { type: 'next' }, b.conn)
    expect(b.conn.last.phase).toBe('question')
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
    let rv = a.conn.last.reveal!
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
    rv = a.conn.last.reveal!
    expect(rv.lines.everyone).toBeUndefined()
    expect(rv.lines.twins).toBeUndefined()
    vi.advanceTimersByTime(rv.timeline.endsAt - Date.now())
    expect(a.conn.last.round!.line).toBe('Bob took the lead from Ada.')

    for (let i = 2; i < 4; i++) {
      vi.advanceTimersByTime(30_000 + DEADLINE_GRACE_MS)
      vi.advanceTimersByTime(a.conn.last.reveal!.timeline.endsAt - Date.now())
    }
    expect(a.conn.last.round!.line).toMatch(/^Last one\. Bob leads, \w+ trails\.$/)
  })

  it('does not say everyone locked in when a disconnected player never answered', () => {
    const { room, players } = setup(3)
    const [a, b, c] = players
    room.handle(a.id, { type: 'start' }, a.conn)
    room.disconnect(c.id, c.conn)
    room.handle(a.id, { type: 'lock', text: '5' }, a.conn)
    room.handle(b.id, { type: 'lock', text: '7' }, b.conn)
    expect(a.conn.last.phase).toBe('reveal') // the connected players were done
    expect(a.conn.last.reveal!.lines.everyone).toBeUndefined()
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

describe('quipNames', () => {
  const p = (name: string, score: number, fromStart = true) => ({ name, score, fromStart })

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
})
