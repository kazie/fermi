<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { formatCompact, formatFactor, type PlayerView, type RevealView } from '@fermi/shared'
import { describeOff, flippedCount, revealStage, STEAL, stealPlan } from '@/lib/reveal'
import type { Release } from '@/lib/version'
import AnswerCard from './AnswerCard.vue'
import FermeanieSays from './FermeanieSays.vue'
import LogNumberLine from './LogNumberLine.vue'
import Scoreboard from './Scoreboard.vue'
import StealFx from './StealFx.vue'
import TruthPanel from './TruthPanel.vue'

const props = withDefaults(
  defineProps<{
    reveal: RevealView
    players: PlayerView[]
    you: string
    now: number
    fermeanieBefore: number
    release?: Release
    /** Disable auto-scrolling (stories). */
    noScroll?: boolean
  }>(),
  { release: undefined, noScroll: false },
)

const stage = computed(() => revealStage(props.reveal, props.now))
const order = ['numberLine', 'truth', 'cards', 'fermeanie', 'scoreboard'] as const
const atLeast = (s: (typeof order)[number]) => order.indexOf(stage.value) >= order.indexOf(s)
const flipped = computed(() => flippedCount(props.reveal, props.now))
const latestId = computed(() => (flipped.value > 0 && stage.value === 'cards' ? props.reveal.cards[flipped.value - 1].playerId : null))

const guesses = computed(() =>
  props.reveal.cards.map((c) => ({
    id: c.playerId,
    name: c.name,
    value: c.value,
    outlier: !!props.reveal.crowd?.outlierIds.includes(c.playerId) || (c.value !== null && !(c.value > 0)),
    dunce: atLeast('truth') && !!c.dunce,
    you: c.playerId === props.you,
  })),
)
// Pins only appear as their card flips, so nobody can tell who answered what ahead of time.
const shownIds = computed(() => (atLeast('fermeanie') ? null : props.reveal.cards.slice(0, flipped.value).map((c) => c.playerId)))
const pending = computed(() => (atLeast('fermeanie') ? 0 : props.reveal.cards.length - flipped.value))

const fer = computed(() => props.reveal.fermeanie)
const crowd = computed(() => props.reveal.crowd)
const mine = computed(() => props.reveal.cards.find((c) => c.playerId === props.you))
const nextIn = computed(() => Math.max(0, Math.ceil((props.reveal.timeline.endsAt - props.now) / 1000)))
const isLast = computed(() => props.reveal.index + 1 >= props.reveal.total)

const ferMood = computed(() => (fer.value?.beatsAll ? 'smug' : fer.value ? 'sulk' : 'idle'))

// The steal: points fly off the cards one by one, the cards drain, FerMEANie gloats.
const plan = computed(() => stealPlan(props.reveal))
const ferT = computed(() => props.now - props.reveal.timeline.fermeanieAt)
const stealing = computed(() => !!plan.value && atLeast('fermeanie') && ferT.value < plan.value.doneAt + 1200)
const drained = (id: string) => !!plan.value && atLeast('fermeanie') && id in plan.value.starts && ferT.value >= plan.value.starts[id]
const stolenPoints = computed(() => Object.fromEntries(props.reveal.cards.map((c) => [c.playerId, c.stolen])))
const haul = computed(() => {
  const p = plan.value
  if (!p) return 0
  return props.reveal.cards
    .filter((c) => c.playerId in p.starts && ferT.value >= p.starts[c.playerId] + STEAL.flight)
    .reduce((n, c) => n + c.stolen, 0)
})
const verdictIn = computed(() => !plan.value || ferT.value >= plan.value.doneAt)
// One bubble that chats: rule change, then the group dunce remark, then the verdict.
const ferMessages = computed(() => [props.reveal.lines.ruleChange, props.reveal.lines.dunceGroup, props.reveal.lines.verdict])

// Single-column layout (phones): the cards and FerMEANie's panel can't both be on screen.
const narrow = ref(false)
let mq: MediaQueryList | undefined
const onMq = () => (narrow.value = !!mq?.matches)
onMounted(() => {
  mq = matchMedia('(max-width: 899px)')
  onMq()
  mq.addEventListener('change', onMq)
})
onUnmounted(() => mq?.removeEventListener('change', onMq))

// Desktop: keep the newest thing in view. Phones don't need it: there the feed puts the newest item
// right under the sticky number line and pushes older ones down.
const root = ref<HTMLElement>()
watch([stage, flipped], async () => {
  if (props.noScroll || narrow.value || !root.value) return
  await nextTick()
  const target =
    stage.value === 'cards'
      ? root.value.querySelector('.ac.latest')
      : stage.value === 'truth'
        ? root.value.querySelector('.truth')
        : stage.value === 'fermeanie'
          ? root.value.querySelector('.fer-panel')
          : stage.value === 'scoreboard'
            ? root.value.querySelector('.sb')
            : null
  target?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' })
})
</script>

