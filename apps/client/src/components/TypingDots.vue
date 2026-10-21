<template>
  <span class="dots"><i></i><i></i><i></i></span>
</template>

<style scoped>
.dots {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  height: 1.5em;
  padding: 0 2px;
}
.dots i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--fer);
  opacity: 0.4;
  animation: hop 1s ease-in-out infinite;
}
.dots i:nth-child(2) {
  animation-delay: 0.15s;
}
.dots i:nth-child(3) {
  animation-delay: 0.3s;
}
@keyframes hop {
  0%,
  60%,
  100% {
    transform: translateY(0);
    opacity: 0.4;
  }
  30% {
    transform: translateY(-5px);
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .dots i {
    animation: none;
    opacity: 0.8;
  }
}
</style>
