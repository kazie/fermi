<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { MarkupSegment } from '@fermi/shared'
import { segments, spoken } from '@/lib/markup'

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
/** Redactions peeked at by tapping (hover peeks too). */
const peeked = ref(new Set<number>())
const peek = (i: number) => peeked.value.add(i)
watch(
  () => props.text,
  () => peeked.value.clear(),
)
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
  <!-- Screen readers get the spoken text, where a redaction stays redacted, instead of the styled pieces. -->
  <span class="fer-text"
    ><span class="shown" aria-hidden="true"
      ><span
        v-for="(s, i) in visible"
        :key="i"
        :class="{ b: s.bold, i: s.italic, s: s.strike, redacted: s.redacted, peek: peeked.has(i) }"
        @click="s.redacted && peek(i)"
        >{{ s.text }}</span
      ></span
    ><span class="sr-only">{{ spoken(text) }}</span></span
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
/* A black bar; tap or hover to peek. */
.redacted {
  background: currentColor;
  border-radius: 2px;
  cursor: help;
  transition: background-color 0.2s;
}
.redacted:hover,
.redacted.peek {
  background: rgba(255, 255, 255, 0.12);
}
</style>
