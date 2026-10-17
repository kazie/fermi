<script setup lang="ts">
import { finalView } from '@/fixtures/rooms'
import FinalScreen from './FinalScreen.vue'
</script>

<template>
  <Story title="FinalScreen" group="screens">
    <Variant title="Humans win"
      ><div class="page"><FinalScreen :final="finalView(false)" you="p1" is-host /></div
    ></Variant>
    <Variant title="FerMEANie wins (version bump)"
      ><div class="page"><FinalScreen :final="finalView(true)" you="p0" :is-host="false" /></div
    ></Variant>
  </Story>
</template>
