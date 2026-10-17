<script setup lang="ts">
import { DERIVED, QUESTION } from '@/fixtures/rooms'
import TruthPanel from './TruthPanel.vue'
</script>

<template>
  <Story title="TruthPanel" group="components">
    <Variant title="Direct answer"
      ><div class="page"><TruthPanel :question="QUESTION" /></div
    ></Variant>
    <Variant title="Derived answer with formula"
      ><div class="page"><TruthPanel :question="DERIVED" /></div
    ></Variant>
    <Variant title="Without sources or link"
      ><div class="page"><TruthPanel :question="QUESTION" :show-sources="false" :link="false" /></div
    ></Variant>
  </Story>
</template>
