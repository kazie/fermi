<script setup lang="ts">
import { asScreen, finalQuestionRoom, questionRoom, QUIP_DUE, quipRoom, T0 } from '@/fixtures/rooms'
import ScreenQuestion from './ScreenQuestion.vue'

const first = asScreen(questionRoom({ n: 6 }))
const due = quipRoom({ n: 6, due: true })
const later = asScreen({
  ...due,
  round: { ...due.round!, index: 4, line: 'Someone in this room is secretly good at this. I won’t say who. It’s Ada.' },
})
const final = asScreen(finalQuestionRoom())
const quip = asScreen(quipRoom({ n: 6 }))
</script>

<template>
  <Story title="ScreenQuestion (big screen)" group="screens">
    <Variant title="First question (with FerMEANie)"
      ><div class="page"><ScreenQuestion :room="first" :now="T0 + 18_000" /></div
    ></Variant>
    <Variant title="Later question, last seconds"
      ><div class="page"><ScreenQuestion :room="later" :now="T0 + 54_000" /></div
    ></Variant>
    <Variant title="Final question (double points)"
      ><div class="page"><ScreenQuestion :room="final" :now="T0 + 12_000" /></div
    ></Variant>
    <Variant title="Later question, quip still to come"
      ><div class="page"><ScreenQuestion :room="quip" :now="QUIP_DUE - 9000" /></div
    ></Variant>
  </Story>
</template>
