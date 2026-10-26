<script setup lang="ts">
import { computed } from 'vue'
import { estimateGameMinutes, playersMissing, type RoomView } from '@fermi/shared'
import { S } from '@/lib/strings'
import LobbyLine from './LobbyLine.vue'
import JoinQr from './JoinQr.vue'
import PlayerAvatar from './PlayerAvatar.vue'

/** The lobby on a big screen: how to join, who's in, and who will press Start. */
const props = defineProps<{
  room: RoomView
  joinUrl: string
  /** Server time, for her lobby line (a function, so only her bubble re-renders as it ticks). */
  clock?: () => number
}>()

const host = computed(() => props.room.players.find((p) => p.id === props.room.hostId))
const s = computed(() => props.room.settings)
const missingPlayers = computed(() => playersMissing(props.room.players))
const minutes = computed(() => estimateGameMinutes(s.value, props.room.players.length))
</script>

<template>
  <div class="tv-lobby">
    <section class="join">
      <div class="join-text">
        <span class="eyebrow">Join on your phone</span>
        <div class="url mono">{{ joinUrl.replace(/^https?:\/\//, '').replace(/\/r\/.*$/, '') }}</div>
        <span class="eyebrow">Room code</span>
        <div class="code mono">{{ room.code }}</div>
      </div>
      <JoinQr :url="joinUrl" :size="260" />
    </section>

    <section class="people">
      <h2 class="eyebrow">Test subjects ({{ room.players.length }})</h2>
      <ul v-if="room.players.length" class="grid">
        <li v-for="p in room.players" :key="p.id" :class="{ off: !p.connected }">
          <PlayerAvatar :seed="p.id" :size="56" :state="p.connected ? 'idle' : 'off'" />
          <span class="name">{{ p.name }}</span>
          <span v-if="p.isHost" class="tag">host</span>
        </li>
      </ul>
      <p v-else class="empty muted">Nobody yet. Scan the code to join!</p>
    </section>

    <LobbyLine v-if="room.lobbyLine" :line="room.lobbyLine" :release="room.fermeanie" :clock="clock" size="l" />

    <p class="status">
      <template v-if="host && missingPlayers">{{ S.needPlayers(missingPlayers) }}</template>
      <template v-else-if="host"
        >Waiting for <strong>{{ host.name }}</strong> to start</template
      >
      <template v-else>The first player to join becomes the host</template>
      · {{ s.rounds }} rounds · {{ s.timerSec }} s per question · {{ S.betweenRoundsShort(s) }} · {{ S.introShort(s.intro) }} · about
      {{ minutes }} min
    </p>
  </div>
</template>

<style scoped>
.tv-lobby {
  display: grid;
  gap: var(--space-6);
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: start;
}
.join {
  display: flex;
  gap: var(--space-5);
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-l);
  padding: var(--space-5);
}
.join-text {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}
.url {
  font-size: var(--text-xl);
  color: var(--blue);
  overflow-wrap: anywhere;
  margin-bottom: var(--space-3);
}
.code {
  font-size: 5rem;
  font-weight: 800;
  letter-spacing: 0.15em;
  color: var(--accent);
  line-height: 1;
}
.people .grid {
  list-style: none;
  margin: var(--space-3) 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: var(--space-3);
}
.people li {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-3);
  border-radius: var(--radius-l);
  background: var(--surface);
  border: 1px solid var(--border);
  animation: pop var(--dur-slow) var(--ease) both;
}
@keyframes pop {
  from {
    opacity: 0;
    transform: scale(0.8);
  }
}
.people li.off {
  opacity: 0.45;
}
.name {
  font-weight: 700;
  font-size: var(--text-l);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tag {
  padding: 0 8px;
}
.empty {
  font-size: var(--text-l);
}
.status {
  grid-column: 1 / -1;
  margin: 0;
  text-align: center;
  font-size: var(--text-l);
  color: var(--text-dim);
}
@media (max-width: 900px) {
  .tv-lobby {
    grid-template-columns: 1fr;
  }
  .join {
    flex-wrap: wrap;
  }
}
</style>
