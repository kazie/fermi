<script setup lang="ts">
import { REACTIONS, type Reaction } from '@fermi/shared'
import { S } from '@/lib/strings'

/** The emoji buttons on a phone during the reveal and the break. */
const emit = defineEmits<{ react: [Reaction] }>()
</script>

<template>
  <div class="bar" role="group" :aria-label="S.react">
    <button v-for="e in REACTIONS" :key="e" type="button" class="r" :aria-label="`${S.react} ${e}`" @click="emit('react', e)">
      {{ e }}
    </button>
  </div>
</template>

<style scoped>
.bar {
  display: flex;
  justify-content: center;
  gap: var(--space-1);
  flex-wrap: wrap;
}
.r {
  min-width: 44px;
  min-height: 44px;
  font-size: 1.4rem;
  border-radius: 999px;
  border: 1px solid var(--border-strong);
  background: var(--surface-2);
  cursor: pointer;
  transition: transform var(--dur-fast) var(--ease);
}
.r:active {
  transform: scale(0.88);
}
</style>
