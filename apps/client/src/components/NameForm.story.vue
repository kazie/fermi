<script setup lang="ts">
import NameForm from './NameForm.vue'

const quote = 'Please state your name for the lab report. Legibly. The last specimen wrote theirs in crayon.'
</script>

<template>
  <Story title="NameForm" group="screens">
    <Variant title="Empty"
      ><div class="page"><NameForm code="FRMI" :quote="quote" /></div
    ></Variant>
    <Variant title="Typing"
      ><div class="page"><NameForm code="FRMI" initial-name="Ada" :quote="quote" /></div
    ></Variant>
    <Variant title="Mid-game"
      ><div class="page"><NameForm code="FRMI" mid-game :quote="quote" /></div
    ></Variant>
  </Story>
</template>
