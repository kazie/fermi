<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatCompact, formatFactor, type RevealCard } from '@fermi/shared'
import { describeOff } from '@/lib/reveal'
import { S } from '@/lib/strings'
import DunceCap from './DunceCap.vue'
import FermeanieAvatar from './FermeanieAvatar.vue'
import FermeanieSays from './FermeanieSays.vue'
import PlayerAvatar from './PlayerAvatar.vue'
import WorkingView from './WorkingView.vue'

const props = withDefaults(
  defineProps<{
    card: RevealCard
    flipped: boolean
    /** FerMEANie took this card's points: it drains to grey and cracks. */
    stolen?: boolean
    dunceLine?: string
    you?: boolean
    unit?: string
    latest?: boolean
  }>(),
  { stolen: false, dunceLine: '', you: false, unit: '', latest: false },
)

const lines = computed(() => props.card.text.split('\n').filter((l) => l.trim()).length)
const expanded = ref(false)
const off = computed(() => describeOff(props.card.factor, props.card.direction, formatFactor))
</script>

<template>
  <article
    class="ac"
    :class="{ flipped, you, latest, stolen: stolen && card.stolen > 0, dunce: !!card.dunce }"
    :aria-label="flipped ? `${card.name}'s answer` : 'An answer, not revealed yet'"
    :data-steal-from="card.playerId"
  >
    <!-- no name on the back: the order of the cards would give away who was furthest off -->
    <div v-if="!flipped" class="back">
      <span class="q" aria-hidden="true">?</span>
      <span class="hidden-name" aria-hidden="true"></span>
    </div>
    <template v-else>
      <header class="head">
        <span v-if="card.rank" class="rank mono">#{{ card.rank }}</span>
        <PlayerAvatar :seed="card.playerId" :size="22" :state="stolen && card.stolen > 0 ? 'drained' : 'idle'" />
        <span class="name">
          <span v-if="card.dunce" class="cap" title="Dunce cap"><DunceCap /></span>
          {{ card.name }}
          <span v-if="you" class="you-tag">you</span>
        </span>
        <span class="pts mono" :class="{ zero: card.points === 0 && card.stolen === 0 }">
          <template v-if="stolen && card.stolen > 0">
            <s>+{{ card.stolen }}</s>
            <span class="now-zero">0</span>
            <span class="to-fer" title="Stolen by FerMEANie">→ <FermeanieAvatar :size="18" mini mood="smug" /></span>
          </template>
          <template v-else>+{{ card.points || card.stolen }}</template>
        </span>
      </header>

      <div class="val">
        <template v-if="card.value !== null">
          <strong class="mono">{{ formatCompact(card.value) }}</strong>
          <span v-if="unit" class="unit">{{ unit }}</span>
        </template>
        <span v-else class="muted">{{ S.noAnswer }}</span>
      </div>
      <div class="meta">
        <span :class="['off', card.direction ?? 'none']">{{ off }}</span>
        <span v-if="card.bonusKind === 'bullseye'" class="badge bull">🎯 Bullseye +{{ card.bonus }}</span>
        <span v-else-if="card.bonusKind === 'close'" class="badge close">Within 2× +{{ card.bonus }}</span>
      </div>

      <FermeanieSays v-if="dunceLine" class="dunce-says" :text="dunceLine" size="s" mood="smug" />

      <div v-if="card.text.trim()" class="work">
        <WorkingView :text="expanded || lines <= 6 ? card.text : card.text.split('\n').slice(0, 6).join('\n')" compact />
        <button v-if="lines > 6" type="button" class="more" @click="expanded = !expanded">
          {{ expanded ? 'Show less' : `Show all ${lines} lines` }}
        </button>
      </div>
    </template>
  </article>
</template>

