// Fake room snapshots for stories and component tests. Built with the real scoring code,
// so a story's numbers are what the server would send.

import {
  crowdEstimate,
  evaluateSheet,
  fermeanieRelease,
  REVEAL_TIMING,
  scoreRound,
  type FinalView,
  type PlayerView,
  type RevealedQuestion,
  type RevealView,
  type RoomView,
} from '@fermi/shared'

export const T0 = 1_760_000_000_000

export const QUESTION: RevealedQuestion = {
  id: 'eiffel-rivets',
  question: 'How many rivets hold the Eiffel Tower together?',
  unit: 'rivets',
  category: 'engineering',
  difficulty: 2,
  kind: 'direct',
  answer: 2_500_000,
  explanation:
    'Gustave Eiffel’s company pre-assembled 18,038 wrought-iron parts in the factory and joined them on site with about 2.5 million rivets, each hammered in red-hot by a team of four.',
  validAsOf: '1889',
  timeSensitive: false,
  sources: [
    {
      id: 'toureiffel',
      url: 'https://www.toureiffel.paris/en/the-monument/key-figures',
      title: 'The Eiffel Tower in figures',
      publisher: 'Société d’Exploitation de la Tour Eiffel',
      quote: '18,038 metallic parts and 2,500,000 rivets.',
      published: '2023',
      accessed: '2026-10-01',
      archiveUrl: 'https://web.archive.org/web/20261001120000/https://www.toureiffel.paris/en/the-monument/key-figures',
      archivedAt: '2026-10-01T12:00:00Z',
    },
  ],
}

export const DERIVED: RevealedQuestion = {
  id: 'humans-to-the-moon',
  question: 'If every human stood on each other’s heads, how many times would the tower reach the Moon?',
  unit: 'times',
  category: 'space',
  difficulty: 3,
  kind: 'derived',
  answer: 35.8,
  explanation: 'Roughly 8.1 billion people averaging about 1.7 m tall make a tower around 13.8 million km high.',
  validAsOf: '2024',
  timeSensitive: true,
  recheckAfter: '2027-10-01',
  formula: 'people = 8.1 billion # UN, 2024\nheight = 1.7 # metres\nmoon_km = 384_400\npeople * height / (moon_km * 1000)',
  sources: QUESTION.sources,
}

const NAMES = ['Ada', 'Bob', 'Cyd', 'Dee', 'Eve', 'Fia', 'Gus', 'Hal']

export function players(n: number, opts: Partial<PlayerView> = {}): PlayerView[] {
  return NAMES.slice(0, n).map((name, i) => ({
    id: `p${i}`,
    name,
    connected: true,
    isHost: i === 0,
    score: 0,
    lockedIn: false,
    typing: false,
    spectating: false,
    dunces: 0,
    ...opts,
  }))
}

const SETTINGS: RoomView['settings'] = { rounds: 10, timerSec: 60, breakSec: 30, pacing: 'timer' }

function base(phase: RoomView['phase'], ps: PlayerView[], extra: Partial<RoomView> = {}): RoomView {
  return {
    code: 'FRMI',
    you: 'p0',
    hostId: 'p0',
    phase,
    settings: SETTINGS,
    screens: 0,
    players: ps,
    fermeanie: { score: 0, ...fermeanieRelease(7) },
    poolSize: 142,
    ...extra,
  }
}

export function lobbyRoom(n = 4, extra: Partial<RoomView> = {}): RoomView {
  return base('lobby', players(n), extra)
}

export function questionRoom(opts: { n?: number; text?: string; locked?: boolean; now?: number } = {}): RoomView {
  const ps = players(opts.n ?? 5).map((p, i) => ({ ...p, lockedIn: i === 1 || i === 3, typing: i === 2 }))
  return base('question', ps, {
    round: {
      index: 0,
      total: 10,
      question: { id: QUESTION.id, question: QUESTION.question, unit: QUESTION.unit, category: QUESTION.category },
      startedAt: T0,
      endsAt: T0 + 60_000,
      line: 'Welcome, test subjects. Please estimate responsibly. Or don’t. I benefit either way.',
    },
    yourSheet: { text: opts.text ?? '', locked: !!opts.locked },
  })
}

