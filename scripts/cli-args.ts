import { parseArgs } from 'node:util'

/** Argument parsing for `pnpm q`: booleans never swallow the next argument, and flags may go anywhere. */
export function parseCli(argv: string[]) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      server: { type: 'string' },
      batch: { type: 'string' },
      replaces: { type: 'string' },
      question: { type: 'string' },
      reason: { type: 'string' },
      draft: { type: 'string' },
      notes: { type: 'string' },
      resolution: { type: 'string' },
      'dry-run': { type: 'boolean' },
      texts: { type: 'boolean' },
      links: { type: 'boolean' },
      categories: { type: 'boolean' },
    },
  })
  const [cmd, ...rest] = positionals
  return { cmd, rest, opts: values }
}
