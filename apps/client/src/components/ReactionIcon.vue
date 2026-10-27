<script setup lang="ts">
import { computed } from 'vue'
import type { Reaction } from '@fermi/shared'

/**
 * A reaction, drawn: the same on every device and crisp at any size (sized by font-size, like DunceCap). Flat fills
 * from the game's palette with dark outlines, like the avatars.
 *
 * `play` brings it to life from the inside: the dart lands and the board keeps ringing, the flame licks, the lid
 * flies higher and the pupils dilate, the rocket launches, the jaw chatters, the brain pulses with thoughts. Each move
 * is an entrance (a landing, a pop: once, on a 3 s timeline, a reaction's float) or ambient (it loops). `play` sets how
 * many times each kind runs: `float` an entrance once and ambient forever; `once` (a tap on the bar) every move a
 * single time, then back to the still pose; `loop` (a showcase) everything forever. All of it runs on the clock `age`
 * (ms since it started), so a remount or a story looks the same.
 *
 * Nothing animated sits under an SVG `transform` attribute: some browsers then only repaint it when something else
 * changes (a hover). Where a part turns about a point, the point is a px origin in the 48-unit box (`view-box`).
 */
export type ReactionPlay = 'float' | 'once' | 'loop'
const props = defineProps<{ kind: Reaction; play?: ReactionPlay; age?: number }>()

/** Every animation's delay starts from this: the age as a negative delay. */
const clock = computed(() => ({ '--d': `${-(props.age ?? 0)}ms` }))

const INK = '#0b0e13'
/** Mind blown's puff and the brain's lobes: circles outlined, then filled over to leave only the outer edge. */
const PUFF = [
  [22, 12, 5],
  [28, 8.5, 6],
  [34, 12, 5],
  [28, 14, 5],
]
const LOBES = [
  [15, 20, 8],
  [24, 16, 9],
  [33, 20, 8],
  [14, 29, 7],
  [24, 30, 8],
  [34, 29, 7],
]
/** The brain's folds: drawn once in a darker pink, and again as thoughts running along them. */
const FOLDS = ['M24 8 C22 14 26 20 24 26 C22 32 25 35 24 38', 'M10 19 q4 -4 8 0', 'M30 17 q4 -3 8 1', 'M9 29 q4 3 8 -1', 'M30 30 q4 3 8 -2']
const SHAFT = 'M22.5 25.5 L35 13'
const PI = 'M20.5 2 h6 M22 2 v5 M25 2 q0 4.5 1.6 5'
/** A four-point sparkle from its top point (x, y), `s` across its short arms. */
function sparkle(x: number, y: number, s: number) {
  const a = +s.toFixed(2)
  const b = +(s * 2.33).toFixed(2)
  return `M${x} ${y} l${a} ${b} l${b} ${a} l${-b} ${a} l${-a} ${b} l${-a} ${-b} l${-b} ${-a} l${b} ${-a} Z`
}
</script>

