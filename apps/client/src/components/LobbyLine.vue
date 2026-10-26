<script setup lang="ts">
import { computed } from 'vue'
import type { FermeanieView, RoomView } from '@fermi/shared'
import FermeanieSays from './FermeanieSays.vue'

/**
 * FerMEANie's line in the lobby, on the server clock (and voiced, when the server has a voice). The time comes as a
 * function: the lobby around it shouldn't re-render every time the clock ticks. A new line types from the start; an
 * edit (someone renamed) types on. Said only when she isn't already talking, so a burst of joins doesn't queue up.
 */
const props = withDefaults(
  defineProps<{
    line: NonNullable<RoomView['lobbyLine']>
    release?: FermeanieView
    /** Server time; without it (stories) the line types on its own clock. */
    clock?: () => number
    size?: 'm' | 'l'
  }>(),
  { release: undefined, clock: undefined, size: 'm' },
)
// held at the line's end once she's done: the bubble stops re-rendering as the clock ticks on
const now = computed(() => {
  const t = props.clock?.()
  return t === undefined ? undefined : Math.min(t, props.line.until)
})
</script>

<template>
  <FermeanieSays
    :key="line.at"
    :release="release"
    mood="smug"
    :text="line.text"
    :start-at="now === undefined ? undefined : line.at"
    :now="now"
    :size="size"
    aside
  />
</template>
