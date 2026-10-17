import { onMounted, onUnmounted } from 'vue'

/** Exposes the on-screen keyboard height as --kb-inset so helper keys can sit right above it. */
export function useKeyboardInset() {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null
  const update = () => {
    if (!vv) return
    const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
    document.documentElement.style.setProperty('--kb-inset', `${Math.round(inset)}px`)
  }
  onMounted(() => {
    vv?.addEventListener('resize', update)
    vv?.addEventListener('scroll', update)
    update()
  })
  onUnmounted(() => {
    vv?.removeEventListener('resize', update)
    vv?.removeEventListener('scroll', update)
    document.documentElement.style.setProperty('--kb-inset', '0px')
  })
}