<template>
  <svg
    class="ri"
    :class="[kind, { on: play, once: play === 'once', loop: play === 'loop' }]"
    :style="clock"
    viewBox="0 0 48 48"
    aria-hidden="true"
  >
    <!-- `--o`: an element's offset on the clock, so a set of them runs out of step -->
    <g :stroke="INK" stroke-linejoin="round" stroke-linecap="round">
      <template v-if="kind === 'bullseye'">
        <circle class="ripple" cx="22" cy="26" r="17" fill="none" stroke="#ff9a3c" stroke-width="2.5" />
        <circle class="ripple" cx="22" cy="26" r="17" fill="none" stroke="#ffd166" stroke-width="2" style="--o: 0.25s" />
        <circle class="pulse" cx="22" cy="26" r="17" fill="none" stroke="#ff9a3c" stroke-width="2" />
        <g class="board">
          <circle cx="22" cy="26" r="17" fill="#efe7d2" stroke-width="2.5" />
          <circle cx="22" cy="26" r="12" fill="#ff9a3c" stroke-width="1.6" />
          <circle cx="22" cy="26" r="7.5" fill="#efe7d2" stroke-width="1.6" />
          <circle class="bull" cx="22" cy="26" r="3.5" fill="#ff4f4f" stroke-width="1.6" />
        </g>
        <g class="dart">
          <g class="quiver">
            <path :d="SHAFT" stroke-width="4.4" />
            <path :d="SHAFT" stroke="#e8edf2" stroke-width="1.8" />
            <g class="flights">
              <path d="M34 14 L35 5.5 L38.5 10.5 Z" fill="#4fb3ff" stroke-width="1.5" />
              <path d="M34 14 L42.5 13 L37.5 9.5 Z" fill="#4fb3ff" stroke-width="1.5" />
            </g>
          </g>
        </g>
      </template>

      <template v-else-if="kind === 'fire'">
        <g class="flame">
          <path
            class="tongue"
            d="M24 3 C30 12 38 17 38 29 A14 14 0 0 1 10 29 C10 22 14 18 17 13 C18 18 20 20 22 21 C21 14 21 8 24 3 Z"
            fill="#ff4f4f"
            stroke-width="2.5"
          />
          <path
            class="tongue mid"
            d="M24 16 C28 22 32 25 32 32 A8 8 0 0 1 16 32 C16 27 19 25 21 21 C22 24 23 25 24 26 C23 22 23 19 24 16 Z"
            fill="#ff9a3c"
            stroke="none"
            style="--o: -0.1s"
          />
          <path
            class="tongue core"
            d="M24 27 C27 31 28 33 28 36 A4 4 0 0 1 20 36 C20 33 22 31 24 27 Z"
            fill="#ffd166"
            stroke="none"
            style="--o: -0.2s"
          />
        </g>
        <g fill="#ffd166" stroke-width="1">
          <circle class="spark" cx="16" cy="8" r="1.7" />
          <circle class="spark" cx="30" cy="5" r="1.4" style="--o: -0.3s" />
          <circle class="spark" cx="34" cy="12" r="1.5" style="--o: -0.6s" />
        </g>
      </template>

      <template v-else-if="kind === 'mindblown'">
        <g fill="#b4bfcb" stroke="none">
          <circle class="smoke" cx="21" cy="24" r="2.6" style="--o: 0.15s" />
          <circle class="smoke" cx="27" cy="24" r="2.2" style="--o: 0.5s" />
          <circle class="smoke" cx="24" cy="24" r="3" style="--o: 0.85s" />
        </g>
        <g class="head">
          <ellipse cx="24" cy="27" rx="12.5" ry="4.5" :fill="INK" stroke-width="1.6" />
          <path
            d="M9 28 L13 25.5 L17 28.5 L21 25.5 L25 28.5 L29 25.5 L33 28.5 L37 25.5 L39 28 A15 14 0 0 1 9 28 Z"
            fill="#7cc7ff"
            stroke-width="2.5"
          />
          <g class="eyes">
            <circle cx="18.5" cy="33.4" r="3.3" fill="#fff" stroke-width="1.6" />
            <circle cx="29.5" cy="33.4" r="3.3" fill="#fff" stroke-width="1.6" />
            <g :fill="INK" stroke="none">
              <circle class="pupil" cx="18.5" cy="33.4" r="1.4" />
              <circle class="pupil" cx="29.5" cy="33.4" r="1.4" />
            </g>
          </g>
          <ellipse class="mouth" cx="24" cy="38.9" rx="1.8" ry="2" :fill="INK" stroke="none" />
        </g>
        <g class="lid">
          <path
            class="hover"
            d="M9 28 L13 25.5 L17 28.5 L21 25.5 L25 28.5 L29 25.5 L33 28.5 L37 25.5 L39 28 A15 13 0 0 0 9 28 Z"
            fill="#9fd6ff"
            stroke-width="2.5"
          />
        </g>
        <g class="puff">
          <g class="billow">
            <circle v-for="([cx, cy, r], i) in PUFF" :key="`o${i}`" :cx="cx" :cy="cy" :r="r" stroke-width="4" />
            <circle v-for="([cx, cy, r], i) in PUFF" :key="`f${i}`" :cx="cx" :cy="cy" :r="r" fill="#efe7d2" stroke="none" />
            <text
              x="27.5"
              y="14"
              text-anchor="middle"
              font-size="7.5"
              font-weight="900"
              font-family="system-ui, sans-serif"
              :fill="INK"
              stroke="none"
            >
              <!-- each in its own tspan: no space between them -->
              <tspan>10</tspan>
              <tspan dy="-3" font-size="5">n</tspan>
            </text>
          </g>
        </g>
        <g fill="#ffd166" stroke-width="1.2">
          <path class="star" :d="sparkle(7, 9, 1.2)" />
          <path class="star" :d="sparkle(42, 17, 1)" style="--o: -0.03s; --o2: -0.2s" />
          <path class="star" :d="sparkle(14, 1, 0.8)" style="--o: 0.06s; --o2: -0.4s" />
          <path class="star" :d="sparkle(44, 4, 0.8)" style="--o: 0.1s; --o2: -0.1s" />
        </g>
      </template>

      <template v-else-if="kind === 'rocket'">
        <!-- a rocket leaning 40° up-right, drawn in place (no transforms): forward is (0.643, -0.766) -->
        <g stroke="#b4bfcb" stroke-width="1.6">
          <path class="rk-line" d="M23.7 8 L19.2 13.4" style="--o: 0.3s" />
          <path class="rk-line" d="M41.7 19.2 L37.2 24.6" style="--o: 0.47s" />
          <path class="rk-line" d="M17.1 18.2 L13.9 22" style="--o: 0.63s" />
        </g>
        <g fill="#b4bfcb" stroke-width="1.2">
          <circle class="rk-puff" cx="12.5" cy="37.8" r="3" />
          <circle class="rk-puff later" cx="10.6" cy="38.6" r="2.4" style="--o: -0.2s" />
          <circle class="rk-puff later" cx="13.4" cy="39.6" r="2.6" style="--o: -0.4s" />
        </g>
        <g fill="#ffd166" stroke-width="1">
          <path class="rk-twinkle" :d="sparkle(6, 6, 0.9)" />
          <path class="rk-twinkle" :d="sparkle(43, 34, 0.9)" style="--o: -0.35s" />
        </g>
        <g class="rk-ship">
          <g class="rk-thrust" stroke="none">
            <path class="rk-flame" d="M15.2 28.3 Q10.9 32.6 10.5 40.1 Q17.8 38.3 21.3 33.4 Z" fill="#ff9a3c" />
            <path class="rk-flame inner" d="M16.6 29.4 Q13.8 32.3 13.1 37 Q17.6 35.5 19.9 32.3 Z" fill="#ffd166" style="--o: -0.05s" />
          </g>
          <path d="M21.8 16.9 L13 20 L10.5 23 L16.5 24.2 Z" fill="#ff4f4f" stroke-width="2" />
          <path d="M31.4 24.9 L29.9 34.1 L27.3 37.2 L25.1 31.4 Z" fill="#ff4f4f" stroke-width="2" />
          <path d="M17.5 26.3 L22.9 30.8 L21.7 33.8 L14.8 28 Z" fill="#8a96a3" stroke-width="2" />
          <path
            d="M37.5 7.9 C38.8 14.2 35.4 20.5 30.3 26.6 L24.4 32.1 L16 25 L20.3 18.3 C25.5 12.1 31.1 7.7 37.5 7.9 Z"
            fill="#efe7d2"
            stroke-width="2.5"
          />
          <path d="M37.5 7.9 C38.4 12.1 37.8 14.7 37 16.6 Q32 14.5 29 9.9 C30.8 8.8 33.2 7.8 37.5 7.9 Z" fill="#ff4f4f" stroke-width="2" />
          <circle cx="28.5" cy="18.6" r="3.4" fill="#4fb3ff" stroke-width="2" />
          <circle cx="27.4" cy="17.4" r="1" fill="#fff" stroke="none" />
        </g>
      </template>

      <template v-else-if="kind === 'dead'">
        <path class="tear" d="M11 20 q-3.6 5 0 7.2 q3.6 -2.2 0 -7.2 Z" fill="#4fb3ff" stroke-width="1.4" />
        <path class="tear" d="M37 20 q-3.6 5 0 7.2 q3.6 -2.2 0 -7.2 Z" fill="#4fb3ff" stroke-width="1.4" style="--o: -0.4s" />
        <rect x="17" y="29" width="14" height="6" :fill="INK" stroke="none" />
        <g class="jaw">
          <rect x="15.5" y="31" width="17" height="8" rx="3.5" fill="#efe7d2" stroke-width="2.3" />
          <path d="M20 31 v4 M24 31 v4 M28 31 v4" stroke-width="1.4" />
        </g>
        <g class="cranium">
          <path d="M12 24 A13 13 0 1 1 36 24 L34 31 L14 31 Z" fill="#efe7d2" stroke-width="2.5" />
          <path d="M14.5 16.5 L20 20 L14.5 23.5 M33.5 16.5 L28 20 L33.5 23.5" fill="none" stroke-width="2.8" />
          <path d="M24 23.5 l-2 3.5 h4 Z" :fill="INK" stroke-width="1" />
          <path d="M20 31 v-2.6 M24 31 v-2.6 M28 31 v-2.6" stroke-width="1.4" />
        </g>
      </template>

      <template v-else>
        <g class="lobes">
          <circle v-for="([cx, cy, r], i) in LOBES" :key="`o${i}`" :cx="cx" :cy="cy" :r="r" stroke-width="5" />
          <circle v-for="([cx, cy, r], i) in LOBES" :key="`f${i}`" :cx="cx" :cy="cy" :r="r" fill="#f0abfc" stroke="none" />
          <g fill="none" stroke-width="1.6">
            <path v-for="d in FOLDS" :key="d" :d="d" stroke="#a855b5" />
            <path
              v-for="(d, i) in FOLDS"
              :key="`t${d}`"
              class="thought"
              :d="d"
              pathLength="30"
              stroke="#fff"
              :style="{ '--o': i % 2 ? '-0.45s' : '0s' }"
            />
          </g>
          <ellipse cx="17" cy="13" rx="2.6" ry="1.5" fill="#fff" stroke="none" opacity="0.8" />
        </g>
        <g class="idea" fill="none">
          <path :d="PI" stroke-width="4" />
          <path :d="PI" stroke="#ffd166" stroke-width="1.8" />
        </g>
        <g fill="#ffd166" stroke-width="1">
          <circle class="idea" cx="8" cy="9" r="1.7" style="--o: -0.3s" />
          <circle class="idea" cx="40" cy="9" r="1.5" style="--o: -0.6s" />
          <circle class="idea" cx="43" cy="21" r="1.3" style="--o: -0.9s" />
        </g>
      </template>
    </g>
  </svg>
