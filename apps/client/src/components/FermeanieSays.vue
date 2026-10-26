<script setup lang="ts">
import { computed, onUnmounted, ref, shallowRef, watch } from 'vue'
import { S } from '@/lib/strings'
import { chatState, messageStarts, plainText, typeDuration } from '@fermi/shared'
import { spoken } from '@/lib/markup'
import { useVoicePlayer } from '@/composables/useVoice'
import { versionTag, type Release } from '@/lib/version'
import { useMediaQuery } from '@/composables/useMediaQuery'
import FermeanieAvatar from './FermeanieAvatar.vue'
import FerText from './FerText.vue'
import TypingDots from './TypingDots.vue'

const props = withDefaults(
  defineProps<{
    /** A single line (with markup, see FerText). Live edits keep the shared prefix and type only the rest. */
    text?: string
    /** Several lines played in the same bubble: type, pause, typing dots, next. Empty entries are skipped. */
    messages?: (string | null | undefined)[]
    /**
     * Play from a clock instead of from when the bubble appears: `startAt` is when she starts "typing", `now` the
     * current time. Pass server time, so every screen types in step and a remount (reconnect) doesn't retype.
     */
    startAt?: number
    now?: number
    /** FerMEANie's version (and codename), shown on the bubble. */
    release?: Release
    mood?: 'smug' | 'sulk' | 'idle'
    /** Everything at once (recaps): no dots, no typing. */
    instant?: boolean
    /** s: inline remark (dunce cap, bullseye); m: default; l: final screen */
    size?: 's' | 'm' | 'l'
    gloat?: boolean
    look?: { x: number; y: number } | null
    /** A remark on the side (a dunce cap): her voice says it only when she isn't already talking. */
    aside?: boolean
    /** Earlier messages stay in the bubble above the one being typed, instead of being replaced by it. */
    keep?: boolean
  }>(),
  {
    text: '',
    messages: undefined,
    startAt: undefined,
    now: undefined,
    release: undefined,
    mood: 'idle',
    instant: false,
    size: 'm',
    gloat: false,
    look: null,
    aside: false,
    keep: false,
  },
)

const emit = defineEmits<{ start: [index: number] }>()

const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
const seq = computed(() => {
  const m = (props.messages ?? []).filter((x): x is string => !!x)
  return m.length ? m : props.text ? [props.text] : []
})
// The typewriter counts visible characters, so markup markers never show half-typed.
const plainSeq = computed(() => seq.value.map(plainText))
const spokenSeq = computed(() => seq.value.map(spoken))

// ---- the clock ----
// `frame` ticks every animation frame while her text can change. With a `now` prop it only smooths between the
// parent's ticks (100 ms), capped, so a paused clock (a story) doesn't run on.
const SMOOTH_MAX_MS = 250
const frame = ref(performance.now())
let nowAt = performance.now()
const ownStart = ref(performance.now())
/** Off after an edit of a single line: the bubble keeps the shared prefix and types on, no new "typing…" beat. */
const lead = ref(true)
const t = computed(() =>
  props.now !== undefined
    ? props.now - (props.startAt ?? 0) + Math.min(Math.max(0, frame.value - nowAt), SMOOTH_MAX_MS)
    : frame.value - ownStart.value,
)
// With a voice on the server, bubbles on the server clock (her lines in a game) stay up until she has said them, on
// every device, sound on or off, as the server paces the game. Other bubbles (recaps, stories) are never voiced.
const voice = useVoicePlayer()
const voiced = computed(() => props.now !== undefined && !!voice?.voiced)
const chatOpts = computed(() => ({ lead: props.now !== undefined || lead.value, paced: voiced.value }))
// when each message starts: fixed for a sequence, so not worked out again every frame
const starts = computed(() => messageStarts(plainSeq.value, chatOpts.value))
const live = computed(() =>
  props.instant ? chatState(plainSeq.value, Infinity) : chatState(plainSeq.value, t.value, chatOpts.value, starts.value),
)
// What renders changes only when one of these does, not on every frame.
const state = shallowRef(live.value)
watch(live, (s) => {
  const o = state.value
  if (s.index !== o.index || s.shown !== o.shown || s.dots !== o.dots || s.done !== o.done) state.value = s
})

// Frames only while she's typing; before `startAt`, one timer for the wait.
let cancel: (() => void) | null = null
function tick() {
  cancel = null
  frame.value = performance.now()
  if (live.value.done) return
  const wait = -t.value
  if (wait > 50) {
    const id = setTimeout(tick, Math.min(wait, 10_000)) // a far-off start (or a clock jump): look again later
    cancel = () => clearTimeout(id)
  } else {
    const id = requestAnimationFrame(tick)
    cancel = () => cancelAnimationFrame(id)
  }
}
const run = () => {
  if (!cancel && !live.value.done) tick()
}
onUnmounted(() => cancel?.())

