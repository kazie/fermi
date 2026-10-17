<script setup lang="ts">
withDefaults(defineProps<{ still?: boolean }>(), { still: false })
</script>

<template>
  <!-- a paper dunce cap: patronising, never cool. Sized by font-size. -->
  <svg class="cap" :class="{ still }" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2.5 L19.5 20 H4.5 Z" fill="#efe7d2" stroke="#8a8170" stroke-width="1" stroke-linejoin="round" />
    <path d="M9.6 8.2 L14.4 8.2 M8.4 11 L15.6 11" stroke="#d9cfb6" stroke-width="0.8" />
    <text x="12" y="18" text-anchor="middle" font-size="7" font-weight="900" font-family="system-ui, sans-serif" fill="#5b5446">D</text>
    <ellipse cx="12" cy="20.2" rx="8.6" ry="1.8" fill="#d9cfb6" stroke="#8a8170" stroke-width="0.8" />
    <circle cx="12" cy="2.6" r="1.6" fill="#ff9a3c" />
  </svg>
</template>

<style scoped>
.cap {
  display: inline-block;
  width: 1.15em;
  height: 1.15em;
  vertical-align: -0.2em;
  transform-origin: 50% 90%;
  animation: wobble 2.8s ease-in-out infinite;
}
.cap.still {
  animation: none;
}
@keyframes wobble {
  0%,
  100% {
    transform: rotate(-7deg);
  }
  50% {
    transform: rotate(6deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .cap {
    animation: none;
  }
}
</style>
