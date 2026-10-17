<script setup lang="ts">
import { computed } from 'vue'
import { usePlayerColors } from '@/lib/playerColors'
import { formatCompact, superscript } from '@fermi/shared'
import DunceCap from './DunceCap.vue'

export interface Guess {
  id: string
  name: string
  value: number | null
  /** Swarm outliers (known before the truth) don't stretch the axis; they get pinned to the edge. */
  outlier?: boolean
  /** Shows the dunce cap. Only pass it once the truth is revealed: it gives away who was way off. */
  dunce?: boolean
  you?: boolean
}

const props = withDefaults(
  defineProps<{
    guesses: Guess[]
    truth?: number | null
    fermeanie?: number | null
    /** id of the guess to emphasise (the card being flipped) */
    highlight?: string | null
    /**
     * ids of the guesses to draw, or null for all. The layout (axis, label rows) always uses every
     * guess, so pins can appear one by one during the reveal without anything jumping.
     */
    shown?: string[] | null
  }>(),
  { truth: null, fermeanie: null, highlight: null, shown: null },
)

const colorOf = usePlayerColors()
const PAD = 0.35 // decades of padding either side

const domain = computed(() => {
  const logs: number[] = []
  for (const g of props.guesses) if (g.value && g.value > 0 && !g.outlier && !g.dunce) logs.push(Math.log10(g.value))
  if (props.truth) logs.push(Math.log10(props.truth))
  if (props.fermeanie) logs.push(Math.log10(props.fermeanie))
  if (!logs.length) for (const g of props.guesses) if (g.value && g.value > 0) logs.push(Math.log10(g.value))
  if (!logs.length) return { lo: 0, hi: 3 }
  let lo = Math.min(...logs)
  let hi = Math.max(...logs)
  if (hi - lo < 1) {
    const mid = (hi + lo) / 2
    lo = mid - 0.5
    hi = mid + 0.5
  }
  return { lo: lo - PAD, hi: hi + PAD }
})

function pos(v: number): { x: number; clipped: 'lo' | 'hi' | null } {
  const { lo, hi } = domain.value
  const l = Math.log10(v)
  if (l < lo) return { x: 0, clipped: 'lo' }
  if (l > hi) return { x: 100, clipped: 'hi' }
  return { x: ((l - lo) / (hi - lo)) * 100, clipped: null }
}

function shortLabel(k: number): string {
  if (k < 0) return `10${superscript(k)}`
  if (k <= 2) return String(10 ** k)
  if (k > 15) return `10${superscript(k)}`
  const units: [number, string][] = [
    [15, 'Q'],
    [12, 'T'],
    [9, 'B'],
    [6, 'M'],
    [3, 'k'],
  ]
  for (const [p, u] of units) if (k >= p) return `${10 ** (k - p)}${u}`
  return String(10 ** k)
}

const ticks = computed(() => {
  const { lo, hi } = domain.value
  const first = Math.ceil(lo)
  const last = Math.floor(hi)
  const n = last - first + 1
  const step = n > 8 ? Math.ceil(n / 7) : 1
  const out: { x: number; label: string }[] = []
  for (let k = first; k <= last; k += step) out.push({ x: ((k - lo) / (hi - lo)) * 100, label: shortLabel(k) })
  return out
})

/** Greedy row assignment so labels don't overlap. */
const pins = computed(() => {
  const placed: {
    id: string
    name: string
    x: number
    row: number
    clipped: 'lo' | 'hi' | null
    value: number | null
    you?: boolean
    dunce?: boolean
    nonPos: boolean
  }[] = []
  const items = props.guesses
    .filter((g) => g.value !== null)
    .map((g) => {
      const nonPos = !(g.value! > 0)
      const p = nonPos ? { x: 0, clipped: 'lo' as const } : pos(g.value!)
      return { ...g, ...p, nonPos }
    })
    .sort((a, b) => a.x - b.x)
  const rowEnds: number[] = []
  for (const it of items) {
    const width = Math.min(30, 4 + it.name.length * 1.6)
    let row = rowEnds.findIndex((end) => end <= it.x - 1)
    if (row === -1) {
      row = rowEnds.length
      rowEnds.push(0)
    }
    rowEnds[row] = it.x + width
    placed.push({
      id: it.id,
      name: it.name,
      x: it.x,
      row,
      clipped: it.clipped,
      value: it.value,
      you: it.you,
      dunce: it.dunce,
      nonPos: it.nonPos,
    })
  }
  return placed
})
const rows = computed(() => Math.max(1, ...pins.value.map((p) => p.row + 1)))
const visiblePins = computed(() => (props.shown ? pins.value.filter((p) => props.shown!.includes(p.id)) : pins.value))

const truthPos = computed(() => (props.truth ? pos(props.truth) : null))
const ferPos = computed(() => (props.fermeanie ? pos(props.fermeanie) : null))
</script>

