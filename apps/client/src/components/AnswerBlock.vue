<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { evaluateSheet, formatApprox, formatNumber, LIMITS } from '@fermi/shared'
import { lineAt, lineStart, segments } from '@/lib/highlight'
import { S } from '@/lib/strings'
import ErrorDot from './ErrorDot.vue'
import HelperKeys from './HelperKeys.vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    locked?: boolean
    unit?: string
    /** Show the lock-in button (off for the practice pad). */
    lockable?: boolean
    autofocus?: boolean
    minRows?: number
    placeholder?: string
  }>(),
  {
    locked: false,
    unit: '',
    lockable: true,
    autofocus: false,
    minRows: 4,
    placeholder: 'people = 8 billion\nshare = 30%\npeople * share',
  },
)
const emit = defineEmits<{ 'update:modelValue': [string]; lock: []; unlock: []; focus: []; blur: [] }>()

const ta = ref<HTMLTextAreaElement>()
const scrollX = ref(0)
const focused = ref(false)
const caretLine = ref(0)

const sheet = computed(() => evaluateSheet(props.modelValue))
const rawLines = computed(() => props.modelValue.split('\n'))
const rows = computed(() => Math.max(props.minRows, rawLines.value.length))
const tooManyLines = computed(() => rawLines.value.length > LIMITS.maxLines)

const firstErrorLine = computed(() => sheet.value.lines.find((l) => l.error)?.index ?? null)
/** The line the status bar talks about: the caret's line while typing, otherwise the first problem. */
const statusLine = computed(() => (focused.value ? caretLine.value : (firstErrorLine.value ?? sheet.value.answerLine ?? 0)))
const active = computed(() => sheet.value.lines[statusLine.value])
const answer = computed(() => sheet.value.answer)
const answerLineResult = computed(() => (sheet.value.answerLine === null ? undefined : sheet.value.lines[sheet.value.answerLine]))

const overlay = computed(() => rawLines.value.map((raw, i) => segments(raw, sheet.value.lines[i])))

function resultText(i: number): string {
  const l = sheet.value.lines[i]
  if (!l || l.value === undefined) return ''
  return formatNumber(l.value)
}

function updateCaret() {
  const el = ta.value
  if (!el) return
  caretLine.value = lineAt(props.modelValue, el.selectionStart)
}

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLTextAreaElement).value)
  nextTick(updateCaret)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    if (props.lockable && !props.locked && answer.value !== null) emit('lock')
  }
}

function onFocus() {
  focused.value = true
  updateCaret()
  emit('focus')
}

function onBlur() {
  focused.value = false
  emit('blur')
}

function onScroll() {
  scrollX.value = ta.value?.scrollLeft ?? 0
}

/** Insert text at the caret (helper keys, variable chips) and keep the keyboard open. */
function insert(text: string) {
  const el = ta.value
  if (!el || props.locked) return
  const { selectionStart: s, selectionEnd: e, value } = el
  const before = value.slice(0, s)
  // `people` after `rate` needs a space; `k` after `5` must stay attached (5k = 5000).
  const needsSpace = /^[\p{L}_]/u.test(text) && /[\p{L}_]$/u.test(before)
  const ins = (needsSpace ? ' ' : '') + text
  const next = before + ins + value.slice(e)
  emit('update:modelValue', next)
  nextTick(() => {
    el.focus()
    const pos = s + ins.length
    el.setSelectionRange(pos, pos)
    updateCaret()
  })
}

function applyFix(lineIdx: number) {
  const l = sheet.value.lines[lineIdx]
  if (!l?.error?.fix) return
  const start = lineStart(props.modelValue, lineIdx)
  const { start: s, end: e, fix } = l.error
  const next = props.modelValue.slice(0, start + s) + fix + props.modelValue.slice(start + e)
  emit('update:modelValue', next)
  nextTick(() => {
    const el = ta.value
    if (!el) return
    el.focus()
    const pos = start + s + fix.length
    el.setSelectionRange(pos, pos)
    updateCaret()
  })
}

function focusLine(i: number) {
  const el = ta.value
  if (!el) return
  const start = lineStart(props.modelValue, i)
  const end = start + (rawLines.value[i]?.length ?? 0)
  el.focus()
  el.setSelectionRange(end, end)
  updateCaret()
}

watch(
  () => props.locked,
  (l) => {
    if (!l) nextTick(() => ta.value?.focus())
  },
)

onMounted(() => {
  if (props.autofocus && !props.locked) ta.value?.focus({ preventScroll: true })
})

defineExpose({ focus: () => ta.value?.focus(), insert })

const variables = computed(() => sheet.value.variables.map((v) => v.name))
</script>

