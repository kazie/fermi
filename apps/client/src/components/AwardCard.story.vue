<script setup lang="ts">
import { AWARDS } from '@fermi/shared'
import AwardCard from './AwardCard.vue'

const values: Record<(typeof AWARDS)[number], number> = {
  swarm_slayer: 4,
  bullseye: 2,
  steady_hand: 1.6,
  abacus: 6,
  gut_feeling: 7,
  contrarian: 3,
  bold_estimator: 32_000,
  last_minute: 48,
  swarm_twin: 1.3,
  comeback: 3,
  optimist: 5,
  pessimist: 4,
  late_bloomer: 3.2,
  one_liner: 6,
  round_numbers: 5,
  near_miss: 3,
  swarm_donor: 1800,
}
const award = (kind: (typeof AWARDS)[number]) => ({ kind, playerId: 'p2', name: 'Cyd', value: values[kind] })
</script>

<template>
  <Story title="AwardCard" group="components">
    <Variant title="Read out (big)"
      ><div class="page"><AwardCard :award="award('swarm_slayer')" big /></div
    ></Variant>
    <Variant title="Every award (compact)"
      ><div class="page" style="display: grid; gap: 8px">
        <AwardCard v-for="k in AWARDS" :key="k" :award="award(k)" :you="k === 'abacus'" /></div
    ></Variant>
  </Story>
</template>
