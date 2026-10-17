import { onMounted, onUnmounted, ref } from 'vue'

/** Reactive `matchMedia`, e.g. `useMediaQuery('(max-width: 899px)')`. Known on the first render, so children can use it. */
export function useMediaQuery(query: string) {
  const matches = ref(typeof matchMedia !== 'undefined' && matchMedia(query).matches)
  let mq: MediaQueryList | undefined
  const update = () => (matches.value = !!mq?.matches)
  onMounted(() => {
    if (typeof matchMedia === 'undefined') return
    mq = matchMedia(query)
    update()
    mq.addEventListener('change', update)
  })
  onUnmounted(() => mq?.removeEventListener('change', update))
  return matches
}
