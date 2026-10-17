<script setup lang="ts">
import JoinQr from './JoinQr.vue'
</script>

<template>
  <Story title="JoinQr" group="components">
    <Variant title="Default"
      ><div class="page"><JoinQr url="https://fermi.example/r/FRMI" /></div
    ></Variant>
    <Variant title="Small"
      ><div class="page"><JoinQr url="https://fermi.example/r/FRMI" :size="96" /></div
    ></Variant>
  </Story>
</template>