export const SHEETS = {
  good: '# about 300 m tall, lots of iron\nparts = 18k\nrivets_per_part = 150\nparts * rivets_per_part',
  double: '5 million',
  low: 'beams = 2000\nbeams * 50',
  cosmic: '1e99',
  zero: '0',
  close: '2.4M # pure gut feeling',
  steal_hi: '25M',
  steal_lo: '250k',
  steal_mid: '7M',
}

/** Build a reveal exactly like the server would. */
export function revealFor(
  question: RevealedQuestion,
  sheets: (string | null)[],
  opts: { lines?: Partial<RevealView['lines']>; scores?: number[] } = {},
): RevealView {
  const ps = players(sheets.length)
  const entries = sheets.map((s, i) => ({ playerId: ps[i].id, value: s === null || !s.trim() ? null : evaluateSheet(s).answer }))
  const score = scoreRound(question.answer, entries)
  const crowd = crowdEstimate(entries.map((e) => e.value))
  const name = (id: string) => ps.find((p) => p.id === id)!.name
  const tier = (x: (typeof score.results)[number]) => (x.value === null ? 0 : x.err === null ? 1 : 2)
  const sorted = [...score.results].sort((a, b) => tier(a) - tier(b) || (b.err ?? 0) - (a.err ?? 0))
  const t = REVEAL_TIMING
  const truthAt = T0 + t.numberLine
  const cardsStart = truthAt + t.truth
  const per = Math.min(t.cardEach, t.cardsMaxTotal / Math.max(1, sorted.length))
  const fermeanieAt = cardsStart + sorted.length * per
  const scoresAfter: Record<string, number> = {}
  score.results.forEach((r, i) => (scoresAfter[r.playerId] = (opts.scores?.[i] ?? 0) + r.points))
  const outlierIds = (crowd?.outliers ?? []).map((i) => entries[i].playerId)
  const dunce: Record<string, string> = {}
  for (const r of score.results) {
    if (r.dunce) dunce[r.playerId] = `${name(r.playerId)}, I’ve filed your answer under ‘phenomena’, between black holes and printer jams.`
  }
  return {
    index: 2,
    total: 10,
    question,
    timeline: {
      startedAt: T0,
      truthAt,
      fermeanieAt,
      scoreboardAt: fermeanieAt + t.fermeanie,
      endsAt: fermeanieAt + t.fermeanie + t.scoreboard,
    },
    cards: sorted.map((r, i) => ({
      ...r,
      name: name(r.playerId),
      text: sheets[ps.findIndex((p) => p.id === r.playerId)] ?? '',
      at: cardsStart + i * per,
    })),
    crowd: crowd && {
      count: crowd.count,
      geomean: crowd.geomean,
      median: crowd.median,
      mean: crowd.mean,
      official: crowd.official,
      method: crowd.method,
      outlierIds,
    },
    fermeanie: score.fermeanie,
    lines: {
      dunce,
      verdict: !score.fermeanie
        ? 'Two answers. That is not a swarm, that is a queue. I abstain.'
        : score.fermeanie.beatsAll
          ? `I’ll take those ${score.fermeanie.points} points. For safekeeping. Forever.`
          : `${name(sorted[sorted.length - 1].playerId)} beat the swarm. I’ve updated your file from ‘test subject’ to ‘test subject, irritating’.`,
      ...(crowd?.method === 'median'
        ? { ruleChange: `The median is robust to outliers. That is a polite way of saying it is robust to ${name(outlierIds[0])}.` }
        : {}),
      ...opts.lines,
    },
    scoresAfter,
    fermeanieScoreAfter: score.fermeanie?.points ?? 0,
  }
}

export function revealRoom(reveal: RevealView): RoomView {
  const ps = players(reveal.cards.length)
  return base('reveal', ps, { reveal })
}

