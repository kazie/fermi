<script setup lang="ts">
import { ref, useId } from 'vue'
import { CALC_TIPS, HOW_TO_PLAY, S } from '@/lib/strings'
import FermeanieAvatar from './FermeanieAvatar.vue'
import FermeanieSays from './FermeanieSays.vue'

/** The start page: host here, host on a big screen, or join with a code. Pure; the view does the API calls. */
withDefaults(defineProps<{ busy?: boolean; error?: string }>(), { busy: false, error: '' })
const emit = defineEmits<{ host: []; hostScreen: []; join: [string] }>()
const code = ref('')
const codeId = useId()
</script>

<template>
  <div class="page home">
    <section class="hero">
      <div class="hero-eye" aria-hidden="true"><FermeanieAvatar :size="112" mood="smug" /></div>
      <h1>Fermi</h1>
      <p class="tagline">{{ S.tagline }}</p>
    </section>

    <section class="actions card">
      <div class="hosts">
        <div class="host-opt">
          <button class="btn btn-primary btn-block big" type="button" :disabled="busy" @click="emit('host')">{{ S.hostGame }}</button>
          <span class="muted hint">{{ S.hostGameHint }}</span>
        </div>
        <div class="host-opt">
          <button class="btn btn-block big tvbtn" type="button" :disabled="busy" @click="emit('hostScreen')">📺 {{ S.hostScreen }}</button>
          <span class="muted hint">{{ S.hostScreenHint }}</span>
        </div>
      </div>
      <div class="or muted">or join one</div>
      <form class="join" @submit.prevent="emit('join', code)">
        <label class="sr-only" :for="codeId">{{ S.roomCodePlaceholder }}</label>
        <input
          :id="codeId"
          v-model="code"
          class="input mono code"
          maxlength="4"
          :placeholder="S.roomCodePlaceholder"
          autocapitalize="characters"
          autocomplete="off"
          spellcheck="false"
        />
        <button class="btn" type="submit">{{ S.joinGame }}</button>
      </form>
      <p v-if="error" class="err">{{ error }}</p>
    </section>

    <FermeanieSays
      mood="smug"
      text="Hello, test subjects. Each of you will guess badly. I will average your guesses and be right. This is called science. You may call it humiliation."
    />

    <div class="cols">
      <section class="card">
        <h2 class="eyebrow">How it works</h2>
        <ol class="how">
          <li v-for="h in HOW_TO_PLAY" :key="h">{{ h }}</li>
        </ol>
      </section>
      <section class="card">
        <h2 class="eyebrow">The answer block</h2>
        <dl class="tips">
          <template v-for="[c, d] in CALC_TIPS" :key="c">
            <dt class="mono">{{ c }}</dt>
            <dd class="muted">{{ d }}</dd>
          </template>
        </dl>
      </section>
    </div>
  </div>
</template>

<style scoped>
.hosts {
  display: grid;
  gap: var(--space-3);
}
.host-opt {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.hint {
  font-size: var(--text-s);
  text-align: center;
}
.tvbtn {
  border-color: var(--accent);
}
@media (min-width: 640px) {
  .hosts {
    grid-template-columns: 1fr 1fr;
  }
}
.home {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  max-width: 760px;
}
.hero {
  position: relative;
  padding-right: 128px;
}
.hero-eye {
  position: absolute;
  top: 0;
  right: 0;
}
@media (max-width: 480px) {
  .hero {
    padding-right: 84px;
  }
  .hero-eye :deep(svg) {
    width: 76px;
    height: 76px;
  }
}
.hero h1 {
  font-size: clamp(2.6rem, 10vw, 4.5rem);
  letter-spacing: -0.03em;
}
.tagline {
  color: var(--text-dim);
  font-size: var(--text-l);
  margin: var(--space-2) 0 0;
}
.actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.big {
  min-height: 56px;
  font-size: var(--text-l);
}
.or {
  text-align: center;
  font-size: var(--text-s);
}
.join {
  display: flex;
  gap: var(--space-2);
}
.code {
  text-transform: uppercase;
  letter-spacing: 0.2em;
  font-size: var(--text-l);
}
.err {
  color: var(--danger);
  margin: 0;
}
.cols {
  display: grid;
  gap: var(--space-4);
}
.how {
  margin: var(--space-2) 0 0;
  padding-left: 1.2em;
  color: var(--text-dim);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.tips {
  margin: var(--space-2) 0 0;
  font-size: var(--text-s);
}
.tips dt {
  color: var(--syn-num);
}
.tips dd {
  margin: 0 0 var(--space-2);
}
@media (min-width: 720px) {
  .cols {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
