<script setup lang="ts">
import type { FinalAward } from '@fermi/shared'
import { S } from '@/lib/strings'
import PlayerAvatar from './PlayerAvatar.vue'

/** One end-of-game award: big while FerMEANie reads it out, compact in the list under the final scores and the recap. */
withDefaults(defineProps<{ award: Pick<FinalAward, 'kind' | 'playerId' | 'name' | 'value'>; big?: boolean; you?: boolean }>(), {
  big: false,
  you: false,
})
</script>

<template>
  <div class="award card" :class="{ big, you }">
    <span class="emoji" aria-hidden="true">{{ S.awards[award.kind].emoji }}</span>
    <div class="body">
      <span class="eyebrow">{{ S.awards[award.kind].title }}</span>
      <div class="who">
        <PlayerAvatar :seed="award.playerId" :size="big ? 40 : 22" />
        <strong class="name">{{ award.name }}</strong>
        <span v-if="you" class="tag">you</span>
      </div>
      <span class="muted stat">{{ S.awards[award.kind].stat(award.value) }}</span>
    </div>
  </div>
</template>

<style scoped>
.award {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}
.big {
  flex-direction: column;
  text-align: center;
  border-color: rgba(255, 209, 102, 0.45);
  background: radial-gradient(circle at 50% 0%, rgba(255, 209, 102, 0.14), var(--surface) 70%);
  animation: rise var(--dur-slow) var(--ease) both;
}
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(16px) scale(0.96);
  }
}
.you {
  border-color: var(--accent);
}
.emoji {
  font-size: 1.8rem;
}
.big .emoji {
  font-size: 3.5rem;
}
.body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.big .body {
  align-items: center;
  gap: var(--space-1);
}
.who {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}
.name {
  overflow-wrap: anywhere;
}
.big .name {
  font-size: var(--text-2xl);
}
.tag {
  color: var(--accent);
  border-color: var(--accent);
}
.stat {
  font-size: var(--text-s);
}
.big .stat {
  font-size: var(--text-l);
}
@media (prefers-reduced-motion: reduce) {
  .big {
    animation: none;
  }
}
</style>
