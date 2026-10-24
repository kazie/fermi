import { MIN_PLAYERS, type IntroMode, type Rule, type RoomSettings } from '@fermi/shared'

// All user-facing copy in one place, so a translation can slot in later.
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
      text: 'The closest answer scores the most. Within 2× earns a bonus, within 10% a bigger one.',
    },
    swarm: {
      title: 'The swarm',
      text: 'FerMEANie plays the average of all your answers. If she beats every human, she steals the round’s points.',
    },
  } satisfies Record<Rule, { title: string; text: string }>,
  lookUp: 'Look at the big screen',
  controllerView: 'Controller',
  fullView: 'Full view',
  joinGame: 'Join',
  roomCodePlaceholder: 'Room code',
  yourName: 'Your name',
  namePlaceholder: 'HUMAN_NAME_HERE',
  welcomeName: (name: string) => `Welcome to my little game, ${name}.`,
  lockIn: 'Lock in',
  unlock: 'Edit answer',
  lockHint: 'Ctrl/⌘ + Enter',
  copyJoin: 'Copy join message',
  copied: 'Copied!',
  start: 'Start game',
  playAgain: 'Play again',
  waitingForHost: 'Waiting for the host…',
  needPlayers: (missing: number) => `FerMEANie needs at least ${MIN_PLAYERS} test subjects to be the average of. Invite ${missing} more.`,
  rounds: 'Rounds',
  timer: 'Seconds per question',
  connecting: 'Connecting…',
  reconnecting: 'Reconnecting…',
  soundOn: 'FerMEANie’s voice is on. Tap to mute her.',
  soundOff: 'Let FerMEANie speak (sound on this device)',
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
