<script setup lang="ts">
import { computed } from 'vue'
import { formatFactor, revealChat, type Call, type PlayerView, type RevealView } from '@fermi/shared'
import { describeOff, flippedCount, revealStage } from '@/lib/reveal'
import type { Release } from '@/lib/version'
import { S } from '@/lib/strings'
import AnswerCard from './AnswerCard.vue'
import CallPanel from './CallPanel.vue'
import FermeanieSays from './FermeanieSays.vue'

/** The reveal on a phone while a big screen shows the full show: just your own part of it. */
const props = defineProps<{ reveal: RevealView; players: PlayerView[]; you: string; now: number; release?: Release; yourCall?: Call }>()
const emit = defineEmits<{ call: [Call] }>()

const stage = computed(() => revealStage(props.reveal, props.now))
const order = ['call', 'numberLine', 'truth', 'cards', 'fermeanie', 'scoreboard'] as const
const atLeast = (s: (typeof order)[number]) => order.indexOf(stage.value) >= order.indexOf(s)
const mineIdx = computed(() => props.reveal.cards.findIndex((c) => c.playerId === props.you))
const mine = computed(() => props.reveal.cards[mineIdx.value])
const flipped = computed(() => flippedCount(props.reveal, props.now))
const myFlipped = computed(() => mineIdx.value >= 0 && flipped.value > mineIdx.value)
const fer = computed(() => props.reveal.fermeanie)
const scoreAfter = computed(() => props.reveal.scoresAfter[props.you] ?? 0)
const rank = computed(() => {
  const all = Object.entries(props.reveal.scoresAfter).sort((a, b) => b[1] - a[1])
  return all.findIndex(([id]) => id === props.you) + 1
})
const stolen = computed(() => atLeast('fermeanie') && !!fer.value?.beatsAll)
// The same chat as the big screen, at the same moment.
const ferMessages = computed(() => revealChat(props.reveal.lines))
const nextIn = computed(() => Math.max(0, Math.ceil((props.reveal.timeline.endsAt - props.now) / 1000)))
</script>

<template>
  <div class="ctl">
    <p class="look">📺 {{ S.lookUp }}</p>

    <CallPanel v-if="!atLeast('cards')" :reveal="reveal" :you="you" :your-call="yourCall" :now="now" @call="(c) => emit('call', c)" />
    <p v-if="!atLeast('cards')" class="muted center">The truth is landing…</p>
    <template v-else-if="mine">
      <AnswerCard
        v-if="myFlipped"
        :card="mine"
        flipped
        you
        :stolen="stolen && mine.stolen > 0"
        :dunce-line="reveal.lines.dunce[mine.playerId]"
        :now="now"
        :unit="reveal.question.unit"
      />
      <!-- not how many cards are left: they flip from furthest to closest, so that would give your rank away -->
      <p v-else class="wait card center">Your card is coming up…</p>
      <p v-if="myFlipped" class="you-were center">
        You were <strong>{{ describeOff(mine.factor, mine.direction, formatFactor) }}</strong>
      </p>
    </template>
    <p v-else class="muted center">You’re watching this round.</p>

    <FermeanieSays
      v-if="atLeast('fermeanie')"
      :messages="ferMessages"
      :start-at="reveal.timeline.chatAt"
      :now="now"
      :release="release"
      :mood="fer?.beatsAll ? 'smug' : 'sulk'"
      size="s"
    />

    <p v-if="reveal.practice && atLeast('scoreboard')" class="muted center">{{ S.firstRealIn(nextIn) }}</p>
    <p v-else-if="atLeast('scoreboard') && mine" class="score card center">
      <span class="eyebrow">{{ S.afterRound(reveal.index, reveal.multiplier) }}</span
      ><br />
      <strong class="mono big">{{ scoreAfter }}</strong> points · <strong>#{{ rank }}</strong>
    </p>
  </div>
</template>

<style scoped>
.ctl {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: 520px;
  margin: 0 auto;
}
.look {
  margin: 0;
  text-align: center;
  font-size: var(--text-l);
  font-weight: 700;
  color: var(--accent);
}
.center {
  text-align: center;
}
.wait {
  color: var(--text-dim);
}
.you-were {
  margin: 0;
}
.you-were strong {
  color: var(--blue);
}
.score {
  margin: 0;
}
.big {
  font-size: var(--text-2xl);
  color: var(--accent);
}
</style>
