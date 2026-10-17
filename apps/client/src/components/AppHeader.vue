<script setup lang="ts">
import type { SocketStatus } from '@/composables/useSocket'
import { S } from '@/lib/strings'
import FermeanieAvatar from './FermeanieAvatar.vue'

defineProps<{ code?: string; status?: SocketStatus; version?: string }>()
</script>

<template>
  <header class="hdr">
    <a href="/" class="brand"><span class="logo" aria-hidden="true">≈</span> {{ S.appName }}</a>
    <span v-if="code" class="room mono">{{ code }}</span>
    <span class="spacer"></span>
    <span v-if="status && status !== 'open'" class="conn" :class="status">{{
      status === 'connecting' ? S.connecting : S.reconnecting
    }}</span>
    <span v-if="version" class="ver mono" :title="S.botBackronym"><FermeanieAvatar :size="18" mini /> {{ version }}</span>
  </header>
</template>

<style scoped>
.hdr {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--gutter);
  max-width: var(--max-w);
  margin: 0 auto;
}
.brand {
  font-weight: 800;
  font-size: var(--text-l);
  color: var(--text);
  text-decoration: none;
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.logo {
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: var(--accent);
  color: var(--accent-ink);
  font-weight: 900;
}
.room {
  color: var(--muted);
  letter-spacing: 0.1em;
}
.spacer {
  flex: 1;
}
.conn {
  font-size: var(--text-xs);
  color: var(--warn);
}
.ver {
  font-size: var(--text-xs);
  color: var(--fer);
}
</style>
