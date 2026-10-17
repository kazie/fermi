<script setup lang="ts">
import { formatApprox, formatNumber, type RevealedQuestion } from '@fermi/shared'
import SourceList from './SourceList.vue'
import WorkingView from './WorkingView.vue'

withDefaults(defineProps<{ question: RevealedQuestion; showSources?: boolean; link?: boolean }>(), { showSources: true, link: true })
</script>

<template>
  <section class="truth card" aria-label="The answer">
    <span class="eyebrow">The answer</span>
    <div class="ans">
      <strong class="mono">{{ formatNumber(question.answer) }}</strong>
      <span class="unit">{{ question.unit }}</span>
    </div>
    <div v-if="formatApprox(question.answer)" class="muted approx">
      {{ formatApprox(question.answer) }} · valid as of {{ question.validAsOf }}
    </div>
    <div v-else class="muted approx">valid as of {{ question.validAsOf }}</div>
    <p class="expl">{{ question.explanation }}</p>
    <div v-if="question.kind === 'derived' && question.formula" class="formula">
      <span class="eyebrow">How it’s calculated</span>
      <WorkingView :text="question.formula" compact />
    </div>
    <details v-if="showSources" class="srcs">
      <summary>Sources ({{ question.sources.length }})</summary>
      <SourceList :sources="question.sources" />
    </details>
    <a v-if="link" class="link" :href="`/q/${question.id}`" target="_blank" rel="noopener">Check the sources or dispute this answer ↗</a>
  </section>
</template>

<style scoped>
.truth {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  border-color: rgba(255, 209, 102, 0.45);
  background: linear-gradient(180deg, rgba(255, 209, 102, 0.07), var(--surface) 60%);
  animation: rise var(--dur-slow) var(--ease) both;
}
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
}
.ans {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-2);
}
.ans strong {
  font-size: var(--text-2xl);
  color: var(--gold);
  word-break: break-word;
}
.unit {
  color: var(--text-dim);
  font-size: var(--text-l);
}
.approx {
  font-size: var(--text-s);
}
.expl {
  margin: 0;
  color: var(--text-dim);
}
.formula {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.srcs summary {
  cursor: pointer;
  color: var(--blue);
  font-size: var(--text-s);
  min-height: 32px;
  display: flex;
  align-items: center;
}
.link {
  font-size: var(--text-s);
}
</style>
