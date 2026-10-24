<script setup lang="ts">
import { ref } from 'vue'
import { finalView, T0 } from '@/fixtures/rooms'
import FinalScreen from './FinalScreen.vue'

const ceremony = finalView(false)
const t = ref(ceremony.awards[1].at - T0 + 3000)
</script>

<template>
  <Story title="FinalScreen" group="screens">
    <Variant title="Humans win"
      ><div class="page"><FinalScreen :final="finalView(false)" you="p1" is-host /></div
    ></Variant>
    <Variant title="FerMEANie wins (version bump)"
      ><div class="page"><FinalScreen :final="finalView(true)" you="p0" :is-host="false" /></div
    ></Variant>
    <Variant title="Awards ceremony (scrub to the crown)">
      <template #default>
        <div class="page"><FinalScreen :final="ceremony" you="p0" is-host :now="T0 + t" /></div>
      </template>
      <template #controls>
        <HstSlider v-model="t" title="Time (ms)" :min="0" :max="ceremony.crownAt - T0 + 8000" :step="100" />
      </template>
    </Variant>
  </Story>
</template>
