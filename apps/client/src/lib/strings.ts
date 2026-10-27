import { formatFactor, MIN_PLAYERS, type AwardKind, type IntroMode, type Reaction, type Rule, type RoomSettings } from '@fermi/shared'

// All user-facing copy in one place, so a translation can slot in later.
/** Words used in more than one string below. */
const HIGHER = 'Higher'
const LOWER = 'Lower'
const HINDSIGHT = 'Hindsight'

export const S = {
  appName: 'Fermi',
  botName: 'FerMEANie',
  botBackronym: 'Flawlessly Expected Result Machine: Everyone’s Average, Not Individually Excellent',
  tagline: 'Napkin maths, a stopwatch, and a smug robot that thinks it is smarter than all of you combined.',
  hostGame: 'Host a game',
  hostScreen: 'Host on a big screen',
  hostScreenHint: 'A TV or laptop shows the game; everyone plays on their phones.',
  hostGameHint: 'You play and host from this device.',
  breakLabel: 'Break between rounds',
  skipBreak: 'Skip break',
  nextQuestion: 'Next question',
  nextWhenYouAre: 'Tap Next when everyone’s ready.',
  nextWhenHostIs: (host: string) => `Next question when ${host} is ready.`,
  waitingForName: (name: string) => `Waiting for ${name}…`,
  theHost: 'the host',
  pacing: 'Pacing',
  pacingTimer: 'Timed breaks',
  pacingHost: 'Host taps Next',
  /** What happens between rounds, as a sentence (lobby) or a short status (big screen). */
  betweenRounds: ({ pacing, breakSec }: RoomSettings) =>
    pacing === 'host'
      ? 'After each round, everyone talks it over until the host taps Next.'
      : breakSec
        ? 'Between rounds there’s a break to talk; a majority can skip it.'
        : 'No breaks: once it starts, it runs.',
  betweenRoundsShort: ({ pacing, breakSec }: RoomSettings) =>
    pacing === 'host' ? 'the host taps Next between rounds' : breakSec ? `${breakSec} s breaks` : 'no breaks',
  intro: 'Intro',
  introLabel: { full: 'Full', short: 'Short', off: 'Off' } satisfies Record<IntroMode, string>,
  /** What the intro setting does, as a sentence (lobby) or a short status (big screen). */
  introHint: (mode: IntroMode) =>
    mode === 'full'
      ? 'FerMEANie introduces herself and everyone, explains the rules and plays a practice question.'
      : mode === 'short'
        ? 'FerMEANie says hello and introduces everyone, then it starts.'
        : 'No intro: straight to the first question.',
  introShort: (mode: IntroMode) => (mode === 'full' ? 'full intro' : mode === 'short' ? 'short intro' : 'no intro'),
  skipIntro: 'Skip intro',
  skipIntroVotes: (votes: number, needed: number) => `${votes} of ${needed} want to skip the intro`,
  thatsYou: 'That’s you!',
  meetPlayers: 'Meet the test subjects',
  practice: 'Practice question · no points',
  doublePoints: (m: number) => (m === 2 ? 'Double points' : `${m}× points`),
  /** Titles over a round's scores; a final round that counted double says so. */
  scoresAfter: (index: number, multiplier?: number) =>
    `Scores after round ${index + 1}${multiplier && multiplier > 1 ? ` (${multiplier}× points)` : ''}`,
  afterRound: (index: number, multiplier?: number) =>
    `After round ${index + 1}${multiplier && multiplier > 1 ? ` · ${multiplier}× points` : ''}`,
  nextIsFinal: 'Next: the final question',
  firstRealIn: (s: number) => `First real question in ${s}s…`,
  /** The intro's rule slides: a title and the short version of what she says. */
  rules: {
    sheet: {
      title: 'Work it out',
      text: 'Everyone gets the same question. Break it into steps, one per line. The last line is your answer, and everyone sees your working at the end.',
    },
    times_off: {
      title: 'Times off',
      text: 'Closeness is measured in “times off”: 2× too high is as good as 2× too low.',
    },
    points: {
      title: 'Points',
      text: 'The closest answer scores the most. Within 2× earns a bonus, within 10% a bigger one. The final question counts double.',
    },
    call: {
      title: 'Higher or lower?',
      text: 'As each reveal starts, call whether the truth is higher or lower than your own answer. No points, just bragging rights, and an award for the best hindsight.',
    },
    swarm: {
      title: 'The swarm',
      text: 'FerMEANie plays the average of all your answers. If she beats every human, she steals the round’s points.',
    },
  } satisfies Record<Rule, { title: string; text: string }>,
  lastLineCounts: 'Not locked in? When time runs out, your last line counts.',
  timesUp: 'Time’s up!',
  awardsTitle: 'The awards',
  awardsSoFar: 'Awards',
  /** The end-of-game awards: an emoji, a title, and what the number is. */
  awards: {
    swarm_slayer: { emoji: '⚔️', title: 'Swarm Slayer', stat: (n: number) => `closer than the swarm in ${n} round${n === 1 ? '' : 's'}` },
    bullseye: { emoji: '🎯', title: 'Bullseye', stat: (n: number) => `${n} answer${n === 1 ? '' : 's'} within 10%` },
    steady_hand: { emoji: '🧘', title: 'Steady Hand', stat: (v: number) => `${formatFactor(v)} off on average` },
    abacus: { emoji: '🧮', title: 'The Abacus', stat: (v: number) => `${v} lines of working per answer` },
    gut_feeling: { emoji: '⚡', title: 'Gut Feeling', stat: (v: number) => `locked in after ${v} s on average` },
    contrarian: { emoji: '🔄', title: 'Contrarian', stat: (n: number) => `against everyone else in ${n} round${n === 1 ? '' : 's'}` },
    bold_estimator: { emoji: '🚀', title: 'Bold Estimator', stat: (v: number) => `one answer ${formatFactor(v)} off` },
    last_minute: { emoji: '⏳', title: 'Last Minute', stat: (v: number) => `locked in after ${v} s on average` },
    swarm_twin: { emoji: '🪞', title: 'Swarm Twin', stat: (v: number) => `${formatFactor(v)} from the swarm on average` },
    comeback: { emoji: '📈', title: 'Comeback', stat: (n: number) => `climbed ${n} places` },
    optimist: { emoji: '🌞', title: 'Optimist', stat: (n: number) => `too high ${n} times` },
    pessimist: { emoji: '🌧️', title: 'Pessimist', stat: (n: number) => `too low ${n} times` },
    late_bloomer: { emoji: '🌱', title: 'Late Bloomer', stat: (v: number) => `${formatFactor(v)} closer in the second half` },
    one_liner: { emoji: '☝️', title: 'One-Liner', stat: (n: number) => `${n} answer${n === 1 ? '' : 's'} with no working` },
    round_numbers: { emoji: '🔵', title: 'Round Numbers', stat: (n: number) => `${n} perfectly round answer${n === 1 ? '' : 's'}` },
    near_miss: { emoji: '🤏', title: 'Near Miss', stat: (n: number) => `${n} answers within 2×, no bullseye` },
    swarm_donor: { emoji: '💸', title: 'Swarm Donor', stat: (n: number) => `${n} points given to the swarm` },
    hindsight: { emoji: '🔮', title: HINDSIGHT, stat: (n: number) => `called higher or lower right ${n} times` },
  } satisfies Record<AwardKind, { emoji: string; title: string; stat: (value: number) => string }>,
  call: {
    ask: 'Is the truth higher or lower than your answer?',
    /** Under the question while the call is open: what it's for (not in the practice round, which no award counts). */
    why: `No points: just bragging rights, and the ${HINDSIGHT} award.`,
    higher: HIGHER,
    lower: LOWER,
    /** The call's buttons (and the rule slide's picture of them). */
    button: { higher: `⬆ ${HIGHER}`, lower: `⬇ ${LOWER}` },
    closesIn: (s: number) => `Closes in ${s}s`,
    youSaid: (c: string) => `You said ${c.toLowerCase()}. Truth incoming…`,
    tooLate: 'Calls are closed. Truth incoming…',
    yourAnswer: 'Your answer',
    right: 'You called it ✅',
    wrong: 'Wrong twice ❌',
    exact: 'Spot on: nothing to call 🎯',
    tvAsk: 'Higher or lower than your answer? Make your call on your phone.',
    made: (n: number) => `${n} called`,
    tally: (right: number, made: number) => `${right} of ${made} called it`,
  },
  react: 'React',
  /** Each reaction's name, for screen readers and tooltips. */
  reactions: {
    bullseye: 'Bullseye',
    fire: 'On fire',
    mindblown: 'Mind blown',
    rocket: 'To the moon',
    dead: "I'm dead",
    brain: 'Big brain',
  } satisfies Record<Reaction, string>,
  /** After a burst of reactions, the bar rests for a while. */
  reactRest: 'Let the lab air out… 🧪',
  lookUp: 'Look at the big screen',
  controllerView: 'Controller',
  fullView: 'Full view',
  joinGame: 'Join',
  roomCodePlaceholder: 'Room code',
  yourName: 'Your name',
  rename: 'Change your name',
  renameSave: 'Save name',
  renameCancel: 'Keep the old name',
  kick: (name: string) => `Send ${name} back to the name screen`,
  kickArmed: (name: string) => `Tap again to send ${name} back to the name screen`,
  kickConfirm: 'Kick?',
  /** A player offline for a whole question: out of the running until they come back. */
  left: 'left',
  leftHint: 'Left the game: ranked after everyone who stayed',
  lockIn: 'Lock in',
  unlock: 'Edit answer',
  lockHint: 'Ctrl/⌘ + Enter',
  copyJoin: 'Copy join message',
  copied: 'Copied!',
  start: 'Start game',
  startingSoon: 'Starting as FerMEANie finishes…',
  playAgain: 'Play again',
  waitingForHost: 'Waiting for the host…',
  needPlayers: (missing: number) => `FerMEANie needs at least ${MIN_PLAYERS} test subjects to be the average of. Invite ${missing} more.`,
  rounds: 'Rounds',
  timer: 'Seconds per question',
  connecting: 'Connecting…',
  reconnecting: 'Reconnecting…',
  soundOn: 'Sound is on. Tap to mute FerMEANie and the sound effects.',
  soundOff: 'Turn sound on: FerMEANie and sound effects on this device',
  /** Sound is on but the browser waits for a tap (a TV nobody has touched yet). */
  soundLocked: (tv: boolean) => `🔊 ${tv ? 'Click' : 'Tap'} anywhere for sound: FerMEANie talks!`,
  /** Sound was turned off on this device. */
  soundMuted: '🔈 Sound is off, and FerMEANie has a lot to say. Turn it on',
  spectating: 'You joined mid-round. You’re in from the next question!',
  noAnswer: 'No answer',
  yourAnswer: 'Your answer',
  readAs: 'Read as',
  dispute: 'Something wrong with this answer?',
  joinMessage: (url: string, code: string) => `Join my Fermi game! 🧮 ${url} (room ${code})`,
}

export const HOW_TO_PLAY = [
  'Everyone gets the same question. Nobody knows the answer, so estimate it.',
  'Work it out in the answer block: one step per line, with variables if you like. Everyone sees your working at the end.',
  'Closeness is measured in “times off”: 2× too high is as good as 2× too low.',
  'FerMEANie absorbs your guesses into a hive mind and averages them. If the swarm beats every human, it steals the round.',
]

export const CALC_TIPS: [string, string][] = [
  ['366 × 24 × 60 × 60', 'Ordinary maths: * or × or x, / or ÷, ^ for powers'],
  ['people = 8 billion', 'Name things and reuse them on later lines'],
  ['2(3 + 4)  ·  3 days', 'Implicit multiplication works, the way you’d write it'],
  ['5k  2.5M  8bn  1e9', 'Suffixes and scientific notation'],
  ['1_000_000', 'Use _ to group digits. Commas mean different things in different countries'],
  ['# my reasoning', 'Comments are shown in the reveal'],
]
