<script setup lang="ts">
import { logEvent } from 'histoire/client'
import { asScreen, breakRoom } from '@/fixtures/rooms'
import BreakScreen from './BreakScreen.vue'

const room = breakRoom()
const voted = breakRoom({ votes: 2, youVoted: true, left: 9 })
const now = room.break!.startedAt + 7000
const nowVoted = voted.break!.startedAt + 21_000
const tv = asScreen(breakRoom({ votes: 2 }))
</script>

<template>
  <Story title="BreakScreen" group="screens">
    <Variant title="Phone"
      ><div class="page"><BreakScreen :room="room" :now="now" @skip="logEvent('skip', {})" /></div
    ></Variant>
    <Variant title="Phone, already voted"
      ><div class="page"><BreakScreen :room="voted" :now="nowVoted" /></div
    ></Variant>
    <Variant title="Phone, controller mode"
      ><div class="page"><BreakScreen :room="room" :now="now" variant="compact" /></div
    ></Variant>
    <Variant title="Big screen"
      ><div class="page"><BreakScreen :room="tv" :now="now" variant="tv" /></div
    ></Variant>
  </Story>
</template>