<template>
  <div class="answer-block" :class="{ locked, focused }">
    <div class="sheet" :style="{ '--rows': rows }">
      <div class="editor">
        <div class="overlay mono" aria-hidden="true" :style="{ transform: `translateX(${-scrollX}px)` }">
          <div v-for="(segs, i) in overlay" :key="i" class="ov-line" :class="{ 'is-answer': i === sheet.answerLine && answer !== null }">
            <span v-for="(s, j) in segs" :key="j" :class="s.cls">{{ s.text }}</span>
          </div>
        </div>
        <textarea
          ref="ta"
          class="input-layer mono"
          :value="modelValue"
          :readonly="locked"
          :placeholder="placeholder"
          :rows="rows"
          wrap="off"
          spellcheck="false"
          autocapitalize="off"
          autocomplete="off"
          autocorrect="off"
          enterkeyhint="enter"
          aria-label="Your calculation"
          aria-describedby="answer-status"
          @input="onInput"
          @keydown="onKeydown"
          @keyup="updateCaret"
          @click="updateCaret"
          @select="updateCaret"
          @scroll="onScroll"
          @focus="onFocus"
          @blur="onBlur"
        ></textarea>
      </div>
      <div class="results mono" aria-hidden="true">
        <div
          v-for="(_, i) in rawLines"
          :key="i"
          class="res"
          :class="{
            'is-answer': i === sheet.answerLine && answer !== null,
            'is-error': !!sheet.lines[i]?.error,
            'is-active': focused && i === caretLine,
          }"
          :title="sheet.lines[i]?.error?.message ?? (sheet.lines[i]?.echoNotable ? `${S.readAs}: ${sheet.lines[i]?.echo}` : '')"
          @click="focusLine(i)"
        >
          <template v-if="sheet.lines[i]?.error"><ErrorDot /></template>
          <template v-else-if="i >= LIMITS.maxLines"><span class="muted">—</span></template>
          <template v-else-if="resultText(i)">
            <span class="eq">=</span>
            {{ resultText(i) }}
          </template>
        </div>
      </div>
    </div>

    <div id="answer-status" class="status" aria-live="polite">
      <template v-if="tooManyLines">
        <span class="status-err">Only the first {{ LIMITS.maxLines }} lines count.</span>
      </template>
      <template v-else-if="active?.error">
        <span class="status-err">Line {{ statusLine + 1 }}: {{ active.error.message }}</span>
        <button v-if="active.error.fix && !locked" class="btn fix" type="button" @pointerdown.prevent @click="applyFix(statusLine)">
          Fix: <code class="mono">{{ active.error.fix }}</code>
        </button>
      </template>
      <template v-else-if="active?.hints.length">
        <span class="status-hint">{{ active.hints[0] }}</span>
      </template>
      <template v-else-if="active?.echoNotable">
        <span class="status-echo"
          ><span class="muted">{{ S.readAs }}:</span> <code class="mono">{{ active.echo }}</code></span
        >
      </template>
      <template v-else-if="active?.value !== undefined && formatApprox(active.value)">
        <span class="muted">Line {{ statusLine + 1 }}: {{ formatApprox(active.value) }}</span>
      </template>
      <template v-else-if="!modelValue.trim()">
        <span class="muted"
          >One step per line. Name things (<code class="mono">people = 8 billion</code>) and reuse them. The last line is your answer.</span
        >
      </template>
      <template v-else-if="firstErrorLine !== null">
        <button class="linklike" type="button" @click="focusLine(firstErrorLine)">Line {{ firstErrorLine + 1 }} has a problem</button>
      </template>
    </div>

    <div v-if="variables.length && !locked" class="chips" aria-label="Insert a variable">
      <button v-for="v in variables" :key="v" type="button" class="chip mono" @pointerdown.prevent @click="insert(v)">{{ v }}</button>
    </div>

    <div class="footer">
      <div class="final" :class="{ empty: answer === null }">
        <span class="eyebrow">{{ S.yourAnswer }}</span>
        <template v-if="answer !== null">
          <strong class="mono value">{{ formatNumber(answer) }}</strong>
          <span v-if="unit" class="unit">{{ unit }}</span>
          <span v-if="formatApprox(answer)" class="muted approx">{{ formatApprox(answer) }}</span>
        </template>
        <template v-else-if="answerLineResult?.error">
          <span class="status-err">Fix line {{ (sheet.answerLine ?? 0) + 1 }} to get an answer</span>
        </template>
        <template v-else>
          <span class="muted">Nothing yet</span>
        </template>
      </div>
      <template v-if="lockable">
        <button v-if="!locked" class="btn btn-primary lock" type="button" :disabled="answer === null" @click="emit('lock')">
          🔒 {{ S.lockIn }} <kbd class="kbd">{{ S.lockHint }}</kbd>
        </button>
        <button v-else class="btn lock" type="button" @click="emit('unlock')">✏️ {{ S.unlock }}</button>
      </template>
    </div>

    <HelperKeys v-if="focused && !locked" :variables="variables" @insert="insert" />
  </div>