</template>

<style scoped>
/*
 * How many times each move runs, and whether it holds its first and last frames, by `play` (iteration count and fill
 * mode, in either order in the shorthand): an entrance once, ambient forever; a tap each once, back to still after.
 */
.ri {
  display: inline-block;
  width: 1em;
  height: 1em;
  overflow: visible;
  --entrance: 1 both;
  --ambient: infinite both;
}
.once {
  --ambient: 1 none;
  --entrance: 1 none;
}
.loop {
  /* the entrances repeat every 3 s too: each starts where it ends, so the loop is seamless */
  --entrance: infinite both;
}
.ri * {
  transform-box: fill-box;
  transform-origin: 50% 50%;
}

/* --- bullseye: the dart flies in, thunks and quivers; then the board keeps ringing and the bull glows --- */
.ripple,
.pulse {
  opacity: 0;
}
.dart,
.quiver {
  transform-origin: 0% 100%;
}
.flights {
  transform-box: view-box;
  transform-origin: 35px 13px;
}
.on .dart {
  animation: dart-in 3s cubic-bezier(0.5, 0, 1, 0.6) var(--d) var(--entrance);
}
.on .quiver {
  animation: quiver 3s linear var(--d) var(--entrance);
}
.on .board {
  animation: thud 3s ease-out var(--d) var(--entrance);
}
.on .ripple {
  animation: ring 3s ease-out calc(var(--d) + var(--o, 0s)) var(--entrance);
}
/* after the landing (0.6 s in): a ring every 0.9 s, the bull glowing, the flights twitching */
.on .pulse {
  animation: pulse 0.9s ease-out calc(var(--d) + 0.6s) var(--ambient);
}
.on .bull {
  animation: glow 0.45s ease-in-out calc(var(--d) + 0.6s) alternate var(--ambient);
}
.on .flights {
  animation: twitch 0.22s ease-in-out calc(var(--d) + 0.6s) alternate var(--ambient);
}
@keyframes dart-in {
  0% {
    transform: translate(18px, -18px);
    opacity: 0;
  }
  2% {
    opacity: 1;
  }
  7%,
  100% {
    transform: none;
  }
}
@keyframes quiver {
  0%,
  7% {
    transform: none;
  }
  9% {
    transform: rotate(-10deg);
  }
  11% {
    transform: rotate(7deg);
  }
  13% {
    transform: rotate(-5deg);
  }
  15% {
    transform: rotate(3deg);
  }
  17% {
    transform: rotate(-1.5deg);
  }
  19%,
  100% {
    transform: none;
  }
}
@keyframes thud {
  0%,
  7% {
    transform: none;
  }
  9% {
    transform: scale(0.92);
  }
  13%,
  100% {
    transform: none;
  }
}
@keyframes ring {
  0%,
  7% {
    transform: none;
    opacity: 0;
  }
  8% {
    opacity: 0.9;
  }
  30%,
  100% {
    transform: scale(1.5);
    opacity: 0;
  }
}
@keyframes pulse {
  from {
    transform: none;
    opacity: 0.7;
  }
  to {
    transform: scale(1.35);
    opacity: 0;
  }
}
@keyframes glow {
  from {
    transform: none;
    fill: #ff4f4f;
  }
  to {
    transform: scale(1.35);
    fill: #ffd166;
  }
}
@keyframes twitch {
  from {
    transform: rotate(-5deg);
  }
  to {
    transform: rotate(5deg);
  }
}

