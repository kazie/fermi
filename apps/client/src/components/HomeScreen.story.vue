<script setup lang="ts">
import { logEvent } from 'histoire/client'
import HomeScreen from './HomeScreen.vue'
</script>

<template>
  <Story title="HomeScreen" group="screens">
    <Variant title="Default">
      <HomeScreen @host="logEvent('host', {})" @host-screen="logEvent('hostScreen', {})" @join="(c: string) => logEvent('join', c)" />
    </Variant>
    <Variant title="Creating a room (busy)"><HomeScreen busy /></Variant>
    <Variant title="Bad room code"><HomeScreen error="Room QQQQ doesn’t exist" /></Variant>
  </Story>
</template>
