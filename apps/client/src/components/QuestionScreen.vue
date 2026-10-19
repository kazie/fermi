<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import type { RoomView } from '@fermi/shared'
import { S } from '@/lib/strings'
import { useMediaQuery } from '@/composables/useMediaQuery'
import AnswerBlock from './AnswerBlock.vue'
import { versionTag } from '@/lib/version'
import FermeanieSays from './FermeanieSays.vue'
import PlayerStrip from './PlayerStrip.vue'
import RoundTimer from './RoundTimer.vue'

const props = withDefaults(
  defineProps<{
    room: RoomView
    now: number
    /** Stories: show the phone "typing" layout without a real focused keyboard. */
    previewEditing?: boolean
  }>(),
  { previewEditing: false },
)
const emit = defineEmits<{ draft: [string]; lock: [string]; unlock: [] }>()

const round = computed(() => props.room.round!)
const sheet = computed(() => props.room.yourSheet)
const playing = computed(() => !!sheet.value)
const locked = computed(() => !!sheet.value?.locked)
const text = ref(sheet.value?.text ?? '')
const lockedCount = computed(() => props.room.players.filter((p) => p.lockedIn).length)
const playingCount = computed(() => props.room.players.filter((p) => !p.spectating).length)

// Phones, while typing: the keyboard takes half the screen, so the question card folds into the sticky
// timer bar as one line. Tapping it shows the whole question until tapped again. No autofocus on phones:
// players should read the question first, and a programmatic focus may pop up the keyboard.
const narrow = useMediaQuery('(max-width: 899px)')
const focused = ref(false)
const compact = computed(() => (narrow.value && focused.value) || props.previewEditing)
const questionOpen = ref(false)
// Restoring the full card on blur is delayed: tapping "Lock in" blurs the editor on pointer-down, and an
// instant layout jump would move the button away before the tap lands.
let unfold: ReturnType<typeof setTimeout> | undefined
function onEditorFocus() {
  clearTimeout(unfold)
  focused.value = true
}
function onEditorBlur() {
  clearTimeout(unfold)
  unfold = setTimeout(() => {
    focused.value = false
    questionOpen.value = false
  }, 300)
}
onUnmounted(() => clearTimeout(unfold))

// The component is keyed by round, so `text` starts from the server's copy each round. Drafts typed
// while offline are kept by useSocket and resent on reconnect.
let debounce: ReturnType<typeof setTimeout> | undefined
let dirty = false
watch(text, (t) => {
  if (locked.value) return
  dirty = true
  clearTimeout(debounce)
  debounce = setTimeout(flush, 300)
  void t
})
function flush() {
  clearTimeout(debounce)
  if (dirty) emit('draft', text.value)
  dirty = false
}
// Make sure the last keystrokes reach the server before the deadline.
watch(
  () => props.now,
  (n) => {
    if (dirty && n > round.value.endsAt - 500) flush()
  },
)
onUnmounted(flush)

// FerMEANie glances at whoever just locked in, then goes back to wandering.
const remarkBox = ref<HTMLElement>()
const look = ref<{ x: number; y: number } | null>(null)
let lookTimer: ReturnType<typeof setTimeout> | undefined
function glance({ rect }: { rect: DOMRect }) {
  const el = remarkBox.value?.querySelector('svg')
  if (!el) return
  const e = el.getBoundingClientRect()
  const dx = rect.left + rect.width / 2 - (e.left + e.width / 2)
  const dy = rect.top + rect.height / 2 - (e.top + e.height / 2)
  const len = Math.hypot(dx, dy) || 1
  const k = Math.min(1, len / 80)
  look.value = { x: (dx / len) * k, y: (dy / len) * k }
  clearTimeout(lookTimer)
  lookTimer = setTimeout(() => (look.value = null), 1300)
}
onUnmounted(() => clearTimeout(lookTimer))

function lock() {
  clearTimeout(debounce)
  dirty = false
  emit('lock', text.value)
}
</script>

<template>
  <div class="qs">
    <div class="sticky">
      <button
        v-if="compact"
        type="button"
        class="mini-q"
        :aria-expanded="questionOpen"
        @pointerdown.prevent
        @click="questionOpen = !questionOpen"
      >
        <span class="mini-text">{{ round.question.question }}</span>
        <span class="mini-unit">{{ round.question.unit }} {{ questionOpen ? '▴' : '▾' }}</span>
      </button>
      <div v-if="compact && questionOpen" class="q-sheet card" @pointerdown.prevent @click="questionOpen = false">
        <h1>{{ round.question.question }}</h1>
        <p class="unit">
          Answer in <strong>{{ round.question.unit }}</strong>
        </p>
      </div>
      <RoundTimer :started-at="round.startedAt" :ends-at="round.endsAt" :now="now" />
    </div>
    <div class="layout">
      <div class="main">
        <section v-show="!compact" class="question card">
          <span class="eyebrow"
            >Question {{ round.index + 1 }} of {{ round.total }} · {{ round.question.category.replace(/-/g, ' ') }}</span
          >
          <h1>{{ round.question.question }}</h1>
          <p class="unit">
            Answer in <strong>{{ round.question.unit }}</strong>
          </p>
        </section>

        <AnswerBlock
          v-if="playing"
          v-model="text"
          :locked="locked"
          :unit="round.question.unit"
          :autofocus="!narrow"
          @lock="lock"
          @unlock="emit('unlock')"
          @focus="onEditorFocus"
          @blur="onEditorBlur"
        />
        <p v-else class="card spect">{{ S.spectating }}</p>
      </div>

      <aside class="side">
        <div class="lock-count">
          <span class="eyebrow">Locked in</span>
          <span class="mono count">{{ lockedCount }} / {{ playingCount }}</span>
        </div>
        <PlayerStrip :players="room.players" :you="room.you" @locked-in="glance" />
        <div ref="remarkBox">
          <FermeanieSays :text="round.line" :version="versionTag(room.fermeanie)" mood="smug" :look="look" />
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.qs {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.sticky {
  position: sticky;
  top: 0;
  z-index: 20;
  padding: var(--space-2) 0;
  background: linear-gradient(var(--bg) 70%, transparent);
}
.layout {
  display: grid;
  gap: var(--space-4);
}
.main,
.side {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
}
.question h1 {
  font-size: var(--text-xl);
  margin: var(--space-2) 0;
  overflow-wrap: anywhere;
}
.unit {
  margin: 0;
  color: var(--text-dim);
}
.unit strong {
  color: var(--accent);
}
.spect {
  color: var(--text-dim);
}
.lock-count {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.lock-count .count {
  margin-left: auto;
}
@media (max-width: 899px) {
  /* players and FerMEANie under the editor, compact */
  .side {
    order: 2;
  }
}
@media (min-width: 900px) {
  .layout {
    grid-template-columns: minmax(0, 1fr) 300px;
    align-items: start;
  }
  .side {
    position: sticky;
    top: 64px;
  }
}
.mini-q {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  width: 100%;
  min-height: 36px;
  margin-bottom: var(--space-2);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius);
  border: 1px solid var(--border-strong);
  background: var(--surface);
  text-align: left;
  cursor: pointer;
}
.mini-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 700;
}
.mini-unit {
  flex: none;
  color: var(--accent);
  font-size: var(--text-s);
}
.q-sheet {
  margin-bottom: var(--space-2);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.5);
}
.q-sheet h1 {
  font-size: var(--text-l);
  margin: 0 0 var(--space-1);
  overflow-wrap: anywhere;
}
</style>
