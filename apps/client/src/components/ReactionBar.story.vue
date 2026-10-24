<script setup lang="ts">
import { logEvent } from 'histoire/client'
import { REACTION_GAP_MS, REACTION_WINDOW_MS } from '@fermi/shared'
import { T0 as T } from '@/fixtures/rooms'
import ReactionBar from './ReactionBar.vue'
</script>

<template>
  <Story title="ReactionBar" group="components">
    <Variant title="Phone"
      ><div class="page"><ReactionBar @react="(e) => logEvent('react', e)" /></div
    ></Variant>
    <Variant title="Resting after a reaction"
      ><div class="page">
        <ReactionBar
          :rest="{ from: T, until: T + REACTION_GAP_MS, burst: false, seen: T + REACTION_GAP_MS / 3 }"
          @react="(e) => logEvent('react', e)"
        /></div
    ></Variant>
    <Variant title="Resting after a burst"
      ><div class="page">
        <ReactionBar
          :rest="{ from: T, until: T + REACTION_WINDOW_MS, burst: true, seen: T + 4000 }"
          @react="(e) => logEvent('react', e)"
        /></div
    ></Variant>
  </Story>
</template>
