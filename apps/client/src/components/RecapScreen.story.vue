<script setup lang="ts">
import { recapGame } from '@/fixtures/rooms'
import RecapScreen from './RecapScreen.vue'

const game = recapGame()
</script>

<template>
  <Story title="RecapScreen" group="screens">
    <Variant title="Finished game"
      ><div class="page"><RecapScreen :game="game" me="p0" /></div
    ></Variant>
    <Variant title="A dispute sent">
      <div class="page">
        <RecapScreen :game="game" me="p1" :disputes="{ [game.rounds[0].question.id]: { state: 'sent', error: '' } }" />
      </div>
    </Variant>
  </Story>
</template>
