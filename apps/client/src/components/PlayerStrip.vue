<script setup lang="ts">
import { usePlayerColors } from '@/lib/playerColors'
import { ref, watch } from 'vue'
import type { PlayerView } from '@fermi/shared'
import PlayerAvatar, { type AvatarState } from './PlayerAvatar.vue'

const props = defineProps<{ players: PlayerView[]; you: string }>()
/** A player just locked in, with where their chip is on screen (so FerMEANie can glance at it). */
const emit = defineEmits<{ lockedIn: [{ id: string; rect: DOMRect }] }>()

const root = ref<HTMLElement>()
watch(
  () => props.players.filter((p) => p.lockedIn).map((p) => p.id),
  (now, before) => {
    const fresh = now.find((id) => !before.includes(id))
    const el = fresh && root.value?.querySelector(`[data-player="${CSS.escape(fresh)}"]`)
    if (fresh && el) emit('lockedIn', { id: fresh, rect: el.getBoundingClientRect() })
  },
)

function state(p: PlayerView): AvatarState {
  if (!p.connected) return 'off'
  if (p.lockedIn) return 'locked'
  if (p.typing) return 'typing'
  return 'idle'
}
const colorOf = usePlayerColors()
</script>

<template>
  <ul ref="root" class="strip" aria-label="Players">
    <li
      v-for="p in players"
      :key="p.id"
      class="pl"
      :data-player="p.id"
      :style="{ '--pc': colorOf(p.id) }"
      :class="{ locked: p.lockedIn, typing: p.typing && !p.lockedIn, off: !p.connected, you: p.id === you, spect: p.spectating }"
      :title="
        p.lockedIn
          ? `${p.name} has locked in`
          : p.spectating
            ? `${p.name} joins next round`
            : p.typing
              ? `${p.name} is working on it`
              : p.name
      "
    >
      <PlayerAvatar :seed="p.id" :size="22" :state="state(p)" />
      <span class="name">{{ p.name }}</span>
      <span v-if="p.lockedIn" class="badge ok" aria-hidden="true">✓</span>
      <span v-else-if="p.spectating" class="badge" aria-hidden="true">⏳</span>
      <span v-if="p.lockedIn" class="sr-only">locked in</span>
    </li>
  </ul>
</template>

<style scoped>
.strip {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.pl {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px 3px 4px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  font-size: var(--text-s);
  max-width: 100%;
  transition: border-color var(--dur);
}
.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 14ch;
}
.badge {
  font-size: 11px;
  font-weight: 800;
  color: var(--muted);
}
.badge.ok {
  color: var(--ok);
}
.typing {
  border-color: rgba(79, 179, 255, 0.45);
}

.off {
  opacity: 0.45;
}
.you .name {
  font-weight: 700;
}
/* each player's colour as a left accent while they're still working on it */
.pl {
  border-left: 3px solid var(--pc);
}
/* ready: the whole chip turns green, outline and fill, with no player-colour accent */
.pl.locked {
  border-color: var(--ok);
  border-left-color: var(--ok);
  background: var(--ok-soft);
}
</style>