<template>
  <div ref="root" class="reveal" :class="{ stealing, narrow }">
    <StealFx v-if="plan && atLeast('fermeanie')" :root="root" :t="ferT" :starts="plan.starts" :points="stolenPoints" />
    <header class="q">
      <span class="eyebrow">Round {{ reveal.index + 1 }} of {{ reveal.total }} · reveal</span>
      <h2>{{ reveal.question.question }}</h2>
      <span class="muted">in {{ reveal.question.unit }}</span>
    </header>

    <section class="line card" aria-label="All answers">
      <LogNumberLine
        :guesses="guesses"
        :truth="atLeast('truth') ? reveal.question.answer : null"
        :fermeanie="atLeast('fermeanie') && fer ? fer.value : null"
        :highlight="latestId"
        :shown="shownIds"
      />
      <div v-if="pending" class="pending" :aria-label="`${pending} answers still to come`">
        <span v-for="n in pending" :key="n" class="chip mono" aria-hidden="true">?</span>
      </div>
      <p v-if="stage === 'numberLine'" class="muted center">Everyone’s answers are in. The truth is about to land…</p>
      <p v-else-if="mine && atLeast('cards') && flipped > reveal.cards.indexOf(mine)" class="center you-were">
        You were <strong>{{ describeOff(mine.factor, mine.direction, formatFactor) }}</strong>
      </p>
      <FermeanieSays v-if="reveal.lines.everyone && !atLeast('cards')" :text="reveal.lines.everyone" mood="smug" size="s" />
    </section>

    <div class="grid">
      <div class="area-truth">
        <TruthPanel v-if="atLeast('truth')" :question="reveal.question" />
      </div>

      <section v-if="atLeast('cards')" class="cards" aria-label="Answers, furthest to closest">
        <AnswerCard
          v-for="(c, i) in reveal.cards"
          :key="c.playerId"
          :card="c"
          :flipped="i < flipped"
          :latest="c.playerId === latestId"
          :stolen="drained(c.playerId)"
          :dunce-line="reveal.lines.dunce[c.playerId]"
          :you="c.playerId === you"
          :unit="reveal.question.unit"
        />
        <template v-if="flipped === reveal.cards.length">
          <FermeanieSays v-if="reveal.lines.twins" :text="reveal.lines.twins" mood="smug" size="s" />
          <FermeanieSays v-if="reveal.lines.bullseye" :text="reveal.lines.bullseye" mood="sulk" size="s" />
        </template>
      </section>

      <div class="area-fer">
        <section v-if="atLeast('fermeanie')" class="fer-panel card">
          <div class="fer-head">
            <template v-if="fer && crowd">
              <div>
                <span class="eyebrow how"
                  >Swarm estimate: FerMEANie played the <b>{{ crowd.method === 'median' ? 'median' : 'geometric mean' }}</b> of your
                  answers{{ crowd.method === 'median' ? ', because someone was wildly off' : '' }}</span
                >
                <div class="fer-val mono">{{ formatCompact(fer.value) }}</div>
                <span class="muted">{{ describeOff(fer.factor, fer.direction, formatFactor) }}</span>
              </div>
              <div v-if="!verdictIn" class="haul mono" aria-hidden="true">{{ haul ? `+${haul}` : '' }}</div>
              <div v-else class="verdict" :class="{ steal: fer.beatsAll }">
                {{ fer.beatsAll ? `Steals ${fer.points} points` : 'Beaten by a human' }}
              </div>
            </template>
            <span v-else class="muted">Not enough answers to form a swarm.</span>
          </div>
          <div data-steal-to>
            <FermeanieSays
              :messages="ferMessages"
              :start-at="reveal.timeline.fermeanieAt"
              :now="now"
              :release="release"
              :mood="ferMood"
              :gloat="stealing"
            />
          </div>
          <dl v-if="crowd" class="nerd mono">
            <div :class="{ picked: crowd.method === 'geomean' }">
              <dt>geomean</dt>
              <dd>{{ formatCompact(crowd.geomean) }}</dd>
              <span v-if="crowd.method === 'geomean'" class="pick-tag">FerMEANie’s pick</span>
            </div>
            <div :class="{ picked: crowd.method === 'median' }">
              <dt>median</dt>
              <dd>{{ formatCompact(crowd.median) }}</dd>
              <span v-if="crowd.method === 'median'" class="pick-tag">FerMEANie’s pick</span>
            </div>
            <div>
              <dt>mean</dt>
              <dd>{{ formatCompact(crowd.mean) }}</dd>
            </div>
            <div>
              <dt>answers</dt>
              <dd>{{ crowd.count }}</dd>
            </div>
          </dl>
        </section>

        <Scoreboard
          v-if="atLeast('scoreboard')"
          :players="players"
          :scores-after="reveal.scoresAfter"
          :fermeanie-before="fermeanieBefore"
          :fermeanie-after="reveal.fermeanieScoreAfter"
          :you="you"
          :title="`Scores after round ${reveal.index + 1}`"
        />
        <p v-if="atLeast('scoreboard')" class="muted center next">{{ isLast ? 'Final results' : 'Next question' }} in {{ nextIn }}s…</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.reveal {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
/* the room goes red while FerMEANie takes the points */
.reveal::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 25;
  pointer-events: none;
  box-shadow: inset 0 0 140px 30px rgba(255, 40, 40, 0.42);
  background: radial-gradient(ellipse at center, transparent 55%, rgba(120, 0, 0, 0.25));
  opacity: 0;
  transition: opacity 0.9s var(--ease);
}
.reveal.stealing::before {
  opacity: 1;
  transition-duration: 0.35s;
}
.pending {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  margin-top: var(--space-2);
}
.chip {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-s);
  background: var(--surface-3);
  border: 1px dashed var(--border-strong);
  color: var(--muted);
  font-weight: 800;
  font-size: 12px;
}
.q h2 {
  font-size: var(--text-l);
  margin: var(--space-1) 0;
}
.line {
  padding: var(--space-4) var(--space-2) var(--space-3);
}
.center {
  text-align: center;
  margin: var(--space-2) 0 0;
}
.you-were strong {
  color: var(--blue);
}
.grid {
  display: grid;
  gap: var(--space-4);
}
.area-truth,
.area-fer {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}
.area-truth:empty {
  display: none;
}
.cards {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
}
.fer-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  border-color: rgba(255, 79, 79, 0.35);
  animation: rise var(--dur-slow) var(--ease) both;
}
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
}
.fer-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-3);
  flex-wrap: wrap;
}
.fer-val {
  font-size: var(--text-xl);
  font-weight: 800;
  color: var(--fer);
}
.verdict {
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius);
  background: var(--ok-soft);
  color: var(--ok);
  font-weight: 800;
}
.verdict.steal {
  background: var(--danger-soft);
  color: var(--fer);
  animation: stamp 0.45s cubic-bezier(0.2, 1.6, 0.4, 1) both;
}
@keyframes stamp {
  from {
    opacity: 0;
    transform: scale(2.2) rotate(-8deg);
  }
}
.haul {
  font-size: var(--text-xl);
  font-weight: 900;
  color: var(--fer);
  text-shadow: 0 0 12px var(--fer-glow);
}
.how b {
  color: var(--fer);
}
.nerd {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
  margin: var(--space-2) 0 0;
  font-size: var(--text-xs);
}
.nerd div {
  position: relative;
  background: var(--surface-2);
  border-radius: var(--radius-s);
  padding: var(--space-1) var(--space-2);
  min-width: 0;
  border: 2px solid transparent;
}
.nerd .picked {
  border: 2px dashed var(--fer);
  background: rgba(255, 79, 79, 0.08);
}
.nerd .picked dt,
.nerd .picked dd {
  color: var(--fer);
  font-weight: 800;
}
.pick-tag {
  position: absolute;
  top: -9px;
  left: 6px;
  font-family: var(--font-ui);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--fer);
  background: var(--surface);
  padding: 0 4px;
  border-radius: 4px;
  white-space: nowrap;
}
.nerd dt {
  color: var(--muted);
}
.nerd dd {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.next {
  margin: 0;
}
@media (min-width: 520px) {
  .nerd {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
@media (prefers-reduced-motion: reduce) {
  .verdict.steal {
    animation: none;
  }
}
@media (min-width: 900px) {
  .grid {
    grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
    grid-template-areas:
      'truth cards'
      'fer cards';
    grid-template-rows: auto 1fr;
    align-items: start;
  }
  .area-truth {
    grid-area: truth;
  }
  .area-fer {
    grid-area: fer;
  }
  .cards {
    grid-area: cards;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    align-items: start;
  }
}
/* ---------- phones: one feed, newest on top ----------
   The number line sticks to the top; under it, the newest item appears first and pushes the rest down:
   FerMEANie + scores, then the cards (most recently flipped first), then the answer. */
@media (max-width: 899px) {
  .narrow .line {
    position: sticky;
    top: 0;
    z-index: 15;
    padding: var(--space-2) var(--space-1) var(--space-2);
    box-shadow: 0 8px 16px -8px rgba(0, 0, 0, 0.7);
  }
  .narrow .grid {
    display: flex;
    flex-direction: column;
    overflow-anchor: none; /* let new items push the old ones down instead of the browser holding them in place */
  }
  .narrow .area-fer {
    order: 1;
    flex-direction: column-reverse; /* scores above FerMEANie's panel once they arrive */
  }
  .narrow .cards {
    order: 2;
    flex-direction: column-reverse;
  }
  .narrow .area-truth {
    order: 3;
  }
  /* face-down cards are already counted by the ? chips in the number line */
  .narrow .cards :deep(.ac:not(.flipped)) {
    display: none;
  }
  .narrow .cards :deep(.ac.flipped),
  .narrow :deep(.truth),
  .narrow .fer-panel,
  .narrow :deep(.sb) {
    animation: feed-in var(--dur-slow) var(--ease) both;
  }
}
@keyframes feed-in {
  from {
    opacity: 0;
    transform: translateY(-14px);
  }
}
</style>
