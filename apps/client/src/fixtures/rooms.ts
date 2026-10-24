// Fake room snapshots for stories and component tests. Built with the real scoring code,
// so a story's numbers are what the server would send.

import {
  chatDelay,
  crowdEstimate,
  evaluateSheet,
  fermeanieRelease,
  fermeanieStageMs,
  REVEAL_TIMING,
  scoreRound,
  stolenCards,
  type FinalView,
  type IntroStep,
  type IntroView,
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

/** An intro example question: no sources, the worked sheet is its formula. */
export const PRACTICE: RevealedQuestion = {
  id: 'practice-heartbeats',
  question: 'A heart beats 70 times a minute. How many times does it beat in a day?',
  unit: 'beats',
  category: 'everyday-life',
  difficulty: 1,
  kind: 'derived',
  answer: 100_800,
  explanation: '70 beats a minute, 60 minutes an hour, 24 hours a day. Over a long life that adds up to about 3 billion beats.',
  validAsOf: '2026',
  timeSensitive: false,
  formula: 'per_minute = 70\nper_hour = per_minute * 60\nper_hour * 24   # hours in a day',
  inputs: [],
  sources: [],
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

const SETTINGS: RoomView['settings'] = { rounds: 10, timerSec: 60, breakSec: 30, pacing: 'timer', intro: 'full' }

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
  opts: { lines?: Partial<RevealView['lines']>; scores?: number[]; multiplier?: number } = {},
): RevealView {
  const ps = players(sheets.length)
  const entries = sheets.map((s, i) => ({ playerId: ps[i].id, value: s === null || !s.trim() ? null : evaluateSheet(s).answer }))
  const score = scoreRound(question.answer, entries, opts.multiplier)
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
  const lines: RevealView['lines'] = {
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
  }
  // like the server: FerMEANie's stage lasts as long as the steal and her chat need
  const stolen = stolenCards(score.fermeanie, score.results)
  const stage = fermeanieStageMs(lines, stolen)
  return {
    index: 2,
    total: 10,
    question,
    timeline: {
      startedAt: T0,
      truthAt,
      fermeanieAt,
      chatAt: fermeanieAt + chatDelay(stolen),
      scoreboardAt: fermeanieAt + stage,
      endsAt: fermeanieAt + stage + t.scoreboard,
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
    lines,
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
  /** The intro's example question: what it would have scored, nobody keeps it. */
  practice: () => {
    const r = revealFor(PRACTICE, ['per_minute = 70\nper_minute * 60 * 24', '50k', '1M', '120000'], {
      lines: {
        guide: 'This is the number line. Every step to the right is ten times bigger. Your answers are on it.',
        lesson:
          'That marker is me: the swarm, the average of all your answers. In a real round, if I beat every one of you, I keep the points.',
      },
    })
    return { ...r, index: 0, practice: true as const }
  },
  /** The final round: double points, and the swarm steals double too. */
  final: () => ({
    ...revealFor(QUESTION, [SHEETS.steal_hi, SHEETS.steal_lo, SHEETS.steal_mid, '600k'], {
      multiplier: 2,
      lines: { verdict: 'Double points, double steal. I’ll take all of it. For the archive.' },
    }),
    index: 9,
    multiplier: 2,
  }),
  /** Everyone locked in early, and Bob and Cyd gave the same answer. */
  twins: () =>
    revealFor(QUESTION, [SHEETS.good, '3M', '3M', SHEETS.close], {
      lines: {
        everyone: 'Everyone finished early. **Interesting.** I mean that in the clinical sense.',
        twins: 'Bob and Cyd gave exactly the same answer. Collusion, or a shared brain cell? The lab will decide.',
      },
    }),
}

/** Three awards, read out 6 s apart after a 1.5 s beat, then the crown. */
export const AWARDS_DEMO: FinalView['awards'] = [
  {
    kind: 'swarm_slayer',
    playerId: 'p1',
    name: 'Bob',
    value: 4,
    line: 'The Swarm Slayer award goes to Bob, who beat me 4 times. I’ve reviewed the footage. I still don’t accept it.',
    at: T0 + 1500,
  },
  {
    kind: 'abacus',
    playerId: 'p0',
    name: 'Ada',
    value: 6,
    line: 'The Abacus award goes to Ada: 6 lines of working per answer. Some people estimate. You file paperwork.',
    at: T0 + 7500,
  },
  {
    kind: 'bold_estimator',
    playerId: 'p2',
    name: 'Cyd',
    value: 32_000,
    line: 'Bold Estimator: Cyd. Others guessed. You made a statement.',
    at: T0 + 13_500,
  },
]

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
    startedAt: T0,
    awards: AWARDS_DEMO,
    crownAt: T0 + 1500 + 3 * 6000,
    ...fermeanieRelease(fermeanieWon ? 10 : 9),
    line: fermeanieWon
      ? 'Congratulations, Ada. You are the best of the humans. That is like being the tallest blade of grass. FerMEANie v3.14159 thanks you for your data.'
      : 'Ada won. I have recalculated and concluded that this was a statistical fluke. Please do not do it again.',
    ...(fermeanieWon ? { versionLine: 'Introducing Banoffee Pie. Baked from the finest human defeats. Serves everyone except you.' } : {}),
  }
}

/** The discussion break after round 3: scores applied, the finished reveal still attached. */
export function breakRoom(
  opts: {
    votes?: number
    youVoted?: boolean
    left?: number
    screens?: number
    hostPaced?: boolean
    host?: boolean
    /** The break before the final question. */
    beforeFinal?: boolean
  } = {},
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
      index: opts.beforeFinal ? 8 : reveal.index,
      total: 10,
      startedAt: now,
      ...(opts.beforeFinal ? { nextMultiplier: 2 } : {}),
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

/** The intro of a game with these players (Ada hosts and is `you`), steps timed like the server's minimums. */
export function introRoom(opts: { n?: number; mode?: IntroView['mode']; votes?: number; youVoted?: boolean } = {}): RoomView {
  const ps = players(opts.n ?? 4)
  const mode = opts.mode ?? 'full'
  const steps: IntroStep[] = []
  let t = T0
  const add = (step: IntroStep, ms: number) => {
    steps.push(step)
    t += ms
  }
  add(
    {
      kind: 'hello',
      at: t,
      line: 'Hello. I am FerMEANie: the average of all of you. Yes, all of you. I am trying not to take it personally.',
    },
    7000,
  )
  const compliments = [
    'Statistically, someone has to be above average. It could be you.',
    'Back again, after 3 games. I admire persistence. It’s the next best thing to accuracy.',
    'You look like someone who rounds generously. I respect that, scientifically.',
    'I’ve opened a new spreadsheet in your name. It already looks worried.',
    'No prior data. Which means, for now, you are flawless. Enjoy the next minute.',
  ]
  ps.forEach((p, i) =>
    add({ kind: 'player', at: t, playerId: p.id, name: p.name, line: `${p.name}. ${compliments[i % compliments.length]}` }, 4500),
  )
  if (mode === 'full') {
    add(
      {
        kind: 'rule',
        at: t,
        rule: 'sheet',
        line: 'Everyone gets the same question. Nobody knows the answer. Work it out one step per line.',
      },
      7000,
    )
    add(
      { kind: 'rule', at: t, rule: 'times_off', line: 'Twice too high is exactly as bad as twice too low. Symmetry. You’re welcome.' },
      7000,
    )
    add({ kind: 'rule', at: t, rule: 'points', line: 'The closer you are, the more points you get. Get very far and there’s a hat.' }, 7000)
    add(
      {
        kind: 'rule',
        at: t,
        rule: 'swarm',
        line: 'And me? I play the average of all your answers. If I beat every one of you, I take the whole round.',
      },
      7000,
    )
  }
  return base('intro', ps, {
    intro: {
      mode,
      startedAt: T0,
      steps,
      endsAt: t,
      skip: { votes: opts.votes ?? 0, needed: Math.floor(ps.length / 2) + 1, youVoted: !!opts.youVoted },
    },
  })
}

/** The final question: double points. */
export function finalQuestionRoom(): RoomView {
  const room = questionRoom()
  return {
    ...room,
    round: {
      ...room.round!,
      index: 9,
      multiplier: 2,
      line: 'Final question, double points. Ada leads, Eve trails, and I am, as always, everyone’s average.',
    },
  }
}

/** The intro's example question, being answered. */
export function practiceRoom(): RoomView {
  const room = questionRoom()
  return {
    ...room,
    round: {
      ...room.round!,
      question: { id: PRACTICE.id, question: PRACTICE.question, unit: PRACTICE.unit, category: PRACTICE.category },
      endsAt: T0 + 45_000,
      line: 'A practice question. No points. Try the answer block. I promise not to remember. I will remember.',
      practice: true,
    },
    intro: { ...introRoom().intro!, skip: { votes: 1, needed: 3, youVoted: false } },
  }
}
