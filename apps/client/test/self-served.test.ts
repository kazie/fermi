import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Cheap early warning; the e2e test and the server's CSP are the real guards.
const ROOT = join(__dirname, '..')

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? files(p) : /\.(vue|ts|css|html)$/.test(f) ? [p] : []
  })
}

describe('the game is self-served', () => {
  it('loads no scripts, styles or fonts from other origins', () => {
    const offenders: string[] = []
    for (const f of [...files(join(ROOT, 'src')), join(ROOT, 'index.html')]) {
      if (f.endsWith('.story.vue')) continue
      const src = readFileSync(f, 'utf8')
      const re =
        /<script[^>]+src=["']https?:|<link[^>]+href=["']https?:|@import\s+url\(["']?https?:|url\(["']?https?:\/\/|import\s+[^'"]*['"]https?:/gi
      for (const m of src.matchAll(re)) offenders.push(`${f.slice(ROOT.length)}: ${m[0]}`)
    }
    expect(offenders).toEqual([])
  })
})
