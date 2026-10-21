// pnpm q <command> — thin client for the question admin API, plus source-checking helpers.
// Never prints answers unless you ask for a full question (`get`, `export`).

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { quoteExcerpt } from '../apps/server/src/questions/dedupe.ts'
import { extractNumbers, quoteContainsNumber } from '../apps/server/src/questions/numbers.ts'
import { prepareDraft, withDryRun, type DraftCheck } from '../apps/server/src/questions/prepare.ts'
import { fetchPageText } from '../apps/server/src/questions/html.ts'
import { archive as archiveWith, archiveOptionsFromEnv } from './archive.ts'
import { createBatch, isDraftFile, mtime, sweepLeftovers } from './batch.ts'
import { parseCli } from './cli-args.ts'
import { rewordProblem, screenFilePath, type ScreenFile } from './review.ts'

const ROOT = new URL('../', import.meta.url)
const envFile = new URL('.env', ROOT)
if (existsSync(envFile)) process.loadEnvFile(envFile)

let parsed: ReturnType<typeof parseCli>
try {
  parsed = parseCli(process.argv.slice(2))
} catch (e) {
  console.error(`✗ ${(e as Error).message}`)
  process.exit(1)
}
const { cmd, rest, opts } = parsed
const archiveOpts = archiveOptionsFromEnv(fileURLToPath(new URL('.fermi-work', ROOT)))
const archive = (url: string) => archiveWith(url, archiveOpts)
const server = (opts.server ?? process.env.FERMI_SERVER ?? 'http://localhost:3000').replace(/\/$/, '')
const token = process.env.FERMI_ADMIN_TOKEN

