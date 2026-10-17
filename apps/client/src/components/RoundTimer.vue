<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ startedAt: number; endsAt: number; now: number }>()
const left = computed(() => Math.max(0, props.endsAt - props.now))
const secs = computed(() => Math.ceil(left.value / 1000))
const frac = computed(() => Math.min(1, left.value / Math.max(1, props.endsAt - props.startedAt)))
const urgent = computed(() => secs.value <= 10)
</script>

<template>
  <div class="timer" :class="{ urgent, done: left === 0 }" role="timer" :aria-label="`${secs} seconds left`">
    <div class="bar"><div class="fill" :style="{ transform: `scaleX(${frac})` }"></div></div>
    <span class="secs mono">{{ secs }}s</span>
  </div>
</template>

<style scoped>
.timer {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.bar {
  flex: 1;
  height: 8px;
  border-radius: 999px;
  background: var(--surface-3);
  overflow: hidden;
}
.fill {
  height: 100%;
  background: var(--blue);
  transform-origin: left;
  transition: transform 100ms linear;
}
.secs {
  min-width: 3.5ch;
  text-align: right;
  font-weight: 700;
  font-size: var(--text-l);
}
.urgent .fill {
  background: var(--danger);
}
.urgent .secs {
  color: var(--danger);
  animation: pulse 1s infinite;
}
@keyframes pulse {
  50% {
    opacity: 0.5;
  }
}
@media (prefers-reduced-motion: reduce) {
  .urgent .secs {
    animation: none;
  }
}
</style>