/* --- fire: it flares, three tongues lick out of step and sparks fly off --- */
.flame,
.tongue {
  transform-origin: 50% 100%;
}
.on .flame {
  animation: catch 3s ease-out var(--d) var(--entrance);
}
.on .tongue {
  animation: lick 0.5s ease-in-out calc(var(--d) + var(--o, 0s)) alternate var(--ambient);
}
.on .mid {
  animation-duration: 0.37s;
  animation-direction: alternate-reverse;
}
.on .core {
  animation-duration: 0.29s;
}
.on .spark {
  animation: spark 0.9s ease-out calc(var(--d) + var(--o, 0s)) var(--ambient);
}
@keyframes catch {
  0%,
  100% {
    transform: none;
  }
  3% {
    transform: scale(0.8);
  }
  8% {
    transform: scale(1.18);
  }
  14% {
    transform: none;
  }
}
@keyframes lick {
  from {
    transform: scale(1.03, 0.96) skewX(2deg);
  }
  to {
    transform: scale(0.96, 1.07) skewX(-3deg);
  }
}
@keyframes spark {
  from {
    transform: none;
    opacity: 1;
  }
  to {
    transform: translate(2px, -10px) scale(0.4);
    opacity: 0;
  }
}

/* --- mind blown: the head squashes, the lid shoots up in a puff of powers of ten; then the lid hovers, the pupils
   dilate, smoke curls out and the puff billows --- */
