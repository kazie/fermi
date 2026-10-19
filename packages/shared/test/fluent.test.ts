import { describe, expect, it } from 'vitest'
import { FluentNumber, loadFluent } from '../src/fluent.ts'

const load = (source: string, path = 'a.ftl') => loadFluent([{ path, source }])

const plural = `second = { $count ->
    [one] One cap
   *[other] { $count } caps
} for { $who }
`

describe('loadFluent', () => {
  it('collects each line with the variables it uses, including in selectors', () => {
    const { files } = load(`first = Hi { $name }\n${plural}`)
    expect(files[0].lines.map(({ id, variables }) => ({ id, variables }))).toEqual([
      { id: 'first', variables: ['name'] },
      { id: 'second', variables: ['count', 'who'] },
    ])
  })

  it('lists every reading of a line, one per selector branch, with variables as placeholders', () => {
    const { files } = load(plural)
    expect(files[0].lines[0].readings).toEqual(['One cap for {$who}', '{$count} caps for {$who}'])
  })

  it('formats plurals', () => {
    const { bundle, files } = load('m = { $count ->\n  [one] { $count } answer\n *[other] { $count } answers\n}\n')
    const format = (count: number) => bundle.formatPattern(files[0].lines[0].value, { count: new FluentNumber(count) })
    expect([0, 1, 2].map(format)).toEqual(['0 answers', '1 answer', '2 answers'])
  })

  it('requires IDs to be unique across files', () => {
    expect(() =>
      loadFluent([
        { path: 'a.ftl', source: 'x = One\n' },
        { path: 'b.ftl', source: 'x = Two\n' },
      ]),
    ).toThrow(/b\.ftl:1:1: duplicate ID "x", already declared at a\.ftl:1:1/)
  })

  it.each([
    ['syntax errors', 'ok = Fine\nbroken = {\n', /a\.ftl:\d+:\d+: E\d+/],
    ['message references', 'x = One\ny = { x }\n', /a\.ftl:2:\d+: "y" uses a message reference/],
    ['terms', '-me = FerMEANie\n', /a\.ftl:1:1: terms aren't supported/],
    ['term references', 'x = { -me }\n', /"x" uses a term reference/],
    ['function calls', 'x = { NUMBER($n) }\n', /"x" uses a function call/],
    ['attributes', 'x = One\n  .title = Two\n', /"x" has attributes/],
    ['messages without a value', 'x =\n  .title = Two\n', /"x" has no value/],
  ])('rejects %s', (_, source, error) => {
    expect(() => load(source)).toThrow(error)
  })
})
