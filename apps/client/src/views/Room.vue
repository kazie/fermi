<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { rememberGameId, saveName, savedName, savedPhoneView, savePhoneView, type PhoneView } from '@/lib/storage'
import { providePlayerOrder } from '@/lib/playerColors'
import { useSocket } from '@/composables/useSocket'
import { useServerNow } from '@/composables/useNow'
import { useVoice } from '@/composables/useVoice'
import { useWakeLock } from '@/composables/useWakeLock'
import AppHeader from '@/components/AppHeader.vue'
import FinalScreen from '@/components/FinalScreen.vue'
import IntroSequence from '@/components/IntroSequence.vue'
import Lobby from '@/components/Lobby.vue'
import NameForm from '@/components/NameForm.vue'
import SkipIntro from '@/components/SkipIntro.vue'
import QuestionScreen from '@/components/QuestionScreen.vue'
import RevealSequence from '@/components/RevealSequence.vue'
import BreakScreen from '@/components/BreakScreen.vue'
import ControllerReveal from '@/components/ControllerReveal.vue'
import ViewToggle from '@/components/ViewToggle.vue'
import { revealStage } from '@/lib/reveal'

const props = defineProps<{ code: string }>()
const code = props.code.toUpperCase()
const socket = useSocket(code)
const { room, status, fatal, lastError, offset, send } = socket
// FerMEANie's voice: off until this device turns it on (the speaker in the header)
const voice = useVoice(socket)
const now = useServerNow(offset)
// keep the phone awake through a game, so it doesn't lock (and drop off) mid-question
useWakeLock(() => ['intro', 'question', 'reveal', 'break'].includes(room.value?.phase ?? ''))

const me = computed(() => room.value?.players.find((p) => p.id === room.value?.you))
providePlayerOrder(computed(() => room.value?.players.map((p) => p.id) ?? []))
const joinUrl = `${location.origin}/r/${code}`
const initialName = savedName()

// With a big screen in the room, phones can be a compact controller (look up at the TV) or show everything.
const phoneView = ref<PhoneView>(savedPhoneView())
watch(phoneView, savePhoneView)
const hasScreen = computed(() => (room.value?.screens ?? 0) > 0)
const controller = computed(() => hasScreen.value && phoneView.value === 'controller')
const showToggle = computed(() => hasScreen.value && !!me.value && ['intro', 'reveal', 'break'].includes(room.value?.phase ?? ''))
const isHost = computed(() => !!room.value && room.value.hostId === room.value.you)
/** During the intro's example question, the vote to skip the intro is still on. */
const practiceSkip = computed(() => (room.value?.phase !== 'intro' && !!me.value ? room.value?.intro?.skip : undefined))

function join(name: string) {
  saveName(name)
  send({ type: 'join', name })
}

// Phones buzz when FerMEANie steals the round (where supported, and not under reduced motion).
const stealing = computed(() => {
  const r = room.value?.reveal
  return room.value?.phase === 'reveal' && !!r?.fermeanie?.beatsAll && revealStage(r, now.value) === 'fermeanie'
})
watch(stealing, (on) => {
  if (on && !matchMedia('(prefers-reduced-motion: reduce)').matches) navigator.vibrate?.([80, 60, 80, 60, 240])
})

// remember our per-room public id, so the recap page can highlight our cards
watch(
  () => room.value?.final?.gameId,
  (gameId) => {
    if (gameId && room.value) rememberGameId(gameId, room.value.you)
  },
)
</script>

<template>
  <AppHeader :code="code" :status="status" :version="room?.fermeanie.version" :sound="voice.sound.value" @sound="voice.toggle()" />
  <main class="page">
    <div v-if="fatal" class="card fatal">
      <h1>Hmm.</h1>
      <p>{{ fatal }}</p>
      <a class="btn btn-primary" href="/">Back to start</a>
    </div>
    <p v-else-if="!room" class="muted">Connecting to room {{ code }}…</p>
    <template v-else>
      <ViewToggle v-if="showToggle" v-model="phoneView" class="toggle" />
      <NameForm v-if="!me" :code="code" :mid-game="room.phase !== 'lobby'" :initial-name="initialName" @join="join" />
      <Lobby
        v-else-if="room.phase === 'lobby'"
        :room="room"
        :join-url="joinUrl"
        @settings="
          (s) =>
            send({
              type: 'settings',
              rounds: s.rounds as 5,
              timerSec: s.timerSec as 60,
              breakSec: s.breakSec as 30,
              pacing: s.pacing,
              intro: s.intro,
            })
        "
        @start="send({ type: 'start' })"
      />
      <IntroSequence
        v-else-if="room.phase === 'intro' && room.intro"
        :intro="room.intro"
        :players="room.players"
        :you="room.you"
        :now="now"
        :is-host="isHost"
        :release="room.fermeanie"
        :variant="controller ? 'compact' : 'phone'"
        @skip="send({ type: 'skip_intro' })"
      />
      <QuestionScreen
        v-else-if="room.phase === 'question' && room.round"
        :key="room.round.practice ? 'practice' : room.round.index"
        :room="room"
        :now="now"
        @draft="(text) => send({ type: 'draft', text })"
        @lock="(text) => send({ type: 'lock', text })"
        @unlock="send({ type: 'unlock' })"
      />
      <ControllerReveal
        v-else-if="controller && room.phase === 'reveal' && room.reveal"
        :key="`c${room.reveal.practice ? 'p' : room.reveal.index}`"
        :reveal="room.reveal"
        :players="room.players"
        :you="room.you"
        :now="now"
        :release="room.fermeanie"
      />
      <RevealSequence
        v-else-if="room.phase === 'reveal' && room.reveal"
        :key="`r${room.reveal.practice ? 'p' : room.reveal.index}`"
        :reveal="room.reveal"
        :players="room.players"
        :you="room.you"
        :now="now"
        :fermeanie-before="room.fermeanie.score"
        :release="room.fermeanie"
      />
      <BreakScreen
        v-else-if="room.phase === 'break' && room.break"
        :room="room"
        :now="now"
        :variant="controller ? 'compact' : 'phone'"
        @skip="send({ type: 'skip_break' })"
        @next="send({ type: 'next' })"
      />
      <FinalScreen
        v-else-if="room.phase === 'final' && room.final"
        :final="room.final"
        :now="now"
        :you="room.you"
        :is-host="room.hostId === room.you"
        @play-again="send({ type: 'play_again' })"
      />
      <SkipIntro v-if="practiceSkip" class="practice-skip" :skip="practiceSkip" :is-host="isHost" @skip="send({ type: 'skip_intro' })" />
    </template>
    <div v-if="lastError" class="toast" role="status">{{ lastError }}</div>
  </main>
</template>

<style scoped>
.fatal {
  max-width: 480px;
  margin: var(--space-6) auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  align-items: flex-start;
}
.toast {
  position: fixed;
  left: 50%;
  bottom: calc(var(--space-5) + var(--kb-inset));
  transform: translateX(-50%);
  background: var(--surface-3);
  border: 1px solid var(--danger);
  color: var(--text);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius);
  z-index: 100;
  max-width: calc(100vw - 2 * var(--gutter));
}
.practice-skip {
  margin-top: var(--space-4);
}
.toggle {
  display: flex;
  justify-content: center;
  margin: 0 auto var(--space-4);
  width: fit-content;
}
</style>
