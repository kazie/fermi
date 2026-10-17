import { describe, expect, it } from 'vitest'
import { fill, LinePicker, linesAt, loadLines } from '../src/lines.ts'
import { testDb } from './fixtures.ts'

// Placeholders the game code fills in, per situation.
const ALLOWED: Record<string, string[]> = {
  intro: ['count'],
  welcome: [],
  sits_out: ['count'],
  rule_change: ['name', 'count'],
  'dunce.mild': ['name', 'factor'],
  'dunce.severe': ['name', 'factor'],
  'dunce.cosmic': ['name', 'factor'],
  'dunce.nonpositive': ['name', 'value'],
  'dunce.repeat_offender': ['name', 'count'],
  'dunce.group': ['names', 'count'],
  steal: ['points', 'best'],
  defeated: ['name'],
  everyone_way_off: ['factor'],
  human_bullseye: ['name'],
  game_win: ['winner', 'version', 'wins'],
  game_loss: ['winner', 'version'],
  version_upgrade: ['oldVersion', 'version', 'wins'],
}

describe('FerMEANie line pool', () => {
  const pool = loadLines()

  it('has every situation the game uses, with plenty of dunce lines', () => {
    for (const key of Object.keys(ALLOWED)) expect(linesAt(pool, key).length, key).toBeGreaterThanOrEqual(10)
    const dunce = Object.keys(ALLOWED)
      .filter((k) => k.startsWith('dunce.'))
      .reduce((n, k) => n + linesAt(pool, k).length, 0)
    expect(dunce).toBeGreaterThanOrEqual(150)
  })

  it.each(Object.entries(ALLOWED))('%s uses only valid placeholders', (key, allowed) => {
    for (const line of linesAt(pool, key)) {
      const used = [...line.matchAll(/\{(\w+)\}/g)].map((m) => m[1])
      for (const u of used) expect(allowed, `${key}: "${line}"`).toContain(u)
    }
  })

  it('never calls anyone a troll, and never says crowd', () => {
    const all = Object.keys(ALLOWED).flatMap((k) => linesAt(pool, k))
    expect(all.filter((l) => /troll/i.test(l))).toEqual([])
    // FerMEANie speaks of the swarm / hive mind / collective, never "the crowd"
    expect(all.filter((l) => /crowd/i.test(l))).toEqual([])
  })

  it('has no digits outside placeholders', () => {
    const all = Object.keys(ALLOWED).flatMap((k) => linesAt(pool, k))
    expect(all.filter((l) => /\d/.test(l.replace(/\{\w+\}/g, '')))).toEqual([])
  })

  it('fills placeholders and avoids repeats within a game', () => {
    expect(fill('{name} was {factor} off', { name: 'Ada', factor: '3×' })).toBe('Ada was 3× off')
    const picker = new LinePicker(pool)
    const seen = new Set(Array.from({ length: 10 }, () => picker.pick('steal', { points: 1, best: 'x' })))
    expect(seen.size).toBe(10)
  })

  it('steers dunce lines away from ones a player has already seen', () => {
    const db = testDb()
    const first = new LinePicker(pool, db)
    const a = first.pick('dunce.mild', { name: 'Ada', factor: '3×' }, 'player-a')
    const second = new LinePicker(pool, db, () => 0) // a fresh game, deterministic pick
    const picks = Array.from({ length: 5 }, () => second.pick('dunce.mild', { name: 'Ada', factor: '3×' }, 'player-a'))
    expect(picks).not.toContain(a)
  })
})
