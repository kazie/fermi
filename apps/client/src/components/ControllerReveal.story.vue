<script setup lang="ts">
import { reactive } from 'vue'
import { players, reveals, T0 } from '@/fixtures/rooms'
import ControllerReveal from './ControllerReveal.vue'

const steal = reveals.steal()
const dunce = reveals.dunce()
const final = reveals.final()
const t = reactive({ steal: steal.timeline.endsAt - T0 - 500, dunce: dunce.cards[1].at - T0 + 600, early: 3000 })
</script>

<template>
  <Story title="ControllerReveal (phone with a big screen)" group="screens">
    <Variant title="Your card flipped, then the steal">
      <div class="page">
        <ControllerReveal :reveal="steal" :players="players(4)" you="p0" :now="T0 + t.steal" :release="{ version: 'v3.14159' }" />
      </div>
      <template #controls
        ><HstSlider v-model="t.steal" title="Time (ms)" :min="0" :max="steal.timeline.endsAt - T0" :step="100"
      /></template>
    </Variant>
    <Variant title="Waiting for your card">
      <div class="page"><ControllerReveal :reveal="dunce" :players="players(5)" you="p3" :now="T0 + t.dunce" /></div>
      <template #controls
        ><HstSlider v-model="t.dunce" title="Time (ms)" :min="0" :max="dunce.timeline.endsAt - T0" :step="100"
      /></template>
    </Variant>
    <Variant title="Final round: double points, your score"
      ><div class="page">
        <ControllerReveal :reveal="final" :players="players(4)" you="p0" :now="final.timeline.endsAt - 500" /></div
    ></Variant>
    <Variant title="Truth landing"
      ><div class="page"><ControllerReveal :reveal="steal" :players="players(4)" you="p0" :now="T0 + t.early" /></div
    ></Variant>
  </Story>
</template>
