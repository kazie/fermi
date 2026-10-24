import { describe, expect, it } from 'vitest'
import { clipKey } from '../src/voice/speech.ts'

describe('clipKey', () => {
  it('depends on the voice settings and the sentence', () => {
    const k = clipKey('a', 'Hello.')
    expect(k).toMatch(/^[0-9a-f]{32}$/)
    expect(clipKey('a', 'Hello.')).toBe(k)
    expect(clipKey('b', 'Hello.')).not.toBe(k)
    expect(clipKey('a', 'Hello!')).not.toBe(k)
  })
})
