<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref } from 'vue'
import LobbyLine from './LobbyLine.vue'
import {
  BREAK_OPTIONS,
  cleanName,
  NAME_MAX,
  estimateGameMinutes,
  INTRO_OPTIONS,
  playersMissing,
  PACING_OPTIONS,
  ROUND_OPTIONS,
  TIMER_OPTIONS,
  type PlayerView,
  type RoomSettings,
  type RoomView,
} from '@fermi/shared'
import { CALC_TIPS, HOW_TO_PLAY, S } from '@/lib/strings'
import FermeanieAvatar from './FermeanieAvatar.vue'
import JoinQr from './JoinQr.vue'
import { useMediaQuery } from '@/composables/useMediaQuery'
import PlayerAvatar from './PlayerAvatar.vue'
import PracticePad from './PracticePad.vue'

const props = defineProps<{
  room: RoomView
  joinUrl: string
  /** Server time, for her lobby line (a function, so only her bubble re-renders as it ticks). */
  clock?: () => number
}>()
const emit = defineEmits<{ settings: [RoomSettings]; start: []; rename: [string]; kick: [string] }>()

const isHost = computed(() => props.room.hostId === props.room.you)
// Phones: the essentials first (code, players, start); QR, rules and practice fold away.
const narrow = useMediaQuery('(max-width: 899px)')
const showQr = ref(false)
const hostPaced = computed(() => props.room.settings.pacing === 'host')
const missingPlayers = computed(() => playersMissing(props.room.players))
const minutes = computed(() => estimateGameMinutes(props.room.settings, props.room.players.length))
const pacingLabel = { timer: S.pacingTimer, host: S.pacingHost }
/** A big screen shows the QR code already, so phones don't need it. */
const onTv = computed(() => props.room.screens > 0)
const tooFewQuestions = computed(() => props.room.poolSize < props.room.settings.rounds)
const copied = ref(false)

async function copyJoin() {
  const text = S.joinMessage(props.joinUrl, props.room.code)
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    window.prompt('Copy this:', text)
  }
  copied.value = true
  setTimeout(() => (copied.value = false), 1800)
}

async function share() {
  try {
    await navigator.share({ title: 'Fermi', text: S.joinMessage(props.joinUrl, props.room.code) })
  } catch {
    /* cancelled */
  }
}
const canShare = typeof navigator !== 'undefined' && 'share' in navigator

function set(change: Partial<RoomSettings>) {
  emit('settings', { ...props.room.settings, ...change })
}

// ---- your name, changed in place: only a commit (Enter, ✓) renames; Esc, ✕ or the game starting cancels ----
const editing = ref(false)
const draft = ref('')
const nameInput = ref<HTMLInputElement[]>([])
const myName = computed(() => props.room.players.find((p) => p.id === props.room.you)?.name ?? '')
function startRename() {
  draft.value = myName.value
  editing.value = true
  void nextTick(() => nameInput.value[0]?.select())
}
function commitRename() {
  editing.value = false
  const name = cleanName(draft.value)
  if (name && name !== myName.value) emit('rename', name)
}

// ---- the host sends someone back to the name screen: one tap arms it, a second one sends ----
const armed = ref<string | null>(null)
let disarm: ReturnType<typeof setTimeout> | undefined
function kick(id: string) {
  clearTimeout(disarm)
  if (armed.value === id) {
    armed.value = null
    emit('kick', id)
    return
  }
  armed.value = id
  disarm = setTimeout(() => (armed.value = null), 3000)
}
/** Armed, the label says a second tap sends them (for screen readers too). */
const kickLabel = (p: PlayerView) => (armed.value === p.id ? S.kickArmed(p.name) : S.kick(p.name))
onUnmounted(() => clearTimeout(disarm))
</script>

