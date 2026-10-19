import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LINE_VARIABLES, loadStaticLines } from '../src/lines.ts'

const welcome = (source: string) => () => loadStaticLines({ path: 'welcome.ftl', source })

describe('loadStaticLines (bundled welcome lines)', () => {
  it('gives the lines as plain strings', () => {
    expect(welcome('### Welcome lines\nfirst = Hello\nsecond = Welcome back\n')()).toEqual(['Hello', 'Welcome back'])
  })

  it('applies the same checks as the server', () => {
    expect(welcome('ok = Fine\nbroken = {\n')).toThrow(/welcome\.ftl:\d+:\d+: E\d+/)
    expect(welcome('x = Hi\nx = Again\n')).toThrow(/duplicate ID "x"/)
    expect(welcome('welcome = Hello, { $name }!\n')).toThrow(/"welcome" uses \$name, but the variables passed are: none/)
    expect(() => loadStaticLines({ path: 'nope.ftl', source: 'x = Hi\n' })).toThrow(/there is no "nope" category/)
  })
})

describe('the placeholder table in content/FERMEANIE.md', () => {
  it('lists every category with the variables LINE_VARIABLES passes it', () => {
    const guide = readFileSync(new URL('../../../content/FERMEANIE.md', import.meta.url), 'utf8')
    const section = guide.slice(guide.indexOf('## Placeholders per situation'))
    const vars = (cell: string) => [...cell.matchAll(/\{ \$(\w+) \}/g)].map((m) => m[1])
    const documented = Object.fromEntries(
      section
        .split('\n')
        .map((row) => row.match(/^\| `([\w.]+)` +\|[^|]*\|([^|]*)\|([^|]*)\|$/))
        .filter((m) => m !== null)
        .map(([, key, always, sometimes]) => [key, [...vars(always), ...vars(sometimes).map((v) => `${v}?`)]]),
    )
    expect(documented).toEqual(LINE_VARIABLES)
  })
})
