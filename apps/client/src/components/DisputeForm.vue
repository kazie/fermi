<script setup lang="ts">
import { ref, useId } from 'vue'
import { S } from '@/lib/strings'

export type DisputeState = 'idle' | 'sending' | 'sent' | 'error'

withDefaults(defineProps<{ state?: DisputeState; error?: string }>(), { state: 'idle', error: '' })
const emit = defineEmits<{ submit: [string] }>()
const open = ref(false)
const message = ref('')
const fieldId = useId()
</script>

<template>
  <div class="dispute">
    <p v-if="state === 'sent'" class="ok">Thanks. Once enough players flag it, the question is taken out of rotation and re-verified.</p>
    <template v-else>
      <button v-if="!open" class="btn btn-ghost" type="button" @click="open = true">⚑ {{ S.dispute }}</button>
      <form v-else class="form" @submit.prevent="emit('submit', message)">
        <label :for="fieldId" class="eyebrow">What looks wrong? Links to better sources are very welcome.</label>
        <textarea :id="fieldId" v-model="message" class="input ta" rows="4" maxlength="2000"></textarea>
        <div class="row">
          <button class="btn btn-primary" type="submit" :disabled="message.trim().length < 5 || state === 'sending'">Send</button>
          <button class="btn btn-ghost" type="button" @click="open = false">Cancel</button>
        </div>
        <p v-if="state === 'error'" class="err">{{ error }}</p>
      </form>
    </template>
  </div>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.ta {
  padding: var(--space-2) var(--space-3);
  min-height: 96px;
  resize: vertical;
}
.row {
  display: flex;
  gap: var(--space-2);
}
.ok {
  color: var(--ok);
  margin: 0;
}
.err {
  color: var(--danger);
  margin: 0;
}
</style>
