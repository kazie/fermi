<script setup lang="ts">
import { logEvent } from 'histoire/client'
import SkipIntro from './SkipIntro.vue'
</script>

<template>
  <Story title="SkipIntro" group="components">
    <Variant title="Host (skips at once)"
      ><div class="page"><SkipIntro :skip="{ votes: 0, needed: 3, youVoted: false }" is-host @skip="logEvent('skip', {})" /></div
    ></Variant>
    <Variant title="Player, others voted"
      ><div class="page"><SkipIntro :skip="{ votes: 1, needed: 3, youVoted: false }" :is-host="false" @skip="logEvent('skip', {})" /></div
    ></Variant>
    <Variant title="Player, voted"
      ><div class="page"><SkipIntro :skip="{ votes: 2, needed: 3, youVoted: true }" :is-host="false" /></div
    ></Variant>
    <Variant title="Big screen"
      ><div class="page"><SkipIntro :skip="{ votes: 1, needed: 3, youVoted: false }" :is-host="false" tv /></div
    ></Variant>
  </Story>
</template>