<style scoped>
.ac {
  position: relative;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-l);
  padding: var(--space-3) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
  transition:
    border-color var(--dur),
    transform var(--dur);
}
.ac.flipped {
  animation: flip var(--dur-slow) var(--ease);
}
@keyframes flip {
  from {
    transform: rotateX(70deg);
    opacity: 0.2;
  }
}
.ac.latest {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.ac.you {
  border-color: var(--blue);
}
.ac.dunce {
  background: repeating-linear-gradient(
    135deg,
    var(--surface),
    var(--surface) 12px,
    rgba(255, 255, 255, 0.015) 12px,
    rgba(255, 255, 255, 0.015) 24px
  );
}
.back {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 48px;
  color: var(--muted);
}
.hidden-name {
  width: 9ch;
  height: 0.8em;
  border-radius: 999px;
  background: var(--surface-3);
}
.back .q {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-s);
  background: var(--surface-3);
  font-weight: 800;
}
.head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.rank {
  font-weight: 800;
  color: var(--muted);
}
.name {
  flex: 1;
  min-width: 0;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cap {
  font-size: 1.1em;
  margin-right: 2px;
}
.you-tag {
  font-size: var(--text-xs);
  color: var(--blue);
  border: 1px solid var(--blue);
  border-radius: 999px;
  padding: 0 6px;
  margin-left: 4px;
  font-weight: 600;
}
.pts {
  font-weight: 800;
  color: var(--ok);
}
.pts.zero {
  color: var(--muted);
}
/* drained by FerMEANie: colour gone, a crack, one shudder */
.ac.stolen {
  border-color: rgba(255, 79, 79, 0.4);
  filter: grayscale(1) brightness(0.72);
  animation: shudder 0.45s ease-out;
  transition: filter 0.4s var(--ease);
}
.ac.stolen::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'%3E%3Cpath d='M62 0 L55 18 L66 30 L50 47 L58 60 L44 78 L52 100' fill='none' stroke='%23ffffff' stroke-opacity='.35' stroke-width='.8' vector-effect='non-scaling-stroke'/%3E%3Cpath d='M55 18 L40 24 M50 47 L36 50 M58 60 L72 70' fill='none' stroke='%23ffffff' stroke-opacity='.25' stroke-width='.6' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E")
    no-repeat center / 100% 100%;
}
@keyframes shudder {
  0%,
  100% {
    transform: translateX(0);
  }
  20% {
    transform: translateX(-5px) rotate(-0.6deg);
  }
  40% {
    transform: translateX(4px) rotate(0.5deg);
  }
  60% {
    transform: translateX(-3px);
  }
  80% {
    transform: translateX(2px);
  }
}
.stolen .pts s {
  color: var(--muted);
}
.now-zero {
  margin-left: 4px;
  color: var(--muted);
}
.to-fer {
  color: var(--fer);
  margin-left: 4px;
}
.val {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.val strong {
  font-size: var(--text-xl);
  word-break: break-word;
}
.unit {
  color: var(--text-dim);
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
  font-size: var(--text-s);
}
.off.high,
.off.low {
  color: var(--text-dim);
}
.off.exact {
  color: var(--gold);
  font-weight: 700;
}
.badge {
  padding: 1px 8px;
  border-radius: 999px;
  font-weight: 700;
  font-size: var(--text-xs);
}
.bull {
  background: rgba(255, 209, 102, 0.15);
  color: var(--gold);
}
.close {
  background: var(--ok-soft);
  color: var(--ok);
}
.dunce-line {
  margin: 0;
  font-size: 13px;
  color: #ffd9d4;
  background: rgba(255, 79, 79, 0.07);
  border-left: 3px solid var(--fer);
  padding: var(--space-1) var(--space-2);
  border-radius: 0 var(--radius-s) var(--radius-s) 0;
}
.more {
  margin-top: 4px;
  background: none;
  border: 0;
  color: var(--blue);
  cursor: pointer;
  padding: 4px 0;
  font-size: var(--text-s);
}
@media (prefers-reduced-motion: reduce) {
  .ac.flipped,
  .ac.stolen {
    animation: none;
  }
}
</style>
