<script setup lang="ts">
import DoubleBadge from './DoubleBadge.vue'
</script>

<template>
  <Story title="DoubleBadge" group="components">
    <Variant title="Phone"
      ><div class="page"><DoubleBadge :multiplier="2" /></div
    ></Variant>
    <Variant title="Big screen"
      ><div class="page"><DoubleBadge :multiplier="2" big /></div
    ></Variant>
  </Story>
</template>
