<script setup lang="ts">
import { logEvent } from 'histoire/client'
import { callFor, reveals, T0 } from '@/fixtures/rooms'
import CallPanel from './CallPanel.vue'

// Ada (p0) answered 2.7 million: too high, so "lower" is the right call
const reveal = { ...reveals.normal(), calls: { p0: 'lower', p1: 'lower', p2: 'higher', p3: 'higher' } as const }
const call = callFor(reveal, 'p0', 2)
const tvCall = callFor(reveal, '', 2)
const during = T0 + 2000
const waiting = reveal.timeline.callEndsAt + 500
const landed = reveal.timeline.truthAt + 500
</script>

<template>
  <Story title="CallPanel" group="components">
    <Variant title="Phone: make your call"
      ><div class="page"><CallPanel :call="call" you="p0" :now="during" @call="(c) => logEvent('call', c)" /></div
    ></Variant>
    <Variant title="Phone: called lower"
      ><div class="page"><CallPanel :call="call" you="p0" your-call="lower" :now="during" /></div
    ></Variant>
    <Variant title="Phone: waiting for the truth"
      ><div class="page"><CallPanel :reveal="reveal" you="p0" your-call="lower" :now="waiting" /></div
    ></Variant>
    <Variant title="Phone: called it"
      ><div class="page"><CallPanel :reveal="reveal" you="p0" your-call="lower" :now="landed" /></div
    ></Variant>
    <Variant title="Phone: wrong twice"
      ><div class="page"><CallPanel :reveal="reveal" you="p0" your-call="higher" :now="landed" /></div
    ></Variant>
    <Variant title="Big screen: calls coming in"
      ><div class="page"><CallPanel :call="tvCall" you="" :now="during" /></div
    ></Variant>
    <Variant title="Big screen: the tally"
      ><div class="page"><CallPanel :reveal="reveal" you="" :now="landed" /></div
    ></Variant>
  </Story>
</template>
