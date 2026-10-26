import { describe, expect, it } from 'vitest'
import { AWARD_VALUES, AWARDS, awardWinners, pickAwards, workingLines, type AwardEntry, type AwardRound } from '../src/index.ts'
import { LINE_VARIABLES } from '../src/lines.ts'

const card = (playerId: string, err: number | null, extra: Partial<AwardEntry> = {}): AwardEntry => ({
  playerId,
  err,
  direction: err === null ? null : 'high',
  bonusKind: err !== null && err < 0.04 ? 'bullseye' : null,
  text: '1',
  lockMs: 30_000,
  ...extra,
})
const round = (cards: AwardEntry[], swarm: number | null = 0.5): AwardRound => ({
  cards,
  fermeanie: swarm === null ? null : { err: swarm },
})
const kinds = (rounds: AwardRound[]) => Object.fromEntries(awardWinners(rounds).map((a) => [a.kind, a.playerId]))

describe('awards', () => {
  it('counts lines of working, not blank lines or comments', () => {
    expect(workingLines('a = 5\n\n# just a thought\nb = a * 2 # double\nb')).toBe(3)
  })

  it('Swarm Slayer: beat the swarm most often; Bullseye: most answers within 10%', () => {
    const rounds = [
      round([card('ada', 0.1), card('bob', 0.9), card('cyd', 0.02)]),
      round([card('ada', 0.2), card('bob', 0.8), card('cyd', 0.7)]),
      round([card('ada', 0.3), card('bob', 0.6), card('cyd', 0.6)], null), // no swarm this round
    ]
    expect(kinds(rounds)).toMatchObject({ swarm_slayer: 'ada', bullseye: 'cyd' })
  })

  it('a tie means nobody gets it', () => {
    const rounds = [round([card('ada', 0.1), card('bob', 0.1), card('cyd', 0.9)])]
    expect(kinds(rounds).swarm_slayer).toBeUndefined()
  })

  it('Steady Hand: lowest average, only for those who answered at least half the game', () => {
    const rounds = [
      round([card('ada', 0.3), card('bob', 0.01), card('cyd', 0.2)]),
      round([card('ada', 0.3), card('bob', null), card('cyd', 0.3)]),
      round([card('ada', 0.3), card('bob', null), card('cyd', 0.2)]),
    ]
    const steady = awardWinners(rounds).find((a) => a.kind === 'steady_hand')!
    expect(steady.playerId).toBe('cyd') // Bob's one great answer isn't enough
    expect(steady.value).toBeCloseTo(10 ** (0.7 / 3))
  })

  it('The Abacus, Gut Feeling, Contrarian and Bold Estimator', () => {
    const long = 'a = 1\nb = 2\nc = a + b\nc * 2'
    const rounds = [0, 1].map(() =>
      round([
        card('ada', 0.2, { text: long, direction: 'high' }),
        card('bob', 0.3, { lockMs: 4000, direction: 'high' }),
        card('cyd', 2.5, { direction: 'low' }),
      ]),
    )
    expect(kinds(rounds)).toMatchObject({ abacus: 'ada', gut_feeling: 'bob', contrarian: 'cyd', bold_estimator: 'cyd' })
    expect(awardWinners(rounds).find((a) => a.kind === 'gut_feeling')!.value).toBe(4)
    expect(awardWinners(rounds).find((a) => a.kind === 'bold_estimator')!.value).toBeCloseTo(10 ** 2.5)
  })

  it('Last Minute and Swarm Twin', () => {
    const rounds = [0, 1].map(() => ({
      cards: [
        card('ada', 0.2, { lockMs: 50_000, value: 900 }),
        card('bob', 0.3, { lockMs: 10_000, value: 5000 }),
        card('cyd', 0.4, { lockMs: 20_000, value: 100 }),
      ],
      fermeanie: { err: 0.1, value: 1000 },
    }))
    const w = Object.fromEntries(awardWinners(rounds).map((a) => [a.kind, a]))
    expect(w.last_minute).toMatchObject({ playerId: 'ada', value: 50 })
    expect(w.gut_feeling.playerId).toBe('bob')
    expect(w.swarm_twin.playerId).toBe('ada')
    expect(w.swarm_twin.value).toBeCloseTo(10 / 9)
  })

  it('Comeback: from last place mid-game to first at the end', () => {
    const pts = [
      [100, 300, 200],
      [100, 300, 200],
      [900, 100, 100],
      [900, 100, 100],
    ]
    const totals = [0, 0, 0]
    const rounds = pts.map((p) => {
      p.forEach((x, i) => (totals[i] += x))
      return { ...round(['ada', 'bob', 'cyd'].map((id) => card(id, 0.5))), scoresAfter: { ada: totals[0], bob: totals[1], cyd: totals[2] } }
    })
    const comeback = awardWinners(rounds).find((a) => a.kind === 'comeback')!
    expect(comeback).toMatchObject({ playerId: 'ada', value: 2 })
  })

  it('Optimist, Pessimist, One-Liner, Round Numbers, Near Miss and Swarm Donor', () => {
    const rounds = [0, 1, 2].map(() =>
      round([
        card('ada', 0.2, { direction: 'high', value: 5000, text: 'a = 2\nb = 3\na * b' }),
        card('bob', 0.25, { direction: 'low', value: 2_000_000, text: '2M', bonusKind: 'close', stolen: 300 }),
        card('cyd', 0.6, { direction: 'low', value: 1234, text: 'x = 1\ny = 2\nx + y', stolen: 100 }),
      ]),
    )
    const w = kinds(rounds)
    expect(w).toMatchObject({ optimist: 'ada', one_liner: 'bob', near_miss: 'bob', swarm_donor: 'bob' })
    expect(w.pessimist).toBeUndefined() // Bob and Cyd tie on three
    expect(w.round_numbers).toBeUndefined() // Ada and Bob tie on round numbers
  })

  it('Late Bloomer: at least twice as close in the second half', () => {
    const errs = [
      [1.5, 0.5],
      [1.4, 0.5],
      [0.2, 0.5],
      [0.1, 0.5],
    ]
    const rounds = errs.map(([a, b]) => round([card('ada', a), card('bob', b)]))
    const bloom = awardWinners(rounds).find((x) => x.kind === 'late_bloomer')!
    expect(bloom.playerId).toBe('ada')
    expect(bloom.value).toBeCloseTo(10 ** 1.3)
  })

  it('puts the awards from the previous game last, so a group playing again hears different ones', () => {
    const long = 'a = 1\nb = 2\nc = a + b\nc * 2'
    const rounds = [0, 1].map(() =>
      round([
        card('ada', 0.02, { text: long }),
        card('bob', 0.3, { lockMs: 4000 }),
        card('cyd', 2.5, { direction: 'low' }),
        card('dee', 0.4),
      ]),
    )
    const first = pickAwards(rounds, 'game-1')
    const again = pickAwards(
      rounds,
      'game-1',
      3,
      first.map((a) => a.kind),
    )
    const all = awardWinners(rounds).length
    if (all > first.length) expect(again.map((a) => a.kind)).not.toEqual(first.map((a) => a.kind))
  })

  it('decides on exact averages, not the rounded numbers shown', () => {
    const rounds = [
      round([card('ada', 0.1, { lockMs: 6600 }), card('bob', 0.2, { lockMs: 7200 })]),
      round([card('ada', 0.1, { lockMs: 6600 }), card('bob', 0.2, { lockMs: 7200 })]),
    ]
    expect(awardWinners(rounds).find((a) => a.kind === 'gut_feeling')).toMatchObject({ playerId: 'ada', value: 7 })
  })

  it('Near Miss is never quite a bullseye: a player with one does not qualify', () => {
    const rounds = [0, 1, 2].map((i) =>
      round([card('ada', 0.2, { bonusKind: i ? 'close' : 'bullseye' }), card('bob', 0.25, { bonusKind: i < 2 ? 'close' : null })]),
    )
    expect(kinds(rounds).near_miss).toBe('bob')
  })

  it('Hindsight: the most right calls on higher or lower, at least three', () => {
    const rounds = [0, 1, 2, 3].map(() => ({
      ...round([card('ada', 0.3, { direction: 'high' }), card('bob', 0.3, { direction: 'low' })]),
      calls: { ada: 'lower' as const, bob: 'lower' as const },
    }))
    expect(awardWinners(rounds).find((a) => a.kind === 'hindsight')).toMatchObject({ playerId: 'ada', value: 4 })
  })

  it('never goes to a player who left: the best of those who stayed gets it instead', () => {
    const rounds = [
      round([card('ada', 0.02), card('bob', 0.02), card('cyd', 0.01)]),
      round([card('ada', 0.03), card('bob', 0.5), card('cyd', 0.02)]),
      round([card('ada', 0.5), card('bob', 0.5), card('cyd', 0.02)]),
    ]
    expect(kinds(rounds).bullseye).toBe('cyd')
    const stayed = Object.fromEntries(awardWinners(rounds, new Set(['cyd'])).map((a) => [a.kind, a.playerId]))
    expect(stayed.bullseye).toBe('ada') // not dropped because the one who left had more
    // a tie with a player who left is no tie
    const tied = [round([card('ada', 0.02), card('cyd', 0.02), card('bob', 0.9)])]
    expect(kinds(tied).bullseye).toBeUndefined()
    expect(Object.fromEntries(awardWinners(tied, new Set(['cyd'])).map((a) => [a.kind, a.playerId])).bullseye).toBe('ada')
  })

  it('every award has its line category, with its number as the variable', () => {
    for (const kind of AWARDS) expect(LINE_VARIABLES[`award.${kind}`], kind).toEqual(['name', AWARD_VALUES[kind]])
  })

  it('gives at most three, each to a different player, the same every time for a game', () => {
    const long = 'a = 1\nb = 2\nc = a + b\nc * 2'
    const rounds = [0, 1].map(() =>
      round([
        card('ada', 0.02, { text: long }),
        card('bob', 0.3, { lockMs: 4000 }),
        card('cyd', 2.5, { direction: 'low' }),
        card('dee', 0.4),
      ]),
    )
    const picked = pickAwards(rounds, 'game-1')
    expect(picked.length).toBeLessThanOrEqual(3)
    expect(new Set(picked.map((a) => a.playerId)).size).toBe(picked.length)
    expect(pickAwards(rounds, 'game-1')).toEqual(picked)
  })
})
