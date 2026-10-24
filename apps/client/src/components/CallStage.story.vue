<script setup lang="ts">
import { logEvent } from 'histoire/client'
import { callFor, reveals, T0 } from '@/fixtures/rooms'
import CallStage from './CallStage.vue'

const reveal = reveals.crowd()
const call = callFor(reveal, 'p0', 3)
const tvCall = callFor(reveal, '', 3) // a big screen has no answer of its own
const now = T0 + 2000
</script>

<template>
  <Story title="CallStage" group="screens">
    <Variant title="Phone: higher or lower?"
      ><div class="page"><CallStage :call="call" you="p0" :now="now" @call="(c) => logEvent('call', c)" /></div
    ></Variant>
    <Variant title="Phone, controller mode"
      ><div class="page"><CallStage :call="call" you="p0" your-call="higher" :now="now" variant="compact" /></div
    ></Variant>
    <Variant title="Big screen"
      ><div class="page"><CallStage :call="tvCall" you="" :now="now" variant="tv" /></div
    ></Variant>
  </Story>
</template>
