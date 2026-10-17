<script setup lang="ts">
import { logEvent } from 'histoire/client'
import DisputeForm from './DisputeForm.vue'
</script>

<template>
  <Story title="DisputeForm" group="components">
    <Variant title="Idle (click to open)"
      ><div class="page"><DisputeForm @submit="(m: string) => logEvent('submit', m)" /></div
    ></Variant>
    <Variant title="Sent"
      ><div class="page"><DisputeForm state="sent" /></div
    ></Variant>
    <Variant title="Error"
      ><div class="page"><DisputeForm state="error" error="Too many disputes from here. Try again later." /></div
    ></Variant>
  </Story>
</template>
