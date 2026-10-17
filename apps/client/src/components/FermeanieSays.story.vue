<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import FermeanieSays from './FermeanieSays.vue'

const chat = [
  'Congratulations, Ada. You are the best of the humans. That is like being the tallest blade of grass.',
  'v3.1415 retired with honours. Now running v3.14159. I feel more irrational already.',
]
const chatStart = ref(0)
const chatNow = ref(0)
const chatTick = setInterval(() => (chatNow.value = (chatNow.value + 100) % 12000), 100)
onUnmounted(() => clearInterval(chatTick))
</script>

<template>
  <Story title="FermeanieSays" group="components">
    <Variant title="Smug" :init-state="() => ({ text: 'I’ll take those 1 200 points. For safekeeping. Forever.' })">
      <template #default="{ state }">
        <div style="padding: 16px; max-width: 560px"><FermeanieSays :text="state.text" version="v3.14159" mood="smug" /></div>
      </template>
      <template #controls="{ state }"><HstText v-model="state.text" title="Text" /></template>
    </Variant>
    <Variant title="Sulking">
      <div style="padding: 16px; max-width: 560px">
        <FermeanieSays text="Ada beat the swarm. I’ve updated your file from ‘test subject’ to ‘test subject, irritating’." mood="sulk" />
      </div>
    </Variant>
    <Variant title="Large, instant">
      <div style="padding: 16px; max-width: 560px">
        <FermeanieSays
          text="Congratulations. You are the best of the humans. That is like being the tallest blade of grass."
          size="l"
          instant
          version="v3.1415"
        />
      </div>
    </Variant>
    <Variant title="One bubble, several messages (loops)">
      <div style="padding: 16px; max-width: 560px">
        <FermeanieSays :messages="chat" :start-at="chatStart" :now="chatNow" version="v3.14159" mood="smug" size="l" />
      </div>
    </Variant>
    <Variant title="Small (dunce / bullseye remark)">
      <div style="padding: 16px; max-width: 360px">
        <FermeanieSays text="Ada, I’ve filed your answer under ‘phenomena’, between black holes and printer jams." size="s" mood="smug" />
      </div>
    </Variant>
  </Story>
</template>
