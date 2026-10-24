<script setup lang="ts">
import { RULES } from '@fermi/shared'
import RuleSlide from './RuleSlide.vue'
</script>

<template>
  <Story title="RuleSlide" group="components">
    <Variant v-for="r in RULES" :key="r" :title="r"
      ><div class="page"><RuleSlide :rule="r" /></div
    ></Variant>
  </Story>
</template>
