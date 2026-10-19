// FerMEANie's line pool: random picks without repeats within a game, and dunce lines
// steered away from ones a player has already been insulted with.

import { fileURLToPath } from 'node:url'
import { FluentNumber, readFluentDir, type FluentLine } from '@fermi/shared/fluent'
import { loadLinePool, type LineArgs, type LineCategory, type LinePool } from '@fermi/shared/lines'
import { escapeMarkup } from '@fermi/shared'
import { nowIso, type DB } from './db.ts'

const CONTENT_DIR = fileURLToPath(new URL('../../../content/fermeanie/', import.meta.url))

export type { LinePool }

let cached: LinePool | undefined
/** Every line in content/fermeanie/, checked; throws, naming the file and line, if anything is wrong. */
export function loadLines(): LinePool {
  cached ??= loadLinePool(readFluentDir(CONTENT_DIR))
  return cached
}

/** A line picked for a category, with the values it was picked for; `say` can update them. */
export interface ChosenLine<K extends LineCategory> {
  msg: FluentLine
  vars: LineArgs<K>
}

export class LinePicker {
  private used = new Set<string>()
  private pool: LinePool
  private db: DB | undefined
  private rand: () => number

  constructor(pool: LinePool, db?: DB, rand: () => number = Math.random) {
    this.pool = pool
    this.db = db
    this.rand = rand
  }

  /**
   * Lines using an optional variable that wasn't given are skipped; every category has a line that needs none.
   * @param playerId when given, prefer lines this player hasn't seen before (across games).
   */
  pick<K extends LineCategory>(key: K, vars: LineArgs<K>, playerId?: string): string {
    return this.say(this.choose(key, vars, playerId))
  }

  /** Picks a line (as `pick` does) to `say` later, perhaps with newer values, such as a host who has changed. */
  choose<K extends LineCategory>(key: K, vars: LineArgs<K>, playerId?: string): ChosenLine<K> {
    const args: Record<string, string | number | undefined> = vars
    const candidates = this.pool.categories[key]
      .filter((msg) => msg.variables.every((name) => args[name] !== undefined))
      .map((msg) => ({ msg, id: `${key}#${msg.id}` }))
    let options = candidates.filter((line) => !this.used.has(line.id))
    if (!options.length) options = candidates

    if (playerId && this.db) {
      const seen = new Map(
        (
          this.db
            .prepare('SELECT line_key, seen_at FROM player_lines WHERE player_id = ? AND line_key LIKE ?')
            .all(playerId, `${key}#%`) as {
            line_key: string
            seen_at: string
          }[]
        ).map((r) => [r.line_key, r.seen_at]),
      )
      const fresh = options.filter((o) => !seen.has(o.id))
      if (fresh.length) options = fresh
      else
        options = [...options]
          .sort((a, b) => (seen.get(a.id)! < seen.get(b.id)! ? -1 : 1))
          .slice(0, Math.max(1, Math.ceil(options.length / 4)))
    }

    const choice = options[Math.floor(this.rand() * options.length)]
    this.used.add(choice.id)
    if (playerId && this.db) {
      this.db
        .prepare('INSERT OR REPLACE INTO player_lines (player_id, line_key, seen_at) VALUES (?, ?, ?)')
        .run(playerId, choice.id, nowIso())
    }
    return { msg: choice.msg, vars }
  }

  /**
   * The line as text. `update` replaces values; a value left out or undefined keeps the one the line was picked for,
   * so every variable the line uses is always there.
   * Numbers become FluentNumbers without digit grouping (the game formats big numbers itself), and text is escaped so
   * a name like "**Bob**" shows as typed instead of as markup.
   */
  say<K extends LineCategory>({ msg, vars }: ChosenLine<K>, update: Partial<LineArgs<K>> = {}): string {
    const picked: Record<string, string | number | undefined> = vars
    const updated = update as Record<string, string | number | undefined> // a Partial of a generic loses its value types
    const args = Object.fromEntries(
      msg.variables.map((name) => {
        const v = (updated[name] ?? picked[name])!
        return [name, typeof v === 'number' ? new FluentNumber(v, { useGrouping: false }) : escapeMarkup(v)]
      }),
    )
    return this.pool.bundle.formatPattern(msg.value, args)
  }
}
