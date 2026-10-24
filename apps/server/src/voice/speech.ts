// The clip key for a sentence of FerMEANie's voice (see voice/index.ts). What she says, and how it's split into
// sentences, is shared with the chat's pacing: @fermi/shared speech.ts.

import { createHash } from 'node:crypto'

/** The clip for one sentence in this voice: changing any setting gives every sentence a new key. */
export function clipKey(settings: string, sentence: string): string {
  return createHash('sha256').update(settings).update('\n').update(sentence).digest('hex').slice(0, 32)
}

/** A clip key: what clipKey returns. */
export const CLIP_KEY_RE = /^[0-9a-f]{32}$/
