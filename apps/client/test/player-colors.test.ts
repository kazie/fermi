import { describe, expect, it } from 'vitest'
import { colorFor, RED_ZONE } from '../src/lib/playerColors'

const hueOf = (c: string) => {
  const m = /^hsl\((\d+)/.exec(c)
  if (m) return Number(m[1])
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max === min) return null // grey/white: no hue
  const d = max - min
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (h * 60 + 360) % 360
}

describe('player colours', () => {
  it('gives 30 players 30 different colours', () => {
    const colors = Array.from({ length: 30 }, (_, i) => colorFor(i))
    expect(new Set(colors).size).toBe(30)
  })
  it('never looks like FerMEANie (no reds)', () => {
    for (let i = 0; i < 40; i++) {
      const h = hueOf(colorFor(i))
      if (h !== null) expect(Math.min(h, 360 - h), colorFor(i)).toBeGreaterThan(RED_ZONE - 1)
    }
  })
})

describe('player colours without a room (stories)', () => {
  it('gives every id its own colour, in first-seen order', async () => {
    const { defineComponent, h } = await import('vue')
    const { mount } = await import('@vue/test-utils')
    const { usePlayerColors } = await import('../src/lib/playerColors')
    let colorOf!: (id: string) => string
    mount(defineComponent({ setup: () => ((colorOf = usePlayerColors()), () => h('div')) }))
    const ids = Array.from({ length: 16 }, (_, i) => `p${i}`)
    const colors = ids.map((id) => colorOf(id))
    expect(new Set(colors).size).toBe(16)
    expect(colorOf('p8')).not.toBe(colorOf('p11'))
    expect(colorOf('p9')).not.toBe(colorOf('p10'))
    expect(colorOf('p3')).toBe(colors[3]) // stable
  })
})
