<script setup lang="ts">
import { ref } from 'vue'
import { lineDuration } from '@fermi/shared'
import { T0 } from '@/fixtures/rooms'
import LobbyLine from './LobbyLine.vue'

const text = 'Another volunteer. How brave. Ada, your consent form was the join button.'
const line = { text, at: T0, until: T0 + lineDuration(text) }
const t = ref(2500)
const clock = () => T0 + t.value
</script>

<template>
  <Story title="LobbyLine" group="components">
    <Variant title="On its own clock"
      ><div class="page"><LobbyLine :line="line" /></div
    ></Variant>
    <Variant title="On the server clock (scrub it)">
      <template #default>
        <div class="page"><LobbyLine :line="line" :clock="clock" size="l" /></div>
      </template>
      <template #controls>
        <HstSlider v-model="t" title="Time (ms)" :min="0" :max="8000" :step="100" />
      </template>
    </Variant>
  </Story>
</template>
