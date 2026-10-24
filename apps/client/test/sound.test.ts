import { describe, expect, it } from 'vitest'
import type { RoomView } from '@fermi/shared'
import { audible, cuesBetween, reactionCues, soundRoute } from '../src/lib/sound'
import { asScreen, introRoom, questionRoom, reveals, revealRoom, T0 } from '../src/fixtures/rooms'

const cues = (prev: RoomView | null, room: RoomView, from: number, now: number) => cuesBetween(prev, room, from, now).map((e) => e.cue)

describe('sound routing', () => {
  it('online, every device plays everything; at a party the big screen does, and phones only their own moments', () => {
    const phone = questionRoom()
    expect(soundRoute(phone)).toBe('all')
    expect(soundRoute({ ...phone, screens: 1 })).toBe('personal')
    expect(soundRoute(asScreen({ ...phone, screens: 1 }))).toBe('all')
    const events = [
      { cue: 'tick' as const, n: 3 },
      { cue: 'youLocked' as const, personal: true },
    ]
    expect(audible(events, 'all')).toEqual(events)
    expect(audible(events, 'personal')).toEqual([events[1]])
  })
})

describe('cues', () => {
  it('a question: its chime, a buzz at ten seconds left, the last five seconds tick, then time is up', () => {
    const room = questionRoom()
    const { startedAt, endsAt } = room.round!
    expect(cues(room, room, startedAt - 100, startedAt + 100)).toEqual(['question'])
    expect(cues(room, room, endsAt - 10_100, endsAt - 9_900)).toEqual(['tenLeft'])
    expect(cues(room, room, endsAt - 5_100, endsAt - 4_900)).toEqual(['tick'])
    expect(cuesBetween(room, room, endsAt - 1_100, endsAt - 900)).toEqual([{ cue: 'tick', n: 1 }])
    expect(cues(room, room, endsAt - 100, endsAt + 100)).toEqual(['timesUp'])
    expect(cues(room, room, startedAt + 1000, startedAt + 2000)).toEqual([])
  })

  it('skips moments the clock passed long ago: no burst after a reconnect', () => {
    const room = questionRoom()
    const { endsAt } = room.round!
    expect(cues(null, room, T0 - 60_000, endsAt + 500)).toEqual(['timesUp'])
  })

  it('someone locking in, and you locking in, fire as the snapshot arrives', () => {
    const before = questionRoom()
    const others = { ...before, players: before.players.map((p, i) => (i === 2 ? { ...p, lockedIn: true } : p)) }
    expect(cues(before, others, T0 + 5000, T0 + 5000)).toEqual(['lock'])
    const mine = { ...before, yourSheet: { text: '5', locked: true } }
    expect(cuesBetween(before, mine, T0 + 5000, T0 + 5000)).toEqual([{ cue: 'youLocked', personal: true }])
  })

  it('a reveal: the truth lands, each card flips (yours too), then the swarm steals', () => {
    const rv = reveals.steal()
    const room = { ...revealRoom(rv), you: rv.cards[1].playerId }
    expect(cues(room, room, rv.timeline.truthAt - 1, rv.timeline.truthAt)).toEqual(['truth'])
    expect(cues(room, room, rv.cards[1].at - 1, rv.cards[1].at)).toEqual(['flip', 'yourCard'])
    expect(cues(room, room, rv.timeline.fermeanieAt - 1, rv.timeline.fermeanieAt)).toEqual(['steal'])
  })

  it('the intro: a sting, then the roll call, with your own turn marked for your phone', () => {
    const room = introRoom()
    const steps = room.intro!.steps
    expect(cues(room, room, T0 - 1, T0)).toEqual(['intro'])
    expect(cuesBetween(room, room, steps[1].at - 1, steps[1].at)).toEqual([{ cue: 'rollCall' }, { cue: 'yourTurn', personal: true }])
    expect(cues(room, room, steps[2].at - 1, steps[2].at)).toEqual(['rollCall'])
  })
})

describe('reaction sounds', () => {
  const hear = (route: 'all' | 'personal', events: [string, number][]) => {
    const heard = { last: -Infinity }
    return events.map(([playerId, t]) => audible(reactionCues({ playerId, emoji: '👏' }, 'me', t, heard), route).map((e) => e.cue))
  }

  it("plays each emoji's own sound where everything plays, plus a click for your own; a phone at a party only the click", () => {
    expect(
      hear('all', [
        ['ann', 0],
        ['me', 500],
      ]),
    ).toEqual([['reaction'], ['reaction', 'youReacted']])
    expect(
      hear('personal', [
        ['ann', 0],
        ['me', 500],
      ]),
    ).toEqual([[], ['youReacted']])
  })

  it("doesn't stack a burst, but your own tap is always heard", () => {
    const heard = hear('all', [
      ['ann', 0],
      ['bob', 30],
      ['me', 40],
      ['bob', 200],
    ])
    expect(heard.map((cues) => cues.length > 0)).toEqual([true, false, true, true])
  })
})
