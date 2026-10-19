<script setup lang="ts">
import FerText from './FerText.vue'
import FermeanieSays from './FermeanieSays.vue'

const lines = [
  'Streak report: three losses. Morale: **excellent**. Accuracy of that statement: low.',
  '~~Ada will never catch up.~~ I believe in you, Ada. Keep going.',
  'I have no favourites. ||Bob.||',
  'Changelog: *Added* one more digit of pi. *Removed* any doubt.',
  'The ~~humans~~ test subjects are turning on each other. **Excellent.**',
  'A name stays as typed: \\*\\*Bob\\*\\* wins.',
]
</script>

<template>
  <Story title="FerText (line formatting)" group="components">
    <Variant title="Every style">
      <ul style="padding: 16px 32px; display: grid; gap: 8px; font-family: var(--mono)">
        <li v-for="l in lines" :key="l"><FerText :text="l" /></li>
      </ul>
    </Variant>
    <Variant title="Typed out halfway">
      <p style="padding: 16px; font-family: var(--mono)"><FerText :text="lines[1]" :shown="16" /></p>
    </Variant>
    <Variant title="In a bubble (tap the bar to peek)">
      <div style="padding: 16px; max-width: 560px; display: grid; gap: 12px">
        <FermeanieSays :text="lines[2]" mood="smug" />
        <FermeanieSays :text="lines[1]" mood="smug" size="l" />
      </div>
    </Variant>
  </Story>
</template>
