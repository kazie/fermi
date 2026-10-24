import { describe, expect, it } from 'vitest'
import { clipKey } from '../src/voice/speech.ts'
import { lockedVersions, voiceFingerprint } from '../src/voice/worker.ts'

describe('clipKey', () => {
  it('depends on the voice settings and the sentence', () => {
    const k = clipKey('a', 'Hello.')
    expect(k).toMatch(/^[0-9a-f]{32}$/)
    expect(clipKey('a', 'Hello.')).toBe(k)
    expect(clipKey('b', 'Hello.')).not.toBe(k)
    expect(clipKey('a', 'Hello!')).not.toBe(k)
  })
})

describe('voiceFingerprint', () => {
  const config = JSON.stringify({ engine: 'kokoro', engineDeps: ['kokoro-onnx', 'onnxruntime'], speed: 1 })
  const lock = (versions: Record<string, string>) =>
    Object.entries(versions)
      .map(
        ([name, version]) => `[[package]]\nname = "${name}"\nversion = "${version}"\nsource = { registry = "https://pypi.org/simple" }\n`,
      )
      .join('\n')
  const base = { 'kokoro-onnx': '0.4.9', onnxruntime: '1.31.0', numpy: '2.4.6' }

  it('reads the versions uv.lock pins', () => {
    expect(lockedVersions(lock(base))).toEqual(new Map(Object.entries(base)))
  })
  it('changes when the voice engine changes, not when anything else does', () => {
    const f = voiceFingerprint(config, lock(base))
    expect(voiceFingerprint(config, lock({ ...base, onnxruntime: '1.32.0' }))).not.toBe(f)
    expect(voiceFingerprint(config.replace('"speed":1', '"speed":1.1'), lock(base))).not.toBe(f)
    expect(voiceFingerprint(config, lock({ ...base, numpy: '2.5.0' }))).toBe(f)
  })
  it("refuses an engine package the lock doesn't have", () => {
    expect(() => voiceFingerprint(config, lock({ numpy: '2.4.6' }))).toThrow(/kokoro-onnx/)
  })
  it('matches the real voice.json and uv.lock', () => {
    expect(JSON.parse(voiceFingerprint()).engine).toHaveProperty('kokoro-onnx')
  })
})
