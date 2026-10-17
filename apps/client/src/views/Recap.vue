<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '@/lib/api'
import type { RecapGame } from '@/lib/recap'
import AppHeader from '@/components/AppHeader.vue'
import RecapScreen from '@/components/RecapScreen.vue'
import { myIdInGame } from '@/lib/storage'
import { useDisputes } from '@/composables/useDispute'
import { providePlayerOrder } from '@/lib/playerColors'

const props = defineProps<{ id: string }>()
const game = ref<RecapGame | null>(null)
const error = ref('')
const me = myIdInGame(props.id)
const disputes = useDisputes()
// card order is per round; use the final ranking's order so colours stay the same across rounds
providePlayerOrder(computed(() => game.value?.final?.ranking.map((r) => r.playerId) ?? []))

onMounted(async () => {
  try {
    game.value = await api<RecapGame>(`/api/games/${props.id}`)
  } catch (e) {
    error.value = (e as Error).message
  }
})
</script>

<template>
  <AppHeader />
  <main class="page">
    <p v-if="error" class="err">{{ error }}</p>
    <p v-else-if="!game" class="muted">Loading…</p>
    <RecapScreen v-else :game="game" :me="me" :disputes="disputes.states" @dispute="disputes.submit" />
  </main>
</template>

<style scoped>
.err {
  color: var(--danger);
}
</style>
