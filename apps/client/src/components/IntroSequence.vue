<script setup lang="ts">
import { computed } from 'vue'
import type { IntroView, PlayerView } from '@fermi/shared'
import type { Release } from '@/lib/version'
import { S } from '@/lib/strings'
import FermeanieAvatar from './FermeanieAvatar.vue'
import FermeanieSays from './FermeanieSays.vue'
import PlayerAvatar from './PlayerAvatar.vue'
import RuleSlide from './RuleSlide.vue'
import SkipIntro from './SkipIntro.vue'

/**
 * The intro before the first question: FerMEANie says hello, introduces each player, and (in full) explains the rules.
 * The server times every step; this only shows the one `now` falls in. tv: the big screen. phone: the whole show on
 * a phone. compact: a phone in controller mode, which only says when it's your turn.
 */
const props = withDefaults(
  defineProps<{
    intro: IntroView
    players: PlayerView[]
    you: string
    now: number
    isHost: boolean
    release?: Release
    variant?: 'tv' | 'phone' | 'compact'
  }>(),
  { release: undefined, variant: 'phone' },
)
const emit = defineEmits<{ skip: [] }>()

const index = computed(() => {
  let i = 0
  while (i + 1 < props.intro.steps.length && props.now >= props.intro.steps[i + 1].at) i++
  return i
})
const step = computed(() => props.intro.steps[index.value])
const yours = computed(() => step.value.kind === 'player' && step.value.playerId === props.you)
/** Players already introduced, for the row along the bottom. */
const met = computed(() =>
  props.intro.steps
    .slice(0, index.value + 1)
    .flatMap((s) => (s.kind === 'player' ? [s.playerId] : []))
    .filter((id) => props.players.some((p) => p.id === id)),
)
const sayer = computed(() => (props.variant === 'tv' ? 'l' : props.variant === 'compact' ? 's' : 'm'))
</script>

<template>
  <div class="intro" :class="variant">
    <ol class="dots" :aria-label="`Intro, step ${index + 1} of ${intro.steps.length}`">
      <li v-for="n in intro.steps.length" :key="n" :class="{ done: n - 1 < index, on: n - 1 === index }" />
    </ol>

    <template v-if="variant === 'compact'">
      <p class="look">📺 {{ S.lookUp }}</p>
      <p v-if="yours" class="you card">{{ S.thatsYou }}</p>
    </template>

    <Transition v-else name="step" mode="out-in">
      <section v-if="step.kind === 'hello'" :key="index" class="hello">
        <FermeanieAvatar :size="variant === 'tv' ? 160 : 112" mood="smug" speaking />
      </section>
      <section v-else-if="step.kind === 'player'" :key="index" class="player">
        <span class="eyebrow">{{ S.meetPlayers }}</span>
        <PlayerAvatar class="zoom" :seed="step.playerId" :size="variant === 'tv' ? 160 : 112" />
        <h2 class="name">{{ step.name }}</h2>
        <p v-if="yours" class="you">{{ S.thatsYou }}</p>
      </section>
      <RuleSlide v-else :key="index" :rule="step.rule" />
    </Transition>

    <FermeanieSays :key="`say${index}`" :text="step.line" :start-at="step.at" :now="now" :release="release" mood="smug" :size="sayer" />

    <div v-if="variant !== 'compact' && met.length" class="met" aria-hidden="true">
      <PlayerAvatar v-for="id in met" :key="id" :seed="id" :size="variant === 'tv' ? 40 : 28" />
    </div>

    <SkipIntro :skip="intro.skip" :is-host="isHost" :tv="variant === 'tv'" @skip="emit('skip')" />
  </div>
</template>

<style scoped>
.intro {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: 720px;
  margin: 0 auto;
}
.intro.tv {
  max-width: 1100px;
}
.dots {
  display: flex;
  flex-wrap: wrap;
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
  transition: background var(--dur) var(--ease);
}
.dots li.done {
  background: var(--text-dim);
}
.dots li.on {
  background: var(--accent);
}
.hello,
.player {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  text-align: center;
}
.zoom {
  animation: zoom 0.6s var(--ease) both;
}
@keyframes zoom {
  from {
    opacity: 0;
    transform: scale(0.3) rotate(-12deg);
  }
}
.name {
  margin: 0;
  font-size: var(--text-2xl);
  overflow-wrap: anywhere;
}
.tv .name {
  font-size: clamp(2.5rem, 5vw, 4rem);
}
.you {
  margin: 0;
  color: var(--accent);
  font-weight: 700;
  font-size: var(--text-l);
  text-align: center;
}
.look {
  margin: 0;
  text-align: center;
  font-size: var(--text-l);
}
.met {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-1);
}
.step-enter-active,
.step-leave-active {
  transition:
    opacity var(--dur) var(--ease),
    transform var(--dur) var(--ease);
}
.step-enter-from {
  opacity: 0;
  transform: translateX(24px);
}
.step-leave-to {
  opacity: 0;
  transform: translateX(-24px);
}
@media (prefers-reduced-motion: reduce) {
  .zoom {
    animation: none;
  }
  .step-enter-active,
  .step-leave-active {
    transition: none;
  }
}
</style>
