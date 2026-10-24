<script setup lang="ts">
import { logEvent } from 'histoire/client'
import SoundNudge from './SoundNudge.vue'
</script>

<template>
  <Story title="SoundNudge" group="components">
    <Variant title="Phone, waiting for a tap"
      ><div class="page"><SoundNudge state="locked" @on="logEvent('on', {})" /></div
    ></Variant>
    <Variant title="Phone, turned off"
      ><div class="page"><SoundNudge state="muted" @on="logEvent('on', {})" /></div
    ></Variant>
    <Variant title="Big screen, waiting for a click"
      ><div class="page"><SoundNudge state="locked" tv @on="logEvent('on', {})" /></div
    ></Variant>
    <Variant title="Big screen, turned off"
      ><div class="page"><SoundNudge state="muted" tv @on="logEvent('on', {})" /></div
    ></Variant>
  </Story>
</template>
