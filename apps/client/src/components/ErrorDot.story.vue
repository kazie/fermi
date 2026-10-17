<script setup lang="ts">
import ErrorDot from './ErrorDot.vue'
</script>

<template>
  <Story title="ErrorDot" group="components">
    <Variant title="Sizes">
      <div class="page" style="display: flex; gap: 16px; align-items: center">
        <ErrorDot :size="14" />
        <ErrorDot />
        <ErrorDot :size="24" />
        <ErrorDot :size="48" />
        <span class="mono">1 ++ 2 <ErrorDot :size="14" /></span>
      </div>
    </Variant>
  </Story>
</template>
