// Loads Fluent (.ftl) files where every message is one line of dialogue. Used by the server at
// startup and by the client build (see lines.ts for FerMEANie's categories). Node only.
//
// On top of Fluent syntax, a line must have a value and no attributes, and may only use
// variables, plain text and selectors (`{ $count -> [one] … *[other] … }`): no message or term
// references and no function calls. With those ruled out, every line that loads also formats.

import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { FluentBundle, FluentNumber, FluentResource } from '@fluent/bundle'
import {
  columnOffset,
  FluentParser,
  lineOffset,
  Visitor,
  type FunctionReference,
  type Expression,
  type MessageReference,
  type Pattern,
  type TermReference,
  type VariableReference,
} from '@fluent/syntax'

export { FluentNumber, type FluentBundle }

export interface FluentFile {
  path: string
  source: string
}

export interface FluentLine {
  id: string
  /** Variables the line uses, sorted. */
  variables: string[]
  /** Every way the line can read, one per selector branch, with variables left as `{$name}` (for checks). */
  readings: string[]
  value: NonNullable<NonNullable<ReturnType<FluentBundle['getMessage']>>['value']>
}

/** Every .ftl file under `dir`, with paths relative to it (`dunce/mild.ftl`), sorted. */
export function readFluentDir(dir: string): FluentFile[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ftl'))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort()
    .map((full) => ({ path: relative(dir, full).split(sep).join('/'), source: readFileSync(full, 'utf8') }))
}

const parser = new FluentParser({ withSpans: true })

/** Collects a line's variables, and reports the constructs lines may not use. */
class LineVisitor extends Visitor {
  variables = new Set<string>()
  unsupported: { what: string; at: number }[] = []

  visitVariableReference(node: VariableReference) {
    this.variables.add(node.id.name)
  }
  visitMessageReference(node: MessageReference) {
    this.unsupported.push({ what: 'a message reference', at: node.span?.start ?? 0 })
  }
  visitTermReference(node: TermReference) {
    this.unsupported.push({ what: 'a term reference', at: node.span?.start ?? 0 })
  }
  visitFunctionReference(node: FunctionReference) {
    this.unsupported.push({ what: 'a function call', at: node.span?.start ?? 0 })
  }
}

function readings(pattern: Pattern): string[] {
  let out = ['']
  for (const element of pattern.elements) {
    const parts = element.type === 'TextElement' ? [element.value] : expressionReadings(element.expression)
    out = out.flatMap((start) => parts.map((part) => start + part))
  }
  return out
}

function expressionReadings(expression: Expression): string[] {
  switch (expression.type) {
    case 'SelectExpression':
      return expression.variants.flatMap((variant) => readings(variant.value))
    case 'VariableReference':
      return [`{$${expression.id.name}}`]
    case 'StringLiteral':
      return [expression.parse().value]
    case 'NumberLiteral':
      return [expression.value]
    case 'Placeable':
      return expressionReadings(expression.expression)
    default:
      return [''] // references and functions are rejected before this is used
  }
}

/** Parses the files into one bundle (IDs must be unique across them) and returns each file's lines. */
export function loadFluent(files: FluentFile[]): { bundle: FluentBundle; files: { path: string; lines: FluentLine[] }[] } {
  const bundle = new FluentBundle('en', { useIsolating: false })
  const errors: string[] = []
  const declared = new Map<string, string>()

  const loaded = files.map(({ path, source }) => {
    const at = (position = 0) => `${path}:${lineOffset(source, position) + 1}:${columnOffset(source, position) + 1}`
    bundle.addResource(new FluentResource(source), { allowOverrides: true }) // duplicates are reported below
    const lines: FluentLine[] = []

    for (const entry of parser.parse(source).body) {
      if (entry.type === 'Junk') {
        if (!entry.annotations.length) errors.push(`${at(entry.span?.start)}: invalid Fluent syntax`)
        for (const a of entry.annotations) errors.push(`${at(a.span?.start ?? entry.span?.start)}: ${a.code}: ${a.message}`)
        continue
      }
      if (entry.type === 'Term') {
        errors.push(`${at(entry.span?.start)}: terms aren't supported; write the text into each line`)
        continue
      }
      if (entry.type !== 'Message') continue

      const id = entry.id.name
      const where = at(entry.span?.start)
      const previous = declared.get(id)
      declared.set(id, where)
      if (previous) errors.push(`${where}: duplicate ID "${id}", already declared at ${previous}`)
      if (!entry.value) errors.push(`${where}: "${id}" has no value`)
      if (entry.attributes.length) errors.push(`${where}: "${id}" has attributes, which lines don't use`)
      if (previous || !entry.value || entry.attributes.length) continue

      const visitor = new LineVisitor()
      visitor.visit(entry.value)
      for (const { what, at: position } of visitor.unsupported)
        errors.push(`${at(position)}: "${id}" uses ${what}, which lines don't support`)
      if (visitor.unsupported.length) continue

      const value = bundle.getMessage(id)?.value
      if (value) lines.push({ id, variables: [...visitor.variables].sort(), readings: readings(entry.value), value })
      else errors.push(`${where}: "${id}" could not be read by the Fluent runtime`)
    }
    return { path, lines }
  })

  if (errors.length) throw new Error(`Invalid Fluent:\n${[...new Set(errors)].join('\n')}`)
  return { bundle, files: loaded }
}