.lid {
  transform-origin: 50% 100%;
  transform: translate(-6px, -5px) rotate(-22deg);
}
.puff {
  transform-origin: 30% 100%;
}
.smoke {
  opacity: 0;
}
.on .head {
  animation: strain 3s linear var(--d) var(--entrance);
}
.on .lid {
  animation: lid 3s ease-out var(--d) var(--entrance);
}
.on .hover {
  animation: hover 0.7s ease-in-out calc(var(--d) + 0.3s) alternate var(--ambient);
}
.on .puff {
  animation: puff 3s ease-out var(--d) var(--entrance);
}
.on .billow {
  animation: billow 0.9s ease-in-out calc(var(--d) + 0.45s) alternate var(--ambient);
}
.on .eyes {
  animation: eyes 3s ease-out var(--d) var(--entrance);
}
.on .pupil {
  animation: dilate 0.9s ease-in-out var(--d) alternate var(--ambient);
}
.on .mouth {
  animation: gasp 0.5s ease-in-out calc(var(--d) + 0.15s) alternate var(--ambient);
}
.on .smoke {
  animation: smoke 1.1s ease-out calc(var(--d) + var(--o, 0s)) var(--ambient);
}
.on .star {
  animation:
    star-in 3s ease-out calc(var(--d) + var(--o, 0s)) var(--entrance),
    twinkle 0.6s ease-in-out calc(var(--d) + var(--o2, 0s)) alternate var(--ambient);
}
@keyframes strain {
  0%,
  10%,
  100% {
    transform: none;
  }
  3% {
    transform: scale(1.06, 0.92);
  }
  6% {
    transform: scale(0.97, 1.04);
  }
}
@keyframes lid {
  0% {
    transform: translate(-6px, -5px) rotate(-22deg);
  }
  6% {
    transform: translate(-9px, -17px) rotate(-38deg);
  }
  14% {
    transform: translate(-8px, -13px) rotate(-30deg);
  }
  70% {
    transform: translate(-7px, -10px) rotate(-26deg);
  }
  100% {
    transform: translate(-6px, -5px) rotate(-22deg);
  }
}
@keyframes hover {
  from {
    transform: translateY(0) rotate(-4deg);
  }
  to {
    transform: translateY(-2.5px) rotate(5deg);
  }
}
@keyframes puff {
  0%,
  100% {
    transform: none;
  }
  2% {
    transform: scale(0.75);
  }
  8% {
    transform: scale(1.25);
  }
  16% {
    transform: none;
  }
}
@keyframes billow {
  from {
    transform: scale(0.95, 1.04) rotate(-3deg);
  }
  to {
    transform: scale(1.06, 0.96) rotate(3deg) translateY(-1.5px);
  }
}
@keyframes eyes {
  0%,
  100% {
    transform: none;
  }
  4% {
    transform: scale(1.35);
  }
  14% {
    transform: none;
  }
}
@keyframes dilate {
  from {
    transform: scale(0.7);
  }
  to {
    transform: scale(1.2);
  }
}
@keyframes gasp {
  from {
    transform: scale(0.8, 0.7);
  }
  to {
    transform: scale(1.15, 1.25);
  }
}
@keyframes smoke {
  from {
    transform: scale(0.4);
    opacity: 0.9;
  }
  to {
    transform: translate(3px, -16px) scale(1.6);
    opacity: 0;
  }
}
@keyframes star-in {
  0%,
  100% {
    scale: 1;
  }
  4% {
    scale: 0.3;
  }
  10% {
    scale: 1.5;
  }
  16% {
    scale: 1;
  }
}
@keyframes twinkle {
  from {
    transform: rotate(-20deg) scale(0.8);
  }
  to {
    transform: rotate(20deg) scale(1.15);
  }
}

