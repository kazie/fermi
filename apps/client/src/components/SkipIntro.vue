<script setup lang="ts">
import type { IntroView } from '@fermi/shared'
import { S } from '@/lib/strings'

/**
 * Skipping the intro: the host skips it at once, anyone else votes (a majority skips it). The big screen only shows
 * the votes. Shown through the whole intro, its example question included.
 */
defineProps<{ skip: IntroView['skip']; isHost: boolean; tv?: boolean }>()
const emit = defineEmits<{ skip: [] }>()
</script>

<template>
  <div class="skip-intro" :class="{ tv }">
    <p v-if="tv" class="muted">
      <template v-if="skip.votes">{{ S.skipIntroVotes(skip.votes, skip.needed) }}. </template>
      <span class="hint">Seen it before? Tap “{{ S.skipIntro }}” on your phone.</span>
    </p>
    <template v-else>
      <button v-if="isHost || !skip.youVoted" class="btn btn-ghost" type="button" @click="emit('skip')">⏭ {{ S.skipIntro }}</button>
      <button v-else class="btn btn-ghost" type="button" disabled>Waiting for others · {{ skip.votes }}/{{ skip.needed }}</button>
      <span v-if="!isHost && skip.votes && !skip.youVoted" class="muted votes">{{ S.skipIntroVotes(skip.votes, skip.needed) }}</span>
    </template>
  </div>
</template>

<style scoped>
.skip-intro {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
}
.skip-intro p {
  margin: 0;
  text-align: center;
}
.hint {
  color: var(--accent);
}
.votes {
  font-size: var(--text-s);
}
</style>
