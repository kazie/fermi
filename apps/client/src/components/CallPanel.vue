<script setup lang="ts">
import { computed } from 'vue'
import { callRight, CALLS, formatCompact, type Call, type CallView, type RevealView } from '@fermi/shared'
import { S } from '@/lib/strings'

/**
 * The call at the start of a reveal: is the truth higher or lower than your answer? While it's open (`call`), two
 * buttons and your answer on a phone, the count of calls on the big screen (`you` empty). Once the reveal has arrived,
 * your result after the truth lands, or the big screen's tally. No points either way.
 */
const props = defineProps<{ call?: CallView; reveal?: RevealView; you: string; yourCall?: Call; now: number }>()
const emit = defineEmits<{ call: [Call] }>()

const secs = computed(() => (props.call ? Math.max(0, Math.ceil((props.call.endsAt - props.now) / 1000)) : 0))
const landed = computed(() => !!props.reveal && props.now >= props.reveal.timeline.truthAt)
const mine = computed(() => props.reveal?.cards.find((c) => c.playerId === props.you && c.value !== null && c.value > 0))
const result = computed(() => (mine.value ? callRight(props.yourCall, mine.value.direction) : null))
const calls = computed(() => Object.entries(props.reveal?.calls ?? {}))
const right = computed(
  () => calls.value.filter(([id, c]) => callRight(c, props.reveal!.cards.find((card) => card.playerId === id)?.direction ?? null)).length,
)
const label = { higher: `⬆ ${S.call.higher}`, lower: `⬇ ${S.call.lower}` }
</script>

<template>
  <!-- the call is open -->
  <template v-if="call">
    <div v-if="!you" class="call tv" role="status">
      <p class="ask">{{ S.call.tvAsk }}</p>
      <p class="muted">{{ S.call.made(call.made) }} · {{ S.call.closesIn(secs) }}</p>
    </div>
    <div v-else-if="call.yours !== undefined" class="call card" role="group" :aria-label="S.call.ask">
      <p class="ask">{{ S.call.ask }}</p>
      <p class="muted small">
        {{ S.call.yourAnswer }}: <strong class="mono">{{ formatCompact(call.yours) }}</strong>
      </p>
      <div class="buttons">
        <button
          v-for="c in CALLS"
          :key="c"
          type="button"
          class="btn"
          :class="{ 'btn-primary': yourCall === c }"
          :aria-pressed="yourCall === c"
          @click="emit('call', c)"
        >
          {{ label[c] }}
        </button>
      </div>
      <p class="muted small">{{ S.call.closesIn(secs) }}</p>
    </div>
  </template>

  <!-- the reveal: the result -->
  <template v-else-if="reveal">
    <div v-if="!you" class="call tv" role="status">
      <p v-if="landed && calls.length" class="tally">{{ S.call.tally(right, calls.length) }}</p>
    </div>
    <div v-else-if="mine && yourCall" class="call card" role="status">
      <p v-if="!landed" class="muted">{{ S.call.youSaid(S.call[yourCall]) }}</p>
      <p v-else class="result" :class="{ right: result === true, wrong: result === false }">
        {{ result === null ? S.call.exact : result ? S.call.right : S.call.wrong }}
      </p>
    </div>
  </template>
</template>

<style scoped>
.call {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  text-align: center;
}
.call p {
  margin: 0;
}
.ask {
  font-weight: 700;
}
.tv .ask {
  font-size: var(--text-xl);
}
.buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
  width: 100%;
}
.buttons .btn {
  min-height: 52px;
  font-size: var(--text-l);
}
.small {
  font-size: var(--text-s);
}
.result {
  font-size: var(--text-l);
  font-weight: 700;
}
.result.right {
  color: var(--ok);
}
.result.wrong {
  color: var(--danger);
}
.tally {
  font-size: var(--text-l);
  font-weight: 700;
}
</style>
