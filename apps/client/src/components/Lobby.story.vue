<script setup lang="ts">
import { logEvent } from 'histoire/client'
import type { RoomSettings, RoomView } from '@fermi/shared'
import { lobbyRoom } from '@/fixtures/rooms'
import Lobby from './Lobby.vue'

const host = lobbyRoom(4)
const guest = { ...lobbyRoom(4), you: 'p2' }
const empty = lobbyRoom(1, { poolSize: 0 })
const few = { ...lobbyRoom(3, { poolSize: 6 }) }
const twoPlayers = lobbyRoom(2)
const hostState = () => ({ room: JSON.parse(JSON.stringify(host)) as RoomView })
const setSettings = (state: { room: RoomView }, s: RoomSettings) => (state.room.settings = s)
const guestHostPaced = { ...guest, settings: { ...guest.settings, pacing: 'host' as const } }
</script>

<template>
  <Story title="Lobby" group="screens">
    <Variant title="Host" :init-state="hostState">
      <template #default="{ state }">
        <div class="page">
          <Lobby
            :room="state.room"
            join-url="https://fermi.example/r/FRMI"
            @settings="(s: RoomSettings) => setSettings(state, s)"
            @start="logEvent('start', {})"
          />
        </div>
      </template>
    </Variant>
    <Variant title="Guest"
      ><div class="page"><Lobby :room="guest" join-url="https://fermi.example/r/FRMI" /></div
    ></Variant>
    <Variant title="Guest, host pacing"
      ><div class="page"><Lobby :room="guestHostPaced" join-url="https://fermi.example/r/FRMI" /></div
    ></Variant>
    <Variant title="Too few players to start"
      ><div class="page"><Lobby :room="twoPlayers" join-url="https://fermi.example/r/FRMI" /></div
    ></Variant>
    <Variant title="No questions yet"
      ><div class="page"><Lobby :room="empty" join-url="https://fermi.example/r/FRMI" /></div
    ></Variant>
    <Variant title="Fewer questions than rounds"
      ><div class="page"><Lobby :room="few" join-url="https://fermi.example/r/FRMI" /></div
    ></Variant>
  </Story>
</template>
