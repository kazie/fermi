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
  it('parses the verifier flags', () => {
    expect(parseCli(['approve', 'b/drafts/x.json', '--batch', 'b', '--notes', 'checked both'])).toMatchObject({
      cmd: 'approve',
      rest: ['b/drafts/x.json'],
      opts: { batch: 'b', notes: 'checked both' },
    })
    expect(parseCli(['reject', '--draft', 'b/drafts/x.json', '--reason', 'weak source']).opts).toEqual({
      draft: 'b/drafts/x.json',
      reason: 'weak source',
    })
  })
  it('parses list --all and purge --yes', () => {
    expect(parseCli(['list', '--all']).opts).toEqual({ all: true })
    expect(parseCli(['purge', '--yes']).opts).toEqual({ yes: true })
  })
  it('rejects unknown flags', () => {
    expect(() => parseCli(['add', '--dryrun', 'a.json'])).toThrow()
  })
})
