<script setup lang="ts">
import { computed } from 'vue'
import type { PlayerView } from '@fermi/shared'
import { REACTION_SHOW_MS, type FloatingReaction } from '@/composables/useSocket'
import { rng } from '@/lib/random'
import PlayerAvatar from './PlayerAvatar.vue'
import ReactionIcon from './ReactionIcon.vue'

/**
 * Reactions floating up from the bottom of the screen, each with the sender's avatar, for a few seconds. The float is a
 * CSS animation (smooth, unlike the 100 ms game clock); `now` (server ms) drops expired ones and starts a remounted
 * one mid-flight, so stories can freeze it. Each starts in a lane picked from its id, so a burst spreads out.
 *
 * To feel alive, each pops in, sways as it rises and plays its own animation (inside ReactionIcon, on the same clock).
 * How far it sways, tilts and rises comes from its id, not Math.random, so a remount or a story looks the same.
 */
const props = defineProps<{ reactions: FloatingReaction[]; players: PlayerView[]; now: number; big?: boolean }>()

/** How one reaction floats: its sway, tilt, size and rise as CSS variables. */
function float(r: FloatingReaction, age: number) {
  const rand = rng(r.id)
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo)
  const sign = rand() < 0.5 ? -1 : 1
  return {
    ...r,
    age,
    style: {
      left: `${8 + ((r.id * 37) % 84)}%`,
      '--delay': `-${age}ms`,
      '--sway': `${sign * between(1.5, 4)}vw`,
      '--sway-dur': `${between(0.9, 1.6)}s`,
      '--tilt': `${sign * between(4, 12)}deg`,
      '--scale': between(0.85, 1.2),
      '--rise': `${between(50, 70)}vh`,
    },
  }
}

// Each reaction's float is made once, when it first shows: its age goes in as the animations' delay, and changing that
// on every tick of the clock would push a running animation forward. Keeping the same object also spares Vue patching
// it every tick.
const floats = new Map<number, ReturnType<typeof float>>()
const NONE: ReturnType<typeof float>[] = []
const live = computed(() => {
  // nothing floating: the same empty list every tick, so the layer sits still between reactions
  const newest = props.reactions.at(-1)
  if (!newest || props.now - newest.t >= REACTION_SHOW_MS) {
    floats.clear()
    return NONE
  }
  const ids = new Set<number>()
  const out = props.reactions
    .filter((r) => props.now - r.t < REACTION_SHOW_MS && props.players.some((p) => p.id === r.playerId))
    .map((r) => {
      ids.add(r.id)
      if (!floats.has(r.id)) floats.set(r.id, float(r, Math.max(0, props.now - r.t)))
      return floats.get(r.id)!
    })
  for (const id of floats.keys()) if (!ids.has(id)) floats.delete(id)
  return out
})
</script>

<template>
  <div class="layer" :class="{ big }" aria-hidden="true">
    <span v-for="r in live" :key="r.id" class="float" :style="r.style">
      <span class="sway">
        <span class="pop">
          <ReactionIcon class="icon" :kind="r.kind" play="float" :age="r.age" />
          <PlayerAvatar :seed="r.playerId" :size="big ? 28 : 18" />
        </span>
      </span>
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
.float,
.pop {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.float {
  position: absolute;
  bottom: 0;
  /* a steady rise */
  animation: rise 3s linear both;
}
@keyframes rise {
  from {
    transform: translate(-50%, 0);
    opacity: 0;
  }
  8% {
    opacity: 1;
  }
  75% {
    opacity: 1;
  }
  to {
    transform: translate(-50%, calc(-1 * var(--rise)));
    opacity: 0;
  }
}
.sway {
  animation: sway var(--sway-dur) ease-in-out infinite alternate;
}
@keyframes sway {
  from {
    transform: translateX(calc(-1 * var(--sway))) rotate(calc(-1 * var(--tilt)));
  }
  to {
    transform: translateX(var(--sway)) rotate(var(--tilt));
  }
}
.pop {
  animation: pop 3s ease-out both;
}
@keyframes pop {
  from {
    transform: scale(0.2);
  }
  8% {
    transform: scale(calc(var(--scale) * 1.3));
  }
  14%,
  to {
    transform: scale(var(--scale));
  }
}
.icon {
  font-size: 2.6rem;
}
.big .icon {
  font-size: 4.4rem;
}
/* every animation here runs on the reaction's own clock: its age, as a negative delay (after the shorthands above) */
.float,
.sway,
.pop {
  animation-delay: var(--delay);
}
@media (prefers-reduced-motion: reduce) {
  .float {
    animation-name: fade;
    transform: translate(-50%, -20vh);
  }
  .sway,
  .pop {
    animation: none;
  }
  @keyframes fade {
    to {
      opacity: 0;
    }
  }
}
</style>
