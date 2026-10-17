<script setup lang="ts">
import { useKeyboardInset } from '@/composables/useKeyboardInset'

defineProps<{ variables?: string[] }>()
const emit = defineEmits<{ insert: [string] }>()

useKeyboardInset()

const KEYS: { label: string; text: string; aria?: string }[] = [
  { label: '×', text: ' × ', aria: 'times' },
  { label: '÷', text: ' / ', aria: 'divide' },
  { label: '^', text: '^', aria: 'power' },
  { label: '(', text: '(' },
  { label: ')', text: ')' },
  { label: '=', text: ' = ', aria: 'equals (name a value)' },
  { label: '#', text: ' # ', aria: 'comment' },
  { label: 'k', text: 'k', aria: 'thousand' },
  { label: 'M', text: 'M', aria: 'million' },
  { label: 'B', text: 'B', aria: 'billion' },
  { label: 'e', text: 'e', aria: 'times ten to the' },
  { label: '%', text: '%' },
]
</script>

<template>
  <div class="helper-keys" role="toolbar" aria-label="Maths keys">
    <div class="row">
      <button
        v-for="k in KEYS"
        :key="k.label"
        type="button"
        class="key mono"
        :aria-label="k.aria ?? k.label"
        @pointerdown.prevent
        @click="emit('insert', k.text)"
      >
        {{ k.label }}
      </button>
    </div>
    <div v-if="variables?.length" class="row vars">
      <button v-for="v in variables" :key="v" type="button" class="key var mono" @pointerdown.prevent @click="emit('insert', v)">
        {{ v }}
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Only on touch devices: desktop users have a keyboard with all of these. */
.helper-keys {
  display: none;
}
@media (pointer: coarse) {
  .helper-keys {
    display: flex;
    flex-direction: column;
    gap: 4px;
    position: fixed;
    left: 0;
    right: 0;
    bottom: var(--kb-inset, 0px);
    z-index: 50;
    padding: 6px 6px calc(6px + env(safe-area-inset-bottom));
    background: color-mix(in srgb, var(--surface) 94%, transparent);
    backdrop-filter: blur(8px);
    border-top: 1px solid var(--border);
  }
}
.row {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  scrollbar-width: none;
}
.key {
  flex: 1 0 40px;
  min-height: 42px;
  border-radius: var(--radius-s);
  border: 1px solid var(--border-strong);
  background: var(--surface-2);
  font-size: 18px;
  cursor: pointer;
}
.key:active {
  background: var(--surface-3);
}
.var {
  flex: 0 0 auto;
  padding: 0 12px;
  font-size: 15px;
  color: var(--syn-var);
}
</style>
