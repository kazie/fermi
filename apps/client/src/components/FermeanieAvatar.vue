<script setup lang="ts">
import { computed, useId } from 'vue'

const props = withDefaults(
  defineProps<{
    size?: number
    speaking?: boolean
    mood?: 'smug' | 'sulk' | 'idle'
    /** Gloating over a steal: bright, bouncing, laughing. */
    gloat?: boolean
    /** Where to look, each axis -1..1. Overrides the idle wandering while set. */
    look?: { x: number; y: number } | null
    /** Inline icon use (next to text): no halo, so it sits quietly in a line. */
    mini?: boolean
  }>(),
  { size: 48, speaking: false, mood: 'idle', gloat: false, look: null, mini: false },
)

// Per-instance ids, and a per-instance phase so several eyes on a page don't move in lockstep.
const id = useId()
const seed = [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
const phase = { '--phase': `${-(seed % 9000)}ms` }
const aim = computed(() => (props.look ? { transform: `translate(${props.look.x * 6}px, ${props.look.y * 5}px)` } : undefined))
</script>

<template>
  <span class="fer" :class="[mood, { speaking, gloat, looking: !!look, mini }]" :style="phase">
    <svg :width="size" :height="size" viewBox="0 0 64 64" role="img" aria-label="FerMEANie">
      <defs>
        <radialGradient :id="`iris-${id}`" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#ffe2d6" />
          <stop offset="35%" stop-color="#ff7a5c" />
          <stop offset="100%" stop-color="#b3151a" />
        </radialGradient>
        <radialGradient :id="`halo-${id}`" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#ff4f4f" stop-opacity="0.7" />
          <stop offset="100%" stop-color="#ff4f4f" stop-opacity="0" />
        </radialGradient>
        <!-- the eye opening: nothing red is drawn outside it, and the lid sits on top -->
        <clipPath :id="`open-${id}`">
          <circle cx="32" cy="32" r="21" />
        </clipPath>
      </defs>
      <circle cx="32" cy="32" r="30" fill="#10141a" stroke="#3a4756" stroke-width="2" />
      <circle cx="32" cy="32" r="22" fill="#1b222b" />
      <g :clip-path="`url(#open-${id})`">
        <g class="light">
          <g class="dim">
            <circle class="halo" cx="32" cy="32" r="21" :fill="`url(#halo-${id})`" />
          </g>
          <g class="drift">
            <g class="aim" :style="aim">
              <g class="pupil">
                <circle class="iris" cx="32" cy="32" r="13" :fill="`url(#iris-${id})`" />
                <circle cx="32" cy="32" r="4.5" fill="#fff4ee" />
              </g>
            </g>
          </g>
        </g>
        <g v-if="mood === 'smug'" class="lid">
          <path d="M8 4 H56 V27 Q32 22 8 27 Z" />
          <path class="edge" d="M8 27 Q32 22 56 27" />
        </g>
        <g v-else-if="mood === 'sulk'" class="lid">
          <path d="M8 4 H56 V31 L8 21 Z" />
          <path class="edge" d="M8 21 L56 31" />
        </g>
        <rect class="blink" x="8" y="8" width="48" height="48" />
      </g>
      <circle cx="32" cy="32" r="22" fill="none" stroke="#2a3440" stroke-width="2" />
    </svg>
  </span>
</template>

<style scoped>
.fer.mini::before {
  display: none;
}
.fer.mini {
  vertical-align: middle;
}
.fer {
  flex: none;
  position: relative;
  display: inline-flex;
  isolation: isolate;
}
/* the red light behind the eye: breathes when idle, pulses when talking */
.fer::before {
  content: '';
  position: absolute;
  inset: -18%;
  z-index: -1;
  border-radius: 50%;
  background: radial-gradient(circle, var(--fer-glow) 0, transparent 68%);
  animation: breathe 3.2s ease-in-out infinite;
  pointer-events: none;
}
.halo {
  transform-origin: 32px 32px;
  animation: breathe 3.2s ease-in-out infinite;
}
.speaking::before,
.speaking .halo {
  animation: talk 0.9s ease-in-out infinite;
}
.speaking .iris {
  transform-origin: 32px 32px;
  animation: iris-talk 0.9s ease-in-out infinite;
}
.sulk::before {
  filter: opacity(0.45);
}
.sulk .dim {
  opacity: 0.45;
}
.pupil {
  transform-origin: 32px 32px;
  transition: transform var(--dur) var(--ease);
}
.sulk .pupil {
  transform: scale(0.8);
}
.gloat .pupil {
  transform: scale(1.18);
}
.gloat::before,
.gloat .halo {
  animation: flare 0.7s ease-in-out infinite;
}
.gloat svg {
  animation: cackle 0.38s ease-in-out infinite;
}
.drift {
  animation: wander 13s ease-in-out infinite;
  animation-delay: var(--phase);
}
.looking .drift {
  animation: none;
}
.aim {
  transition: transform 0.35s var(--ease);
}
.light {
  animation: flicker 9s linear infinite;
  animation-delay: var(--phase);
}
.lid path {
  fill: #232c37;
}
.lid .edge {
  fill: none;
  stroke: #3a4756;
  stroke-width: 3;
  stroke-linecap: round;
}
.blink {
  fill: #232c37;
  transform-origin: 32px 10px;
  transform: scaleY(0);
  animation: blink 6.5s ease-in-out infinite;
  animation-delay: var(--phase);
}

@keyframes breathe {
  0%,
  100% {
    opacity: 0.55;
    transform: scale(0.94);
  }
  50% {
    opacity: 1;
    transform: scale(1.05);
  }
}
@keyframes talk {
  0%,
  100% {
    opacity: 0.75;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.14);
  }
}
@keyframes iris-talk {
  50% {
    transform: scale(1.1);
  }
}
@keyframes flare {
  0%,
  100% {
    opacity: 0.9;
    transform: scale(1.1);
  }
  50% {
    opacity: 1;
    transform: scale(1.3);
  }
}
@keyframes cackle {
  0%,
  100% {
    transform: translateY(0) rotate(0);
  }
  30% {
    transform: translateY(-6%) rotate(-4deg);
  }
  60% {
    transform: translateY(0) rotate(3deg);
  }
}
/* holds, slow drifts and the odd quick dart */
@keyframes wander {
  0%,
  14% {
    transform: translate(0, 0);
  }
  20%,
  34% {
    transform: translate(-4px, 1px);
  }
  36%,
  48% {
    transform: translate(5px, -2px);
  }
  56%,
  66% {
    transform: translate(2px, 3px);
  }
  68%,
  80% {
    transform: translate(-5px, -1px);
  }
  88%,
  100% {
    transform: translate(0, 0);
  }
}
/* one blink, then a double blink */
@keyframes blink {
  0%,
  44%,
  48%,
  88%,
  91%,
  94%,
  100% {
    transform: scaleY(0);
  }
  46%,
  89.5%,
  92.5% {
    transform: scaleY(1);
  }
}
/* a faulty lab light, now and then */
@keyframes flicker {
  0%,
  95%,
  95.6%,
  96.8%,
  100% {
    opacity: 1;
  }
  95.3% {
    opacity: 0.5;
  }
  96.2% {
    opacity: 0.75;
  }
}

@media (prefers-reduced-motion: reduce) {
  .fer::before,
  .halo,
  .speaking::before,
  .speaking .halo,
  .speaking .iris,
  .gloat::before,
  .gloat .halo,
  .gloat svg,
  .drift,
  .light,
  .blink {
    animation: none;
  }
  .fer::before,
  .halo {
    opacity: 0.8;
  }
}
</style>
