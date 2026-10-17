import { describe, expect, it } from 'vitest'
import { parseCli } from '../cli-args.ts'

describe('pnpm q argument parsing', () => {
  it('boolean flags never swallow a file', () => {
    expect(parseCli(['add', '--dry-run', 'a.json', 'b.json'])).toMatchObject({
      cmd: 'add',
      rest: ['a.json', 'b.json'],
      opts: { 'dry-run': true },
    })
  })
  it('value flags may come before positionals', () => {
    expect(parseCli(['status', '--resolution', 'fixed it', 'abc', 'active'])).toMatchObject({
      cmd: 'status',
      rest: ['abc', 'active'],
      opts: { resolution: 'fixed it' },
    })
  })
  it('rejects unknown flags', () => {
    expect(() => parseCli(['add', '--dryrun', 'a.json'])).toThrow()
  })
})