/* --- rocket: it rumbles, launches along its axis and cruises, flame flickering, smoke puffing out behind and speed
   lines streaming past; it eases back at the end, so a loop doesn't jump --- */
.rk-thrust,
.rk-flame {
  transform-box: view-box;
  transform-origin: 18.2px 30.9px;
}
.rk-line,
.rk-puff.later {
  opacity: 0;
}
.on .rk-ship {
  animation: launch 3s ease-out var(--d) var(--entrance);
}
.on .rk-thrust {
  animation: thrust 3s ease-out var(--d) var(--entrance);
}
.on .rk-flame {
  animation: flicker 0.12s ease-in-out calc(var(--d) + var(--o, 0s)) alternate var(--ambient);
}
.on .rk-flame.inner {
  animation-duration: 0.09s;
  animation-direction: alternate-reverse;
}
.on .rk-puff {
  animation: exhaust 0.6s ease-out calc(var(--d) + var(--o, 0s)) var(--ambient);
}
.on .rk-line {
  animation: streak 0.5s linear calc(var(--d) + var(--o, 0s)) var(--ambient);
}
.on .rk-twinkle {
  animation: twinkle 0.7s ease-in-out calc(var(--d) + var(--o, 0s)) alternate var(--ambient);
}
@keyframes launch {
  0%,
  10%,
  100% {
    transform: none;
  }
  2% {
    transform: translate(-0.8px, 0.5px);
  }
  4% {
    transform: translate(0.8px, -0.4px);
  }
  6% {
    transform: translate(-0.7px, -0.5px);
  }
  8% {
    transform: translate(0.7px, 0.5px);
  }
  20% {
    transform: translate(5.8px, -6.9px);
  }
  28% {
    transform: translate(4.5px, -5.4px);
  }
  45% {
    transform: translate(5.1px, -6.1px);
  }
  62% {
    transform: translate(4.3px, -5.1px);
  }
  78% {
    transform: translate(4.8px, -5.7px);
  }
}
@keyframes thrust {
  0%,
  100% {
    transform: none;
  }
  10% {
    transform: scale(0.9);
  }
  16% {
    transform: scale(1.6);
  }
  30%,
  80% {
    transform: scale(1.25);
  }
}
@keyframes flicker {
  from {
    transform: scale(0.85);
  }
  to {
    transform: scale(1.12);
  }
}
@keyframes exhaust {
  from {
    transform: scale(0.4);
    opacity: 0.9;
  }
  to {
    transform: translate(-6px, 6px) scale(1.5);
    opacity: 0;
  }
}
@keyframes streak {
  from {
    transform: translate(3px, -3.6px);
    opacity: 0;
  }
  30% {
    opacity: 0.9;
  }
  to {
    transform: translate(-7px, 8.4px);
    opacity: 0;
  }
}

