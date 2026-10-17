<script setup lang="ts">
import { QUESTION } from '@/fixtures/rooms'
import SourceList from './SourceList.vue'

const many = [
  QUESTION.sources[0],
  {
    ...QUESTION.sources[0],
    id: 'long',
    publisher: 'A Very Long Publisher Name Indeed, Department of Extremely Specific Statistics',
    title: 'https://example.org/an/extremely/long/path/that/must/wrap/on/a/phone/without/overflowing/the/page',
    published: undefined,
    quote:
      'A much longer verbatim quote that goes on and on to check how wrapping behaves on a narrow screen with 2,500,000 numbers in it.',
  },
]
</script>

<template>
  <Story title="SourceList" group="components">
    <Variant title="One source"
      ><div class="page"><SourceList :sources="QUESTION.sources" /></div
    ></Variant>
    <Variant title="Long names and quotes"
      ><div class="page"><SourceList :sources="many" /></div
    ></Variant>
  </Story>
</template>
