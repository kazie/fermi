<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { escapeMarkup, NAME_MAX } from '@fermi/shared'
import { S } from '@/lib/strings'
import { pickWelcome } from '@/lib/welcome'
import FerText from './FerText.vue'
import FermeanieSays from './FermeanieSays.vue'

const props = withDefaults(defineProps<{ code: string; midGame?: boolean; initialName?: string; quote?: string }>(), {
  midGame: false,
  initialName: '',
  quote: undefined,
})
const emit = defineEmits<{ join: [string] }>()
const name = ref(props.initialName)
const fieldId = useId()
// picked once per visit, so it doesn't change while typing
const quote = props.quote ?? pickWelcome()
const clean = computed(() => name.value.replace(/\s+/g, ' ').trim())
// the greeting is a FerMEANie line with markup: the name shows exactly as typed
const greeting = computed(() => S.welcomeName(escapeMarkup(clean.value) || S.namePlaceholder))

function submit() {
  if (clean.value) emit('join', clean.value)
}
</script>

<template>
  <form class="name-form card" @submit.prevent="submit">
    <span class="eyebrow"
      >Joining room <span class="mono code">{{ code }}</span></span
    >
    <FermeanieSays :text="greeting" size="l" mood="smug" />
    <label class="sr-only" :for="fieldId">{{ S.yourName }}</label>
    <input
      :id="fieldId"
      v-model="name"
      class="input"
      :maxlength="NAME_MAX"
      :placeholder="S.namePlaceholder"
      autocomplete="nickname"
      enterkeyhint="go"
      autofocus
    />
    <p v-if="quote" class="quote">“<FerText :text="quote" />”</p>
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
.quote {
  font-style: italic;
  color: var(--text-dim);
}
p {
  margin: 0;
  font-size: var(--text-s);
}
</style>
