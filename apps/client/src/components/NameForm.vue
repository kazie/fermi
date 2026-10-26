<script lang="ts">
/** Visits to the name screen in this page, across mounts. */
const visits = { n: 0 }
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, onUnmounted, ref, useId, watch } from 'vue'
import { cleanName, NAME_MAX, NAME_PLACEHOLDER, type RoomView } from '@fermi/shared'
import { useVoicePlayer } from '@/composables/useVoice'
import { S } from '@/lib/strings'
import FermeanieSays from './FermeanieSays.vue'

const props = withDefaults(
  defineProps<{
    code: string
    midGame?: boolean
    initialName?: string
    /** Her greeting (to HUMAN_NAME_HERE) and the line she adds after it in the same bubble, picked by the server. */
    welcome?: RoomView['welcome']
  }>(),
  { midGame: false, initialName: '', welcome: undefined },
)
const emit = defineEmits<{ join: [string] }>()
const name = ref(props.initialName)
const fieldId = useId()
const clean = computed(() => cleanName(name.value))

// Her bubble: the greeting, then her line after it. Built once, so typing a name doesn't hand the bubble new messages.
const messages = computed(() => (props.welcome ? [props.welcome.greeting, props.welcome.line] : []))

// Her voice says each line once: the greeting as soon as sound can play (usually the tap into the name field) and
// the page is in view (a link opened in a background tab waits), and the line after it once the bubble starts typing
// it, so she never says what isn't on screen yet. Both are fixed lines rendered ahead: typing a name never makes the
// server render anything.
const voice = useVoicePlayer()
const visible = ref(typeof document === 'undefined' || !document.hidden)
const onVisibility = () => (visible.value = !document.hidden)
document.addEventListener('visibilitychange', onVisibility)
onUnmounted(() => document.removeEventListener('visibilitychange', onVisibility))
/** Each visit to the name screen (a kicked player is back on it) is a new welcome, even with the same greeting. */
const visit = ++visits.n
/** The last message the bubble has started typing (the greeting may be said before its typing starts). */
const reached = ref(0)
const onStart = (index: number) => (reached.value = Math.max(reached.value, index))
const sent = new Set<string>()
watch(
  () => (voice?.running && visible.value ? messages.value.slice(0, reached.value + 1) : []),
  (lines) => {
    lines.forEach((text, i) => {
      const id = `welcome ${visit} ${i} ${text}`
      const keys = voice!.keys(text)
      if (keys && !sent.has(id)) {
        sent.add(id)
        voice!.say(keys, { id })
      }
    })
  },
  { immediate: true },
)
// Joining ends the name screen and its lines: her greeting in the lobby mustn't be skipped for being said over them.
// Before unmounting, so the lobby's line (mounted right after) isn't stopped with them.
onBeforeUnmount(() => voice?.hush())

function submit() {
  if (clean.value) emit('join', clean.value)
}
</script>

<template>
  <form class="name-form card" @submit.prevent="submit">
    <span class="eyebrow"
      >Joining room <span class="mono code">{{ code }}</span></span
    >
    <FermeanieSays v-if="welcome" :messages="messages" keep size="l" mood="smug" @start="onStart" />
    <label class="sr-only" :for="fieldId">{{ S.yourName }}</label>
    <input
      :id="fieldId"
      v-model="name"
      class="input"
      :maxlength="NAME_MAX"
      :placeholder="NAME_PLACEHOLDER"
      autocomplete="nickname"
      enterkeyhint="go"
      autofocus
    />
    <button class="btn btn-primary btn-block" type="submit" :disabled="!clean">{{ S.joinGame }}</button>
    <p v-if="midGame" class="muted">A game is in progress. You’ll be in from the next question.</p>
  </form>
</template>

<style scoped>
.name-form {
  max-width: 460px;
  margin: var(--space-6) auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.code {
  color: var(--accent);
}
.input::placeholder {
  font-family: var(--font-mono);
  letter-spacing: 0.04em;
}
p {
  margin: 0;
  font-size: var(--text-s);
}
</style>
