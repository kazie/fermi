<script setup lang="ts">
import { reactive } from 'vue'
import { logEvent } from 'histoire/client'
import { introRoom, T0 } from '@/fixtures/rooms'
import IntroSequence from './IntroSequence.vue'

const full = introRoom()
const short = introRoom({ mode: 'short', votes: 1 })
const voted = introRoom({ votes: 2, youVoted: true })
const intro = full.intro!
const at = (i: number) => intro.steps[i].at + 3500
const variants = [
  { title: 'Hello (phone)', room: full, variant: 'phone' as const, now: at(0) },
  { title: 'Roll call: that’s you', room: full, variant: 'phone' as const, now: at(1) },
  { title: 'Roll call: someone else', room: full, variant: 'phone' as const, now: at(3) },
  { title: 'Rule: work it out', room: full, variant: 'phone' as const, now: at(5) },
  { title: 'Rule: times off', room: full, variant: 'phone' as const, now: at(6) },
  { title: 'Rule: points', room: full, variant: 'phone' as const, now: at(7) },
  { title: 'Rule: the swarm', room: voted, variant: 'phone' as const, now: at(8) },
  { title: 'Short intro, a vote to skip', room: short, variant: 'phone' as const, now: at(2) },
  { title: 'Controller mode, your turn', room: full, variant: 'compact' as const, now: at(1) },
  { title: 'Big screen: roll call', room: { ...full, you: '' }, variant: 'tv' as const, now: at(2) },
  { title: 'Big screen: rule', room: { ...voted, you: '' }, variant: 'tv' as const, now: at(6) },
]
const times = reactive<Record<string, number>>(Object.fromEntries(variants.map((v) => [v.title, v.now - T0])))
</script>

<template>
  <Story title="IntroSequence" group="screens">
    <Variant v-for="v in variants" :key="v.title" :title="v.title">
      <template #default>
        <div class="page">
          <IntroSequence
            :intro="v.room.intro!"
            :players="v.room.players"
            :you="v.room.you"
            :now="T0 + times[v.title]"
            :is-host="v.variant !== 'tv' && v.room.you === v.room.hostId && v.title !== 'Short intro, a vote to skip'"
            :release="{ version: 'v3.1415' }"
            :variant="v.variant"
            @skip="logEvent('skip', {})"
          />
        </div>
      </template>
      <template #controls>
        <HstSlider v-model="times[v.title]" title="Time (ms)" :min="0" :max="v.room.intro!.endsAt - T0" :step="100" />
      </template>
    </Variant>
  </Story>
</template>
