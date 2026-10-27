<script setup lang="ts">
import { ref } from 'vue'
import { REACTIONS } from '@fermi/shared'
import { S } from '@/lib/strings'
import ReactionIcon from './ReactionIcon.vue'

// Scrub a 3 s float by hand: each icon's clock is its `age`. Paused, so it holds still.
const at = ref(400)
</script>

<template>
  <Story title="ReactionIcon" group="components">
    <Variant title="All, still and animated">
      <div class="page grid">
        <template v-for="k in REACTIONS" :key="k">
          <span class="name muted">{{ S.reactions[k] }}</span>
          <ReactionIcon :kind="k" style="font-size: 48px" />
          <ReactionIcon :kind="k" play="loop" style="font-size: 48px" />
          <ReactionIcon :kind="k" play="loop" style="font-size: 120px" />
        </template>
      </div>
    </Variant>
    <Variant title="Sizes">
      <div class="page">
        <div v-for="k in REACTIONS" :key="k" class="row">
          <ReactionIcon v-for="s in [16, 24, 32, 64]" :key="s" :kind="k" :style="{ fontSize: `${s}px` }" />
        </div>
      </div>
    </Variant>
    <Variant title="Scrub the timeline">
      <div class="page">
        <label class="muted">{{ at }} ms <input v-model.number="at" type="range" min="0" max="3000" step="10" /></label>
        <div class="row paused">
          <ReactionIcon v-for="k in REACTIONS" :key="k" :kind="k" play="loop" :age="at" style="font-size: 72px" />
        </div>
      </div>
    </Variant>
  </Story>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: auto auto auto 1fr;
  align-items: center;
  gap: 16px 24px;
}
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 24px;
  margin-block: 16px;
}
.paused :deep(*) {
  animation-play-state: paused !important;
}
</style>
