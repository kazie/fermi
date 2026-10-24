// FerMEANie's line categories: which exist, and which variables the game passes to each. Lines
// live in content/fermeanie/ as Fluent files; the path is the category (dunce/mild.ftl → dunce.mild).
// The server loads them all; the client build bundles welcome.ftl. Node only.

import { loadFluent, type FluentBundle, type FluentFile, type FluentLine } from './fluent.ts'
import { parseMarkup } from './markup.ts'

/**
 * Every category, with the variables passed to its lines. A trailing `?` marks a variable that
 * isn't always given: lines using it are skipped when it is missing.
 */
export const LINE_VARIABLES = {
  welcome: [],
  hello: ['count', 'version?'],
  hello_again: ['count', 'version?'],
  'roll_call.new': ['name'],
  'roll_call.returning': ['name', 'games'],
  'roll_call.dunces': ['name', 'dunces'],
  'roll_call.losses': ['name', 'losses', 'games'],
  'rules.sheet': [],
  'rules.times_off': [],
  'rules.points': [],
  'rules.swarm': [],
  'practice.question': [],
  'practice.guide': [],
  'practice.lesson': [],
  'for_real.played': [],
  'for_real.intro': [],
  'for_real.skipped': [],
  intro: ['count'],
  quip: ['leader?', 'last?'],
  final_round_double: ['leader?', 'last?'],
  'award.swarm_slayer': ['name', 'count'],
  'award.bullseye': ['name', 'count'],
  'award.steady_hand': ['name', 'factor'],
  'award.abacus': ['name', 'lines'],
  'award.gut_feeling': ['name', 'seconds'],
  'award.contrarian': ['name', 'count'],
  'award.bold_estimator': ['name', 'factor'],
  'award.last_minute': ['name', 'seconds'],
  'award.swarm_twin': ['name', 'factor'],
  'award.comeback': ['name', 'places'],
  'award.optimist': ['name', 'count'],
  'award.pessimist': ['name', 'count'],
  'award.late_bloomer': ['name', 'factor'],
  'award.one_liner': ['name', 'count'],
  'award.round_numbers': ['name', 'count'],
  'award.near_miss': ['name', 'count'],
  'award.swarm_donor': ['name', 'points'],
  'award.hindsight': ['name', 'count'],
  lead_change: ['name', 'previous'],
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
  everyone_locked: [],
  twins: ['names'],
  break_time: ['leader?'],
  host_wait: ['host'],
  game_win: ['winner', 'version', 'wins'],
  game_loss: ['winner', 'version'],
  game_tie: ['winner', 'version'],
  humble_pie: ['winner', 'version', 'losses'],
  release_notes: ['winner', 'version', 'wins'],
  pie_release: ['codename', 'version', 'wins'],
} as const satisfies Record<string, readonly string[]>

export type LineCategory = keyof typeof LINE_VARIABLES
type Declared<K extends LineCategory> = (typeof LINE_VARIABLES)[K][number]
/** The arguments for a category (for a union of categories, the arguments of any of them). */
export type LineArgs<K extends LineCategory> = K extends LineCategory
  ? { [V in Declared<K> as V extends `${string}?` ? never : V]: string | number } & {
      [V in Declared<K> as V extends `${infer Name}?` ? Name : never]?: string | number
    }
  : never

export interface LinePool {
  bundle: FluentBundle
  categories: Record<LineCategory, FluentLine[]>
}

/**
 * Checks loaded files against LINE_VARIABLES: every file is a known category; its lines use only the
 * variables passed to it, and every one of those is used somewhere; at least one line needs no optional
 * variable, so a pick always finds a line; and the markup (see markup.ts) is balanced in every reading.
 * Returns the lines by category, plus a list of problems.
 */
function check(files: FluentFile[]) {
  const { bundle, files: loaded } = loadFluent(files)
  const declared = new Map<string, readonly string[]>(Object.entries(LINE_VARIABLES))
  const categories: Partial<Record<LineCategory, FluentLine[]>> = {}
  const errors: string[] = []

  for (const { path, lines } of loaded) {
    const category = path.slice(0, -'.ftl'.length).replaceAll('/', '.')
    const variables = declared.get(category)
    if (!variables) {
      errors.push(`${path}: there is no "${category}" category; add it to LINE_VARIABLES in packages/shared/src/lines.ts`)
      continue
    }
    const always = variables.filter((v) => !v.endsWith('?'))
    const passed = variables.map((v) => v.replace(/\?$/, ''))
    const list = (vars: string[]) => vars.map((v) => `$${v}`).join(', ') || 'none'
    for (const line of lines) {
      const unknown = line.variables.filter((v) => !passed.includes(v))
      if (unknown.length) errors.push(`${path}: "${line.id}" uses ${list(unknown)}, but the variables passed are: ${list(passed)}`)
      for (const reading of new Set(line.readings)) {
        try {
          parseMarkup(reading.replace(/\{\$\w+\}/g, 'x'))
        } catch (e) {
          errors.push(`${path}: "${line.id}": ${(e as Error).message}`)
          break
        }
      }
    }
    const unused = passed.filter((v) => !lines.some((line) => line.variables.includes(v)))
    if (unused.length)
      errors.push(`${path}: no line uses ${list(unused)}; use it or remove it from LINE_VARIABLES (and from the lines.pick call)`)
    if (!lines.some((line) => line.variables.every((v) => always.includes(v)))) {
      const needs = always.length ? `only ${list(always)}` : 'no variables'
      errors.push(`${path}: needs at least one line that uses ${needs}`)
    }
    categories[category as LineCategory] = lines
  }
  return { bundle, categories, errors }
}

const fail = (errors: string[]) => {
  if (errors.length) throw new Error(`Invalid FerMEANie lines:\n${errors.join('\n')}`)
}

/** Loads every category's file (see `check`); throws, naming the file and line, if anything is wrong or missing. */
export function loadLinePool(files: FluentFile[]): LinePool {
  const { bundle, categories, errors } = check(files)
  const missing = Object.keys(LINE_VARIABLES).filter((category) => !(category in categories))
  fail([...errors, ...missing.map((category) => `${category.replaceAll('.', '/')}.ftl: missing`)])
  return { bundle, categories: categories as LinePool['categories'] }
}

/** The lines of one file of a category without variables (like welcome.ftl), as plain strings. */
export function loadStaticLines(file: FluentFile): string[] {
  const { bundle, categories, errors } = check([file])
  fail(errors)
  return Object.values(categories)
    .flat()
    .map((line) => bundle.formatPattern(line.value))
}