<template>
  <div class="lobby">
    <div class="main">
      <section class="join card">
        <div class="join-text">
          <span class="eyebrow">Room code</span>
          <div class="code mono">{{ room.code }}</div>
          <a class="url mono" :href="joinUrl">{{ joinUrl.replace(/^https?:\/\//, '') }}</a>
          <div class="join-actions">
            <button class="btn" type="button" @click="copyJoin">{{ copied ? S.copied : `📋 ${S.copyJoin}` }}</button>
            <button v-if="canShare" class="btn" type="button" @click="share">Share…</button>
            <button v-if="narrow && !onTv" class="btn" type="button" :aria-expanded="showQr" @click="showQr = !showQr">
              {{ showQr ? 'Hide QR' : 'Show QR' }}
            </button>
          </div>
        </div>
        <JoinQr v-if="!onTv && (!narrow || showQr)" :url="joinUrl" />
        <p v-if="onTv" class="muted tv-note">📺 The QR code is on the big screen.</p>
      </section>

      <section class="players card">
        <h2 class="eyebrow">Test subjects ({{ room.players.length }})</h2>
        <ul>
          <li v-for="p in room.players" :key="p.id" :class="{ off: !p.connected, you: p.id === room.you }">
            <span class="dot" :class="{ on: p.connected }" aria-hidden="true"></span>
            <PlayerAvatar :seed="p.id" :size="24" :state="p.connected ? 'idle' : 'off'" />
            <template v-if="editing && p.id === room.you">
              <input
                ref="nameInput"
                v-model="draft"
                class="input rename"
                :maxlength="NAME_MAX"
                :aria-label="S.yourName"
                autocomplete="nickname"
                enterkeyhint="done"
                @keydown.enter.prevent="commitRename"
                @keydown.esc.prevent="editing = false"
              />
              <button
                class="btn btn-ghost row-btn save"
                type="button"
                :aria-label="S.renameSave"
                :title="S.renameSave"
                @click="commitRename"
              >
                ✓
              </button>
              <button
                class="btn btn-ghost row-btn"
                type="button"
                :aria-label="S.renameCancel"
                :title="S.renameCancel"
                @click="editing = false"
              >
                ✕
              </button>
            </template>
            <template v-else>
              <span class="pname">{{ p.name }}</span>
              <span v-if="p.isHost" class="tag">host</span>
              <span v-if="p.id === room.you" class="tag you">you</span>
              <button
                v-if="p.id === room.you"
                class="btn btn-ghost row-btn"
                type="button"
                :aria-label="S.rename"
                :title="S.rename"
                @click="startRename"
              >
                ✎
              </button>
            </template>
            <button
              v-if="isHost && p.id !== room.you"
              class="btn btn-ghost row-btn kick"
              :class="{ armed: armed === p.id }"
              type="button"
              :aria-label="kickLabel(p)"
              :title="kickLabel(p)"
              @click="kick(p.id)"
            >
              {{ armed === p.id ? S.kickConfirm : '✕' }}
            </button>
          </li>
          <li class="bot">
            <span class="dot on fer-dot" aria-hidden="true"></span>
            <FermeanieAvatar :size="24" />
            <span class="pname">FerMEANie {{ room.fermeanie.version }}</span>
            <span class="tag">uninvited</span>
          </li>
        </ul>
      </section>

      <section class="settings card">
        <div class="setting">
          <span class="label">{{ S.rounds }}</span>
          <div v-if="isHost" class="segmented" role="group" :aria-label="S.rounds">
            <button
              v-for="r in ROUND_OPTIONS"
              :key="r"
              type="button"
              :aria-pressed="room.settings.rounds === r"
              @click="set({ rounds: r })"
            >
              {{ r }}
            </button>
          </div>
          <strong v-else>{{ room.settings.rounds }}</strong>
        </div>
        <div class="setting">
          <span class="label">{{ S.timer }}</span>
          <div v-if="isHost" class="segmented" role="group" :aria-label="S.timer">
            <button
              v-for="t in TIMER_OPTIONS"
              :key="t"
              type="button"
              :aria-pressed="room.settings.timerSec === t"
              @click="set({ timerSec: t })"
            >
              {{ t }}s
            </button>
          </div>
          <strong v-else>{{ room.settings.timerSec }}s</strong>
        </div>
        <div class="setting">
          <span class="label">{{ S.pacing }}</span>
          <div v-if="isHost" class="segmented" role="group" :aria-label="S.pacing">
            <button
              v-for="p in PACING_OPTIONS"
              :key="p"
              type="button"
              :aria-pressed="room.settings.pacing === p"
              @click="set({ pacing: p })"
            >
              {{ pacingLabel[p] }}
            </button>
          </div>
          <strong v-else>{{ pacingLabel[room.settings.pacing] }}</strong>
        </div>
        <div v-if="!hostPaced" class="setting">
          <span class="label">{{ S.breakLabel }}</span>
          <div v-if="isHost" class="segmented" role="group" :aria-label="S.breakLabel">
            <button
              v-for="b in BREAK_OPTIONS"
              :key="b"
              type="button"
              :aria-pressed="room.settings.breakSec === b"
              @click="set({ breakSec: b })"
            >
              {{ b ? `${b}s` : 'Off' }}
            </button>
          </div>
          <strong v-else>{{ room.settings.breakSec ? `${room.settings.breakSec}s` : 'Off' }}</strong>
        </div>
        <div class="setting">
          <span class="label">{{ S.intro }}</span>
          <div v-if="isHost" class="segmented" role="group" :aria-label="S.intro">
            <button v-for="m in INTRO_OPTIONS" :key="m" type="button" :aria-pressed="room.settings.intro === m" @click="set({ intro: m })">
              {{ S.introLabel[m] }}
            </button>
          </div>
          <strong v-else>{{ S.introLabel[room.settings.intro] }}</strong>
        </div>
        <p class="muted est">
          About {{ minutes }} min of play. {{ S.betweenRounds(room.settings) }} {{ S.introHint(room.settings.intro) }}
        </p>
        <p v-if="room.poolSize === 0" class="warn">There are no questions in the database yet. Generate some first (see README).</p>
        <p v-else-if="tooFewQuestions" class="warn">Only {{ room.poolSize }} questions available; the game will end early.</p>
        <p v-if="missingPlayers" class="warn">{{ S.needPlayers(missingPlayers) }}</p>
        <button
          v-if="isHost"
          class="btn btn-primary btn-block start"
          type="button"
          :disabled="room.poolSize === 0 || missingPlayers > 0 || !!room.starting"
          @click="emit('start')"
        >
          {{ room.starting ? S.startingSoon : `▶ ${S.start}` }}
        </button>
        <p v-else class="muted center">{{ room.starting ? S.startingSoon : S.waitingForHost }}</p>
      </section>
    </div>

    <aside class="side">
      <LobbyLine v-if="room.lobbyLine" :line="room.lobbyLine" :release="room.fermeanie" :clock="clock" />
      <details class="card how" :open="!narrow">
        <summary class="eyebrow">How it works</summary>
        <ol>
          <li v-for="h in HOW_TO_PLAY" :key="h">{{ h }}</li>
        </ol>
      </details>
      <details class="card tips">
        <summary class="eyebrow">Calculator cheat sheet</summary>
        <dl>
          <template v-for="[code, desc] in CALC_TIPS" :key="code">
            <dt class="mono">{{ code }}</dt>
            <dd class="muted">{{ desc }}</dd>
          </template>
        </dl>
      </details>
      <details v-if="narrow" class="practice-fold">
        <summary class="btn btn-block">Practise the calculator while you wait</summary>
        <PracticePad />
      </details>
      <PracticePad v-else />
    </aside>
  </div>
</template>

<style scoped>
.lobby {
  display: grid;
  gap: var(--space-4);
}
.main,
.side {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}
.join {
  display: flex;
  gap: var(--space-4);
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
}
.join-text {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}
.code {
  font-size: 3rem;
  font-weight: 800;
  letter-spacing: 0.15em;
  color: var(--accent);
  line-height: 1;
}
.url {
  font-size: var(--text-s);
  overflow-wrap: anywhere;
}
.join-actions {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.players ul {
  list-style: none;
  margin: var(--space-2) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.players li {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--surface-2);
  border-radius: var(--radius);
}
.players li.off {
  opacity: 0.5;
}
.players li.bot {
  background: rgba(255, 79, 79, 0.08);
  color: #ffd9d4;
}
.pname {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--muted);
}
.dot.on {
  background: var(--ok);
}
.dot.fer-dot {
  background: var(--fer);
}
.tag.you {
  border-color: var(--blue);
  color: var(--blue);
}
.rename {
  flex: 1;
  min-width: 0;
  min-height: 0;
  padding: 2px var(--space-2);
}
/* small buttons inside a player's row; the row itself is the touch target's height */
.row-btn {
  flex: none;
  min-width: 32px;
  min-height: 0;
  height: 28px;
  padding: 0 var(--space-2);
  font-size: var(--text-xs);
}
.row-btn.save {
  color: var(--ok);
}
.row-btn.kick.armed {
  border-color: var(--danger);
  background: var(--danger-soft);
  color: var(--danger);
  font-weight: 600;
}
.settings {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.setting {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}
.label {
  font-weight: 600;
}
.est {
  margin: 0;
  font-size: var(--text-s);
}
.warn {
  margin: 0;
  color: var(--warn);
  font-size: var(--text-s);
}
.start {
  min-height: 52px;
  font-size: var(--text-l);
}
.center {
  text-align: center;
  margin: 0;
}
.how ol {
  margin: var(--space-2) 0 0;
  padding-left: 1.2em;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  color: var(--text-dim);
  font-size: var(--text-s);
}
.tips summary {
  cursor: pointer;
  min-height: 28px;
}
.tips dl {
  margin: var(--space-3) 0 0;
  display: grid;
  gap: 2px var(--space-3);
  font-size: var(--text-s);
}
.tips dt {
  color: var(--syn-num);
}
.tips dd {
  margin: 0 0 var(--space-2);
}
@media (min-width: 900px) {
  .lobby {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: start;
  }
}
.how summary,
.tips summary {
  cursor: pointer;
  min-height: 28px;
}
.practice-fold > summary {
  list-style: none;
}
.practice-fold[open] > summary {
  margin-bottom: var(--space-3);
}
/* phones: one column in priority order */
@media (max-width: 899px) {
  .main,
  .side {
    display: contents;
  }
  .side > :first-child {
    order: -1; /* FerMEANie's greeting on top */
  }
  .join {
    order: 0;
  }
  .players {
    order: 1;
  }
  .settings {
    order: 2;
  }
  .how {
    order: 3;
  }
  .tips {
    order: 4;
  }
  .practice-fold {
    order: 5;
  }
}
.tv-note {
  margin: 0;
  font-size: var(--text-s);
}
</style>
