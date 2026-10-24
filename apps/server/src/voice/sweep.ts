// What can be rendered before anyone needs it: every sentence of FerMEANie's lines that has no variables (most of
// them), the ones that only count players, the questions, and, once a player has joined, every sentence that only
// names them.

import { sentences, speechText } from '@fermi/shared'
import type { LinePool } from '@fermi/shared/lines'
import type { DB } from '../db.ts'
import { lineArg } from '../lines.ts'
import { activeQuestionTexts } from '../questions/repo.ts'
import type { Voice } from './index.ts'

/** Variables that hold one player's name. */
const NAME_VARIABLES = ['name', 'best', 'winner', 'leader', 'last', 'host', 'previous']
/** Player counts, from none up to the 30 a room holds: sits_out is said with 0–2 answers, the intro to whole rooms. */
const COUNTS = Array.from({ length: 31 }, (_, i) => i)

/**
 * A reading's sentences as the game says them with these values filled in, keeping only the complete ones. The values
 * go in before the line is split, as in the game: a name can change where a sentence ends ("Nice try. kazie loses."
 * is one sentence: the next word starts in lower case).
 */
function filled(reading: string, values: Record<string, string>): string[] {
  let text = reading
  for (const [name, value] of Object.entries(values)) text = text.replaceAll(`{$${name}}`, value)
  return sentences(speechText(text)).filter((s) => !s.includes('{$'))
}

let cache: { pool: LinePool; ahead: string[]; fixed: Set<string>; named: { reading: string; variables: string[] }[] } | undefined
function prepared(pool: LinePool) {
  if (cache?.pool === pool) return cache
  const lines = Object.values(pool.categories).flat()
  const fixed = new Set(lines.flatMap((line) => line.readings.flatMap((r) => filled(r, {}))))
  // lines that only count players, formatted as the game formats them (the right plural for each count)
  const counts = lines
    .filter((line) => line.variables.length === 1 && line.variables[0] === 'count')
    .flatMap((line) => COUNTS.flatMap((n) => sentences(speechText(pool.bundle.formatPattern(line.value, { count: lineArg(n) })))))
  const named = lines.flatMap((line) => {
    const variables = line.variables.filter((v) => NAME_VARIABLES.includes(v))
    return variables.length ? line.readings.map((reading) => ({ reading, variables })) : []
  })
  cache = { pool, ahead: [...new Set([...fixed, ...counts])], fixed, named }
  return cache
}

/** The sentences rendered at startup: those without variables, and those that only count players. */
export function lineSentences(pool: LinePool): string[] {
  return prepared(pool).ahead
}

/** Every sentence that names only this player, as the game would say it. */
export function nameSentences(pool: LinePool, name: string): string[] {
  const { named, fixed } = prepared(pool)
  const value = lineArg(name) // as the line picker puts names into lines
  const out = new Set<string>()
  for (const { reading, variables } of named)
    for (const v of variables) for (const s of filled(reading, { [v]: value })) if (!fixed.has(s)) out.add(s)
  return [...out]
}

/**
 * Queues everything that can be rendered ahead: the questions first (one is read out the moment its round starts,
 * while her lines get a typing beat), then her sentences without variables.
 */
export function sweep(voice: Voice, pool: LinePool, db: DB) {
  for (const text of activeQuestionTexts(db)) voice.request(text, { tier: 'sweep' })
  voice.requestSentences(lineSentences(pool))
}
