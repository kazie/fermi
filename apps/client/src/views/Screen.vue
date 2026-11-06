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
import SoundNudge from '@/components/SoundNudge.vue'

/** /screen/:code — the big screen (TV or laptop). It only watches; everyone plays on their phones. */
const props = defineProps<{ code: string }>()
const code = props.code.toUpperCase()
const socket = useSocket(code, { screen: true })
const { room, status, fatal, offset } = socket
// FerMEANie's voice and the effects: on unless turned off (the speaker in the header), once the browser has had a click
const voice = useVoice(socket)
/** Nobody clicks a TV, so it asks: whenever sound waits for a click, and in the lobby when it was turned off. */
const nudge = computed(() => {
  const silence = voice.silence.value
  return silence === 'locked' || (silence === 'muted' && room.value?.phase === 'lobby') ? silence : null
})
const now = useServerNow(offset)
/** The clock as a function, for views where only a small part needs it (the lobby's line). */
const clock = () => now.value
// the big screen plays the shared sounds: the countdown, the reveal, the steal
useGameSfx(room, now, voice, socket.onReaction)
useWakeLock(() => !!room.value) // a TV page should never fall asleep
providePlayerOrder(computed(() => room.value?.players.map((p) => p.id) ?? []))
const joinUrl = `${location.origin}/r/${code}`

// Scale the whole UI with the screen, px and rem alike (CSS zoom), so a TV shows the layout a 1280×720 window
// would, only bigger. Never smaller: a smaller window gets the plain page at 1×, responsive layout and all.
const DESIGN_W = 1280
const DESIGN_H = 720
const zoom = ref(1)
const isFullscreen = ref(false)
/** The lobby and a question are short: centred on the screen rather than stuck to the top. */
const middle = computed(() => !fatal.value && (room.value?.phase === 'lobby' || room.value?.phase === 'question'))
function fit() {
  // a browser without CSS zoom keeps 1×: the page would not grow, only its min-height would shrink
  zoom.value = CSS.supports('zoom', '2') ? Math.max(1, Math.min(innerWidth / DESIGN_W, innerHeight / DESIGN_H)) : 1
  isFullscreen.value = !!document.fullscreenElement // also when it was left with Esc
}
onMounted(() => {
  fit()
  addEventListener('resize', fit)
  document.addEventListener('fullscreenchange', fit)
})
onUnmounted(() => {
  removeEventListener('resize', fit)
  document.removeEventListener('fullscreenchange', fit)
})

async function toggleFullscreen() {
  if (document.fullscreenElement) await document.exitFullscreen()
  else await document.documentElement.requestFullscreen?.()
}
</script>

<template>
  <div class="tv-root" :style="{ zoom, '--zoom': zoom }">
    <AppHeader :code="code" :status="status" :version="room?.fermeanie.version" :sound="voice.sound.value" @sound="voice.toggle()" />
    <main class="page tv">
      <button class="btn btn-ghost fs" type="button" @click="toggleFullscreen">
        {{ isFullscreen ? 'Exit full screen' : '⛶ Full screen' }}
      </button>
      <SoundNudge v-if="room && !fatal && nudge" :state="nudge" tv @on="voice.enable()" />
      <!-- one full-width block, so each phase lays out as on any page; only the block is centred -->
      <div class="phase" :class="{ middle }">
        <div v-if="fatal" class="card fatal">
          <h1>Hmm.</h1>
          <p>{{ fatal }}</p>
          <a class="btn btn-primary" href="/">Back to start</a>
        </div>
        <p v-else-if="!room" class="muted">Connecting to room {{ code }}…</p>
        <ScreenLobby v-else-if="room.phase === 'lobby'" :room="room" :join-url="joinUrl" :clock="clock" />
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
      </div>
      <template v-if="room && !fatal">
        <ReactionLayer :reactions="socket.reactions.value" :players="room.players" :now="now" big />
        <SkipIntro v-if="room.intro && room.phase !== 'intro'" class="practice-skip" :skip="room.intro.skip" :is-host="false" tv />
      </template>
    </main>
  </div>
</template>

<style scoped>
/* zoomed (see fit): 100dvh inside it would be zoomed too, so it's divided back out */
.tv-root {
  --max-w: 1600px;
  min-height: calc(100vh / var(--zoom)); /* TV browsers without dvh */
  min-height: calc(100dvh / var(--zoom));
  display: flex;
  flex-direction: column;
}
.tv {
  position: relative;
  width: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;
}
.phase.middle {
  margin-block: auto;
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