</template>

<style scoped>
.answer-block {
  --lh: 28px;
  --pad: 12px;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.sheet {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(7ch, max-content);
  background: var(--bg);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  overflow: hidden;
  transition: border-color var(--dur-fast);
}
.focused .sheet {
  border-color: var(--blue);
  box-shadow: 0 0 0 3px var(--blue-soft);
}
.locked .sheet {
  opacity: 0.75;
  border-style: dashed;
}

.editor {
  position: relative;
  overflow: hidden;
  min-width: 0;
}
.overlay,
.input-layer {
  font-size: 16px; /* ≥16px stops iOS zooming in on focus */
  line-height: var(--lh);
  padding: var(--pad);
  tab-size: 2;
  letter-spacing: 0;
  font-variant-ligatures: none;
}
.overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  white-space: pre;
  color: var(--text);
}
.ov-line {
  height: var(--lh);
}
.ov-line.is-answer {
  background: linear-gradient(90deg, transparent, var(--accent-soft));
}
.input-layer {
  position: relative;
  display: block;
  width: 100%;
  height: calc(var(--rows) * var(--lh) + 2 * var(--pad) + 6px);
  resize: none;
  border: 0;
  outline: none;
  background: transparent;
  color: transparent;
  caret-color: var(--text);
  white-space: pre;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
}
.input-layer::placeholder {
  color: var(--muted);
  opacity: 0.6;
}
.input-layer::selection {
  background: rgba(79, 179, 255, 0.35);
  color: transparent;
}

.results {
  border-left: 1px solid var(--border);
  background: var(--surface);
  padding: var(--pad) 0;
  font-size: 15px;
  max-width: 45vw;
}
.res {
  height: var(--lh);
  line-height: var(--lh);
  padding: 0 var(--space-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: right;
  color: var(--text-dim);
  cursor: pointer;
}
.res .eq {
  color: var(--muted);
  margin-right: 0.3em;
}
.res.is-active {
  background: var(--surface-2);
}
.res.is-answer {
  color: var(--accent);
  font-weight: 700;
  background: var(--accent-soft);
}

.status {
  min-height: 1.6em;
  font-size: var(--text-s);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}
.status code {
  background: var(--surface-2);
  padding: 1px 6px;
  border-radius: 4px;
}
.status-err {
  color: var(--danger);
}
.status-hint {
  color: var(--warn);
}
.status-echo code {
  color: var(--text);
}
.fix {
  min-height: 32px;
  padding: 0 var(--space-3);
  font-size: var(--text-s);
}
.linklike {
  background: none;
  border: 0;
  color: var(--danger);
  text-decoration: underline;
  cursor: pointer;
  padding: 0;
}

.chips {
  display: flex;
  gap: var(--space-2);
  overflow-x: auto;
  scrollbar-width: none;
}
.chip {
  flex: none;
  min-height: 34px;
  padding: 0 var(--space-3);
  border-radius: 999px;
  border: 1px solid var(--border-strong);
  background: var(--surface-2);
  color: var(--syn-var);
  cursor: pointer;
  font-size: var(--text-s);
}

.footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding-top: var(--space-1);
}
.final {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-2);
  min-width: 0;
}
.final .value {
  font-size: var(--text-xl);
  color: var(--accent);
  word-break: break-all;
}
.final .unit {
  color: var(--text-dim);
}
.final .approx {
  font-size: var(--text-s);
}
.lock {
  flex: 1 0 auto;
  max-width: 100%;
}
.kbd {
  font-family: var(--font-ui);
  font-size: var(--text-xs);
  opacity: 0.6;
  font-weight: 500;
}
@media (pointer: coarse) {
  .kbd {
    display: none;
  }
}
@media (pointer: coarse) {
  /* room for the fixed helper keys */
  .answer-block.focused {
    padding-bottom: 110px;
  }
}
@media (min-width: 768px) {
  .lock {
    flex: 0 0 auto;
  }
}
/* phones: give the expressions more room, the results less */
@media (max-width: 480px) {
  .results {
    max-width: 38vw;
    font-size: 13px;
  }
  .res {
    padding: 0 var(--space-2);
  }
}
</style>
