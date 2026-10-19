<script setup lang="ts">
import { onUnmounted, reactive, ref } from 'vue'
import { players, reveals, T0 } from '@/fixtures/rooms'
import { STEAL, stealPlan } from '@/lib/reveal'
import RevealSequence from './RevealSequence.vue'

const variants = [
  { title: 'Normal round', reveal: reveals.normal() },
  { title: 'FerMEANie steals', reveal: reveals.steal() },
  { title: 'Dunce caps and rule change', reveal: reveals.dunce() },
  { title: 'FerMEANie sits out', reveal: reveals.sitsOut() },
  { title: 'Derived answer', reveal: reveals.derived() },
  { title: 'Big swarm (8)', reveal: reveals.crowd() },
  { title: 'Early lock-ins and twins', reveal: reveals.twins() },
]
type Reveal = (typeof variants)[number]['reveal']
const duration = (r: Reveal) => r.timeline.endsAt - T0
// default: the end of the reveal, so everything is visible; scrub back with the slider
const times = reactive<Record<string, number>>(Object.fromEntries(variants.map((v) => [v.title, duration(v.reveal) - 1000])))

// "Play" variants: real time, looping
const loops = [
  { title: '▶ Play steal (loops)', reveal: reveals.steal() },
  { title: '▶ Play dunce round (loops)', reveal: reveals.dunce() },
  { title: '▶ Play early lock-ins and twins (loops)', reveal: reveals.twins() },
]
const clock = ref(0)
const id = setInterval(() => (clock.value += 100), 100)
onUnmounted(() => clearInterval(id))
const loopTime = (r: Reveal) => clock.value % (duration(r) + 2000)

// "Steal moment": scrub just the steal, from the FerMEANie stage on
const steal = reveals.steal()
const stealFrom = steal.timeline.fermeanieAt - T0
// Open on the last card's points in mid-flight: every card has been hit, so nobody looks "skipped".
// (Cards drain furthest-first, so the closest guess, Cyd here, goes last.)
const lastStart = Math.max(...Object.values(stealPlan(steal)!.starts))
const stealT = ref(stealFrom + lastStart + STEAL.flight / 2)
</script>

<template>
  <Story title="RevealSequence" group="screens">
    <Variant v-for="l in loops" :key="l.title" :title="l.title">
      <div class="page">
        <RevealSequence
          :reveal="l.reveal"
          :players="players(l.reveal.cards.length)"
          you="p0"
          :now="T0 + loopTime(l.reveal)"
          :fermeanie-before="0"
          version="v3.1415"
          no-scroll
        />
      </div>
    </Variant>
    <Variant title="Steal moment">
      <template #default>
        <div class="page">
          <RevealSequence
            :reveal="steal"
            :players="players(steal.cards.length)"
            you="p0"
            :now="T0 + stealT"
            :fermeanie-before="0"
            version="v3.1415"
            no-scroll
          />
        </div>
      </template>
      <template #controls>
        <HstSlider v-model="stealT" title="Time (ms)" :min="stealFrom - 500" :max="stealFrom + 6500" :step="50" />
      </template>
    </Variant>
    <Variant v-for="v in variants" :key="v.title" :title="v.title">
      <template #default>
        <div class="page">
          <RevealSequence
            :reveal="v.reveal"
            :players="players(v.reveal.cards.length)"
            you="p0"
            :now="T0 + times[v.title]"
            :fermeanie-before="0"
            version="v3.1415"
            no-scroll
          />
        </div>
      </template>
      <template #controls>
        <HstSlider v-model="times[v.title]" title="Time (ms)" :min="0" :max="duration(v.reveal)" :step="100" />
      </template>
    </Variant>
  </Story>
</template>
