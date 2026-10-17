<script setup lang="ts">
import { logEvent } from 'histoire/client'
import HelperKeys from './HelperKeys.vue'
</script>

<template>
  <Story title="HelperKeys" group="components">
    <Variant title="Touch devices only (use a phone preset with touch)">
      <div class="page">
        <p class="muted">The bar only renders on <code>pointer: coarse</code>; it sits above the on-screen keyboard.</p>
        <HelperKeys :variables="['people', 'share', 'households_in_sweden']" @insert="(t: string) => logEvent('insert', t)" />
      </div>
    </Variant>
  </Story>
</template>
