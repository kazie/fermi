import { onMounted, onUnmounted, ref } from 'vue'

/** 0 → 1 over `ms`, starting `delay` ms after mount (rAF). Jumps straight to 1 under reduced motion. */
export function useProgress(ms: number, delay = 0) {
  const p = ref(0)
  let raf = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  onMounted(() => {
    if (typeof requestAnimationFrame === 'undefined' || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      p.value = 1
      return
    }
    timer = setTimeout(() => {
      const start = performance.now()
      const step = (t: number) => {
        p.value = Math.min(1, (t - start) / ms)
        if (p.value < 1) raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    }, delay)
  })
  onUnmounted(() => {
    clearTimeout(timer)
    cancelAnimationFrame(raf)
  })
  return p
}

/** The value `p` (0..1) of the way from `from` to `to`, eased out and rounded. */
export function tween(from: number, to: number, p: number): number {
  const e = 1 - (1 - Math.min(1, Math.max(0, p))) ** 3
  return Math.round(from + (to - from) * e)
}
