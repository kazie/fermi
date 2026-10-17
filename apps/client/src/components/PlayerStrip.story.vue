<script setup lang="ts">
import { players } from '@/fixtures/rooms'
import PlayerStrip from './PlayerStrip.vue'

const mixed = players(8).map((p, i) => ({ ...p, lockedIn: i % 3 === 0, typing: i % 3 === 1, connected: i !== 5, spectating: i === 7 }))
const long = players(3).map((p, i) => ({ ...p, name: i === 1 ? 'Bartholomew-Maximilian the Third' : p.name }))
</script>

<template>
  <Story title="PlayerStrip" group="components">
    <Variant title="Mixed states"
      ><div class="page"><PlayerStrip :players="mixed" you="p0" /></div
    ></Variant>
    <Variant title="Long names"
      ><div class="page"><PlayerStrip :players="long" you="p1" /></div
    ></Variant>
  </Story>
</template>
