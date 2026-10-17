<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { logEvent } from 'histoire/client'
import { questionRoom, SHEETS, T0 } from '@/fixtures/rooms'
import QuestionScreen from './QuestionScreen.vue'

const spectating = { ...questionRoom(), yourSheet: undefined }
const playingState = () => ({ left: 47, room: questionRoom({ text: SHEETS.good }) })
const lockedRoom = questionRoom({ text: SHEETS.close, locked: true })
const lastRoom = questionRoom({ text: '2.5M' })
const firstRoom = questionRoom()
type State = ReturnType<typeof playingState>

// players lock in one by one (round 2, so FerMEANie watches from the side panel)
const base = questionRoom({ n: 6, text: SHEETS.good })
const step = ref(0)
const tick = setInterval(() => (step.value = (step.value + 1) % 8), 1600)
onUnmounted(() => clearInterval(tick))
const lockingRoom = computed(() => ({
  ...base,
  introLine: undefined,
  round: { ...base.round!, index: 1 },
  players: base.players.map((p, i) => ({ ...p, lockedIn: i < step.value, typing: i >= step.value })),
}))
const onLock = (state: State, t: string) => {
  state.room = { ...state.room, yourSheet: { text: t, locked: true } }
  logEvent('lock', t)
}
const onUnlock = (state: State) => (state.room = { ...state.room, yourSheet: { text: state.room.yourSheet?.text ?? '', locked: false } })
</script>

<template>
  <Story title="QuestionScreen" group="screens">
    <Variant title="Playing" :init-state="playingState">
      <template #default="{ state }">
        <div class="page">
          <QuestionScreen
            :room="state.room"
            :now="T0 + 60_000 - state.left * 1000"
            @draft="(t: string) => logEvent('draft', t)"
            @lock="(t: string) => onLock(state, t)"
            @unlock="onUnlock(state)"
          />
        </div>
      </template>
      <template #controls="{ state }"><HstSlider v-model="state.left" title="Seconds left" :min="0" :max="60" /></template>
    </Variant>
    <Variant title="Players locking in (FerMEANie watches)"
      ><div class="page"><QuestionScreen :room="lockingRoom" :now="T0 + 30_000" /></div
    ></Variant>
    <Variant title="Empty, first round"
      ><div class="page"><QuestionScreen :room="firstRoom" :now="T0 + 3000" /></div
    ></Variant>
    <Variant title="Locked in"
      ><div class="page"><QuestionScreen :room="lockedRoom" :now="T0 + 30_000" /></div
    ></Variant>
    <Variant title="Last seconds"
      ><div class="page"><QuestionScreen :room="lastRoom" :now="T0 + 54_000" /></div
    ></Variant>
    <Variant title="Spectating (joined mid-round)"
      ><div class="page"><QuestionScreen :room="spectating" :now="T0 + 20_000" /></div
    ></Variant>
    <Variant title="Phone, typing (keyboard open)">
      <div class="page"><QuestionScreen :room="playingState().room" :now="T0 + 21_000" preview-editing /></div>
    </Variant>
  </Story>
</template>
