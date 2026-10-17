<script setup lang="ts">
import { reveals, SHEETS } from '@/fixtures/rooms'
import AnswerCard from './AnswerCard.vue'

const normal = reveals.normal()
const dunce = reveals.dunce()
const steal = reveals.steal()
const best = normal.cards[normal.cards.length - 1]
const cosmic = dunce.cards.find((c) => c.dunce === 'cosmic')!
const long = { ...normal.cards[0], text: SHEETS.good + '\n' + Array.from({ length: 8 }, (_, i) => `step${i} = ${i + 2} * 3`).join('\n') }
</script>

<template>
  <Story title="AnswerCard" group="components">
    <Variant title="Face down"
      ><div style="padding: 16px; max-width: 360px"><AnswerCard :card="best" :flipped="false" /></div
    ></Variant>
    <Variant title="Best answer, bullseye"
      ><div style="padding: 16px; max-width: 360px"><AnswerCard :card="best" flipped latest unit="rivets" /></div
    ></Variant>
    <Variant title="Yours"
      ><div style="padding: 16px; max-width: 360px"><AnswerCard :card="normal.cards[1]" flipped you unit="rivets" /></div
    ></Variant>
    <Variant title="Dunce cap"
      ><div style="padding: 16px; max-width: 360px">
        <AnswerCard :card="cosmic" flipped :dunce-line="dunce.lines.dunce[cosmic.playerId]" unit="rivets" /></div
    ></Variant>
    <Variant title="Stolen by FerMEANie (drained)"
      ><div style="padding: 16px; max-width: 360px"><AnswerCard :card="steal.cards[2]" flipped stolen unit="rivets" /></div
    ></Variant>
    <Variant title="Long working"
      ><div style="padding: 16px; max-width: 360px"><AnswerCard :card="long" flipped unit="rivets" /></div
    ></Variant>
  </Story>
</template>
