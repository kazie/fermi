<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { REACTIONS, reactionRest, reactionSent, type Reaction } from '@fermi/shared'
import { players } from '@/fixtures/rooms'
import { addReaction, restShowing, type FloatingReaction } from '@/composables/useSocket'
import { useServerNow } from '@/composables/useNow'
import { reactionCues } from '@/lib/sound'
import { playCue } from '@/lib/synth'
import ReactionBar from './ReactionBar.vue'
import ReactionLayer from './ReactionLayer.vue'

// The bar and what it shows, together: tap a reaction and it floats up, from you (the first player). The others can
// react in a burst, or one of them can spam. With sound ticked it plays as the big screen would (stories are otherwise
// silent), with the same limits as the game.
const ps = players(5)
const you = ps[0].id
const now = useServerNow(ref(0))
const timers: ReturnType<typeof setTimeout>[] = []
onUnmounted(() => timers.forEach(clearTimeout))

const reactions = ref<FloatingReaction[]>([])
const sound = ref(false)
let ctx: AudioContext | null = null
const heard = { last: -Infinity }
let id = 0
/** Like the server: when each player last reacted, so a reaction goes out only when their limit allows. */
const sent = ref<Record<string, number[]>>({})
function arrive(playerId: string, kind: Reaction) {
  const t = Date.now()
  if (t < reactionRest(sent.value[playerId] ?? []).until) return
  sent.value = { ...sent.value, [playerId]: reactionSent(sent.value[playerId] ?? [], t) }
  reactions.value = addReaction(reactions.value, { id: ++id, playerId, kind, t })
  if (!sound.value) return
  ctx ??= new AudioContext()
  void ctx.resume()
  for (const e of reactionCues({ playerId, kind }, you, t, heard)) playCue(ctx, ctx.destination, e)
}

const mine = computed(() => sent.value[you] ?? [])
const rest = restShowing(() => ({ from: mine.value.at(-1), ...reactionRest(mine.value) }), now)

function burst() {
  ps.slice(1).forEach((p, i) => REACTIONS.forEach((e, j) => timers.push(setTimeout(() => arrive(p.id, e), (i + j * 4) * 120))))
}
function spam() {
  for (let i = 0; i < 40; i++) timers.push(setTimeout(() => arrive(ps[1].id, REACTIONS[i % REACTIONS.length]), i * 250))
}
</script>

<template>
  <Story title="Reactions (bar + floats)" group="components" :layout="{ type: 'single', iframe: true }">
    <Variant v-for="v in ['Phone', 'Big screen']" :key="v" :title="v">
      <div class="page play">
        <div class="tools">
          <label><input v-model="sound" type="checkbox" /> sound</label>
          <button class="btn" type="button" @click="burst">burst (4 players)</button>
          <button class="btn" type="button" @click="spam">spammer</button>
        </div>
        <ReactionBar class="bar" :rest="rest" @react="(e) => arrive(you, e)" />
        <ReactionLayer :reactions="reactions" :players="ps" :now="now" :big="v === 'Big screen'" />
      </div>
    </Variant>
  </Story>
</template>

<style scoped>
.play {
  min-height: 600px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.tools {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
}
.bar {
  margin-bottom: var(--space-4);
}
</style>
