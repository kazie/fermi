<script setup lang="ts">
import type { PhoneView } from '@/lib/storage'
import { S } from '@/lib/strings'

defineProps<{ modelValue: PhoneView }>()
const emit = defineEmits<{ 'update:modelValue': [PhoneView] }>()
</script>

<template>
  <div class="view-toggle segmented" role="group" aria-label="Phone view">
    <button type="button" :aria-pressed="modelValue === 'controller'" @click="emit('update:modelValue', 'controller')">
      📺 {{ S.controllerView }}
    </button>
    <button type="button" :aria-pressed="modelValue === 'full'" @click="emit('update:modelValue', 'full')">{{ S.fullView }}</button>
  </div>
</template>

<style scoped>
.view-toggle {
  align-self: center;
}
.view-toggle button {
  min-height: 36px;
  font-size: var(--text-s);
}
</style>
