// FerMEANie's line pool: random picks without repeats within a game, and dunce lines
// steered away from ones a player has already been insulted with.

import { readFileSync } from 'node:fs'
import { nowIso, type DB } from './db.ts'

export type LinePool = Record<string, string[] | Record<string, string[]>>

export const CONTENT_DIR = new URL('../../../content/', import.meta.url)

let cached: LinePool | undefined
export function loadLines(): LinePool {
  cached ??= JSON.parse(readFileSync(new URL('fermeanie-lines.json', CONTENT_DIR), 'utf8')) as LinePool
  return cached
}

export function linesAt(pool: LinePool, key: string): string[] {
  const [a, b] = key.split('.')
  const v = pool[a]
  if (!v) return []
  if (Array.isArray(v)) return v
  return b ? (v[b] ?? []) : []
}

export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
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

  /** @param playerId when given, prefer lines this player hasn't seen before (across games). */
  pick(key: string, vars: Record<string, string | number> = {}, playerId?: string): string {
    const lines = linesAt(this.pool, key)
    if (!lines.length) return ''
    let options = lines.map((text, i) => ({ text, id: `${key}#${i}` })).filter((l) => !this.used.has(l.id))
    if (!options.length) options = lines.map((text, i) => ({ text, id: `${key}#${i}` }))

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
    return fill(choice.text, vars)
  }
}
