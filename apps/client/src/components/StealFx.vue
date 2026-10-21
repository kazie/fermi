<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, watch } from 'vue'
import { STEAL } from '@fermi/shared'

/**
 * The points flying from the drained cards into FerMEANie's eye. An overlay inside `root`, which must
 * be positioned. Sources are `[data-steal-from="<playerId>"] .pts`, the target is `[data-steal-to] svg`.
 * Each flight is a CSS animation started with a negative delay, so it runs smoothly however often
 * `t` ticks and lands in the right place when a story scrubs to the middle of it.
 */
const props = defineProps<{
  root: HTMLElement | undefined
  /** ms since the FerMEANie stage started */
  t: number
  starts: Record<string, number>
  points: Record<string, number>
}>()

const active = computed(() =>
  Object.keys(props.starts).filter((id) => props.t >= props.starts[id] && props.t < props.starts[id] + STEAL.flight),
)
const flights = reactive<Record<string, { x: number; y: number; dx: number; dy: number; delay: number }>>({})

function measure(id: string) {
  const root = props.root
  const from = root?.querySelector(`[data-steal-from="${CSS.escape(id)}"] .pts`)
  const to = root?.querySelector('[data-steal-to] svg')
  if (!root || !from || !to) return
  const r = root.getBoundingClientRect()
  const a = from.getBoundingClientRect()
  const b = to.getBoundingClientRect()
  const x = a.left + a.width / 2 - r.left
  const y = a.top + a.height / 2 - r.top
  flights[id] = { x, y, dx: b.left + b.width / 2 - r.left - x, dy: b.top + b.height / 2 - r.top - y, delay: -(props.t - props.starts[id]) }
}

watch(
  active,
  async (ids) => {
    await nextTick()
    for (const id of ids) if (!flights[id]) measure(id)
    for (const id of Object.keys(flights)) if (!ids.includes(id)) delete flights[id]
  },
  { immediate: true },
)
const remeasure = () => active.value.forEach(measure)
onMounted(() => addEventListener('resize', remeasure))
onUnmounted(() => removeEventListener('resize', remeasure))
</script>

<template>
  <div class="fx" aria-hidden="true">
    <template v-for="id in active" :key="id">
      <span
        v-if="flights[id]"
        class="tok-x"
        :style="{
          left: `${flights[id].x}px`,
          top: `${flights[id].y}px`,
          '--dx': `${flights[id].dx}px`,
          '--dy': `${flights[id].dy}px`,
          '--delay': `${flights[id].delay}ms`,
          '--flight': `${STEAL.flight}ms`,
        }"
      >
        <span class="tok-y"
          ><span class="tok mono">+{{ points[id] }}</span></span
        >
      </span>
    </template>
  </div>
</template>

<style scoped>
.fx {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 30;
  overflow: clip;
}
/* x and y animate with different easings, so the points arc up and then drop into the eye */
.tok-x {
  position: absolute;
  animation: fly-x var(--flight) cubic-bezier(0.45, 0, 0.8, 0.6) both;
  animation-delay: var(--delay);
}
.tok-y {
  display: block;
  animation: fly-y var(--flight) cubic-bezier(0.3, -0.9, 0.75, 1) both;
  animation-delay: var(--delay);
}
.tok {
  display: block;
  transform: translate(-50%, -50%);
  font-weight: 900;
  font-size: var(--text-l);
  white-space: nowrap;
  animation: absorb var(--flight) ease-in both;
  animation-delay: var(--delay);
}
@keyframes fly-x {
  to {
    transform: translateX(var(--dx));
  }
}
@keyframes fly-y {
  to {
    transform: translateY(var(--dy));
  }
}
@keyframes absorb {
  0% {
    color: var(--ok);
    opacity: 1;
    transform: translate(-50%, -50%) scale(1.3);
    text-shadow: 0 0 10px rgba(123, 216, 143, 0.6);
  }
  45% {
    color: var(--fer);
    text-shadow: 0 0 14px var(--fer-glow);
  }
  85% {
    opacity: 1;
  }
  100% {
    color: var(--fer);
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.35);
  }
}
@media (prefers-reduced-motion: reduce) {
  .fx {
    display: none;
  }
}
</style>
