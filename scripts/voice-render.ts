// pnpm voice:render [--out DIR] [--db FILE]: renders FerMEANie's voice ahead of time without a server (the same
// sweep the server runs at startup): her sentences without variables, and every active question. Clips are named by
// content, so a folder rendered here can be copied (rsync) into the server's FERMI_VOICE_DIR. Prints counts only.

import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { defaultDbPath, openDb } from '../apps/server/src/db.ts'
import { loadLines } from '../apps/server/src/lines.ts'
import { voiceFromEnv } from '../apps/server/src/voice/index.ts'
import { sweep } from '../apps/server/src/voice/sweep.ts'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
if (existsSync(`${ROOT}.env`)) process.loadEnvFile(`${ROOT}.env`)

const { values } = parseArgs({ options: { out: { type: 'string' }, db: { type: 'string' } } })
const dbPath = values.db ?? defaultDbPath()
const db = openDb(dbPath)
const voice = voiceFromEnv(dbPath, values.out)
const before = voice.status().rendered
sweep(voice, loadLines(), db)
const total = voice.status().queued.sweep
console.log(`[voice] ${before} clips in ${voice.dir}; ${total} to render`)

const started = Date.now()
const progress = setInterval(() => {
  const s = voice.status()
  if (s.broken) {
    // the worker can't render at all (no uv, no ffmpeg, no model…): say why, rather than rest and retry for hours
    console.error(`[voice] rendering keeps failing: ${s.broken}`)
    voice.close()
    process.exit(1)
  }
  const left = s.queued.sweep
  const done = total - left
  const eta = done ? Math.round((((Date.now() - started) / done) * left) / 60_000) : null
  console.log(`[voice] ${done}/${total} rendered${eta === null ? '' : `, about ${eta} min left`}`)
}, 15_000)

await voice.idle()
clearInterval(progress)
const s = voice.status()
voice.close()
db.close()
console.log(`[voice] done: ${s.renderedNow} rendered, ${s.failed} failed, ${s.rendered} clips in ${voice.dir}`)
if (s.failed) process.exitCode = 1
