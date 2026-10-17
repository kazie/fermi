<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { createRoom, roomExists } from '@/lib/api'
import AppHeader from '@/components/AppHeader.vue'
import HomeScreen from '@/components/HomeScreen.vue'

const router = useRouter()
const busy = ref(false)
const error = ref('')

async function host(screen: boolean) {
  busy.value = true
  error.value = ''
  try {
    const r = await createRoom({ screen })
    router.push(screen ? `/screen/${r.code}` : `/r/${r.code}`)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

async function join(raw: string) {
  const c = raw.trim().toUpperCase()
  if (!/^[A-Z]{4}$/.test(c)) {
    error.value = 'Room codes are 4 letters'
    return
  }
  if (!(await roomExists(c))) {
    error.value = `Room ${c} doesn’t exist`
    return
  }
  router.push(`/r/${c}`)
}
</script>

<template>
  <AppHeader />
  <main>
    <HomeScreen :busy="busy" :error="error" @host="host(false)" @host-screen="host(true)" @join="join" />
  </main>
</template>
