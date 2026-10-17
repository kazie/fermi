<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import QRCode from 'qrcode'

const props = withDefaults(defineProps<{ url: string; size?: number }>(), { size: 168 })
const svg = ref('')
watchEffect(async () => {
  svg.value = await QRCode.toString(props.url, {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#e8edf2', light: '#00000000' },
  })
})
</script>

<template>
  <div class="qr" :style="{ width: `${size}px`, height: `${size}px` }" role="img" :aria-label="`QR code for ${url}`" v-html="svg"></div>
</template>

<style scoped>
.qr {
  flex: none;
  padding: 6px;
  border-radius: var(--radius);
  background: var(--bg);
  border: 1px solid var(--border);
}
.qr :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