watch(
  () => plainSeq.value.join('\u0000'),
  (_, oldKey) => {
    const old = oldKey?.split('\u0000') ?? []
    const cur = plainSeq.value
    let same = 0
    if (old.length === 1 && cur.length === 1) {
      const was = state.value
      // still on her opening dots (a name typed fast): let that beat run on, then type the new text
      if (was.dots && lead.value) return run()
      while (same < cur[0].length && same < old[0].length && cur[0][same] === old[0][same]) same++
      // keep only what was actually on screen
      same = Math.min(same, was.done ? old[0].length : was.shown)
    }
    const now = performance.now()
    frame.value = now
    // an edit types on from the shared prefix; anything new starts with the "typing…" beat
    lead.value = same === 0
    ownStart.value = same ? now - (typeDuration(cur[0].length) * same) / cur[0].length : now
    cancel?.()
    cancel = null
    run()
  },
  { immediate: true },
)
watch(
  () => props.now,
  () => {
    nowAt = performance.now()
    run()
  },
)

// ---- what shows ----
/** Reduced motion and `instant`: no typing; each message appears whole when its turn comes, under the earlier ones. */
const stacked = computed(() => props.instant || reduced.value)
/** The current message is still being typed out. */
const typing = computed(() => {
  const s = state.value
  return !s.done && !s.dots && s.shown < (plainSeq.value[s.index]?.length ?? 0)
})
/** Messages fully typed so far: what screen readers hear (each once, as it completes). */
const complete = computed(() => {
  const s = state.value
  if (s.done) return seq.value.length
  return s.index + (s.dots || typing.value ? 0 : 1)
})
// Each message as she starts typing it (a parent that voices her lines itself, like the name screen).
watch(
  () => (state.value.dots ? -1 : state.value.index),
  (index) => {
    if (index >= 0) emit('start', index)
  },
  { immediate: true },
)

// ---- her voice ----
// Each message is said as she starts typing it (on devices with sound on). A bubble that mounts mid-message (a
// reconnect) stays quiet for that one: the player missed its start.
watch(
  () => (state.value.dots ? null : seq.value[state.value.index]),
  (message) => {
    const { index, at } = state.value
    const keys = message && voiced.value && !props.instant ? voice?.keys(message) : undefined
    if (keys) voice!.say(keys, { id: `${props.startAt} ${index} ${message}`, late: Math.max(0, t.value - at), aside: props.aside })
  },
)

/** Stacked mode shows a message as soon as it starts. */
const stackedCount = computed(() => (state.value.dots ? state.value.index : Math.min(seq.value.length, state.value.index + 1)))
/** Messages each on their own line: stacked, or kept. */
const block = computed(() => stacked.value || props.keep)
/** Which messages are on screen: all started ones when stacked or kept, else only the one being typed. */
const onScreen = computed(() => {
  const s = state.value
  if (stacked.value) return [...Array(stackedCount.value).keys()]
  const upTo = s.dots ? s.index : s.index + 1
  return props.keep ? [...Array(upTo).keys()] : s.dots ? [] : [s.index]
})
/** Her "typing…" beat. Stacked mode shows it only before the first message. */
const dots = computed(() => (stacked.value ? seq.value.length > 0 && stackedCount.value === 0 : state.value.dots))
const avatarSize = computed(() => ({ s: 28, m: 44, l: 64 })[props.size])
</script>

<template>
  <figure class="says" :class="`size-${size}`">
    <FermeanieAvatar :size="avatarSize" :speaking="!state.done" :mood="mood" :gloat="gloat" :look="look" />
    <div class="bubble">
      <div class="who">
        <span class="name" :title="S.botBackronym">Fer<b>MEAN</b>ie</span>
        <span v-if="release" class="ver mono">{{ versionTag(release) }}</span>
      </div>
      <p class="line mono">
        <span class="sr-only" aria-live="polite"
          ><span v-for="(m, i) in spokenSeq.slice(0, complete)" :key="i">{{ m }} </span></span
        >
        <span v-for="i in onScreen" :key="i" :class="{ msg: block }" aria-hidden="true"
          ><FerText :text="seq[i]" :shown="i === state.index && !stacked ? state.shown : plainSeq[i].length" /><span
            v-if="typing && i === state.index && !stacked"
            class="cursor"
            >▍</span
          ></span
        >
        <span v-if="dots" :class="{ msg: block }" aria-hidden="true"><TypingDots /></span>
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
.msg {
  display: block;
}
.msg + .msg {
  margin-top: var(--space-1);
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
