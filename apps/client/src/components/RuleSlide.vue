<script setup lang="ts">
import { BULLSEYE_BONUS, CLOSE_BONUS, FINAL_ROUND_MULTIPLIER, RANK_POINTS, type Rule } from '@fermi/shared'
import { S } from '@/lib/strings'
import FermeanieAvatar from './FermeanieAvatar.vue'
import LogNumberLine from './LogNumberLine.vue'
import WorkingView from './WorkingView.vue'

/** One of the intro's rule slides: a title, a small picture of the rule, and the rule in a sentence. */
defineProps<{ rule: Rule }>()

const SHEET = 'people = 8 billion\nshare = 0.1   # one in ten owns a bike?\npeople * share'
const TIMES_OFF = [
  { id: 'times-off-low', name: '2× too low', value: 500 },
  { id: 'times-off-high', name: '2× too high', value: 2000 },
]
</script>

<template>
  <section class="rule card" :aria-label="S.rules[rule].title">
    <h2>{{ S.rules[rule].title }}</h2>
    <div class="pic">
      <WorkingView v-if="rule === 'sheet'" :text="SHEET" />
      <LogNumberLine v-else-if="rule === 'times_off'" :guesses="TIMES_OFF" :truth="1000" />
      <ol v-else-if="rule === 'points'" class="points">
        <li>
          <span class="mono">{{ RANK_POINTS }}</span> points a place: the closest scores the most
        </li>
        <li>
          <span class="mono">+{{ CLOSE_BONUS }}</span> within 2×
        </li>
        <li>
          <span class="mono">+{{ BULLSEYE_BONUS }}</span> within 10%: a bullseye
        </li>
        <li>
          <span class="mono">×{{ FINAL_ROUND_MULTIPLIER }}</span> on the final question, steal included
        </li>
      </ol>
      <div v-else class="swarm">
        <FermeanieAvatar :size="96" mood="smug" gloat />
      </div>
    </div>
    <p class="text">{{ S.rules[rule].text }}</p>
  </section>
</template>

<style scoped>
.rule {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  animation: rise var(--dur-slow) var(--ease) both;
}
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
}
h2 {
  margin: 0;
  font-size: var(--text-xl);
}
.pic {
  min-width: 0;
}
.text {
  margin: 0;
  color: var(--text-dim);
  font-size: var(--text-l);
}
.points {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.points li {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.points .mono {
  min-width: 4.5ch;
  color: var(--gold);
  font-weight: 700;
}
.swarm {
  display: grid;
  place-items: center;
  padding: var(--space-3) 0;
}
</style>
