<script setup lang="ts">
import { logEvent } from 'histoire/client'
import ReactionBar from './ReactionBar.vue'
</script>

<template>
  <Story title="ReactionBar" group="components">
    <Variant title="Phone"
      ><div class="page"><ReactionBar @react="(e) => logEvent('react', e)" /></div
    ></Variant>
  </Story>
</template>
