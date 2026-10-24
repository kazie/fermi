<script setup lang="ts">
import { onUnmounted, reactive } from 'vue'

// Each screen's story rendered in real-size frames, so media queries see a phone viewport (a narrow
// div wouldn't). Variant ids are `<story id>-<index>`, in the order the variants appear in each story.
const screens = [
  { title: 'Name screen', story: 'nameform', variant: 0 },
  { title: 'Lobby (host)', story: 'lobby', variant: 0 },
  { title: 'Question', story: 'questionscreen', variant: 0 },
  { title: 'Reveal: steal (loops)', story: 'revealsequence', variant: 0 },
  { title: 'Reveal: steal moment', story: 'revealsequence', variant: 2 },
  { title: 'Reveal: big swarm', story: 'revealsequence', variant: 8 },
  { title: 'Final: FerMEANie wins', story: 'finalscreen', variant: 1 },
  { title: 'Home', story: 'homescreen', variant: 0 },
  { title: 'Big screen: lobby', story: 'screenlobby', variant: 1 },
  { title: 'Break (phone)', story: 'breakscreen', variant: 0 },
  { title: 'Controller reveal', story: 'controllerreveal', variant: 0 },
  { title: 'Intro: roll call', story: 'introsequence', variant: 1 },
  { title: 'Intro: rule', story: 'introsequence', variant: 4 },
  { title: 'Intro: example question', story: 'questionscreen', variant: 7 },
  { title: 'Final question (double points)', story: 'questionscreen', variant: 8 },
]
const devices = [
  { label: 'Small phone', w: 360, h: 740, scale: 0.75 },
  { label: 'Phone', w: 390, h: 844, scale: 0.75 },
  { label: 'Desktop', w: 1280, h: 800, scale: 0.45 },
]
function src(s: (typeof screens)[number]) {
  const id = `src-components-${s.story}-story-vue`
  return `${import.meta.env.BASE_URL}__sandbox.html?storyId=${id}&variantId=${id}-${s.variant}`
}

// Flags any frame whose page scrolls sideways (the page must never do that at 360px).
const overflow = reactive<Record<string, boolean | null>>({})
const check = setInterval(() => {
  for (const f of document.querySelectorAll<HTMLIFrameElement>('iframe[data-device]')) {
    const w = f.contentWindow
    const d = f.contentDocument?.documentElement
    overflow[f.dataset.device!] = w && d ? d.scrollWidth - w.innerWidth > 0 : null
  }
}, 1000)
onUnmounted(() => clearInterval(check))
</script>

<template>
  <Story title="Devices" group="screens" :layout="{ type: 'single', iframe: true }">
    <Variant v-for="s in screens" :key="s.title" :title="s.title">
      <div class="gallery">
        <figure v-for="d in devices" :key="d.label" class="device">
          <figcaption>
            <span>{{ d.label }} · {{ d.w }}×{{ d.h }}</span>
            <span
              v-if="overflow[`${s.title}-${d.label}`] !== undefined && overflow[`${s.title}-${d.label}`] !== null"
              class="badge"
              :class="overflow[`${s.title}-${d.label}`] ? 'bad' : 'ok'"
              >{{ overflow[`${s.title}-${d.label}`] ? 'scrolls sideways!' : 'no sideways scroll' }}</span
            >
          </figcaption>
          <div class="frame" :style="{ width: `${d.w * d.scale}px`, height: `${d.h * d.scale}px` }">
            <iframe
              :src="src(s)"
              :data-device="`${s.title}-${d.label}`"
              :title="`${s.title} on ${d.label}`"
              :style="{ width: `${d.w}px`, height: `${d.h}px`, transform: `scale(${d.scale})` }"
            ></iframe>
          </div>
        </figure>
      </div>
    </Variant>
  </Story>
</template>

<style scoped>
.gallery {
  display: flex;
  gap: 24px;
  padding: 16px;
  align-items: flex-start;
  overflow-x: auto;
}
.device {
  margin: 0;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
figcaption {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  color: var(--muted);
}
.frame {
  border: 1px solid var(--border-strong);
  border-radius: 18px;
  overflow: hidden;
  background: var(--bg);
}
iframe {
  border: 0;
  transform-origin: 0 0;
  display: block;
}
.badge {
  padding: 1px 8px;
  border-radius: 999px;
  font-weight: 700;
}
.badge.ok {
  color: var(--ok);
  background: var(--ok-soft);
}
.badge.bad {
  color: var(--danger);
  background: var(--danger-soft);
}
</style>
