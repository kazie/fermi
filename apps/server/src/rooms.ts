import { Room, type RoomDeps } from './game.ts'

// No I or O: too easy to confuse with 1 and 0 when read aloud or off a screen.
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
export const ROOM_IDLE_MS = 30 * 60_000
export const MAX_ROOMS = 2000
const MAX_CODE_ATTEMPTS = 50

export class RoomsFullError extends Error {}

export class RoomRegistry {
  private rooms = new Map<string, Room>()
  private deps: RoomDeps
  private sweeper: ReturnType<typeof setInterval>

  constructor(deps: RoomDeps) {
    this.deps = deps
    this.sweeper = setInterval(() => this.sweep(), 60_000)
    this.sweeper.unref?.()
  }

  create(): Room {
    if (this.rooms.size >= MAX_ROOMS) this.sweep()
    if (this.rooms.size >= MAX_ROOMS) throw new RoomsFullError('Too many open rooms right now')
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      let code = ''
      for (let i = 0; i < 4; i++) code += LETTERS[Math.floor(Math.random() * LETTERS.length)]
      if (!this.rooms.has(code)) {
        const room = new Room(code, this.deps)
        this.rooms.set(code, room)
        return room
      }
    }
    throw new RoomsFullError('Could not find a free room code')
  }

  liveQuestionIds(): Set<string> {
    const ids = new Set<string>()
    for (const r of this.rooms.values()) {
      const q = r.liveQuestionId
      if (q) ids.add(q)
    }
    return ids
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase())
  }

  get size() {
    return this.rooms.size
  }

  sweep(now = Date.now()) {
    for (const [code, room] of this.rooms) {
      if (room.connectedCount === 0 && now - room.lastActivity > ROOM_IDLE_MS) {
        room.dispose()
        this.rooms.delete(code)
      }
    }
  }

  dispose() {
    clearInterval(this.sweeper)
    for (const r of this.rooms.values()) r.dispose()
    this.rooms.clear()
  }
}
