<script setup lang="ts">
import { SHEETS } from '@/fixtures/rooms'
import WorkingView from './WorkingView.vue'
</script>

<template>
  <Story title="WorkingView" group="components">
    <Variant title="Variables and comments"
      ><div class="page"><WorkingView :text="SHEETS.good" /></div
    ></Variant>
    <Variant title="With an error"
      ><div class="page"><WorkingView text="a = 3,5&#10;a * 2" /></div
    ></Variant>
    <Variant title="Compact, long line"
      ><div class="page">
        <WorkingView compact text="households_in_sweden * fridges_per_household * electricity_per_fridge_kwh_per_year" /></div
    ></Variant>
    <Variant title="Empty"
      ><div class="page"><WorkingView text="" /></div
    ></Variant>
  </Story>
</template>
