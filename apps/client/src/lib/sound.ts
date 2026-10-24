// Which sounds a device plays, and when. Pure, so tests can check it without audio: the synth (lib/synth.ts) makes the
// sounds, the composable (useGameSfx) plays them.

import type { RoomView } from '@fermi/shared'

/**
 * Where sound goes depends on the mode. Online (no big screen), every device plays everything: it's the only screen
 * each player has. At a party (a big screen is connected), the big screen plays her voice and the shared sounds, and
 * phones play only their player's own moments, so the room doesn't echo from every pocket.
 */
export type SoundRoute = 'all' | 'personal'

export function soundRoute(room: Pick<RoomView, 'viewer' | 'screens'>): SoundRoute {
  return room.viewer === 'screen' || !room.screens ? 'all' : 'personal'
}

export type Cue =
  /** someone joined the lobby */
  | 'join'
  /** the intro starts */
  | 'intro'
  /** the roll call moves to the next player */
  | 'rollCall'
  /** a question appears */
  | 'question'
  /** another player locked in */
  | 'lock'
  /** ten seconds left: phones buzz, nothing plays */
  | 'tenLeft'
  /** the last seconds; `n` seconds left */
  | 'tick'
  | 'timesUp'
  /** the true answer lands */
  | 'truth'
  /** a card flips */
  | 'flip'
  | 'bullseye'
  /** a dunce cap: an easter egg, so a small comic sound */
  | 'dunce'
  /** the swarm beats every human */
  | 'steal'
  /** a human beats the swarm */
  | 'defeated'
  /** an end-of-game award is read out */
  | 'award'
  | 'fermeanieWins'
  | 'humansWin'
  // personal: this device's player
  /** you locked in */
  | 'youLocked'
  /** your card flips */
  | 'yourCard'
  /** the roll call reaches you */
  | 'yourTurn'

export interface CueEvent {
  cue: Cue
  /** For `tick`: seconds left. */
  n?: number
  /** Personal cues play on the player's own device even at a party; shared ones only where the route is `all`. */
  personal?: boolean
}

/** Seconds left at which the countdown ticks. */
export const TICK_SECONDS = [5, 4, 3, 2, 1] as const
/** A moment the clock passed this long ago is skipped (a reconnect, a tab coming back): no burst of old sounds. */
export const MAX_LATE_MS = 1000

/** Everything timed in a view (server ms): what fires as the clock passes it. */
function timed(room: RoomView): (CueEvent & { at: number })[] {
  const out: (CueEvent & { at: number })[] = []
  const intro = room.phase === 'intro' ? room.intro : undefined
  if (intro) {
    out.push({ cue: 'intro', at: intro.startedAt })
    for (const s of intro.steps) {
      if (s.kind !== 'player') continue
      out.push({ cue: 'rollCall', at: s.at })
      if (s.playerId === room.you) out.push({ cue: 'yourTurn', at: s.at, personal: true })
    }
  }
  const r = room.phase === 'question' ? room.round : undefined
  if (r) {
    out.push({ cue: 'question', at: r.startedAt })
    out.push({ cue: 'tenLeft', at: r.endsAt - 10_000, personal: true })
    for (const n of TICK_SECONDS) out.push({ cue: 'tick', n, at: r.endsAt - n * 1000 })
    out.push({ cue: 'timesUp', at: r.endsAt })
  }
  const rv = room.phase === 'reveal' ? room.reveal : undefined
  if (rv) {
    out.push({ cue: 'truth', at: rv.timeline.truthAt })
    for (const c of rv.cards) {
      out.push({ cue: 'flip', at: c.at })
      if (c.playerId === room.you) out.push({ cue: 'yourCard', at: c.at, personal: true })
      if (c.bonusKind === 'bullseye') out.push({ cue: 'bullseye', at: c.at })
      if (c.dunce) out.push({ cue: 'dunce', at: c.at })
    }
    if (rv.fermeanie) out.push({ cue: rv.fermeanie.beatsAll ? 'steal' : 'defeated', at: rv.timeline.fermeanieAt })
  }
  const f = room.phase === 'final' ? room.final : undefined
  if (f) {
    for (const a of f.awards ?? []) out.push({ cue: 'award', at: a.at })
    out.push({ cue: f.fermeanieWon ? 'fermeanieWins' : 'humansWin', at: f.crownAt ?? f.startedAt })
  }
  return out
}

/**
 * The moments due as this device's clock moves from `from` to `now` (server ms), and as its view changes from `prev` to
 * `room`. Timed moments fire as the clock passes them (late ones are skipped); changes between snapshots (a join,
 * someone locking in) fire when the snapshot arrives. `audible` picks the ones this device plays; phones buzz for any.
 */
export function cuesBetween(prev: RoomView | null, room: RoomView, from: number, now: number): CueEvent[] {
  const out: CueEvent[] = []
  const since = Math.max(from, now - MAX_LATE_MS)
  for (const e of timed(room))
    if (e.at > since && e.at <= now) out.push({ cue: e.cue, ...(e.n && { n: e.n }), ...(e.personal && { personal: true }) })

  if (prev && prev.phase === room.phase) {
    if (room.phase === 'lobby' && room.players.length > prev.players.length) out.push({ cue: 'join' })
    if (room.phase === 'question') {
      const locked = (v: RoomView) => v.players.filter((p) => p.lockedIn && p.id !== v.you).length
      if (locked(room) > locked(prev)) out.push({ cue: 'lock' })
      if (room.yourSheet?.locked && !prev.yourSheet?.locked) out.push({ cue: 'youLocked', personal: true })
    }
  }
  return out
}

/** The moments this device plays: all of them online and on the big screen, only personal ones on a phone at a party. */
export const audible = (events: CueEvent[], route: SoundRoute) => events.filter((e) => route === 'all' || e.personal)

/** Phones buzz for their player's own moments, at a party or not (vibration never echoes). */
export const VIBRATE: Partial<Record<Cue, number[]>> = {
  youLocked: [40],
  yourCard: [30, 40, 30],
  yourTurn: [60],
  /** a phone feels the deadline coming even when the countdown plays on the big screen */
  tenLeft: [120],
  steal: [80, 60, 80, 60, 240],
}
