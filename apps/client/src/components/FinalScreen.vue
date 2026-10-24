<script setup lang="ts">
import { computed } from 'vue'
import type { FinalView } from '@fermi/shared'
import { S } from '@/lib/strings'
import AwardCard from './AwardCard.vue'
import FermeanieAvatar from './FermeanieAvatar.vue'
import FermeanieSays from './FermeanieSays.vue'
import PlayerAvatar from './PlayerAvatar.vue'

const props = withDefaults(
  defineProps<{
    final: FinalView
    you: string
    isHost: boolean
    /** On a big screen: the host restarts from their phone. */ screen?: boolean
    /** Server time: her final lines play from when the game ended, so a remount doesn't retype them. */
    now?: number
  }>(),
  { screen: false, now: undefined },
)
const emit = defineEmits<{ playAgain: [] }>()

/** Older saved games have no awards. */
const awards = computed(() => props.final.awards ?? [])
/** The awards ceremony, before the crown (live only: a recap or a story without a clock shows the end straight away). */
const ceremony = computed(() => props.now !== undefined && awards.value.length > 0 && props.now < props.final.crownAt)
const current = computed(() => {
  const shown = awards.value.filter((a) => props.now !== undefined && props.now >= a.at)
  return shown.at(-1)
})

const winner = computed(() => props.final.ranking[0])
const rows = computed(() => {
  const humans = props.final.ranking.map((r) => ({ ...r, bot: false }))
  const bot = { playerId: 'fermeanie', name: `FerMEANie ${props.final.version}`, score: props.final.fermeanieScore, bot: true }
  return [...humans, bot].sort((a, b) => b.score - a.score || Number(a.bot) - Number(b.bot))
})
</script>

<template>
  <div v-if="ceremony" class="final ceremony">
    <h2 class="eyebrow center">{{ S.awardsTitle }}</h2>
    <ol class="dots" :aria-label="current ? `${S.awardsTitle}: ${awards.indexOf(current) + 1} of ${awards.length}` : S.awardsTitle">
      <li v-for="a in awards" :key="a.kind" :class="{ on: a === current, done: current && a.at < current.at }" />
    </ol>
    <template v-if="current">
      <AwardCard :key="current.kind" :award="current" big :you="current.playerId === you" />
      <FermeanieSays
        :key="`say-${current.kind}`"
        :text="current.line"
        :start-at="current.at"
        :now="now"
        :release="final"
        mood="smug"
        size="l"
      />
    </template>
    <FermeanieAvatar v-else class="center-self" :size="96" mood="smug" speaking />
  </div>
  <div v-else class="final">
    <section class="crown card">
      <span class="eyebrow">Best carbon-based organism</span>
      <div v-if="winner" class="winner">
        <span class="emoji" aria-hidden="true">👑</span>
        <h1>{{ winner.name }}</h1>
        <span class="mono pts">{{ winner.score }} pts</span>
      </div>
      <p v-if="final.fermeanieWon" class="muted">…but FerMEANie scored {{ final.fermeanieScore }}. Technically, the swarm won. Again.</p>
      <p v-else class="muted">Humanity beat the average this time ({{ final.fermeanieScore }} pts for FerMEANie).</p>
    </section>

    <FermeanieSays
      :messages="[final.line, final.versionLine]"
      :start-at="now === undefined ? undefined : final.crownAt"
      :now="now"
      :release="final"
      :mood="final.fermeanieWon ? 'smug' : 'sulk'"
      size="l"
    />
    <p v-if="final.fermeanieWon" class="counter mono">
      FerMEANie {{ final.version }} has defeated carbon-based organisms <strong>{{ final.wins }}</strong> time{{
        final.wins === 1 ? '' : 's'
      }}.
    </p>

    <section class="card">
      <h2 class="eyebrow">Final scores</h2>
      <ol class="list">
        <li v-for="(r, i) in rows" :key="r.playerId" :class="{ bot: r.bot, you: r.playerId === you }">
          <span class="pos mono">{{ i + 1 }}</span>
          <FermeanieAvatar v-if="r.bot" :size="24" :mood="final.fermeanieWon ? 'smug' : 'sulk'" />
          <PlayerAvatar v-else :seed="r.playerId" :size="24" :state="i === 0 ? 'locked' : 'idle'" />
          <span class="name">{{ r.name }}</span>
          <span class="mono score">{{ r.score }}</span>
        </li>
      </ol>
    </section>

    <section v-if="awards.length" class="card">
      <h2 class="eyebrow">{{ S.awardsSoFar }}</h2>
      <div class="awards">
        <AwardCard v-for="a in awards" :key="a.kind" :award="a" :you="a.playerId === you" />
      </div>
    </section>

    <div class="actions">
      <a class="btn" :href="`/recap/${final.gameId}`" target="_blank" rel="noopener">📜 Recap with all answers and sources</a>
      <button v-if="isHost" class="btn btn-primary" type="button" @click="emit('playAgain')">↻ {{ S.playAgain }}</button>
      <span v-else class="muted">{{
        screen ? 'The host can start another game from their phone.' : 'The host can start another game.'
      }}</span>
    </div>
  </div>
</template>

<style scoped>
.final {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: 720px;
  margin: 0 auto;
}
.center {
  text-align: center;
  margin: 0;
}
.center-self {
  align-self: center;
}
.dots {
  display: flex;
  justify-content: center;
  gap: 6px;
  list-style: none;
  margin: 0;
  padding: 0;
}
.dots li {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--surface-3);
}
.dots li.done {
  background: var(--text-dim);
}
.dots li.on {
  background: var(--gold);
}
.awards {
  display: grid;
  gap: var(--space-2);
  margin-top: var(--space-2);
}
.crown {
  text-align: center;
  border-color: rgba(255, 209, 102, 0.45);
  background: radial-gradient(circle at 50% 0%, rgba(255, 209, 102, 0.14), var(--surface) 70%);
}
.winner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  margin: var(--space-3) 0;
}
.emoji {
  font-size: 3rem;
  animation: bob 2s ease-in-out infinite;
}
@keyframes bob {
  50% {
    transform: translateY(-6px);
  }
}
.winner h1 {
  font-size: var(--text-2xl);
  overflow-wrap: anywhere;
}
.pts {
  color: var(--gold);
  font-weight: 800;
}
.counter {
  text-align: center;
  color: #ffd9d4;
  margin: 0;
}
.counter strong {
  color: var(--fer);
  font-size: var(--text-l);
}
.list {
  list-style: none;
  margin: var(--space-2) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.list li {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius);
  background: var(--surface-2);
}
.list li.bot {
  background: rgba(255, 79, 79, 0.08);
  color: #ffd9d4;
}
.list li.you {
  outline: 1px solid var(--blue);
}
.pos {
  width: 2ch;
  color: var(--muted);
}
.name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}
.score {
  font-weight: 800;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: center;
  justify-content: center;
}
@media (prefers-reduced-motion: reduce) {
  .emoji {
    animation: none;
  }
}
</style>
