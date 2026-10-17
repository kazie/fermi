<script setup lang="ts">
import { asScreen, questionRoom, T0 } from '@/fixtures/rooms'
import ScreenQuestion from './ScreenQuestion.vue'

const first = asScreen(questionRoom({ n: 6 }))
const later = asScreen({ ...questionRoom({ n: 6 }), round: { ...questionRoom().round!, index: 4 } })
</script>

<template>
  <Story title="ScreenQuestion (big screen)" group="screens">
    <Variant title="First question (with FerMEANie)"
      ><div class="page"><ScreenQuestion :room="first" :now="T0 + 18_000" /></div
    ></Variant>
    <Variant title="Later question, last seconds"
      ><div class="page"><ScreenQuestion :room="later" :now="T0 + 54_000" /></div
    ></Variant>
  </Story>
</template>
