<script setup lang="ts">
import { computed } from 'vue'
import { finalWinner } from '@fermi/shared'
import type { DisputeState } from './DisputeForm.vue'
import type { RecapGame } from '@/lib/recap'
import AnswerCard from './AnswerCard.vue'
import DisputeForm from './DisputeForm.vue'
import FermeanieAvatar from './FermeanieAvatar.vue'
import AwardCard from './AwardCard.vue'
import DoubleBadge from './DoubleBadge.vue'
import TruthPanel from './TruthPanel.vue'

/** Every round of a finished game: the answer, its sources, everyone's working. Pure; the view fetches. */
const props = withDefaults(
  defineProps<{
    game: RecapGame
    /** Your public id in this game, to highlight your cards. */
    me?: string | null
    disputes?: Record<string, { state: DisputeState; error: string }>
  }>(),
  { me: null, disputes: () => ({}) },
)
const emit = defineEmits<{ dispute: [questionId: string, message: string] }>()
const recapWinner = computed(() => props.game.final && finalWinner(props.game.final))
</script>

<template>
  <div class="recap">
    <header>
      <span class="eyebrow">Game recap · {{ new Date(game.createdAt).toLocaleString() }}</span>
      <h1>Every answer, every source</h1>
      <div v-if="game.final?.awards?.length" class="recap-awards">
        <AwardCard v-for="a in game.final.awards" :key="a.kind" :award="a" />
      </div>
      <p v-if="game.final" class="muted">
        Winner: <strong>{{ recapWinner?.name }}</strong> ({{ recapWinner?.score }} pts) · FerMEANie {{ game.final.version }}:
        {{ game.final.fermeanieScore }} pts
      </p>
    </header>
    <section v-for="r in game.rounds" :key="r.index" class="round">
      <h2>
        <span class="eyebrow-row"
          ><span class="eyebrow">Round {{ r.index + 1 }}</span
          ><DoubleBadge v-if="r.multiplier" :multiplier="r.multiplier"
        /></span>
        {{ r.question.question }} <span class="muted unit">({{ r.question.unit }})</span>
      </h2>
      <div class="cols">
        <div class="left">
          <TruthPanel :question="r.question" :link="false" />
          <DisputeForm v-bind="disputes[r.question.id] ?? {}" @submit="(m: string) => emit('dispute', r.question.id, m)" />
          <p v-if="r.fermeanie" class="muted fer">
            <FermeanieAvatar :size="18" mini /> Swarm estimate ({{ r.crowd?.method }}): {{ r.fermeanie.value.toPrecision(3) }} ·
            {{ r.fermeanie.beatsAll ? `stole ${r.fermeanie.points} points` : 'beaten by a human' }}
          </p>
        </div>
        <div class="cards">
          <AnswerCard
            v-for="c in r.cards"
            :key="c.playerId"
            :card="{ ...c, at: 0 }"
            flipped
            :stolen="!!r.fermeanie?.beatsAll"
            :dunce-line="r.lines.dunce[c.playerId]"
            :you="c.playerId === me"
            :unit="r.question.unit"
          />
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.recap-awards {
  display: grid;
  gap: var(--space-2);
  margin: var(--space-3) 0;
}
.recap {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}
.recap h1 {
  font-size: var(--text-2xl);
  margin: var(--space-2) 0;
}
.round h2 {
  font-size: var(--text-l);
  margin-bottom: var(--space-3);
}
.unit {
  font-size: var(--text-m);
  font-weight: 400;
}
.cols {
  display: grid;
  gap: var(--space-4);
}
.left,
.cards {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
}
.fer {
  font-size: var(--text-s);
  margin: 0;
}
.err {
  color: var(--danger);
}
@media (min-width: 900px) {
  .cols {
    grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
    align-items: start;
  }
}
</style>
