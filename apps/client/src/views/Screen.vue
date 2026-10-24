<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useSocket } from '@/composables/useSocket'
import { useServerNow } from '@/composables/useNow'
import { useVoice } from '@/composables/useVoice'
import { useGameSfx } from '@/composables/useGameSfx'
import { useWakeLock } from '@/composables/useWakeLock'
import { providePlayerOrder } from '@/lib/playerColors'
import AppHeader from '@/components/AppHeader.vue'
import BreakScreen from '@/components/BreakScreen.vue'
import FinalScreen from '@/components/FinalScreen.vue'
import IntroSequence from '@/components/IntroSequence.vue'
import CallStage from '@/components/CallStage.vue'
import RevealSequence from '@/components/RevealSequence.vue'
import ScreenLobby from '@/components/ScreenLobby.vue'
import ScreenQuestion from '@/components/ScreenQuestion.vue'
import SkipIntro from '@/components/SkipIntro.vue'
import ReactionLayer from '@/components/ReactionLayer.vue'

/** /screen/:code — the big screen (TV or laptop). It only watches; everyone plays on their phones. */
const props = defineProps<{ code: string }>()
const code = props.code.toUpperCase()
const socket = useSocket(code, { screen: true })
const { room, status, fatal, offset } = socket
// FerMEANie's voice: off until this device turns it on (the speaker in the header)
const voice = useVoice(socket)
const now = useServerNow(offset)
// the big screen plays the shared sounds: the countdown, the reveal, the steal
useGameSfx(room, now, voice)
useWakeLock(() => !!room.value) // a TV page should never fall asleep
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
  <AppHeader :code="code" :status="status" :version="room?.fermeanie.version" :sound="voice.sound.value" @sound="voice.toggle()" />
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
      <IntroSequence
        v-else-if="room.phase === 'intro' && room.intro"
        :intro="room.intro"
        :players="room.players"
        you=""
        :now="now"
        :is-host="false"
        :release="room.fermeanie"
        variant="tv"
      />
      <ScreenQuestion
        v-else-if="room.phase === 'question' && room.round"
        :key="room.round.practice ? 'practice' : room.round.index"
        :room="room"
        :now="now"
      />
      <CallStage v-else-if="room.phase === 'reveal' && room.call" :call="room.call" you="" :now="now" variant="tv" />
      <RevealSequence
        v-else-if="room.phase === 'reveal' && room.reveal"
        :key="`r${room.reveal.practice ? 'p' : room.reveal.index}`"
        :reveal="room.reveal"
        :players="room.players"
        you=""
        :now="now"
        :fermeanie-before="room.fermeanie.score"
        :release="room.fermeanie"
      />
      <BreakScreen v-else-if="room.phase === 'break' && room.break" :room="room" :now="now" variant="tv" />
      <FinalScreen v-else-if="room.phase === 'final' && room.final" :final="room.final" you="" :is-host="false" :now="now" screen />
      <ReactionLayer :reactions="socket.reactions.value" :players="room.players" :now="now" big />
      <SkipIntro v-if="room.intro && room.phase !== 'intro'" class="practice-skip" :skip="room.intro.skip" :is-host="false" tv />
    </template>
  </main>
</template>

<style scoped>
.tv {
  --max-w: 1600px;
  position: relative;
}
.practice-skip {
  margin-top: var(--space-5);
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
