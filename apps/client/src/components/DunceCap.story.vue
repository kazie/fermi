<script setup lang="ts">
import DunceCap from './DunceCap.vue'
</script>

<template>
  <Story title="DunceCap" group="components">
    <Variant title="Sizes">
      <div class="page row">
        <span style="font-size: 12px"><DunceCap /></span>
        <span style="font-size: 16px"><DunceCap /></span>
        <span style="font-size: 32px"><DunceCap /></span>
        <span style="font-size: 96px"><DunceCap /></span>
        <span style="font-size: 32px"><DunceCap still /></span>
      </div>
    </Variant>
    <Variant title="Inline in text">
      <div class="page">
        <p><DunceCap /> Bob answered with remarkable confidence.</p>
        <p class="mono" style="font-size: 12px"><DunceCap /><DunceCap /><DunceCap /> three caps this game</p>
      </div>
    </Variant>
  </Story>
</template>

<style scoped>
.row {
  display: flex;
  align-items: flex-end;
  gap: 24px;
}
</style>
