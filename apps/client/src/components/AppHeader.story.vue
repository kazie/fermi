<script setup lang="ts">
import AppHeader from './AppHeader.vue'
</script>

<template>
  <Story title="AppHeader" group="components">
    <Variant title="Home"><AppHeader /></Variant>
    <Variant title="In a room"><AppHeader code="FRMI" status="open" version="v3.14159" /></Variant>
    <Variant title="Reconnecting"><AppHeader code="FRMI" status="reconnecting" version="v3.14" /></Variant>
  </Story>
</template>
