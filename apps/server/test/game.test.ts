import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RoomView, ServerMessage } from '@fermi/shared'
import { Room, DEADLINE_GRACE_MS, HOST_HANDOVER_MS } from '../src/game.ts'
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
    expect(players[1].conn.last.settings).toEqual({ rounds: 5, timerSec: 30, breakSec: 0 })
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
    const { room, players } = setup(1, 0)
    room.handle(players[0].id, { type: 'start' }, players[0].conn)
    expect(players[0].conn.errors.at(-1)).toMatchObject({ message: /no questions/ })
  })

  it('plays a full game: answers hidden until reveal, dunce caps, median switch, steal, final', () => {
    const { db, room, players, answerOf } = setup(4)
    const [a, b, c, d] = players
    room.handle(a.id, { type: 'settings', rounds: 5, timerSec: 60 }, a.conn)
    room.handle(a.id, { type: 'start' }, a.conn)
    expect(a.conn.last.phase).toBe('question')
    expect(a.conn.last.introLine).toBe('Welcome, 4 specimens.')
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

  it('FerMEANie version grows when it wins', () => {
    const { db, room, players, answerOf } = setup(3)
    const [a, b, c] = players
    room.handle(a.id, { type: 'settings', rounds: 5, timerSec: 30 }, a.conn)
    room.handle(a.id, { type: 'start' }, a.conn)
    for (let i = 0; i < 5; i++) {
      const t = answerOf()
      room.handle(a.id, { type: 'lock', text: `${t} * 10` }, a.conn)
      room.handle(b.id, { type: 'lock', text: `${t} / 10` }, b.conn)
      room.handle(c.id, { type: 'lock', text: `${t} * 4` }, c.conn)
      vi.advanceTimersByTime(a.conn.last.reveal!.timeline.endsAt - Date.now())
    }
    const final = a.conn.last.final!
    expect(final.fermeanieWon).toBe(true)
    expect(final.oldVersion).toBe('v3.14')
    expect(final.version).toBe('v3.141')
    expect(final.versionLine).toBe('v3.14 → v3.141.')
    expect(a.conn.last.fermeanie.version).toBe('v3.141')
    expect((db.prepare('SELECT wins FROM fermeanie').get() as { wins: number }).wins).toBe(1)
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
    const c = new FakeConn()
    room.connect('only-player-1234', c)
    room.handle('only-player-1234', { type: 'join', name: 'Solo' }, c)
    room.handle('only-player-1234', { type: 'settings', rounds: 5, timerSec: 30, breakSec: 0 }, c)
    room.handle('only-player-1234', { type: 'start' }, c)
    const asked: string[] = []
    for (let i = 0; i < 5; i++) {
      asked.push(c.last.round!.question.id)
      room.handle('only-player-1234', { type: 'lock', text: '1' }, c)
      vi.advanceTimersByTime(c.last.reveal!.timeline.endsAt - Date.now())
    }
    expect(asked.filter((id) => id.startsWith('tmpl-')).length).toBeLessThanOrEqual(1)
  })

  it('mid-round joiners spectate until the next round', () => {
    const { room, players } = setup(2)
    const [a] = players
    room.handle(a.id, { type: 'start' }, a.conn)
    const late = new FakeConn()
    room.connect('late-player-123', late)
    room.handle('late-player-123', { type: 'join', name: 'Late' }, late)
    expect(late.last.players.find((p) => p.name === 'Late')!.spectating).toBe(true)
    expect(late.last.yourSheet).toBeUndefined()
    room.handle('late-player-123', { type: 'lock', text: '5' }, late) // ignored
    room.handle(players[0].id, { type: 'lock', text: '5' }, players[0].conn)
    room.handle(players[1].id, { type: 'lock', text: '6' }, players[1].conn)
    expect(late.last.reveal!.cards.map((c) => c.name)).not.toContain('Late')
    vi.advanceTimersByTime(late.last.reveal!.timeline.endsAt - Date.now())
    expect(late.last.players.find((p) => p.name === 'Late')!.spectating).toBe(false)
    expect(late.last.yourSheet).toEqual({ text: '', locked: false })
  })

  it('restores your sheet on reconnect and hands over host after a timeout', () => {
    const { room, players } = setup(2)
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
    const { room, players } = setup(2)
    const [a, b] = players
    room.handle(a.id, { type: 'start' }, a.conn)
    room.handle(a.id, { type: 'lock', text: '42' }, a.conn)
    expect(a.conn.last.phase).toBe('question')
    room.disconnect(b.id, b.conn)
    expect(a.conn.last.phase).toBe('reveal')
  })

  it('unlock lets you edit again', () => {
    const { room, players } = setup(2)
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
    expect(v.break).toMatchObject({ index: 0, total: 5, votes: 0, needed: 2, youVoted: false })
    expect(v.players.find((p) => p.id === a.id)!.score).toBe(rv.scoresAfter[a.id]) // scores already applied
    room.handle(a.id, { type: 'skip_break' }, a.conn)
    room.handle(a.id, { type: 'skip_break' }, a.conn) // a second vote from the same player doesn't count
    expect(b.conn.last.break).toMatchObject({ votes: 1, youVoted: false })
    expect(a.conn.last.break!.youVoted).toBe(true)
    room.handle(b.id, { type: 'skip_break' }, b.conn)
    expect(c.conn.last.phase).toBe('question')
    expect(c.conn.last.round!.index).toBe(1)
  })

  it('the break ends by itself when the countdown runs out, and never follows the last round', () => {
    const { room, players } = setup(2)
    const [a, b] = players
    room.handle(a.id, { type: 'settings', rounds: 5, timerSec: 30, breakSec: 15 }, a.conn)
    room.handle(a.id, { type: 'start' }, a.conn)
    for (let i = 0; i < 5; i++) {
      room.handle(a.id, { type: 'lock', text: '5' }, a.conn)
      room.handle(b.id, { type: 'lock', text: '6' }, b.conn)
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
    expect(a.conn.last.break!.needed).toBe(2)
    room.handle(b.id, { type: 'skip_break' }, b.conn)
    expect(a.conn.last.phase).toBe('question')
  })

  it('a big screen watches but never plays or sees any sheet', () => {
    const { room, players } = setup(2)
    const [a, b] = players
    const tv = new FakeConn()
    room.connectScreen(tv)
    expect(a.conn.last.screens).toBe(1)
    expect(tv.last).toMatchObject({ viewer: 'screen', you: '' })
    expect(tv.last.players).toHaveLength(2)
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
