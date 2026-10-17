<script setup lang="ts">
import { computed } from 'vue'
import { formatCompact, type RoomView } from '@fermi/shared'
import { S } from '@/lib/strings'
import RoundTimer from './RoundTimer.vue'
import Scoreboard from './Scoreboard.vue'

const props = withDefaults(
  defineProps<{
    room: RoomView
    now: number
    /** tv: no button, voting happens on phones. phone: full. compact: controller mode on a phone. */
    variant?: 'tv' | 'phone' | 'compact'
  }>(),
  { variant: 'phone' },
)
const emit = defineEmits<{ skip: [] }>()

const br = computed(() => props.room.break!)
const reveal = computed(() => props.room.reveal)
const secs = computed(() => Math.max(0, Math.ceil((br.value.endsAt - props.now) / 1000)))

// Scores are already applied in the break; rebuild "before" from this round's points so the board counts up.
const roundPoints = computed(() => Object.fromEntries((reveal.value?.cards ?? []).map((c) => [c.playerId, c.points])))
const playersBefore = computed(() => props.room.players.map((p) => ({ ...p, score: p.score - (roundPoints.value[p.id] ?? 0) })))
const scoresNow = computed(() => Object.fromEntries(props.room.players.map((p) => [p.id, p.score])))
const ferNow = computed(() => props.room.fermeanie.score)
const ferBefore = computed(() => ferNow.value - (reveal.value?.fermeanie?.beatsAll ? reveal.value.fermeanie.points : 0))

const ranked = computed(() => [...props.room.players].sort((a, b) => b.score - a.score))
const myRank = computed(() => ranked.value.findIndex((p) => p.id === props.room.you) + 1)
const me = computed(() => props.room.players.find((p) => p.id === props.room.you))
</script>

<template>
  <div class="brk" :class="variant">
    <header class="head">
      <span class="eyebrow">Round {{ br.index + 1 }} of {{ br.total }} done</span>
      <h2>
        Discuss! Next question in <span class="mono secs">{{ secs }}s</span>
      </h2>
      <RoundTimer :started-at="br.startedAt" :ends-at="br.endsAt" :now="now" />
    </header>

    <section v-if="variant !== 'compact' && reveal" class="recap card">
      <p class="q">{{ reveal.question.question }}</p>
      <p class="a">
        <strong class="mono">{{ formatCompact(reveal.question.answer) }}</strong> {{ reveal.question.unit }}
      </p>
    </section>

    <div class="vote">
      <template v-if="variant === 'tv'">
        <p class="muted">
          {{ br.votes }} of {{ br.needed }} want to skip. <span class="hint">Tap “{{ S.skipBreak }}” on your phone.</span>
        </p>
      </template>
      <template v-else>
        <button v-if="!br.youVoted" class="btn btn-primary btn-block skip" type="button" @click="emit('skip')">⏭ {{ S.skipBreak }}</button>
        <button v-else class="btn btn-block skip" type="button" disabled>Waiting for others · {{ br.votes }}/{{ br.needed }}</button>
        <p v-if="!br.youVoted" class="muted center">{{ br.votes }} of {{ br.needed }} votes needed to skip</p>
      </template>
    </div>

    <p v-if="variant === 'compact' && me" class="rank">
      You're <strong>#{{ myRank }}</strong> with <strong class="mono">{{ me.score }}</strong> points
    </p>
    <Scoreboard
      v-else
      :players="playersBefore"
      :scores-after="scoresNow"
      :fermeanie-before="ferBefore"
      :fermeanie-after="ferNow"
      :you="room.you"
      title="Scores"
    />
  </div>
</template>

<style scoped>
.brk {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: 720px;
  margin: 0 auto;
}
.head h2 {
  font-size: var(--text-xl);
  margin: var(--space-1) 0 var(--space-3);
}
.secs {
  color: var(--accent);
}
.recap .q {
  margin: 0;
  color: var(--text-dim);
}
.recap .a {
  margin: var(--space-1) 0 0;
}
.recap .a strong {
  font-size: var(--text-xl);
  color: var(--gold);
}
.skip {
  min-height: 52px;
  font-size: var(--text-l);
}
.center {
  text-align: center;
  margin: var(--space-2) 0 0;
}
.rank {
  margin: 0;
  text-align: center;
  font-size: var(--text-l);
}
.tv .hint {
  color: var(--accent);
}
.tv .head h2 {
  font-size: var(--text-2xl);
}
</style>
