<script setup lang="ts">
import { computed } from 'vue'
import { evaluateSheet, formatNumber } from '@fermi/shared'
import { segments } from '@/lib/highlight'
import ErrorDot from './ErrorDot.vue'

const props = defineProps<{ text: string; compact?: boolean }>()
const sheet = computed(() => evaluateSheet(props.text))
const lines = computed(() => {
  const raw = props.text.split('\n')
  // drop trailing blank lines
  while (raw.length && !raw[raw.length - 1].trim()) raw.pop()
  return raw.map((r, i) => ({ segs: segments(r, sheet.value.lines[i]), res: sheet.value.lines[i] }))
})
</script>

<template>
  <div class="working mono" :class="{ compact }">
    <div v-if="!lines.length" class="muted empty">(empty)</div>
    <div v-for="(l, i) in lines" :key="i" class="wl" :class="{ answer: i === sheet.answerLine && sheet.answer !== null }">
      <span class="src"
        ><span v-for="(s, j) in l.segs" :key="j" :class="s.cls">{{ s.text }}</span></span
      >
      <span v-if="l.res?.error" class="r err" :title="l.res.error.message"><ErrorDot :size="14" /></span>
      <span v-else-if="l.res?.value !== undefined" class="r">= {{ formatNumber(l.res.value) }}</span>
    </div>
  </div>
</template>

<style scoped>
.working {
  font-size: 14px;
  line-height: 1.7;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-s);
  padding: var(--space-2) var(--space-3);
  overflow-x: auto;
}
.compact {
  font-size: 13px;
}
.wl {
  display: flex;
  justify-content: space-between;
  gap: var(--space-4);
  white-space: pre;
}
.wl.answer .r {
  color: var(--accent);
  font-weight: 700;
}
.r {
  color: var(--muted);
  flex: none;
}
.r.err {
  color: var(--danger);
  font-weight: 800;
}
.empty {
  font-style: italic;
}
</style>