<template>
  <div
    class="nl"
    :class="{ 'has-fer': !!ferPos }"
    :style="{ '--rows': rows }"
    role="img"
    :aria-label="`Number line of ${shown ? shown.length : guesses.length} answers on a logarithmic scale`"
  >
    <div class="track">
      <div
        v-for="p in visiblePins"
        :key="p.id"
        class="pin"
        :class="{ you: p.you, hl: p.id === highlight, dunce: p.dunce, clipped: p.clipped }"
        :style="{ left: `${p.x}%`, '--row': p.row, '--pc': colorOf(p.id) }"
        :title="p.value !== null ? `${p.name}: ${formatCompact(p.value)}` : p.name"
      >
        <span class="label">
          <span v-if="p.clipped === 'lo'" aria-hidden="true">←</span>
          <DunceCap v-if="p.dunce" still />
          {{ p.name }}
          <span v-if="p.clipped === 'hi'" aria-hidden="true">→</span>
        </span>
        <span class="stem"></span>
      </div>

      <div v-if="truthPos" class="truth" :style="{ left: `${truthPos.x}%` }">
        <span class="truth-label">✓ {{ formatCompact(truth!) }}</span>
      </div>
      <div v-if="ferPos" class="fer" :style="{ left: `${ferPos.x}%` }" :title="`FerMEANie: ${formatCompact(fermeanie!)}`">
        <span class="fer-dot" aria-hidden="true"></span>
        <span class="fer-label">FerMEANie</span>
      </div>
    </div>
    <div class="axis">
      <div v-for="t in ticks" :key="t.label" class="tick" :style="{ left: `${t.x}%` }">
        <span class="mono">{{ t.label }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.nl {
  --row-h: 26px;
  position: relative;
  padding: 22px var(--space-5) 0;
  user-select: none;
  overflow-x: clip; /* labels at the edges must never cause page-level horizontal scroll */
}
.track {
  position: relative;
  height: calc(var(--rows) * var(--row-h) + 18px);
  border-bottom: 2px solid var(--border-strong);
}
.pin {
  position: absolute;
  bottom: 0;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  transition:
    left var(--dur-slow) var(--ease),
    opacity var(--dur);
  animation: drop var(--dur-slow) var(--ease) both;
}
.label {
  position: absolute;
  bottom: calc(var(--row) * var(--row-h) + 14px);
  white-space: nowrap;
  font-size: 12px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid var(--border-strong);
  color: var(--text-dim);
  border-left: 3px solid var(--pc, var(--border-strong));
  transition: bottom var(--dur);
}
.stem {
  width: 2px;
  height: calc(var(--row) * var(--row-h) + 14px);
  background: var(--border-strong);
}
.pin.you .label {
  border-color: var(--blue);
  color: var(--blue);
}
.pin.hl .label {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-ink);
  font-weight: 700;
}
.pin.dunce .label {
  border-style: dashed;
}
@keyframes drop {
  from {
    opacity: 0;
    transform: translate(-50%, -20px);
  }
}
.truth {
  position: absolute;
  top: -6px;
  bottom: -8px;
  width: 3px;
  margin-left: -1.5px;
  background: var(--gold);
  box-shadow: 0 0 12px rgba(255, 209, 102, 0.7);
  transition: left var(--dur-slow) var(--ease);
  animation: land var(--dur-slow) var(--ease) both;
  z-index: 2;
}
.truth-label {
  position: absolute;
  top: -20px;
  left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  font-size: 12px;
  font-weight: 800;
  color: var(--gold);
}
@keyframes land {
  from {
    opacity: 0;
    transform: scaleY(0);
  }
}
.fer {
  position: absolute;
  bottom: -9px;
  transform: translateX(-50%);
  transition: left var(--dur-slow) var(--ease);
  z-index: 3;
}
.nl.has-fer {
  padding-bottom: 18px;
}
.fer-label {
  position: absolute;
  top: 40px;
  left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: var(--fer);
  background: var(--surface);
  border: 1px solid rgba(255, 79, 79, 0.45);
  border-radius: 999px;
  padding: 0 6px;
  animation: land var(--dur-slow) var(--ease) both;
}
.fer-dot {
  display: block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: radial-gradient(circle, #ffe2d6 0 25%, var(--fer) 30% 100%);
  box-shadow: 0 0 12px var(--fer-glow);
  animation: land var(--dur-slow) var(--ease) both;
}
.axis {
  position: relative;
  height: 22px;
}
.tick {
  position: absolute;
  top: 4px;
  transform: translateX(-50%);
  font-size: 11px;
  color: var(--muted);
}
.tick::before {
  content: '';
  position: absolute;
  top: -8px;
  left: 50%;
  width: 1px;
  height: 6px;
  background: var(--border-strong);
}
</style>
