import type { FinalView, RevealCard, RevealedQuestion, RevealView } from '@fermi/shared'

/** A finished game as /api/games/:id returns it. */
export interface RecapRound {
  index: number
  /** The final round: its points counted this many times. */
  multiplier?: number
  question: RevealedQuestion
  cards: Omit<RevealCard, 'at'>[]
  crowd: RevealView['crowd']
  fermeanie: RevealView['fermeanie']
  lines: RevealView['lines']
}
export interface RecapGame {
  id: string
  createdAt: string
  rounds: RecapRound[]
  final: FinalView | null
}