async function call(method: string, path: string, body?: unknown) {
  if (!token) die('FERMI_ADMIN_TOKEN is not set (put it in .env)')
  const res = await fetch(`${server}/api/admin${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch((e) => die(`Cannot reach ${server}: ${e.message}. Is the server running?`))
  const json = await res.json().catch(() => ({}))
  if (res.status === 401 || res.status === 403) die((json as { error?: string }).error ?? 'unauthorized')
  // admin API responses are loosely typed here; the server validates everything that matters
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, json: json as any }
}

/** Active questions per category, every category included, fewest first: `n<TAB>category` lines. */
function categoryLines(byCategory: { category: string; n: number }[]) {
  return byCategory.toReversed().map(({ category, n }) => `${n}\t${category}\n`)
}

function die(msg: string): never {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

function readQuestions(files: string[]): unknown[] {
  return files.flatMap((f) => {
    const data = JSON.parse(readFileSync(f, 'utf8'))
    return Array.isArray(data) ? data : Array.isArray(data.questions) ? data.questions : [data]
  })
}

/** Ingests questions and prints one line per result, with similar questions for the verifier to compare. */
async function addQuestions(questions: unknown[], opts: { batchId?: string; replaces?: string; dryRun?: boolean; reword?: boolean }) {
  const { json } = await call('POST', '/questions', { questions, ...opts })
  if (json.error) die(json.error)
  const counts: Record<string, number> = {}
  for (const r of json.results) {
    counts[r.status] = (counts[r.status] ?? 0) + 1
    if (r.status === 'added' || r.status === 'valid') console.log(`✓ ${r.status.padEnd(12)}${r.id}`)
    else if (r.status === 'invalid') console.log(`✗ invalid     ${r.id ?? '(no id)'}\n    - ${r.errors.join('\n    - ')}`)
    else {
      console.log(`${r.status === 'duplicate' ? '✗ duplicate  ' : '? needs_review'} ${r.id}`)
      for (const m of r.matches) {
        console.log(
          `    ~ ${m.id} (similarity ${m.similarity}; ${m.reasons.join(', ')}${m.rejectionReason ? `; rejected because: ${m.rejectionReason}` : ''})`,
        )
        console.log(`      "${m.question}"`)
      }
    }
  }
  console.log(
    `\n${Object.entries(counts)
      .map(([k, v]) => `${v} ${k}`)
      .join(', ')}`,
  )
}

/** `abc` → `abc-v2`, `abc-v2` → `abc-v3`. */
function nextVersionId(id: string) {
  const m = /^(.*)-v(\d+)$/.exec(id)
  return m ? `${m[1]}-v${Number(m[2]) + 1}` : `${id}-v2`
}

async function main() {
  switch (cmd) {
    case 'add': {
      const batchId = opts.batch
      const replaces = opts.replaces
      const dryRun = !!opts['dry-run']
      const files = rest
      if (!files.length) die('usage: pnpm q add <file.json…> [--batch id] [--replaces old-id]')
      await addQuestions(readQuestions(files), { batchId, replaces, dryRun })
      return
    }
    case 'approve': {
      // The verifier's "good": stamp the draft verified, save it to <batch>/verified and ingest it, so the verifier
      // doesn't have to write the whole file out again.
      const [path] = rest
      const notes = opts.notes
      if (!path || !notes) die('usage: pnpm q approve <batch>/drafts/<id>.json --notes "…" [--batch id]')
      const draft = JSON.parse(readFileSync(path, 'utf8'))
      // A draft the screen flagged and the verifier reworded: the same limits as `pnpm review`'s rewordings.
      const screenPath = screenFilePath(path)
      if (existsSync(screenPath)) {
        const seen = JSON.parse(readFileSync(screenPath, 'utf8')) as ScreenFile
        if (draft.question !== seen.question || draft.unit !== seen.unit) {
          const problem = rewordProblem(String(draft.question), String(draft.unit), Number(draft.answer))
          if (problem) die(`the reworded question ${problem}: shorten it, or reject the draft`)
        }
      }
      draft.verification = { verifiedAt: new Date().toISOString(), verdict: 'approved', notes }
      const out = join(dirname(path), '..', 'verified', basename(path))
      mkdirSync(dirname(out), { recursive: true })
      writeFileSync(out, JSON.stringify(draft, null, 2))
      await addQuestions([draft], { batchId: opts.batch })
      return
    }
    case 'reword': {
      // A clearer wording of the same fact: a new version (`<id>-v2`, `-v3`…) that replaces the old one.
      const [id] = rest
      const { question, unit, reason } = opts
      if (!id || !question || !reason) die('usage: pnpm q reword <id> --question "…" [--unit "…"] --reason "…"')
      const { status, json } = await call('GET', `/questions/${id}`)
      if (status !== 200) die(json.error)
      const old = json.question
      const notes = `Reworded: ${reason}. Before: ${old.verification.notes}`.slice(0, 2000)
      let newId = nextVersionId(old.id)
      while ((await call('GET', `/questions/${newId}`)).status === 200) newId = nextVersionId(newId)
      const q = {
        ...old,
        id: newId,
        question,
        ...(unit ? { unit } : {}),
        verification: { verifiedAt: new Date().toISOString(), verdict: 'approved', notes },
      }
      await addQuestions([q], { replaces: id, reword: true })
      return
    }
    case 'purge': {
      // Deletes retired questions that were replaced by a newer version and never played. Preview unless --yes.
      const { json } = await call('POST', '/questions/purge', { confirm: !!opts.yes })
      if (json.error) die(json.error)
      for (const id of json.ids) console.log(id)
      if (json.deleted) console.log(`\n✓ deleted ${json.ids.length} replaced, unplayed question(s)`)
      else
        console.log(
          `\n${json.ids.length} replaced, unplayed question(s) would be deleted. Back up first (pnpm q export backup.json), then: pnpm q purge --yes`,
        )
      return
    }
    case 'flag': {
      // One flag on many questions in one request (e.g. a screened chunk from `pnpm review`). Unknown ids are skipped.
      const [flag, ...ids] = rest
      if (!flag || !ids.length) die('usage: pnpm q flag <flag> <id…> [--remove]')
      const { status, json } = await call('POST', '/questions/flags', opts.remove ? { ids, remove: [flag] } : { ids, add: [flag] })
      if (status !== 200) die(json.error)
      console.log(`✓ ${opts.remove ? 'removed' : 'added'} ${flag} on ${json.updated} question(s)`)
      if (json.missing.length) console.log(`  skipped unknown: ${json.missing.join(', ')}`)
      return
    }
    case 'list': {
      const { json } = await call('GET', '/questions')
      const texts = opts.texts
      const shown = opts.all ? json.questions : json.questions.filter((q: { status: string }) => q.status !== 'retired')
      for (const q of shown)
        console.log(texts ? `${q.id}\t${q.category}\t${q.status}\t${q.question}` : `${q.id}\t${q.category}\t${q.status}`)
      const hidden = json.questions.length - shown.length
      console.error(`${shown.length} questions${hidden ? ` (${hidden} retired hidden; --all to show)` : ''}`)
      return
    }
    case 'get': {
      const { status, json } = await call('GET', `/questions/${rest[0]}`)
      if (status !== 200) die(json.error)
      console.log(JSON.stringify(json, null, 2))
      return
    }
    case 'export': {
      const { json } = await call('GET', '/questions/export')
      const out = rest[0]
      if (out) {
        writeFileSync(out, JSON.stringify(json, null, 2))
        console.log(`exported ${json.questions.length} questions to ${out}`)
      } else console.log(JSON.stringify(json, null, 2))
      return
    }
    case 'import': {
      // Merge an export into the target: keeps statuses and flags, skips ids it already has, de-duplicates the rest.
      if (!rest[0]) die('usage: pnpm q import <export.json> [--server URL]')
      const data = JSON.parse(readFileSync(rest[0], 'utf8'))
      const questions: unknown[] = Array.isArray(data) ? data : (data.questions ?? [])
      const counts: Record<string, number> = {}
      for (let i = 0; i < questions.length; i += 200) {
        const { json } = await call('POST', '/questions', { questions: questions.slice(i, i + 200), batchId: 'import', import: true })
        if (json.error) die(json.error)
        for (const r of json.results) {
          counts[r.status] = (counts[r.status] ?? 0) + 1
          if (r.status === 'invalid') console.log(`✗ invalid      ${r.id ?? '(no id)'}: ${r.errors.join('; ')}`)
          if (r.status === 'duplicate' || r.status === 'needs_review')
            console.log(`~ ${r.status.padEnd(12)} ${r.id} ≈ ${r.matches.map((m: { id: string }) => m.id).join(', ')}`)
        }
      }
      let rej = 0
      for (const r of data.rejections ?? []) {
        await call('POST', '/rejections', { question: r.question, reason: r.reason })
        rej++
      }
      console.log(
        `\n${
          Object.entries(counts)
            .map(([k, v]) => `${v} ${k}`)
            .join(', ') || 'nothing to import'
        }; ${rej} rejections merged`,
      )
      return
    }
    case 'prepare': {
      // Mechanical checks for every draft in a directory; writes <id>.check.json next to each. Drafts already verified
      // are left out, and drafts checked since their last edit just repeat that result, so it's cheap to call after
      // every generator. Captures share a few slots across all runs (scripts/archive.ts).
      const dir = rest[0]
      if (!dir) die('usage: pnpm q prepare <drafts-dir>')
      const verified = join(dir, '..', 'verified')
      const files = readdirSync(dir).filter((f) => isDraftFile(f) && !existsSync(join(verified, f)))
      // One prepare per folder at a time: two would archive and write the same drafts. Wait for the other (it may be
      // a parallel call from the same run); a lock older than 15 minutes is from a crashed prepare.
      const lock = join(dir, '.prepare.lock')
      for (;;) {
        try {
          writeFileSync(lock, String(process.pid), { flag: 'wx' })
          break
        } catch {
          if (Date.now() - (mtime(lock) ?? 0) > 15 * 60 * 1000) rmSync(lock, { force: true })
          else await new Promise((r) => setTimeout(r, 2000))
        }
      }
      process.on('exit', () => rmSync(lock, { force: true }))
      // Waiting for archive slots can take a while: keep the lock fresh so it isn't mistaken for a crashed prepare.
      const lockBeat = setInterval(() => existsSync(lock) && utimesSync(lock, new Date(), new Date()), 60_000)
      const dryRun = async (d: unknown) => (await call('POST', '/questions', { questions: [d], dryRun: true })).json.results[0]
      const check = async (path: string): Promise<DraftCheck> => {
        const checkPath = path.replace(/\.json$/, '.check.json')
        if ((mtime(checkPath) ?? 0) < (mtime(path) ?? 0)) {
          const prepared = await prepareDraft(JSON.parse(readFileSync(path, 'utf8')), { pageText, archive, dryRun })
          writeFileSync(path, JSON.stringify(prepared.draft, null, 2))
          writeFileSync(checkPath, JSON.stringify(prepared.check, null, 2))
          return prepared.check
        }
        const cached: DraftCheck = JSON.parse(readFileSync(checkPath, 'utf8'))
        if (!cached.ok) {
          // Archiving fails for passing reasons (Wayback busy): try again on later calls, up to ARCHIVE_TRIES in all.
          const tries = cached.archiveTries ?? 1
          if (tries >= ARCHIVE_TRIES || !cached.problems.some((p) => p.includes('could not archive'))) return cached
          const prepared = await prepareDraft(JSON.parse(readFileSync(path, 'utf8')), { pageText, archive, dryRun })
          const check = prepared.check.ok ? prepared.check : { ...prepared.check, archiveTries: tries + 1 }
          writeFileSync(path, JSON.stringify(prepared.draft, null, 2))
          writeFileSync(checkPath, JSON.stringify(check, null, 2))
          return check
        }
        // A passed draft may since have been rejected by a verifier, or duplicated by a newer question: ask the server
        // again (cheap). The check file is only rewritten when it flips, so quiet batches stay quiet.
        const updated = withDryRun(cached, await dryRun(JSON.parse(readFileSync(path, 'utf8'))))
        if (!updated.ok) writeFileSync(checkPath, JSON.stringify(updated, null, 2))
        return updated
      }
      let ok = 0
      let next = 0
      const work = async () => {
        while (next < files.length) {
          const path = join(dir, files[next++])
          let c: DraftCheck
          try {
            c = await check(path)
          } catch (e) {
            // Usually a draft a generator is still writing: leave it for the next call. Only the error's name is
            // printed, since JSON.parse messages quote the draft. A draft still unreadable after 10 minutes is dropped.
            const id = basename(path, '.json')
            const written = mtime(path)
            if (written === undefined) continue
            if (Date.now() - written < 10 * 60 * 1000) {
              console.log(`… ${id}: not ready (${(e as Error).name}), checked on a later call`)
              continue
            }
            c = { id, ok: false, quotes: {}, excerpts: {}, ingest: 'unreadable', problems: [`could not be read (${(e as Error).name})`] }
            writeFileSync(path.replace(/\.json$/, '.check.json'), JSON.stringify(c, null, 2))
          }
          if (c.ok) ok++
          console.log(
            `${c.ok ? '✓' : '✗'} ${c.id}${c.ok ? (c.ingest === 'needs_review' ? ' (needs_review)' : '') : `: ${c.problems.length} problem(s)`}`,
          )
        }
      }
      await Promise.all([work(), work(), work()])
      clearInterval(lockBeat)
      console.log(`\n${ok}/${files.length} drafts passed the mechanical checks`)
      return
    }
    case 'reject': {
      const question = opts.draft ? (JSON.parse(readFileSync(opts.draft, 'utf8')).question as string) : opts.question
      const reason = opts.reason
      if (!question || !reason) die('usage: pnpm q reject (--draft <file> | --question "…") --reason "…"')
      await call('POST', '/rejections', { question, reason })
      console.log('✓ rejection recorded')
      return
    }
    case 'disputes': {
      const { json } = await call('GET', '/disputes')
      const lines = json.disputes.map(
        (d: { questionId: string; at: string; message: string }) => `${d.questionId}\t${d.at}\t${d.message}\n`,
      )
      if (rest[0]) writeFileSync(rest[0], lines.join(''))
      else process.stdout.write(lines.join(''))
      console.error(`${json.disputes.length} open disputes${rest[0] ? ` → ${rest[0]}` : ''}`)
      return
    }
    case 'batch': {
      // Set up a /fermi-questions batch: ids/categories only (no texts), then sweep older batches for leftovers.
      const { json: list } = await call('GET', '/questions')
      const { json: stats } = await call('GET', '/stats')
      const workDir = '.fermi-work'
      const heartbeat = process.env.FERMI_HEARTBEAT ?? '' // set by `pnpm grow`
      const dir = createBatch(workDir, new Date(), heartbeat)
      writeFileSync(
        join(dir, 'existing.tsv'),
        list.questions.map((q: { id: string; category: string; status: string }) => `${q.id}\t${q.category}\t${q.status}\n`).join(''),
      )
      writeFileSync(join(dir, 'categories.tsv'), categoryLines(stats.byCategory).join(''))
      const { deleted, leftovers } = sweepLeftovers(workDir, new Date(), dir, heartbeat)
      console.log(`batch ${dir}`)
      for (const l of leftovers) console.log(`leftover ${l.dir} ${l.pending} pending`)
      console.log(`${list.questions.length} questions in pool; ${deleted} stale drafts deleted; ${leftovers.length} batches with leftovers`)
      return
    }
    case 'status': {
      const [id, status] = rest
      const resolution = opts.resolution
      if (!id || !['active', 'retired', 'disputed'].includes(status))
        die('usage: pnpm q status <id> <active|retired|disputed> [--resolution "…"]')
      const { json } = await call('POST', `/questions/${id}/status`, { status, resolution })
      if (json.error) die(json.error)
      console.log(`✓ ${id} → ${status}`)
      return
    }
    case 'check': {
      let { json } = await call('POST', '/check', { links: !!opts.links })
      process.stderr.write(json.links ? 'checking pool and live sources' : 'checking pool')
      while (!json.done) {
        await new Promise((r) => setTimeout(r, 2000))
        process.stderr.write('.')
        json = (await call('GET', '/check')).json
      }
      process.stderr.write('\n')
      if (json.error) die(`check failed: ${json.error}`)
      json = json.report
      for (const i of json.issues) console.log(`${i.id} (${i.status})\n    - ${i.issues.join('\n    - ')}`)
      console.log(
        `checked ${json.checked}; ${json.issues.length} with issues; newly queued for recheck: ${json.disputed.length ? json.disputed.join(', ') : 'none'}`,
      )
      return
    }
    case 'stats': {
      const { json } = await call('GET', '/stats')
      // --categories: active questions per category, fewest first (for steering generation)
      if (opts.categories) process.stdout.write(categoryLines(json.byCategory).join(''))
      else console.log(JSON.stringify(json, null, 2))
      return
    }
    case 'archive': {
      // Find or create a Wayback snapshot for a source URL. Prints JSON {archiveUrl, archivedAt}.
      const url = rest[0]
      if (!url) die('usage: pnpm q archive <url>')
      try {
        console.log(JSON.stringify(await archive(url)))
      } catch (e) {
        die((e as Error).message)
      }
      return
    }
    case 'quote': {
      // Does the live page (or snapshot) contain this quote, and does the quote contain this number?
      const [url, quote, num] = rest
      if (!url || !quote) die('usage: pnpm q quote <url> "<quote>" [number]')
      const text = await pageText(url)
      if (text === null) die(`could not fetch ${url}`)
      const excerpt = quoteExcerpt(text, quote, 120)
      console.log(`quote on page: ${excerpt === null ? 'NO' : `yes\n  ${excerpt}`}`)
      if (num)
        console.log(
          `number ${num} in quote: ${quoteContainsNumber(quote, Number(num)) ? 'yes' : 'NO'} (numbers read: ${extractNumbers(quote).slice(0, 12).join(', ')})`,
        )
      if (excerpt === null) process.exitCode = 2
      return
    }
    default:
      console.log(`pnpm q <command>

  add <file.json…> [--batch id] [--replaces old-id] [--dry-run]   insert via the ingest checks
  batch                                               new .fermi-work batch (ids/categories, no texts) + leftover sweep
  prepare <dir>                                       archive + quote + dry-run checks for drafts (no LLM)
  list [--texts] [--all]                              ids/categories (texts with --texts; never answers; retired only with --all)
  get <id>                                            full question JSON (spoilers!)
  export [file] / import <file>                       backup and restore
  approve <draft.json> --notes "…" [--batch id]       mark a draft verified, save it to verified/ and ingest it
  reword <id> --question "…" [--unit "…"] --reason "…"   replace a question with a clearer wording of the same fact
  purge [--yes]                                       delete retired questions replaced by a newer version and never played (preview without --yes)
  flag <flag> <id…> [--remove]                        add or remove a flag (e.g. reviewed:v1) on questions
  reject (--draft <file> | --question "…") --reason "…"   remember a rejected candidate
  disputes [file]                                     open disputes (to a file if given)
  status <id> <active|retired|disputed> [--resolution "…"]
  check [--links]                                     re-validate the pool (and live sources)
  stats [--categories]                                pool counts (--categories: active questions per category, fewest first)
  archive <url>                                       find/create a Wayback snapshot → {archiveUrl, archivedAt}
  quote <url> "<quote>" [number]                      verify a quote is on the page and contains the number (⚠ prints page text)

  --server URL (default $FERMI_SERVER or http://localhost:3000); token from FERMI_ADMIN_TOKEN`)
  }
}

const pageText = (url: string) => fetchPageText(url)
/** How many `prepare` calls may try to archive a draft's sources before it is given up. */
const ARCHIVE_TRIES = 3

await main()
