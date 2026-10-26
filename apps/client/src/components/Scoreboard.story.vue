<script setup lang="ts">
import { ref } from 'vue'
import { players } from '@/fixtures/rooms'
import Scoreboard from './Scoreboard.vue'

const ps = players(5).map((p, i) => ({ ...p, score: [800, 600, 1100, 200, 0][i], dunces: i === 3 ? 2 : 0 }))
const after = { p0: 1200, p1: 900, p2: 1100, p3: 300, p4: 100 }
// Cyd (p2) led, then left the game: ranked last, whatever the score
const left = ps.map((p) => ({ ...p, connected: p.id !== 'p2', gone: p.id === 'p2' }))
const replay = ref(0)
</script>

<template>
  <Story title="Scoreboard" group="components">
    <Variant title="After a round"
      ><div style="padding: 16px; max-width: 520px">
        <Scoreboard :players="ps" :scores-after="after" :fermeanie-before="700" :fermeanie-after="700" you="p1" /></div
    ></Variant>
    <Variant title="Count-up and overtaking (replay)">
      <template #default>
        <div style="padding: 16px; max-width: 520px">
          <Scoreboard :key="replay" :players="ps" :scores-after="after" :fermeanie-before="300" :fermeanie-after="1500" you="p1" />
        </div>
      </template>
      <template #controls><button type="button" class="htw-btn" @click="replay++">↻ Replay</button></template>
    </Variant>
    <Variant title="The leader left the game"
      ><div style="padding: 16px; max-width: 520px">
        <Scoreboard :players="left" :scores-after="after" :fermeanie-before="700" :fermeanie-after="700" you="p1" /></div
    ></Variant>
    <Variant title="FerMEANie leads"
      ><div style="padding: 16px; max-width: 520px">
        <Scoreboard :players="ps" :scores-after="{}" :fermeanie-before="1500" :fermeanie-after="2900" you="p1" /></div
    ></Variant>
  </Story>
</template>
