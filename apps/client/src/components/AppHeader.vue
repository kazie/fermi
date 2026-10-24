<script setup lang="ts">
import type { SocketStatus } from '@/composables/useSocket'
import { S } from '@/lib/strings'
import FermeanieAvatar from './FermeanieAvatar.vue'

/** `sound`: FerMEANie's voice on this device (on or off); left out when the server has no voice. */
withDefaults(defineProps<{ code?: string; status?: SocketStatus; version?: string; sound?: boolean }>(), {
  code: undefined,
  status: undefined,
  version: undefined,
  sound: undefined, // a Boolean prop left out would otherwise be false, and show the button
})
defineEmits<{ sound: [] }>()
</script>

<template>
  <header class="hdr">
    <a href="/" class="brand"><span class="logo" aria-hidden="true">≈</span> {{ S.appName }}</a>
    <span v-if="code" class="room mono">{{ code }}</span>
    <span class="spacer"></span>
    <span v-if="status && status !== 'open'" class="conn" :class="status">{{
      status === 'connecting' ? S.connecting : S.reconnecting
    }}</span>
    <button
      v-if="sound !== undefined"
      type="button"
      class="sound"
      :class="{ on: sound }"
      :aria-pressed="sound"
      :aria-label="sound ? S.soundOn : S.soundOff"
      :title="sound ? S.soundOn : S.soundOff"
      @click="$emit('sound')"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
        <template v-if="sound">
          <path d="M16 8.5a5 5 0 0 1 0 7" />
          <path d="M18.5 6a8.5 8.5 0 0 1 0 12" />
        </template>
        <path v-else d="M16.5 9.5l5 5m0-5l-5 5" />
      </svg>
    </button>
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
.sound {
  display: inline-grid;
  place-items: center;
  width: var(--touch);
  height: var(--touch);
  margin: calc(var(--space-2) * -1) 0;
  flex: none;
  border: 0;
  border-radius: var(--radius);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}
.sound svg path:not([fill]) {
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}
.sound.on {
  color: var(--fer);
}
.sound:hover {
  background: var(--surface-2);
}
.ver {
  font-size: var(--text-xs);
  color: var(--fer);
}
</style>
