<script setup lang="ts">
import { S } from '@/lib/strings'

/**
 * A reminder that sound is half the fun. `locked`: sound is on, but the browser waits for a tap, so any tap will do
 * (this button too). `muted`: it was turned off on purpose, so this only asks, quietly.
 */
defineProps<{ state: 'locked' | 'muted'; tv?: boolean }>()
const emit = defineEmits<{ on: [] }>()
</script>

<template>
  <button type="button" class="nudge" :class="[state, { tv }]" @click="emit('on')">
    {{ state === 'locked' ? S.soundLocked(!!tv) : S.soundMuted }}
  </button>
</template>

<style scoped>
.nudge {
  display: block;
  margin: 0 auto var(--space-3);
  max-width: 100%;
  padding: var(--space-2) var(--space-4);
  border-radius: 999px;
  border: 1px solid var(--border-strong);
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  cursor: pointer;
  text-align: center;
}
.locked {
  border-color: var(--accent);
  background: var(--accent-soft);
  animation: breathe 2.4s ease-in-out infinite;
}
.muted {
  color: var(--muted);
  font-size: 0.9rem;
}
.tv {
  font-size: 1.4rem;
  padding: var(--space-3) var(--space-5);
}
@keyframes breathe {
  50% {
    transform: scale(1.04);
  }
}
@media (prefers-reduced-motion: reduce) {
  .locked {
    animation: none;
  }
}
</style>
