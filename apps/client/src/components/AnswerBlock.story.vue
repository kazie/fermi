<script setup lang="ts">
import { logEvent } from 'histoire/client'
import AnswerBlock from './AnswerBlock.vue'

// Handlers live here: multi-statement inline handlers break once Prettier drops the semicolons.
function onLock(state: { text: string; locked: boolean }) {
  state.locked = true
  logEvent('lock', state.text)
}

const variants: { title: string; text: string; locked?: boolean; lockable?: boolean; unit?: string }[] = [
  { title: 'Empty', text: '' },
  { title: 'Doc example', text: '366 × 24 × 60 × 60' },
  {
    title: 'Variables and comments',
    text: '# humans stacked to the moon and back\npeople = 8.1 billion\nheight = 1.7 # metres\nmoon = 384_400_000 # metres\n\nstack = people * height\nstack / (2 moon)',
    unit: 'times',
  },
  { title: 'Implicit multiplication', text: 'days = 365\nhours = 24\nseconds = 31_536_000\nseconds / days hours\n2(3 + 4)days' },
  { title: 'Suffix vs variable clash', text: 'k = 7\n2k + 1' },
  { title: 'Comma → fix button', text: 'people = 1,000,000\npeople * 3' },
  { title: 'Error cascades', text: 'a = 3,5\nb = a * 2\npeple = 10\npeople * 2' },
  { title: 'Unclosed bracket', text: 'sqrt(16 * (2 + 2)' },
  { title: 'Long line (phone)', text: 'total = (fridges_per_household * households_in_sweden * electricity_per_fridge_kwh) / 1000' },
  { title: 'Unicode paste', text: '3 − 1\n10⁶ · 2\n6 ÷ 3\n2 ** 10' },
  { title: 'Locked', text: 'parts = 18k\nparts * 150', locked: true },
  { title: 'Practice (no lock button)', text: '', lockable: false },
]
</script>

<template>
  <Story title="AnswerBlock" group="components" :layout="{ type: 'single', iframe: true }">
    <Variant v-for="v in variants" :key="v.title" :title="v.title" :init-state="() => ({ text: v.text, locked: !!v.locked })">
      <template #default="{ state }">
        <div style="padding: 16px; max-width: 760px">
          <AnswerBlock
            v-model="state.text"
            :locked="state.locked"
            :lockable="v.lockable ?? true"
            :unit="v.unit ?? 'rivets'"
            @lock="onLock(state)"
            @unlock="state.locked = false"
          />
        </div>
      </template>
      <template #controls="{ state }">
        <HstTextarea v-model="state.text" title="Text" />
        <HstCheckbox v-model="state.locked" title="Locked" />
      </template>
    </Variant>
  </Story>
</template>
