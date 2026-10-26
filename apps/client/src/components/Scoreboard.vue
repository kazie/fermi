<script setup lang="ts">
import { computed } from 'vue'
import { byStanding, type PlayerView } from '@fermi/shared'
import { tween, useProgress } from '@/composables/useProgress'
import DunceCap from './DunceCap.vue'
import FermeanieAvatar from './FermeanieAvatar.vue'
import PlayerAvatar from './PlayerAvatar.vue'
import { S } from '@/lib/strings'

const props = defineProps<{
  players: PlayerView[]
  /** Scores after this round. Before = player.score. */
  scoresAfter: Record<string, number>
  fermeanieBefore: number
  fermeanieAfter: number
  you: string
  title?: string
}>()

// The rows come in at their old scores, count up, and then slide into their new places.
const p = useProgress(1100, 450)

const rows = computed(() => {
  const humans = props.players.map((pl) => ({
    id: pl.id,
    name: pl.name,
    before: pl.score,
    after: props.scoresAfter[pl.id] ?? pl.score,
    bot: false,
    you: pl.id === props.you,
    dunces: pl.dunces,
    gone: pl.gone,
  }))
  const bot = {
    id: 'fermeanie',
    name: 'FerMEANie',
    before: props.fermeanieBefore,
    after: props.fermeanieAfter,
    bot: true,
    you: false,
    dunces: 0,
    gone: false,
  }
  // ranked by the scores shown: the old ones, then the new ones once counted up
  const score = p.value >= 1 ? 'after' : 'before'
  return [...humans, bot]
    .map((r) => ({ ...r, delta: r.after - r.before, shown: tween(r.before, r.after, p.value), score: r[score] }))
    .sort(byStanding)
})
</script>

<template>
  <section class="sb card">
    <h3 class="eyebrow">{{ title ?? 'Scores' }}</h3>
    <TransitionGroup tag="ol" name="sb" class="list">
      <li v-for="(r, i) in rows" :key="r.id" class="row" :class="{ bot: r.bot, you: r.you, gone: r.gone }" :style="{ '--i': i }">
        <span class="pos mono">{{ r.gone ? '–' : i + 1 }}</span>
        <FermeanieAvatar v-if="r.bot" :size="22" />
        <PlayerAvatar v-else :seed="r.id" :size="22" />
        <span class="name">
          {{ r.name }}
          <span v-if="r.dunces" class="caps" :title="`${r.dunces} dunce cap(s)`"
            ><DunceCap v-for="n in Math.min(r.dunces, 3)" :key="n" still
          /></span>
        </span>
        <span v-if="r.gone" class="tag" :title="S.leftHint">{{ S.left }}</span>
        <span v-if="r.delta" class="delta mono">+{{ r.delta }}</span>
        <span class="score mono">{{ r.shown }}</span>
      </li>
    </TransitionGroup>
  </section>
</template>

<style scoped>
.row.gone {
  opacity: 0.55;
}
.list {
  list-style: none;
  margin: var(--space-2) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius);
  background: var(--surface-2);
  animation: in var(--dur) var(--ease) both;
  animation-delay: calc(var(--i) * 60ms);
}
.sb-move {
  transition: transform 0.6s var(--ease);
}
@keyframes in {
  from {
    opacity: 0;
    transform: translateX(-8px);
  }
}
.row.you {
  outline: 1px solid var(--blue);
}
.row.bot {
  background: rgba(255, 79, 79, 0.08);
  color: #ffd9d4;
}
.pos {
  width: 2ch;
  color: var(--muted);
  font-weight: 700;
}
.name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}
.caps {
  margin-left: 4px;
  font-size: 0.85em;
}
.delta {
  color: var(--ok);
  font-size: var(--text-s);
}
.bot .delta {
  color: var(--fer);
}
.score {
  min-width: 5ch;
  text-align: right;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
@media (prefers-reduced-motion: reduce) {
  .row {
    animation: none;
  }
  .sb-move {
    transition: none;
  }
}
</style>
