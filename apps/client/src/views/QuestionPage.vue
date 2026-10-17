<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { RevealedQuestion } from '@fermi/shared'
import { api } from '@/lib/api'
import AppHeader from '@/components/AppHeader.vue'
import QuestionDetails from '@/components/QuestionDetails.vue'
import { useDisputes } from '@/composables/useDispute'

const props = defineProps<{ id: string }>()
const data = ref<{ question: RevealedQuestion; status: string; flags: string[] } | null>(null)
const error = ref('')
const disputes = useDisputes()

onMounted(async () => {
  try {
    data.value = await api(`/api/questions/${props.id}`)
  } catch (e) {
    error.value = (e as Error).message
  }
})
</script>

<template>
  <AppHeader />
  <main class="page">
    <p v-if="error" class="err">{{ error }}</p>
    <p v-else-if="!data" class="muted">Loading…</p>
    <QuestionDetails
      v-else
      :question="data.question"
      :status="data.status"
      :flags="data.flags"
      :dispute="disputes.stateOf(data.question.id)"
      @dispute="(m: string) => disputes.submit(data!.question.id, m)"
    />
  </main>
</template>

<style scoped>
.err {
  color: var(--danger);
}
</style>
