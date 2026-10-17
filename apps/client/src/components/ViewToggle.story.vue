<script setup lang="ts">
import { ref } from 'vue'
import type { PhoneView } from '@/lib/storage'
import ViewToggle from './ViewToggle.vue'

const v = ref<PhoneView>('controller')
</script>

<template>
  <Story title="ViewToggle" group="components">
    <Variant title="Controller | Full view"
      ><div class="page"><ViewToggle v-model="v" /></div
    ></Variant>
  </Story>
</template>
