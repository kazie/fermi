import type { Question } from '@fermi/shared'
import { openDb } from '../src/db.ts'
import { insertQuestion } from '../src/questions/repo.ts'
import { fileURLToPath } from 'node:url'
import { readFluentDir } from '@fermi/shared/fluent'
import { loadLinePool } from '@fermi/shared/lines'

export const testDb = () => openDb(':memory:')

let n = 0
export function makeQuestion(overrides: Partial<Question> = {}): Question {
  n++
  return {
    id: `q-${n}`,
    question: 'How many rivets hold the Eiffel Tower together?',
    unit: 'rivets',
    category: 'engineering',
    difficulty: 2,
    kind: 'direct',
    answer: 2_500_000,
    explanation: 'The tower was assembled from 18,038 iron parts joined by about 2.5 million rivets.',
    validAsOf: '1889',
    timeSensitive: false,
    sources: [
      {
        id: 's1',
        url: 'https://www.toureiffel.paris/en/the-monument/key-figures',
        title: 'The Eiffel Tower in figures',
        publisher: 'Société d’Exploitation de la Tour Eiffel',
        quote: 'The tower is made of 18,038 metallic parts held together by 2,500,000 rivets.',
        published: '2020',
        accessed: '2026-10-01',
        archiveUrl: 'https://web.archive.org/web/20261001120000/https://www.toureiffel.paris/en/the-monument/key-figures',
        archivedAt: '2026-10-01T12:00:00Z',
      },
    ],
    verification: { verifiedAt: '2026-10-01T13:00:00Z', verdict: 'approved', notes: 'quote found on the official site' },
    ...overrides,
  }
}

export function derivedQuestion(overrides: Partial<Question> = {}): Question {
  return makeQuestion({
    question: 'If every human stood on each other’s heads, how many times would the tower reach the Moon?',
    unit: 'times',
    category: 'space',
    kind: 'derived',
    answer: (8.1e9 * 1.7) / 384_400_000,
    formula: 'people = 8.1 billion\nheight = 1.7 # metres\nmoon_km = 384_400\npeople * height / (moon_km * 1000)',
    inputs: [
      { name: 'people', value: 8.1e9, unit: 'people', sourceIds: ['pop'] },
      { name: 'height', value: 1.7, unit: 'm', sourceIds: ['h'] },
      { name: 'moon_km', value: 384_400, unit: 'km', sourceIds: ['moon'] },
    ],
    sources: ['pop', 'h', 'moon'].map((id, i) => ({
      id,
      url: `https://example.org/${id}`,
      title: id,
      publisher: 'Example',
      quote: [
        'World population reached 8.1 billion in 2024.',
        'Average adult height is about 1.7 m.',
        'The average distance to the Moon is 384,400 km.',
      ][i],
      accessed: '2026-10-01',
      archiveUrl: `https://web.archive.org/web/20261002000000/https://example.org/${id}`,
      archivedAt: '2026-10-02T00:00:00Z',
    })),
    ...overrides,
  })
}

export function seed(db: ReturnType<typeof testDb>, count: number) {
  const questions: Question[] = []
  for (let i = 0; i < count; i++) {
    const q = makeQuestion({
      id: `seed-${i}`,
      question: `Seed question number ${i} about distinct topic ${'abcdefghijklmnop'[i]}`,
      answer: 1000 * (i + 1),
    })
    insertQuestion(db, q)
    questions.push(q)
  }
  return questions
}

/** Fake lines from test/fermeanie/, so tests don't depend on FerMEANie's real wording. */
export const testLineFiles = readFluentDir(fileURLToPath(new URL('./fermeanie/', import.meta.url)))
export const testLines = loadLinePool(testLineFiles)