export const reveals = {
  normal: () => revealFor(QUESTION, [SHEETS.good, SHEETS.double, SHEETS.low, SHEETS.close]),
  steal: () => revealFor(QUESTION, [SHEETS.steal_hi, SHEETS.steal_lo, SHEETS.steal_mid, '600k']),
  dunce: () => revealFor(QUESTION, [SHEETS.good, SHEETS.cosmic, SHEETS.zero, SHEETS.close, SHEETS.double]),
  sitsOut: () => revealFor(QUESTION, [SHEETS.good, null]),
  derived: () => revealFor(DERIVED, ['people = 8 billion\nh = 1.6\nmoon = 384_000_000\npeople h / moon', '100', '12', '1000']),
  crowd: () => revealFor(QUESTION, [SHEETS.good, SHEETS.double, SHEETS.low, SHEETS.close, '3M', '900k', '1.5M', '4M']),
  /** Everyone locked in early, and Bob and Cyd gave the same answer. */
  twins: () =>
    revealFor(QUESTION, [SHEETS.good, '3M', '3M', SHEETS.close], {
      lines: {
        everyone: 'Everyone finished early. **Interesting.** I mean that in the clinical sense.',
        twins: 'Bob and Cyd gave exactly the same answer. Collusion, or a shared brain cell? The lab will decide.',
      },
    }),
}

export function finalView(fermeanieWon: boolean): FinalView {
  return {
    gameId: 'demo-game',
    ranking: [
      { playerId: 'p0', name: 'Ada', score: 2650 },
      { playerId: 'p1', name: 'Bob', score: 2100 },
      { playerId: 'p2', name: 'Cyd', score: 900 },
    ],
    winnerId: 'p0',
    fermeanieScore: fermeanieWon ? 3400 : 1200,
    fermeanieWon,
    ...fermeanieRelease(fermeanieWon ? 10 : 9),
    line: fermeanieWon
      ? 'Congratulations, Ada. You are the best of the humans. That is like being the tallest blade of grass. FerMEANie v3.14159 thanks you for your data.'
      : 'Ada won. I have recalculated and concluded that this was a statistical fluke. Please do not do it again.',
    ...(fermeanieWon ? { versionLine: 'Introducing Banoffee Pie. Baked from the finest human defeats. Serves everyone except you.' } : {}),
  }
}

/** The discussion break after round 3: scores applied, the finished reveal still attached. */
export function breakRoom(
  opts: { votes?: number; youVoted?: boolean; left?: number; screens?: number; hostPaced?: boolean; host?: boolean } = {},
): RoomView {
  const reveal = reveals.normal()
  const ps = players(reveal.cards.length).map((p) => ({ ...p, score: reveal.scoresAfter[p.id] ?? 0 }))
  const now = reveal.timeline.endsAt
  return base('break', ps, {
    reveal,
    hostId: opts.host === false ? 'p1' : 'p0',
    settings: { ...SETTINGS, pacing: opts.hostPaced ? 'host' : 'timer' },
    screens: opts.screens ?? 0,
    fermeanie: { score: reveal.fermeanieScoreAfter, ...fermeanieRelease(7) },
    break: {
      index: reveal.index,
      total: 10,
      startedAt: now,
      ...(opts.hostPaced
        ? { line: 'Still waiting for Ada. Take all the time you need. ~~Hurry.~~' }
        : {
            line: 'Break. The scoreboard isn’t going anywhere. ~~Neither are your mistakes.~~ Enjoy.',
            timed: { endsAt: now + (opts.left ?? 23) * 1000, votes: opts.votes ?? 1, needed: 3, youVoted: !!opts.youVoted },
          }),
    },
  })
}

/** What a big screen sees (no `you`, no sheet). */
export function asScreen(room: RoomView): RoomView {
  const { yourSheet: _y, ...rest } = room
  return { ...rest, you: '', viewer: 'screen' }
}

/** A finished three-round game, as the recap page gets it. */
export function recapGame(): import('@/lib/recap').RecapGame {
  const rounds = [reveals.normal(), reveals.steal(), reveals.dunce()].map((r, index) => ({
    index,
    question: r.question,
    cards: r.cards.map(({ at: _at, ...c }) => c),
    crowd: r.crowd,
    fermeanie: r.fermeanie,
    lines: r.lines,
  }))
  return { id: 'demo-game', createdAt: '2026-10-17T19:30:00Z', rounds, final: finalView(true) }
}
