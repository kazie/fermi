<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import { REACTIONS } from '@fermi/shared'
import { players } from '@/fixtures/rooms'
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
</script>

<template>
  <Story title="ReactionLayer" group="components" :layout="{ type: 'single', iframe: true }">
    <Variant title="Phone (live burst)"
      ><div class="page" style="height: 600px"><ReactionLayer :reactions="reactions" :players="ps" :now="now" /></div
    ></Variant>
    <Variant title="Big screen (live burst)"
      ><div class="page" style="height: 600px"><ReactionLayer :reactions="reactions" :players="ps" :now="now" big /></div
    ></Variant>
  </Story>
</template>
