import { onUnmounted, watch } from 'vue'

/**
 * Keeps the screen on while `active()` is true (where the browser supports it): a phone that dims and locks mid-question
 * drops its connection, and a TV page shouldn't fall into a screensaver. The browser releases the lock whenever the
 * tab is hidden, so it's asked for again when the tab comes back.
 */
export function useWakeLock(active: () => boolean) {
  let lock: WakeLockSentinel | null = null
  let asking = false
  let stopped = false
  const wanted = () => !stopped && active() && document.visibilityState === 'visible'
  async function sync() {
    const want = wanted()
    if (want && !lock && !asking && 'wakeLock' in navigator) {
      asking = true
      try {
        const got = await navigator.wakeLock.request('screen')
        lock = got
        // only forget it if it's still the current one: an old lock's late event mustn't wipe a newer one
        got.addEventListener('release', () => lock === got && (lock = null))
        if (!wanted()) await release() // left the game (or the page) while asking
      } catch {
        // refused (battery saver, no user gesture yet…): the screen just behaves as usual
      } finally {
        asking = false
      }
    } else if (!want && lock) await release()
  }
  async function release() {
    const l = lock
    lock = null
    await l?.release().catch(() => {})
  }
  watch(active, sync, { immediate: true })
  const onVisible = () => void sync()
  document.addEventListener('visibilitychange', onVisible)
  onUnmounted(() => {
    stopped = true
    document.removeEventListener('visibilitychange', onVisible)
    void release()
  })
}
