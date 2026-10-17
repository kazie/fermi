<script setup lang="ts">
import FermeanieAvatar from './FermeanieAvatar.vue'

const moods = ['idle', 'smug', 'sulk'] as const
</script>

<template>
  <Story title="FermeanieAvatar" group="components">
    <Variant title="Moods">
      <div class="page grid">
        <template v-for="m in moods" :key="m">
          <figure>
            <FermeanieAvatar :mood="m" :size="64" />
            <figcaption class="muted">{{ m }}</figcaption>
          </figure>
          <figure>
            <FermeanieAvatar :mood="m" :size="64" speaking />
            <figcaption class="muted">{{ m }}, talking</figcaption>
          </figure>
        </template>
      </div>
    </Variant>
    <Variant title="Gloating">
      <div class="page row"><FermeanieAvatar mood="smug" gloat :size="96" /></div>
    </Variant>
    <Variant title="Looking" :init-state="() => ({ x: 1, y: 0, on: true })">
      <template #default="{ state }">
        <div class="page row"><FermeanieAvatar :size="96" :look="state.on ? { x: state.x, y: state.y } : null" /></div>
      </template>
      <template #controls="{ state }">
        <HstCheckbox v-model="state.on" title="Look (off: wander)" />
        <HstSlider v-model="state.x" title="x" :min="-1" :max="1" :step="0.1" />
        <HstSlider v-model="state.y" title="y" :min="-1" :max="1" :step="0.1" />
      </template>
    </Variant>
    <Variant title="Big (lid and glow check)">
      <div class="page row">
        <FermeanieAvatar :size="160" mood="sulk" speaking />
        <FermeanieAvatar :size="160" mood="smug" speaking />
      </div>
    </Variant>
  </Story>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 24px;
}
figure {
  margin: 0;
  display: grid;
  justify-items: center;
  gap: 8px;
  font-size: var(--text-s);
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 48px;
  padding: 32px;
}
</style>
