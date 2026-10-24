<script setup lang="ts">
import { ref } from 'vue'
import AppHeader from './AppHeader.vue'

const sound = ref(false)
</script>

<template>
  <Story title="AppHeader" group="components">
    <Variant title="Home"><AppHeader /></Variant>
    <Variant title="In a room"><AppHeader code="FRMI" status="open" version="v3.14159" /></Variant>
    <Variant title="Reconnecting"><AppHeader code="FRMI" status="reconnecting" version="v3.14" /></Variant>
    <Variant title="With her voice (tap the speaker)">
      <AppHeader code="FRMI" status="open" version="v3.14159" :sound="sound" @sound="sound = !sound" />
    </Variant>
    <Variant title="Voice, reconnecting, long version">
      <AppHeader code="FRMI" status="reconnecting" version="v3.14159265" :sound="true" />
    </Variant>
  </Story>
</template>
