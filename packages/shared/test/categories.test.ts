import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CATEGORIES, CATEGORY_SCOPES } from '../src/question.ts'

describe('the category table in content/QUESTION_RULES.md', () => {
  it('lists exactly CATEGORIES, in order, with their scopes', () => {
    // Generators only read the rules, so a category missing there would never get questions.
    const rules = readFileSync(new URL('../../../content/QUESTION_RULES.md', import.meta.url), 'utf8')
    const rows = [...rules.matchAll(/^\| `([a-z-]+)` +\| (.+?) +\|$/gm)].map((m) => [m[1], m[2]])
    expect(rows).toEqual(CATEGORIES.map((c) => [c, CATEGORY_SCOPES[c]]))
  })
})
