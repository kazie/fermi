<script setup lang="ts">
import { CALLS, type Call } from '@fermi/shared'
import { S } from '@/lib/strings'

/**
 * The call's two buttons, higher and lower, with `selected` pressed. `inert` draws them as a picture (the intro's rule
 * slide), not buttons.
 */
defineProps<{ selected?: Call; inert?: boolean }>()
const emit = defineEmits<{ call: [Call] }>()
</script>

<template>
  <div v-if="inert" class="buttons" aria-hidden="true">
    <span v-for="c in CALLS" :key="c" class="btn">{{ S.call.button[c] }}</span>
  </div>
  <div v-else class="buttons">
    <button
      v-for="c in CALLS"
      :key="c"
      type="button"
      class="btn"
      :class="{ 'btn-primary': selected === c }"
      :aria-pressed="selected === c"
      @click="emit('call', c)"
    >
      {{ S.call.button[c] }}
    </button>
  </div>
</template>

<style scoped>
.buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
  width: 100%;
}
.btn {
  min-height: 52px;
  font-size: var(--text-l);
}
span.btn {
  pointer-events: none;
}
</style>
