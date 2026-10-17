<script setup lang="ts">
import type { Source } from '@fermi/shared'

defineProps<{ sources: Source[] }>()
</script>

<template>
  <ol class="sources">
    <li v-for="s in sources" :key="s.id" class="src">
      <div class="title">
        <strong>{{ s.publisher }}</strong> — <a :href="s.url" target="_blank" rel="noopener noreferrer">{{ s.title }}</a>
      </div>
      <div class="dates muted">
        <span v-if="s.published">published {{ s.published }} · </span>
        <span>accessed {{ s.accessed }}</span>
        ·
        <a :href="s.archiveUrl" target="_blank" rel="noopener noreferrer">archived copy ({{ s.archivedAt.slice(0, 10) }})</a>
      </div>
      <blockquote class="quote">“{{ s.quote }}”</blockquote>
    </li>
  </ol>
</template>

<style scoped>
.sources {
  margin: 0;
  padding-left: 1.2em;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  font-size: var(--text-s);
}
.title {
  overflow-wrap: anywhere;
}
.dates {
  font-size: var(--text-xs);
}
.quote {
  margin: var(--space-1) 0 0;
  padding: var(--space-1) var(--space-3);
  border-left: 3px solid var(--border-strong);
  color: var(--text-dim);
  font-style: italic;
  overflow-wrap: anywhere;
}
</style>
