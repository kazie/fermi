<script setup lang="ts">
import { computed, ref } from 'vue'
import { BREAK_OPTIONS, estimateGameMinutes, ROUND_OPTIONS, TIMER_OPTIONS, type RoomView } from '@fermi/shared'
import { CALC_TIPS, HOW_TO_PLAY, S } from '@/lib/strings'
import FermeanieAvatar from './FermeanieAvatar.vue'
import FermeanieSays from './FermeanieSays.vue'
import JoinQr from './JoinQr.vue'
import { useMediaQuery } from '@/composables/useMediaQuery'
import PlayerAvatar from './PlayerAvatar.vue'
import PracticePad from './PracticePad.vue'

const props = defineProps<{ room: RoomView; joinUrl: string }>()
const emit = defineEmits<{ settings: [{ rounds: number; timerSec: number; breakSec: number }]; start: [] }>()

const isHost = computed(() => props.room.hostId === props.room.you)
// Phones: the essentials first (code, players, start); QR, rules and practice fold away.
const narrow = useMediaQuery('(max-width: 899px)')
const showQr = ref(false)
const minutes = computed(() =>
  estimateGameMinutes(props.room.settings.rounds, props.room.settings.timerSec, props.room.players.length, props.room.settings.breakSec),
)
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

function set(rounds: number, timerSec: number, breakSec = props.room.settings.breakSec) {
  emit('settings', { rounds, timerSec, breakSec })
}
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
            <span class="pname">{{ p.name }}</span>
            <span v-if="p.isHost" class="tag">host</span>
            <span v-if="p.id === room.you" class="tag you">you</span>
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
              @click="set(r, room.settings.timerSec)"
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
              @click="set(room.settings.rounds, t)"
            >
              {{ t }}s
            </button>
          </div>
          <strong v-else>{{ room.settings.timerSec }}s</strong>
        </div>
        <div class="setting">
          <span class="label">{{ S.breakLabel }}</span>
          <div v-if="isHost" class="segmented" role="group" :aria-label="S.breakLabel">
            <button
              v-for="b in BREAK_OPTIONS"
              :key="b"
              type="button"
              :aria-pressed="room.settings.breakSec === b"
              @click="set(room.settings.rounds, room.settings.timerSec, b)"
            >
              {{ b ? `${b}s` : 'Off' }}
            </button>
          </div>
          <strong v-else>{{ room.settings.breakSec ? `${room.settings.breakSec}s` : 'Off' }}</strong>
        </div>
        <p class="muted est">
          About {{ minutes }} min of play.{{
            room.settings.breakSec
              ? ' Between rounds there’s a break to talk; a majority can skip it.'
              : ' No breaks: once it starts, it runs.'
          }}
        </p>
        <p v-if="room.poolSize === 0" class="warn">There are no questions in the database yet. Generate some first (see README).</p>
        <p v-else-if="tooFewQuestions" class="warn">Only {{ room.poolSize }} questions available; the game will end early.</p>
        <button v-if="isHost" class="btn btn-primary btn-block start" type="button" :disabled="room.poolSize === 0" @click="emit('start')">
          ▶ {{ S.start }}
        </button>
        <p v-else class="muted center">{{ S.waitingForHost }}</p>
      </section>
    </div>

    <aside class="side">
      <FermeanieSays
        :version="room.fermeanie.version"
        mood="smug"
        :text="
          room.fermeanie.wins > 0
            ? `I have defeated carbon-based organisms ${room.fermeanie.wins} time${room.fermeanie.wins === 1 ? '' : 's'}. I am the average of all of you. Think about that.`
            : 'I am the average of all of you. Individually you are noise. Together, you are me. Shall we begin?'
        "
      />
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
.tag {
  font-size: var(--text-xs);
  padding: 0 6px;
  border-radius: 999px;
  border: 1px solid var(--border-strong);
  color: var(--muted);
}
.tag.you {
  border-color: var(--blue);
  color: var(--blue);
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
