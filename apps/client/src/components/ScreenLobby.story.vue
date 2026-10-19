<script setup lang="ts">
import { asScreen, lobbyRoom } from '@/fixtures/rooms'
import ScreenLobby from './ScreenLobby.vue'

const empty = asScreen({ ...lobbyRoom(0), hostId: null })
const four = asScreen(lobbyRoom(4))
const two = asScreen(lobbyRoom(2))
const many = asScreen(lobbyRoom(8))
const url = 'https://fermi.example/r/FRMI'
</script>

<template>
  <Story title="ScreenLobby (big screen)" group="screens">
    <Variant title="Empty room"
      ><div class="page"><ScreenLobby :room="empty" :join-url="url" /></div
    ></Variant>
    <Variant title="Two players, one more needed"
      ><div class="page"><ScreenLobby :room="two" :join-url="url" /></div
    ></Variant>
    <Variant title="Four players, host chosen"
      ><div class="page"><ScreenLobby :room="four" :join-url="url" /></div
    ></Variant>
    <Variant title="Eight players"
      ><div class="page"><ScreenLobby :room="many" :join-url="url" /></div
    ></Variant>
  </Story>
</template>
