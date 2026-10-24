<script setup lang="ts">
import { computed } from 'vue'
import type { RoomView } from '@fermi/shared'
import { useReadQuestion } from '@/composables/useVoice'
import { S } from '@/lib/strings'
import FermeanieSays from './FermeanieSays.vue'
import PlayerStrip from './PlayerStrip.vue'
import RoundTimer from './RoundTimer.vue'

/** The question on a big screen: big text, the timer, who has locked in. Answering happens on phones. */
const props = defineProps<{ room: RoomView; now: number }>()
const round = computed(() => props.room.round!)

useReadQuestion(
  () => round.value,
  () => props.now,
)
const locked = computed(() => props.room.players.filter((p) => p.lockedIn).length)
const playing = computed(() => props.room.players.filter((p) => !p.spectating).length)
</script>

<template>
  <div class="tv-q">
    <span v-if="round.practice" class="eyebrow practice">{{ S.practice }}</span>
    <span v-else class="eyebrow"
      >Question {{ round.index + 1 }} of {{ round.total }} · {{ round.question.category.replace(/-/g, ' ') }}</span
    >
    <h1>{{ round.question.question }}</h1>
    <p class="unit">
      Answer in <strong>{{ round.question.unit }}</strong> · on your phone
    </p>
    <RoundTimer :started-at="round.startedAt" :ends-at="round.endsAt" :now="now" />
    <div class="locks">
      <span class="eyebrow">Locked in {{ locked }} / {{ playing }}</span>
      <PlayerStrip :players="room.players" you="" />
    </div>
    <FermeanieSays :text="round.line" :start-at="round.startedAt" :now="now" :release="room.fermeanie" mood="smug" size="l" />
  </div>
</template>

<style scoped>
.tv-q {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  max-width: 1100px;
  margin: 0 auto;
}
h1 {
  font-size: clamp(2rem, 4.5vw, 3.6rem);
  line-height: 1.15;
  overflow-wrap: anywhere;
}
.unit {
  margin: 0;
  font-size: var(--text-l);
  color: var(--text-dim);
}
.unit strong {
  color: var(--accent);
}
.locks {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
</style>
