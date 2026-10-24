<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import { REACTIONS } from '@fermi/shared'
import { players, T0 as T } from '@/fixtures/rooms'
import type { FloatingReaction } from '@/composables/useSocket'
import ReactionLayer from './ReactionLayer.vue'

// a live burst: a new reaction from a random player every 300 ms
const ps = players(5)
const now = ref(Date.now())
const reactions = ref<FloatingReaction[]>([])
let id = 0
const tick = setInterval(() => {
  now.value = Date.now()
  reactions.value = [
    ...reactions.value.filter((r) => now.value - r.t < 3000),
    { id: ++id, playerId: ps[id % ps.length].id, emoji: REACTIONS[id % REACTIONS.length], t: now.value },
  ]
}, 300)
onUnmounted(() => clearInterval(tick))

// one of each emoji, each starting at a different moment of its flight
const frozen: FloatingReaction[] = REACTIONS.map((emoji, i) => ({
  id: 100 + i,
  playerId: ps[i % ps.length].id,
  emoji,
  t: T - 300 - i * 350,
}))
</script>

<template>
  <Story title="ReactionLayer" group="components" :layout="{ type: 'single', iframe: true }">
    <Variant title="Phone (live burst)"
      ><div class="page" style="height: 600px"><ReactionLayer :reactions="reactions" :players="ps" :now="now" /></div
    ></Variant>
    <Variant title="Big screen (live burst)"
      ><div class="page" style="height: 600px"><ReactionLayer :reactions="reactions" :players="ps" :now="now" big /></div
    ></Variant>
    <Variant title="One of each, mid-flight"
      ><div class="page" style="height: 600px"><ReactionLayer :reactions="frozen" :players="ps" :now="T" big /></div
    ></Variant>
  </Story>
</template>
