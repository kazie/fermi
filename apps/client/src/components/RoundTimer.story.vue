<script setup lang="ts">
import RoundTimer from './RoundTimer.vue'
</script>

<template>
  <Story title="RoundTimer" group="components">
    <Variant title="Scrub" :init-state="() => ({ left: 42 })">
      <template #default="{ state }">
        <div style="padding: 16px"><RoundTimer :started-at="0" :ends-at="60_000" :now="60_000 - state.left * 1000" /></div>
      </template>
      <template #controls="{ state }"><HstSlider v-model="state.left" title="Seconds left" :min="0" :max="60" /></template>
    </Variant>
  </Story>
</template>
