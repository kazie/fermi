import { KEY_RE } from '@fermi/shared'

// localStorage can be missing or throw (private mode, blocked site data); never let that break the game.
export function load(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

let memoryKey: string | undefined

/**
 * This browser's private player key: proves who you are when reconnecting and keys your question
 * history. Never shown to anyone; other players only see a random per-room id.
 */
export function playerKey(): string {
  const existing = load('fermi.key')
  if (existing && KEY_RE.test(existing)) return existing
  if (!memoryKey) {
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    memoryKey = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  }
  save('fermi.key', memoryKey)
  return memoryKey
}

/** Your public id in a finished game, so its recap can highlight you. */
export const rememberGameId = (gameId: string, publicId: string) => save(`fermi.you.${gameId}`, publicId)
export const myIdInGame = (gameId: string) => load(`fermi.you.${gameId}`)

export const savedName = () => load('fermi.name') ?? ''
export const saveName = (name: string) => save('fermi.name', name)

/** With a big screen in the room, phones show either a compact controller or the full reveal. */
export type PhoneView = 'controller' | 'full'
export const savedPhoneView = (): PhoneView => (load('fermi.view') === 'full' ? 'full' : 'controller')
export const savePhoneView = (v: PhoneView) => save('fermi.view', v)
