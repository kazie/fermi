<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { S } from '@/lib/strings'
import { chatState, MAX_TYPE_MS, MS_PER_CHAR } from '@/lib/chat'
import { plain, spoken } from '@/lib/markup'
import FermeanieAvatar from './FermeanieAvatar.vue'
import FerText from './FerText.vue'
import TypingDots from './TypingDots.vue'

const props = withDefaults(
  defineProps<{
    /** A single line (with markup, see FerText). Live edits keep the shared prefix and type only the rest. */
    text?: string
    /** Several lines played in the same bubble: type, pause, typing dots, next. Empty entries are skipped. */
    messages?: (string | null | undefined)[]
    /** With `messages`: drive the sequence from a clock (stories, synced reveals) instead of an own timer. */
    startAt?: number
    now?: number
    version?: string
    mood?: 'smug' | 'sulk' | 'idle'
    instant?: boolean
    /** s: inline remark (dunce cap, bullseye); m: default; l: final screen */
    size?: 's' | 'm' | 'l'
    gloat?: boolean
    look?: { x: number; y: number } | null
  }>(),
  {
    text: '',
    messages: undefined,
    startAt: undefined,
    now: undefined,
    version: '',
    mood: 'idle',
    instant: false,
    size: 'm',
    gloat: false,
    look: null,
  },
)

const TICK_MS = 16
const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
const seq = computed(() => (props.messages ?? []).filter((m): m is string => !!m))
const chat = computed(() => seq.value.length > 1)
// The typewriter counts visible characters, so markup markers never show half-typed.
const plainSeq = computed(() => seq.value.map(plain))

// ---- single line: typewriter that keeps the shared prefix on edits ----
const shown = ref(0)
let timer: ReturnType<typeof setInterval> | undefined
const single = computed(() => seq.value[0] ?? props.text)
const singlePlain = computed(() => plain(single.value))

function play(text: string, old?: string) {
  clearInterval(timer)
  if (chat.value) return
  if (props.instant || reduced) {
    shown.value = text.length
    return
  }
  let same = 0
  if (old) while (same < text.length && same < old.length && text[same] === old[same]) same++
  shown.value = Math.min(shown.value, same)
  if (shown.value >= text.length) return
  const msPerChar = Math.min(MS_PER_CHAR, MAX_TYPE_MS / (text.length - shown.value))
  const started = performance.now()
  const from = shown.value
  timer = setInterval(() => {
    shown.value = Math.min(singlePlain.value.length, from + Math.floor((performance.now() - started) / msPerChar) + 1)
    if (shown.value >= singlePlain.value.length) clearInterval(timer)
  }, TICK_MS)
}
watch(singlePlain, play, { immediate: true })

// ---- several lines: one bubble that chats ----
const ownStart = ref(performance.now())
const ownNow = ref(performance.now())
let chatTimer: ReturnType<typeof setInterval> | undefined
watch(
  () => seq.value.join('\u0000'),
  () => {
    clearInterval(chatTimer)
    if (!chat.value || props.now !== undefined) return
    ownStart.value = performance.now()
    ownNow.value = ownStart.value
    chatTimer = setInterval(() => (ownNow.value = performance.now()), TICK_MS)
  },
  { immediate: true },
)
onUnmounted(() => {
  clearInterval(timer)
  clearInterval(chatTimer)
})
const state = computed(() => {
  const t = props.now !== undefined ? props.now - (props.startAt ?? 0) : ownNow.value - ownStart.value
  return chatState(plainSeq.value, props.instant || reduced ? Infinity : t)
})

const visible = computed(() =>
  chat.value ? { text: seq.value[state.value.index], shown: state.value.shown } : { text: single.value, shown: shown.value },
)
const fullText = computed(() => (chat.value ? seq.value : [single.value]).map(spoken).join(' '))
const dots = computed(() => chat.value && state.value.dots)
const speaking = computed(() => (chat.value ? !state.value.done : shown.value < singlePlain.value.length))
const typing = computed(() =>
  chat.value ? !state.value.done && !state.value.dots && state.value.shown < plainSeq.value[state.value.index].length : speaking.value,
)
const avatarSize = computed(() => ({ s: 28, m: 44, l: 64 })[props.size])
</script>

<template>
  <figure class="says" :class="`size-${size}`">
    <FermeanieAvatar :size="avatarSize" :speaking="speaking" :mood="mood" :gloat="gloat" :look="look" />
    <div class="bubble">
      <div class="who">
        <span class="name" :title="S.botBackronym">Fer<b>MEAN</b>ie</span>
        <span v-if="version" class="ver mono">{{ version }}</span>
      </div>
      <p class="line mono">
        <span class="sr-only">{{ fullText }}</span>
        <TypingDots v-if="dots" aria-hidden="true" />
        <span v-else aria-hidden="true"
          ><FerText :text="visible.text" :shown="visible.shown" /><span v-if="typing" class="cursor">▍</span></span
        >
      </p>
    </div>
  </figure>
</template>

<style scoped>
.says {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  margin: 0;
}
.bubble {
  flex: 1;
  min-width: 0;
  /* opaque, so the text stays readable on top of cards, stripes and the steal vignette */
  background: linear-gradient(180deg, rgba(255, 79, 79, 0.1), rgba(255, 79, 79, 0.03)), var(--surface);
  border: 1px solid rgba(255, 79, 79, 0.35);
  border-radius: 4px var(--radius-l) var(--radius-l) var(--radius-l);
  padding: var(--space-2) var(--space-3);
}
.who {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  font-size: var(--text-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fer);
  font-weight: 700;
}
.who b {
  font-weight: 900;
}
.ver {
  color: var(--muted);
  text-transform: none;
  letter-spacing: 0;
}
.line {
  margin: 2px 0 0;
  font-size: 15px;
  line-height: 1.5;
  color: #ffd9d4;
  min-height: 1.5em;
  overflow-wrap: anywhere; /* lines can carry long player names */
}
.size-l .line {
  font-size: var(--text-l);
}
.size-s {
  gap: var(--space-2);
}
.size-s .bubble {
  padding: var(--space-1) var(--space-2);
}
.size-s .who {
  font-size: 10px;
}
.size-s .line {
  font-size: 13px;
  line-height: 1.45;
  color: var(--text);
}
.cursor {
  color: var(--fer);
  animation: blink 0.8s steps(1) infinite;
}
@keyframes blink {
  50% {
    opacity: 0;
  }
}
</style>
