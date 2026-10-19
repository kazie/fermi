<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useSocket } from '@/composables/useSocket'
import { useServerNow } from '@/composables/useNow'
import { providePlayerOrder } from '@/lib/playerColors'
import AppHeader from '@/components/AppHeader.vue'
import BreakScreen from '@/components/BreakScreen.vue'
import FinalScreen from '@/components/FinalScreen.vue'
import RevealSequence from '@/components/RevealSequence.vue'
import ScreenLobby from '@/components/ScreenLobby.vue'
import ScreenQuestion from '@/components/ScreenQuestion.vue'

/** /screen/:code — the big screen (TV or laptop). It only watches; everyone plays on their phones. */
const props = defineProps<{ code: string }>()
const code = props.code.toUpperCase()
const { room, status, fatal, offset } = useSocket(code, { screen: true })
const now = useServerNow(offset)
providePlayerOrder(computed(() => room.value?.players.map((p) => p.id) ?? []))
const joinUrl = `${location.origin}/r/${code}`

// Scale the whole UI with the screen: most sizes are in rem, so a bigger root font makes it TV-readable.
function scale() {
  document.documentElement.style.fontSize = `${Math.max(16, Math.min(28, (innerWidth / 1280) * 18))}px`
}
onMounted(() => {
  scale()
  addEventListener('resize', scale)
})
onUnmounted(() => {
  removeEventListener('resize', scale)
  document.documentElement.style.fontSize = ''
})

const isFullscreen = ref(false)
async function toggleFullscreen() {
  if (document.fullscreenElement) await document.exitFullscreen()
  else await document.documentElement.requestFullscreen?.()
  isFullscreen.value = !!document.fullscreenElement
}
</script>

<template>
  <AppHeader :code="code" :status="status" :version="room?.fermeanie.version" />
  <main class="page tv">
    <button class="btn btn-ghost fs" type="button" @click="toggleFullscreen">
      {{ isFullscreen ? 'Exit full screen' : '⛶ Full screen' }}
    </button>
    <div v-if="fatal" class="card fatal">
      <h1>Hmm.</h1>
      <p>{{ fatal }}</p>
      <a class="btn btn-primary" href="/">Back to start</a>
    </div>
    <p v-else-if="!room" class="muted">Connecting to room {{ code }}…</p>
    <template v-else>
      <ScreenLobby v-if="room.phase === 'lobby'" :room="room" :join-url="joinUrl" />
      <ScreenQuestion v-else-if="room.phase === 'question' && room.round" :room="room" :now="now" />
      <RevealSequence
        v-else-if="room.phase === 'reveal' && room.reveal"
        :key="`r${room.reveal.index}`"
        :reveal="room.reveal"
        :players="room.players"
        you=""
        :now="now"
        :fermeanie-before="room.fermeanie.score"
        :release="room.fermeanie"
      />
      <BreakScreen v-else-if="room.phase === 'break' && room.break" :room="room" :now="now" variant="tv" />
      <FinalScreen v-else-if="room.phase === 'final' && room.final" :final="room.final" you="" :is-host="false" screen />
    </template>
  </main>
</template>

<style scoped>
.tv {
  --max-w: 1600px;
  position: relative;
}
.fs {
  position: absolute;
  top: 0;
  right: var(--gutter);
  font-size: var(--text-s);
  min-height: 32px;
  opacity: 0.6;
}
.fatal {
  max-width: 560px;
  margin: var(--space-6) auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  align-items: flex-start;
}
</style>
