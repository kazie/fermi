<script setup lang="ts">
import NameForm from './NameForm.vue'

const welcome = {
  greeting: 'Subject HUMAN_NAME_HERE, please step into the testing area.',
  line: 'The last specimen wrote their name in crayon. I am still recovering.',
}
</script>

<template>
  <Story title="NameForm" group="screens">
    <Variant title="Empty"
      ><div class="page"><NameForm code="FRMI" :welcome="welcome" /></div
    ></Variant>
    <Variant title="Typing"
      ><div class="page"><NameForm code="FRMI" initial-name="Ada" :welcome="welcome" /></div
    ></Variant>
    <Variant title="Mid-game"
      ><div class="page"><NameForm code="FRMI" mid-game :welcome="welcome" /></div
    ></Variant>
  </Story>
</template>
