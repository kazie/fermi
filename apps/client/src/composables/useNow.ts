import { onUnmounted, ref, type Ref } from 'vue'

/** A ticking "server now" (ms). Components take `now` as a prop so stories can scrub time. */
export function useServerNow(offset: Ref<number>, intervalMs = 100) {
  const now = ref(Date.now() + offset.value)
  const id = setInterval(() => (now.value = Date.now() + offset.value), intervalMs)
  onUnmounted(() => clearInterval(id))
  return now
}
