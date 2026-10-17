import { inject, provide, type InjectionKey, type Ref } from 'vue'

/**
 * Player colours by join order, so everyone at the table is easy to tell apart.
 * The first 12 are hand-picked to be clearly different from each other; after that, golden-angle hues
 * with alternating lightness. None are near red: red is FerMEANie's.
 */
const PALETTE = [
  '#4fb3ff', // blue
  '#ffb03c', // orange
  '#7bd88f', // green
  '#c792ea', // purple
  '#ffe066', // yellow
  '#2ed6c6', // teal
  '#ff7eb6', // pink
  '#a3b8ff', // periwinkle
  '#b5e550', // lime
  '#d4a373', // tan
  '#e879f9', // magenta
  '#e8edf2', // white
]

/** Hues within this many degrees of FerMEANie's red (0°) are skipped. */
export const RED_ZONE = 25

export function colorFor(index: number): string {
  if (index < PALETTE.length) return PALETTE[index]
  let k = 0
  let accepted = -1
  let hue = 0
  while (accepted < index - PALETTE.length) {
    hue = (200 + k * 137.508) % 360
    k++
    if (hue < RED_ZONE || hue > 360 - RED_ZONE) continue
    accepted++
  }
  const light = index % 2 ? 72 : 56
  return `hsl(${hue.toFixed(0)} 75% ${light}%)`
}

const KEY: InjectionKey<Ref<string[]>> = Symbol('player-order')

/** Call in a view that knows the players: their order decides the colours. */
export function providePlayerOrder(ids: Ref<string[]>) {
  provide(KEY, ids)
}

/**
 * Without a provided order (stories, isolated components), ids get colours in the order they are first
 * seen, so they are still all different. A hash would squeeze ids into the palette and repeat colours.
 */
const firstSeen: string[] = []
function fallbackIndex(id: string): number {
  let i = firstSeen.indexOf(id)
  if (i === -1) i = firstSeen.push(id) - 1
  return i
}

/** A function from player id to colour. */
export function usePlayerColors(): (id: string) => string {
  const order = inject(KEY, null)
  return (id: string) => {
    const i = order?.value.indexOf(id) ?? -1
    return colorFor(i >= 0 ? i : fallbackIndex(id))
  }
}
