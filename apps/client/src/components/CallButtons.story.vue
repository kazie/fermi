<script setup lang="ts">
import { logEvent } from 'histoire/client'
import CallButtons from './CallButtons.vue'
</script>

<template>
  <Story title="CallButtons" group="components">
    <Variant title="Phone: none pressed"
      ><div class="page"><CallButtons @call="(c) => logEvent('call', c)" /></div
    ></Variant>
    <Variant title="Phone: lower pressed"
      ><div class="page"><CallButtons selected="lower" @call="(c) => logEvent('call', c)" /></div
    ></Variant>
    <Variant title="A picture (rule slide)"
      ><div class="page"><CallButtons inert /></div
    ></Variant>
  </Story>
</template>
