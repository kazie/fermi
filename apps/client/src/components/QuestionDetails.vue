<script setup lang="ts">
import type { RevealedQuestion } from '@fermi/shared'
import DisputeForm, { type DisputeState } from './DisputeForm.vue'
import TruthPanel from './TruthPanel.vue'

/** One played question with its sources, status and the dispute form. Pure; the view fetches. */
withDefaults(
  defineProps<{
    question: RevealedQuestion
    status: string
    flags?: string[]
    dispute?: { state: DisputeState; error: string }
  }>(),
  { flags: () => [], dispute: () => ({ state: 'idle', error: '' }) },
)
const emit = defineEmits<{ dispute: [message: string] }>()
</script>

<template>
  <div class="qp">
    <span class="eyebrow">{{ question.category.replace(/-/g, ' ') }}</span>
    <h1>{{ question.question }}</h1>
    <p v-if="status !== 'active'" class="warn">
      {{ status === 'disputed' ? 'This answer has been disputed and is being re-checked.' : 'This question has been retired.' }}
    </p>
    <p v-for="f in flags.filter((f) => f.startsWith('source-changed'))" :key="f" class="warn">
      A source page has changed since it was accessed. The archived copy still shows the quoted text.
    </p>
    <TruthPanel :question="question" :link="false" />
    <DisputeForm v-bind="dispute" @submit="(m: string) => emit('dispute', m)" />
  </div>
</template>

<style scoped>
.qp {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: 760px;
}
.qp h1 {
  font-size: var(--text-xl);
}
.warn {
  color: var(--warn);
  margin: 0;
}
.err {
  color: var(--danger);
}
</style>
