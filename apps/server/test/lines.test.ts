import type { FluentFile } from '@fermi/shared/fluent'
import { describe, expect, it } from 'vitest'
import { loadLinePool } from '@fermi/shared/lines'
import { NAME_PLACEHOLDER } from '@fermi/shared'
import { LinePicker, loadLines } from '../src/lines.ts'
import { testDb, testLineFiles, testLines } from './fixtures.ts'

describe('FerMEANie lines', () => {
  const pool = loadLines()
  // Every reading of every line, variables left as {$name}
  const texts = Object.entries(pool.categories).flatMap(([category, lines]) =>
    lines.flatMap(({ id, readings }) => readings.map((text) => ({ category, id, text }))),
  )

  it('has plenty of lines for every situation, and of dunce lines', () => {
    for (const [key, lines] of Object.entries(pool.categories)) expect(lines.length, key).toBeGreaterThanOrEqual(10)
    const dunce = Object.entries(pool.categories).filter(([k]) => k.startsWith('dunce.'))
    expect(dunce.reduce((n, [, lines]) => n + lines.length, 0)).toBeGreaterThanOrEqual(150)
  })

  it('greets the name screen as HUMAN_NAME_HERE in every greeting', () => {
    expect(texts.filter(({ category, text }) => category === 'greeting' && !text.includes(NAME_PLACEHOLDER))).toEqual([])
  })

  it('never calls anyone a troll, and never says crowd', () => {
    expect(texts.filter(({ text }) => /troll/i.test(text))).toEqual([])
    // FerMEANie speaks of the swarm / hive mind / collective, never "the crowd"
    expect(texts.filter(({ text }) => /crowd/i.test(text))).toEqual([])
  })

  it('has no digits outside placeholders', () => {
    expect(texts.filter(({ text }) => /\d/.test(text))).toEqual([])
  })
})

describe('loadLinePool', () => {
  /** The fixture lines with some files replaced (null removes one). */
  const poolWith = (files: Record<string, string | null>) => () =>
    loadLinePool([
      ...testLineFiles.filter((f) => !(f.path in files)),
      ...Object.entries(files).flatMap(([path, source]): FluentFile[] => (source === null ? [] : [{ path, source }])),
    ])

  it('checks the files against the categories the game uses', () => {
    expect(poolWith({ 'human_bullseye.ftl': null })).toThrow(/human_bullseye\.ftl: missing/)
    expect(poolWith({ 'dunce/mlid.ftl': 'x = Hi\n' })).toThrow(/dunce\/mlid\.ftl: there is no "dunce\.mlid" category/)
    expect(poolWith({ 'defeated.ftl': 'x = { $name } and { $nmae }\n' })).toThrow(/"x" uses \$nmae, but the variables passed are: \$name/)
    expect(poolWith({ 'quip.ftl': 'x = { $leader } leads.\n' })).toThrow(/quip\.ftl: needs at least one line that uses no variables/)
    expect(poolWith({ 'defeated.ftl': 'x = Well done.\n' })).toThrow(/defeated\.ftl: no line uses \$name/)
  })

  it('checks the markup in every reading of a line', () => {
    const sitsOut = (variant: string) => `x = { $count ->\n  [one] One.\n *[other] ${variant}\n}\n`
    expect(poolWith({ 'sits_out.ftl': sitsOut('**Many** { $count }.') })).not.toThrow()
    expect(poolWith({ 'sits_out.ftl': sitsOut('**Many { $count }.') })).toThrow(/sits_out\.ftl: "x": "\*\*" is never closed/)
  })
})

describe('LinePicker', () => {
  it('formats variables, with plurals for numbers', () => {
    const picker = new LinePicker(testLines)
    expect(picker.pick('sits_out', { count: 1 })).toBe('Only 1 answer. I abstain.')
    expect(picker.pick('sits_out', { count: 0 })).toBe('Only 0 answers. I abstain.')
    expect(picker.pick('intro', { count: 12000 })).toBe('Welcome, 12000 specimens.') // no digit grouping
    expect(picker.pick('dunce.mild', { name: 'Ada', factor: '3×' })).toBe('Ada was 3× off.')
  })

  it('can take back a line chosen but never said, so it may come up later', () => {
    const names = { leader: 'Ada', last: 'Bob' }
    const used = new LinePicker(testLines, undefined, () => 0)
    const chosen = used.choose('quip', names)
    expect(used.pick('quip', names)).not.toBe(used.say(chosen)) // chosen counts as used: the other line comes first
    const taken = new LinePicker(testLines, undefined, () => 0)
    taken.unuse('quip', taken.choose('quip', names))
    expect(taken.pick('quip', names)).toBe(taken.say(chosen))
  })

  it('escapes markup in names, so they show as typed', () => {
    const picker = new LinePicker(testLines)
    expect(picker.pick('defeated', { name: '**Bob**' })).toBe('\\*\\*Bob\\*\\* beat me.')
  })

  it('says a chosen line again with newer values, keeping the old ones where none are given', () => {
    const picker = new LinePicker(testLines, undefined, () => 0)
    const chosen = picker.choose('quip', { leader: 'Ada', last: 'Bob' })
    expect(picker.say(chosen)).toBe('Ada leads, Bob trails.')
    expect(picker.say(chosen, { leader: 'Cyd' })).toBe('Cyd leads, Bob trails.')
    expect(picker.say(chosen, { leader: undefined })).toBe('Ada leads, Bob trails.') // never a hole in the line
  })

  it('avoids repeats within a game', () => {
    const picker = new LinePicker(loadLines())
    const seen = new Set(Array.from({ length: 10 }, () => picker.pick('steal', { points: 100, best: 'x' })))
    expect(seen.size).toBe(10)
  })

  it('skips lines that need an optional variable that was left out', () => {
    const both = new LinePicker(testLines, undefined, () => 0)
    expect(both.pick('quip', { leader: 'Ada', last: 'Bob' })).toBe('Ada leads, Bob trails.')
    const neither = new LinePicker(testLines, undefined, () => 0)
    expect(neither.pick('quip', {})).toBe('Carry on.')
    expect(neither.pick('quip', { leader: 'Ada' })).toBe('Carry on.')
  })

  it('keys history by message ID and steers dunce lines away from ones a player has seen', () => {
    const db = testDb()
    const pool = loadLines()
    const vars = { name: 'Ada', factor: '3×' }
    const a = new LinePicker(pool, db).pick('dunce.mild', vars, 'player-a')
    const keys = (db.prepare('SELECT line_key FROM player_lines').all() as { line_key: string }[]).map((r) => r.line_key)
    expect(keys).toEqual([expect.stringMatching(/^dunce\.mild#dunce-mild-\d+$/)])

    const second = new LinePicker(pool, db, () => 0) // a fresh game, deterministic pick
    const picks = Array.from({ length: 5 }, () => second.pick('dunce.mild', vars, 'player-a'))
    expect(picks).not.toContain(a)
  })
})
