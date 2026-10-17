import { reactive } from 'vue'
import { sendDispute } from '@/lib/api'
import { playerKey } from '@/lib/storage'
import type { DisputeState } from '@/components/DisputeForm.vue'

/** Dispute state per question for views that show DisputeForms. */
export function useDisputes() {
  const states = reactive<Record<string, { state: DisputeState; error: string }>>({})
  const stateOf = (id: string) => (states[id] ??= { state: 'idle', error: '' })
  async function submit(questionId: string, message: string) {
    const s = stateOf(questionId)
    s.state = 'sending'
    try {
      await sendDispute(questionId, message, playerKey())
      s.state = 'sent'
    } catch (e) {
      s.error = (e as Error).message
      s.state = 'error'
    }
  }
  return { states, stateOf, submit }
}
