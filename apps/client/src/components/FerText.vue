<script setup lang="ts">
import { computed } from 'vue'
import type { MarkupSegment } from '@fermi/shared'
import { segments } from '@/lib/markup'

const props = withDefaults(
  defineProps<{
    /** A line with FerMEANie's markup: **bold**, *italic*, ~~struck~~, ||redacted||. */
    text: string
    /** Show only the first n characters of the text (for the typewriter effect); all when left out. */
    shown?: number
  }>(),
  { shown: Infinity },
)

const parsed = computed(() => segments(props.text))
// Recomputed on every typewriter tick, so it only slices the parsed segments.
const visible = computed(() => {
  let left = props.shown
  const out: MarkupSegment[] = []
  for (const s of parsed.value) {
    if (left <= 0) break
    out.push({ ...s, text: s.text.slice(0, left) })
    left -= s.text.length
  }
  return out
})
</script>

<template>
  <span class="fer-text"
    ><span
      v-for="(s, i) in visible"
      :key="i"
      :class="{ b: s.bold, i: s.italic, s: s.strike, redacted: s.redacted }"
      :tabindex="s.redacted ? 0 : undefined"
      >{{ s.text }}</span
    ></span
  >
</template>

<style scoped>
.b {
  font-weight: 800;
}
.i {
  font-style: italic;
}
.s {
  text-decoration: line-through;
  text-decoration-thickness: 2px;
}
/* A black bar; tap, hover or focus to peek. */
.redacted {
  background: currentColor;
  border-radius: 2px;
  cursor: help;
  transition: background-color 0.2s;
}
.redacted:hover,
.redacted:focus-visible,
.redacted:focus {
  background: rgba(255, 255, 255, 0.12);
  outline: none;
}
</style>
