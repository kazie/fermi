<script setup lang="ts">
import { CUES, playCue } from '@/lib/synth'
import { TICK_SECONDS, type Cue } from '@/lib/sound'

// Not a game screen: a board for listening to every sound effect while designing them (the game plays them itself,
// from useGameSfx). Stories are otherwise silent.
let ctx: AudioContext | null = null
function play(cue: Cue, n?: number) {
  ctx ??= new AudioContext()
  void ctx.resume()
  playCue(ctx, ctx.destination, cue, n)
}
function countdown() {
  TICK_SECONDS.forEach((n, i) => setTimeout(() => play('tick', n), i * 1000))
  setTimeout(() => play('timesUp'), TICK_SECONDS.length * 1000)
}
</script>

<template>
  <Story title="Sound effects" group="components">
    <Variant title="Soundboard">
      <div class="page board">
        <button v-for="c in CUES.filter((c) => c !== 'tenLeft')" :key="c" class="btn" type="button" @click="play(c, 3)">{{ c }}</button>
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
