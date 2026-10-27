<script setup lang="ts">
import { reactive } from 'vue'
import { REACTIONS, type Reaction } from '@fermi/shared'
import type { ReactRest } from '@/composables/useSocket'
import { S } from '@/lib/strings'
import ReactionIcon from './ReactionIcon.vue'

/**
 * The reaction buttons on a phone during the reveal and the break. After a reaction the bar rests (the server would drop
 * one sent sooner): dimmed, with a line filling back up from `rest.from` to `rest.until`, a CSS animation that starts
 * where the rest was when it first showed. After a burst the rest is longer, and says so. Taps go out either way: the
 * sender decides. A tap that will go out plays its reaction's animation once; one while the bar rests doesn't, so
 * it never looks sent when it wasn't. Each button counts its own taps as its key, so a new tap restarts its animation
 * without cutting off another button's.
 */
const props = defineProps<{ rest?: ReactRest | null }>()
const emit = defineEmits<{ react: [Reaction] }>()

const taps = reactive<Partial<Record<Reaction, number>>>({})
function tap(kind: Reaction) {
  if (!props.rest) taps[kind] = (taps[kind] ?? 0) + 1
  emit('react', kind)
}
</script>

<template>
  <div class="wrap">
    <div class="bar" :class="{ resting: rest }" role="group" :aria-label="S.react">
      <button
        v-for="e in REACTIONS"
        :key="e"
        type="button"
        class="r"
        :aria-label="`${S.react}: ${S.reactions[e]}`"
        :title="S.reactions[e]"
        :aria-disabled="!!rest"
        @click="tap(e)"
      >
        <ReactionIcon :key="taps[e] ?? 0" :kind="e" :play="taps[e] ? 'once' : undefined" />
      </button>
    </div>
    <!-- one fixed-height row, so the sticky bar doesn't grow when the message shows -->
    <p v-if="rest?.burst" class="rest muted">{{ S.reactRest }}</p>
    <div v-else class="refill" aria-hidden="true">
      <!-- a reaction on its way (no end yet) shows empty -->
      <span
        v-if="rest"
        :key="rest.from"
        :class="{ filling: rest.until < Infinity }"
        :style="{ animationDuration: `${rest.until - rest.from}ms`, animationDelay: `-${rest.seen - rest.from}ms` }"
      ></span>
      <span v-else class="full"></span>
    </div>
  </div>
</template>

<style scoped>
.wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  width: fit-content;
  max-width: 100%;
  margin-inline: auto;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius);
  /* sticky over the reveal: readable whatever scrolls under it */
  background: var(--surface);
}
.bar {
  display: flex;
  justify-content: center;
  gap: var(--space-1);
  flex-wrap: wrap;
}
.r {
  min-width: 44px;
  min-height: 44px;
  display: grid;
  place-items: center;
  font-size: 1.75rem;
  border-radius: 999px;
  border: 1px solid var(--border-strong);
  background: var(--surface-2);
  cursor: pointer;
  transition:
    transform var(--dur-fast) var(--ease),
    opacity var(--dur-fast) var(--ease);
}
.r:active {
  transform: scale(0.88);
}
.resting .r {
  opacity: 0.45;
  cursor: default;
}
.resting .r:active {
  transform: none;
}
.refill,
.rest {
  height: 1.1rem;
}
.refill {
  display: flex;
  align-items: center;
  width: min(240px, 60%);
}
.refill span {
  flex: 1;
  height: 3px;
  border-radius: 999px;
  background: var(--accent);
  transform-origin: left;
  transform: scaleX(0);
}
.refill .full {
  transform: none;
}
.refill .filling {
  animation: refill linear both;
}
@keyframes refill {
  to {
    transform: none;
  }
}
.rest {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.2;
}
</style>
