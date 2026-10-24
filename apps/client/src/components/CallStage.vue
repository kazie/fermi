<script setup lang="ts">
import { computed } from 'vue'
import type { Call, CallView } from '@fermi/shared'
import { S } from '@/lib/strings'
import CallPanel from './CallPanel.vue'
import DoubleBadge from './DoubleBadge.vue'
import LogNumberLine from './LogNumberLine.vue'

/**
 * The start of a reveal: the call. Everyone's answers as unnamed dots (yours marked), and the question: higher or
 * lower than your answer? tv: the big screen, which only counts the calls. compact: a phone in controller mode, which
 * skips the number line (it's on the big screen).
 */
const props = withDefaults(
  defineProps<{ call: CallView; you: string; yourCall?: Call; now: number; variant?: 'phone' | 'compact' | 'tv' }>(),
  {
    yourCall: undefined,
    variant: 'phone',
  },
)
const emit = defineEmits<{ call: [Call] }>()

// one dot per answer; the first with your value is yours (two equal answers look the same anyway)
const guesses = computed(() => {
  const yours = props.call.values.indexOf(props.call.yours ?? NaN)
  return props.call.values.map((value, i) => ({ id: `answer-${i}`, name: '', value, you: i === yours }))
})
</script>

<template>
  <div class="stage" :class="variant">
    <p v-if="variant === 'compact'" class="look">📺 {{ S.lookUp }}</p>
    <header v-else class="q">
      <div class="eyebrow-row">
        <span v-if="call.practice" class="eyebrow practice">{{ S.practice }} · reveal</span>
        <span v-else class="eyebrow">Round {{ call.index + 1 }} of {{ call.total }} · reveal</span>
        <DoubleBadge v-if="call.multiplier" :multiplier="call.multiplier" />
      </div>
      <h2>{{ call.question.question }}</h2>
      <span class="muted">in {{ call.question.unit }}</span>
    </header>
    <section v-if="variant !== 'compact'" class="line card" aria-label="Everyone’s answers, without names">
      <LogNumberLine :guesses="guesses" :named="[]" />
    </section>
    <CallPanel :call="call" :you="you" :your-call="yourCall" :now="now" @call="(c) => emit('call', c)" />
  </div>
</template>

<style scoped>
.stage {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.compact {
  max-width: 520px;
  margin: 0 auto;
}
.q h2 {
  margin: var(--space-1) 0;
}
.look {
  margin: 0;
  text-align: center;
  font-size: var(--text-l);
}
</style>
