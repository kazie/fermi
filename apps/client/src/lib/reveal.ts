import { STEAL, stealTiming, type RevealView } from '@fermi/shared'

export type RevealStage = 'numberLine' | 'truth' | 'cards' | 'fermeanie' | 'scoreboard'

export function revealStage(r: RevealView, now: number): RevealStage {
  const t = r.timeline
  if (now >= t.scoreboardAt) return 'scoreboard'
  if (now >= t.fermeanieAt) return 'fermeanie'
  if (r.cards.length && now >= r.cards[0].at) return 'cards'
  if (now >= t.truthAt) return 'truth'
  return 'numberLine'
}

export function flippedCount(r: RevealView, now: number): number {
  return r.cards.filter((c) => now >= c.at).length
}

export function describeOff(factor: number | null, direction: string | null, fmt: (f: number) => string): string {
  if (factor === null || direction === null) return 'no valid answer'
  if (direction === 'exact') return 'spot on'
  return `${fmt(factor)} too ${direction}`
}

export interface StealPlan {
  /** When each stolen card's points take off (and the card drains). */
  starts: Record<string, number>
  /** When the last points have landed: the verdict stamps in. */
  doneAt: number
}

export function stealPlan(r: RevealView): StealPlan | null {
  if (!r.fermeanie?.beatsAll) return null
  // furthest first, like the cards: the best human loses theirs last
  const victims = r.cards.filter((c) => c.stolen > 0)
  const { stagger, doneAt } = stealTiming(victims.length)
  const starts: Record<string, number> = {}
  victims.forEach((c, i) => (starts[c.playerId] = STEAL.lead + i * stagger))
  return { starts, doneAt }
}
