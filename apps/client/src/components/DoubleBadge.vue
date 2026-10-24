<script setup lang="ts">
import { S } from '@/lib/strings'

/** The final question's badge: its points count `multiplier` times (×2). */
withDefaults(defineProps<{ multiplier: number; big?: boolean }>(), { big: false })
</script>

<template>
  <span class="x2" :class="{ big }"
    ><b class="mono">×{{ multiplier }}</b> {{ S.doublePoints(multiplier) }}</span
  >
</template>

<style scoped>
.x2 {
  display: inline-flex;
  align-items: baseline;
  gap: 0.4em;
  width: fit-content;
  padding: 2px 10px;
  border-radius: 999px;
  border: 1px solid var(--gold);
  color: var(--gold);
  background: rgba(255, 209, 102, 0.1);
  font-size: var(--text-s);
  font-weight: 600;
  animation: glow 1.6s var(--ease) infinite alternate;
}
.x2 b {
  font-size: 1.2em;
}
.big {
  font-size: var(--text-l);
}
@keyframes glow {
  to {
    box-shadow: 0 0 14px rgba(255, 209, 102, 0.45);
  }
}
@media (prefers-reduced-motion: reduce) {
  .x2 {
    animation: none;
  }
}
</style>
