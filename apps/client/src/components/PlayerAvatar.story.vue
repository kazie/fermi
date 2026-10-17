<script setup lang="ts">
import { ref } from 'vue'
import { providePlayerOrder } from '@/lib/playerColors'
import PlayerAvatar from './PlayerAvatar.vue'

const seeds = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11']
const states = ['idle', 'typing', 'locked', 'off', 'drained'] as const

// 16 players in join order, as a room would colour them
const sixteen = Array.from({ length: 16 }, (_, i) => `join-${i}`)
providePlayerOrder(ref(sixteen))
</script>

<template>
  <Story title="PlayerAvatar" group="components">
    <Variant title="Seeds × states">
      <div class="page">
        <table>
          <thead>
            <tr>
              <th></th>
              <th v-for="s in states" :key="s" class="muted">{{ s }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="id in seeds" :key="id">
              <td class="mono muted">{{ id }}</td>
              <td v-for="s in states" :key="s"><PlayerAvatar :seed="id" :state="s" :size="32" /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </Variant>
    <Variant title="Sizes">
      <div class="page row">
        <PlayerAvatar v-for="n in [16, 20, 24, 40, 96]" :key="n" seed="p3" :size="n" />
      </div>
    </Variant>
    <Variant title="16 players, join-order colours">
      <div style="padding: 16px; display: flex; flex-wrap: wrap; gap: 10px">
        <PlayerAvatar v-for="s in sixteen" :key="s" :seed="s" :size="40" />
      </div>
    </Variant>
  </Story>
</template>

<style scoped>
table {
  border-collapse: collapse;
}
th,
td {
  padding: 4px 10px;
  text-align: center;
  font-size: var(--text-xs);
}
.row {
  display: flex;
  align-items: flex-end;
  gap: 16px;
}
</style>
