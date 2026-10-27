<script setup lang="ts">
import { CUES, playCue } from '@/lib/synth'
import { REACTIONS } from '@fermi/shared'
import { TICK_SECONDS, type Cue, type CueEvent } from '@/lib/sound'

// Not a game screen: a board for listening to every sound effect while designing them (the game plays them itself,
// from useGameSfx). Stories are otherwise silent.
let ctx: AudioContext | null = null
function play(e: CueEvent) {
  ctx ??= new AudioContext()
  void ctx.resume()
  playCue(ctx, ctx.destination, e)
}
/** A cue on its own (a tick with 3 s left; reactions have their own button). */
const playOne = (cue: Cue) => play(cue === 'tick' ? { cue, n: 3 } : ({ cue } as CueEvent))
/** Each reaction's sound in turn. */
let next = 0
const nextReaction = () => play({ cue: 'reaction', kind: REACTIONS[next++ % REACTIONS.length] })
function countdown() {
  TICK_SECONDS.forEach((n, i) => setTimeout(() => play({ cue: 'tick', n }), i * 1000))
  setTimeout(() => play({ cue: 'timesUp' }), TICK_SECONDS.length * 1000)
}
</script>

<template>
  <Story title="Sound effects" group="components">
    <Variant title="Soundboard">
      <div class="page board">
        <button v-for="c in CUES.filter((c) => c !== 'tenLeft' && c !== 'reaction')" :key="c" class="btn" type="button" @click="playOne(c)">
          {{ c }}
        </button>
        <button class="btn" type="button" @click="nextReaction">reaction (each in turn)</button>
        <button class="btn btn-primary" type="button" @click="countdown">countdown → time's up</button>
      </div>
    </Variant>
  </Story>
</template>

<style scoped>
.board {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
</style>
