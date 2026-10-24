<script setup lang="ts">
import { computed } from 'vue'
import type { PlayerView } from '@fermi/shared'
import { REACTION_SHOW_MS, type FloatingReaction } from '@/composables/useSocket'
import PlayerAvatar from './PlayerAvatar.vue'

/**
 * Reactions floating up from the bottom of the screen, each with the sender's avatar, for a few seconds. The float is a
 * CSS animation (smooth, unlike the 100 ms game clock); `now` (server ms) drops expired ones and starts a remounted
 * one mid-flight, so stories can freeze it. Each starts in a lane picked from its id, so a burst spreads out.
 */
const props = defineProps<{ reactions: FloatingReaction[]; players: PlayerView[]; now: number; big?: boolean }>()
// Each reaction's age is read once, when it first shows: changing a running animation's delay would push it forward
// on every tick of the clock.
const ages = new Map<number, number>()
const live = computed(() => {
  const out = props.reactions
    .filter((r) => props.now - r.t < REACTION_SHOW_MS && props.players.some((p) => p.id === r.playerId))
    .map((r) => {
      if (!ages.has(r.id)) ages.set(r.id, Math.max(0, props.now - r.t))
      return { ...r, lane: 8 + ((r.id * 37) % 84), age: ages.get(r.id)! }
    })
  for (const id of ages.keys()) if (!out.some((r) => r.id === id)) ages.delete(id)
  return out
})
</script>

<template>
  <div class="layer" :class="{ big }" aria-hidden="true">
    <span v-for="r in live" :key="r.id" class="float" :style="{ left: `${r.lane}%`, animationDelay: `-${r.age}ms` }">
      <span class="emoji">{{ r.emoji }}</span>
      <PlayerAvatar :seed="r.playerId" :size="big ? 28 : 18" />
    </span>
  </div>
</template>

<style scoped>
.layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 30;
}
.float {
  position: absolute;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  animation: rise 3s ease-out both;
}
@keyframes rise {
  from {
    transform: translate(-50%, 0) scale(0.6);
    opacity: 0;
  }
  15% {
    transform: translate(-50%, -8vh) scale(1);
    opacity: 1;
  }
  to {
    transform: translate(-50%, -60vh);
    opacity: 0;
  }
}
.emoji {
  font-size: 2rem;
}
.big .emoji {
  font-size: 3.5rem;
}
@media (prefers-reduced-motion: reduce) {
  .float {
    animation: fade 3s linear both;
    transform: translate(-50%, -20vh);
  }
  @keyframes fade {
    to {
      opacity: 0;
    }
  }
}
</style>
