<script setup lang="ts">
import { computed } from 'vue'
import { usePlayerColors } from '@/lib/playerColors'
import { hash, rng } from '@/lib/random'

export type AvatarState = 'idle' | 'locked' | 'typing' | 'off' | 'drained'

const props = withDefaults(defineProps<{ seed: string; size?: number; state?: AvatarState }>(), { size: 24, state: 'idle' })

// Colour comes from the player's join order (distinct per table); the shape from the seed.
const colorOf = usePlayerColors()

const look = computed(() => {
  const h = hash(props.seed)
  const r = rng(h)
  const color = colorOf(props.seed)
  // a soft blob: six points at slightly different radii, joined through their midpoints
  const n = 6
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + r() * 0.4
    const rad = 9 + (r() - 0.5) * 3
    return [12 + Math.cos(a) * rad, 13 + Math.sin(a) * rad * 0.92]
  })
  const mid = (p: number[], q: number[]) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]
  const f = (v: number) => v.toFixed(2)
  const start = mid(pts[n - 1], pts[0])
  let d = `M${f(start[0])} ${f(start[1])}`
  for (let i = 0; i < n; i++) {
    const m = mid(pts[i], pts[(i + 1) % n])
    d += ` Q${f(pts[i][0])} ${f(pts[i][1])} ${f(m[0])} ${f(m[1])}`
  }
  return { color, d, delay: `${-Math.floor(r() * 4000)}ms`, eyeGap: 3 + r() * 1.2 }
})
const grey = computed(() => props.state === 'off' || props.state === 'drained')
</script>

<template>
  <svg class="pa" :class="state" :width="size" :height="size" viewBox="0 0 24 24" aria-hidden="true" :style="{ '--delay': look.delay }">
    <g class="body">
      <path :d="look.d" :fill="grey ? '#5b6472' : look.color" />
      <g class="face" fill="#0b0e13" stroke="#0b0e13" stroke-linecap="round" stroke-width="1.3">
        <template v-if="state === 'locked'">
          <path :d="`M${12 - look.eyeGap - 1.4} 12 q1.4 -1.6 2.8 0 M${12 + look.eyeGap - 1.4} 12 q1.4 -1.6 2.8 0`" fill="none" />
          <path d="M9.6 15.2 q2.4 2.2 4.8 0" fill="none" />
        </template>
        <template v-else-if="state === 'off'">
          <path :d="`M${12 - look.eyeGap - 1.2} 12 h2.4 M${12 + look.eyeGap - 1.2} 12 h2.4`" fill="none" />
        </template>
        <template v-else-if="state === 'drained'">
          <path :d="`M${12 - look.eyeGap - 1.3} 11.2 l2.6 1 M${12 + look.eyeGap + 1.3} 11.2 l-2.6 1`" fill="none" />
          <path d="M9.8 16.4 q2.2 -1.8 4.4 0" fill="none" />
        </template>
        <template v-else>
          <g class="eyes">
            <ellipse :cx="12 - look.eyeGap" cy="11.6" rx="1.3" ry="1.6" stroke="none" />
            <ellipse :cx="12 + look.eyeGap" cy="11.6" rx="1.3" ry="1.6" stroke="none" />
          </g>
          <circle v-if="state === 'typing'" cx="12" cy="15.6" r="1.1" stroke="none" />
          <path v-else d="M10.2 15.2 q1.8 1.4 3.6 0" fill="none" />
        </template>
      </g>
    </g>
  </svg>
</template>

<style scoped>
.pa {
  flex: none;
  display: inline-block;
  vertical-align: middle;
  overflow: visible;
}
.body {
  transform-origin: 12px 20px;
  transform-box: view-box;
  animation: squish 3.6s ease-in-out infinite;
  animation-delay: var(--delay);
}
.typing .body {
  animation: bob 0.6s ease-in-out infinite;
}
.locked .body {
  animation: squish 2.4s ease-in-out infinite;
}
.off .body,
.drained .body {
  animation: none;
}
.drained .body {
  transform: translateY(1px) scaleY(0.92);
}
.eyes {
  transform-origin: 12px 11.6px;
  transform-box: view-box;
  animation: blink 4.8s ease-in-out infinite;
  animation-delay: var(--delay);
}
@keyframes squish {
  0%,
  100% {
    transform: scale(1, 1);
  }
  50% {
    transform: scale(1.04, 0.95);
  }
}
@keyframes bob {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-1.6px);
  }
}
@keyframes blink {
  0%,
  92%,
  100% {
    transform: scaleY(1);
  }
  95% {
    transform: scaleY(0.1);
  }
}
@media (prefers-reduced-motion: reduce) {
  .body,
  .typing .body,
  .locked .body,
  .eyes {
    animation: none;
  }
}
</style>