/* --- dead: laughing, jaw chattering and tears flying --- */
.jaw {
  transform: translateY(1.5px);
}
.cranium {
  transform-origin: 50% 100%;
}
.tear {
  transform-origin: 50% 0%;
}
.on .jaw {
  animation: chatter 0.15s ease-in-out var(--d) alternate var(--ambient);
}
.on .cranium {
  animation: cackle 0.3s ease-in-out var(--d) alternate var(--ambient);
}
.on .tear {
  animation: tear 0.8s ease-in calc(var(--d) + var(--o, 0s)) var(--ambient);
}
@keyframes chatter {
  from {
    transform: none;
  }
  to {
    transform: translateY(3.5px);
  }
}
@keyframes cackle {
  from {
    transform: rotate(-4deg) translateY(0.5px);
  }
  to {
    transform: rotate(4deg) translateY(-1px);
  }
}
@keyframes tear {
  from {
    transform: scale(0.6);
    opacity: 0;
  }
  20% {
    opacity: 1;
  }
  to {
    transform: translateY(12px) scale(1);
    opacity: 0;
  }
}

/* --- brain: it beats, thoughts run along its folds, and ideas (a π, sparks) pop off the top --- */
.thought {
  stroke-dasharray: 4 26;
  stroke-dashoffset: 30;
  opacity: 0;
}
.on .lobes {
  animation: beat 1.1s ease-out var(--d) var(--ambient);
}
.on .thought {
  animation: think 0.9s linear calc(var(--d) + var(--o, 0s)) var(--ambient);
}
.on .idea {
  animation: idea 1.2s ease-out calc(var(--d) + var(--o, 0s)) var(--ambient);
}
@keyframes beat {
  0%,
  28%,
  70%,
  100% {
    transform: none;
  }
  14% {
    transform: scale(1.08);
  }
  42% {
    transform: scale(1.05);
  }
}
@keyframes think {
  0% {
    stroke-dashoffset: 30;
    opacity: 0.9;
  }
  100% {
    stroke-dashoffset: 0;
    opacity: 0.9;
  }
}
@keyframes idea {
  0% {
    transform: scale(0);
    opacity: 0;
  }
  20% {
    transform: scale(1.2);
    opacity: 1;
  }
  100% {
    transform: translateY(-8px) scale(0.8);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ri * {
    animation: none !important;
  }
}
</style>
