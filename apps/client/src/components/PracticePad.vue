<script setup lang="ts">
import { computed, ref } from 'vue'
import { evaluateSheet, formatFactor, formatNumber, logError } from '@fermi/shared'
import AnswerBlock from './AnswerBlock.vue'

const PRACTICE = {
  question: 'How many seconds are there in a leap year?',
  unit: 'seconds',
  answer: 366 * 24 * 60 * 60,
  explanation: '366 days × 24 hours × 60 minutes × 60 seconds.',
}

const text = ref('')
const checked = ref(false)
const value = computed(() => evaluateSheet(text.value).answer)
const verdict = computed(() => {
  if (value.value === null) return ''
  const err = logError(value.value, PRACTICE.answer)
  if (!Number.isFinite(err)) return 'That’s not even positive. FerMEANie has made a note.'
  const f = 10 ** err
  if (f < 1.0005) return 'Exactly right. Suspiciously right.'
  return `${formatFactor(f)} too ${value.value > PRACTICE.answer ? 'high' : 'low'}.`
})
</script>

<template>
  <section class="practice card">
    <span class="eyebrow">Practice while you wait (not scored)</span>
    <h3>{{ PRACTICE.question }}</h3>
    <AnswerBlock
      v-model="text"
      :lockable="false"
      :unit="PRACTICE.unit"
      :min-rows="3"
      placeholder="days = 366&#10;days * 24 * 60 * 60"
      @update:model-value="checked = false"
    />
    <div class="row">
      <button class="btn" type="button" :disabled="value === null" @click="checked = true">Check</button>
      <span v-if="checked" class="result">
        <strong class="mono">{{ formatNumber(PRACTICE.answer) }}</strong> — {{ verdict }}
        <span class="muted">{{ PRACTICE.explanation }}</span>
      </span>
    </div>
  </section>
</template>

<style scoped>
.practice {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.practice h3 {
  font-size: var(--text-m);
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: center;
}
.result {
  display: flex;
  flex-direction: column;
  font-size: var(--text-s);
}
</style>
