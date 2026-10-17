<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 18 })
</script>

<template>
  <!-- drawn, not typed: a "!" glyph in a CSS circle sits off-centre in most fonts -->
  <svg class="err-dot" :width="size" :height="size" viewBox="0 0 20 20" aria-hidden="true">
    <circle cx="10" cy="10" r="10" fill="var(--danger)" />
    <rect x="8.6" y="4.2" width="2.8" height="7.6" rx="1.4" fill="#1a0000" />
    <circle cx="10" cy="15" r="1.6" fill="#1a0000" />
  </svg>
</template>

<style scoped>
.err-dot {
  flex: none;
  display: inline-block;
  vertical-align: middle;
}
</style>
