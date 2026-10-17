<script setup lang="ts">
import { ref } from 'vue'
import LogNumberLine from './LogNumberLine.vue'

const g = [
  { id: 'a', name: 'Ada', value: 2.7e6, you: true },
  { id: 'b', name: 'Bob', value: 5e6 },
  { id: 'c', name: 'Cyd', value: 1e5 },
  { id: 'd', name: 'Dee', value: 2.4e6 },
]
const crowded = Array.from({ length: 12 }, (_, i) => ({
  id: `p${i}`,
  name: ['Ada', 'Bob', 'Cyd', 'Dee', 'Eve', 'Fia', 'Gus', 'Hal', 'Ivy', 'Jon', 'Kim', 'Lou'][i],
  value: 1e6 * (1 + i * 0.4),
}))
// furthest first, like the reveal
const order = ['c', 'b', 'd', 'a']
const k = ref(2)
</script>

<template>
  <Story title="LogNumberLine" group="components">
    <Variant title="Guesses only"
      ><div style="padding: 24px"><LogNumberLine :guesses="g" /></div
    ></Variant>
    <Variant title="With the truth"
      ><div style="padding: 24px"><LogNumberLine :guesses="g" :truth="2.5e6" highlight="b" /></div
    ></Variant>
    <Variant title="With FerMEANie"
      ><div style="padding: 24px"><LogNumberLine :guesses="g" :truth="2.5e6" :fermeanie="1.9e6" /></div
    ></Variant>
    <Variant title="Dunce outlier is clipped">
      <div style="padding: 24px">
        <LogNumberLine
          :guesses="[...g, { id: 'e', name: 'Eve', value: 1e99, dunce: true }, { id: 'f', name: 'Fia', value: 0, dunce: true }]"
          :truth="2.5e6"
        />
      </div>
    </Variant>
    <Variant title="Revealing one by one">
      <template #default>
        <div style="padding: 24px"><LogNumberLine :guesses="g" :truth="2.5e6" :shown="order.slice(0, k)" :highlight="order[k - 1]" /></div>
      </template>
      <template #controls><HstSlider v-model="k" title="Cards flipped" :min="0" :max="4" /></template>
    </Variant>
    <Variant title="Crowded"
      ><div style="padding: 24px"><LogNumberLine :guesses="crowded" :truth="3e6" :fermeanie="2.9e6" /></div
    ></Variant>
  </Story>
</template>
