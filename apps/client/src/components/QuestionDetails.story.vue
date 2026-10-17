<script setup lang="ts">
import { DERIVED, QUESTION } from '@/fixtures/rooms'
import QuestionDetails from './QuestionDetails.vue'
</script>

<template>
  <Story title="QuestionDetails" group="screens">
    <Variant title="Active"
      ><div class="page"><QuestionDetails :question="QUESTION" status="active" /></div
    ></Variant>
    <Variant title="Disputed"
      ><div class="page"><QuestionDetails :question="DERIVED" status="disputed" /></div
    ></Variant>
    <Variant title="Source changed">
      <div class="page"><QuestionDetails :question="QUESTION" status="active" :flags="['source-changed:toureiffel:2026-10-01']" /></div>
    </Variant>
  </Story>
</template>
