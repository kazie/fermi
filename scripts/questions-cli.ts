// pnpm q <command> — thin client for the question admin API, plus source-checking helpers.
// Never prints answers unless you ask for a full question (`get`, `export`).

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { quoteExcerpt } from '../apps/server/src/questions/dedupe.ts'
import { extractNumbers, quoteContainsNumber } from '../apps/server/src/questions/numbers.ts'
import { prepareDraft } from '../apps/server/src/questions/prepare.ts'
import { fetchPageText } from '../apps/server/src/questions/html.ts'
import { createBatch, sweepLeftovers } from './batch.ts'
import { parseCli } from './cli-args.ts'

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

async function main() {
  switch (cmd) {
    case 'add': {
      const batchId = opts.batch
      const replaces = opts.replaces
      const dryRun = !!opts['dry-run']
      const files = rest
      if (!files.length) die('usage: pnpm q add <file.json…> [--batch id] [--replaces old-id]')
      const questions = readQuestions(files)
      const { json } = await call('POST', '/questions', { questions, batchId, replaces, dryRun })
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
      return
    }
    case 'list': {
      const { json } = await call('GET', '/questions')
      const texts = opts.texts
      for (const q of json.questions)
        console.log(texts ? `${q.id}\t${q.category}\t${q.status}\t${q.question}` : `${q.id}\t${q.category}\t${q.status}`)
      console.error(`${json.questions.length} questions`)
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
      // Mechanical checks for every draft in a directory; writes <id>.check.json next to each.
      const dir = rest[0]
      if (!dir) die('usage: pnpm q prepare <drafts-dir>')
      const files = readdirSync(dir).filter((f) => f.endsWith('.json') && !f.endsWith('.check.json'))
      let ok = 0
      for (const f of files) {
        const path = join(dir, f)
        const draft = JSON.parse(readFileSync(path, 'utf8'))
        const { draft: updated, check } = await prepareDraft(draft, {
          pageText,
          archive,
          dryRun: async (d) => (await call('POST', '/questions', { questions: [d], dryRun: true })).json.results[0],
        })
        writeFileSync(path, JSON.stringify(updated, null, 2))
        writeFileSync(path.replace(/\.json$/, '.check.json'), JSON.stringify(check, null, 2))
        if (check.ok) ok++
        console.log(
          `${check.ok ? '✓' : '✗'} ${check.id}${check.ok ? (check.ingest === 'needs_review' ? ' (needs_review)' : '') : `: ${check.problems.length} problem(s)`}`,
        )
      }
      console.log(`\n${ok}/${files.length} drafts passed the mechanical checks`)
      return
    }
    case 'reject': {
      const question = opts.question
      const reason = opts.reason
      if (!question || !reason) die('usage: pnpm q reject --question "…" --reason "…"')
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
      const dir = createBatch(workDir, new Date())
      writeFileSync(
        join(dir, 'existing.tsv'),
        list.questions.map((q: { id: string; category: string; status: string }) => `${q.id}\t${q.category}\t${q.status}\n`).join(''),
      )
      writeFileSync(
        join(dir, 'categories.tsv'),
        stats.byCategory
          .toReversed()
          .map(({ category, n }: { category: string; n: number }) => `${n}\t${category}\n`)
          .join(''),
      )
      const { deleted, leftovers } = sweepLeftovers(workDir, new Date(), dir)
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
      if (opts.categories) for (const { category, n } of json.byCategory.toReversed()) console.log(`${n}\t${category}`)
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
  list [--texts]                                      ids/categories (texts with --texts; never answers)
  get <id>                                            full question JSON (spoilers!)
  export [file] / import <file>                       backup and restore
  reject --question "…" --reason "…"                  remember a rejected candidate
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

/** Find or create a Wayback snapshot. Throws (never exits), so `prepare` can record the failure and carry on. */
async function archive(url: string): Promise<{ archiveUrl: string; archivedAt: string }> {
  const toIso = (ts: string) =>
    `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(8, 10) || '00'}:${ts.slice(10, 12) || '00'}:${ts.slice(12, 14) || '00'}Z`
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  try {
    const r = await fetch(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}&timestamp=${today}`, {
      signal: AbortSignal.timeout(30_000),
    })
    const j = (await r.json()) as { archived_snapshots?: { closest?: { available: boolean; url: string; timestamp: string } } }
    const c = j.archived_snapshots?.closest
    if (c?.available && Math.abs(Date.parse(toIso(c.timestamp)) - Date.now()) < 7 * 86_400_000) {
      return { archiveUrl: c.url.replace(/^http:/, 'https:'), archivedAt: toIso(c.timestamp) }
    }
  } catch {
    /* fall through to save */
  }
  const res = await fetch(`https://web.archive.org/save/${url}`, {
    redirect: 'follow',
    signal: AbortSignal.timeout(120_000),
    headers: { 'user-agent': 'Mozilla/5.0 (fermi archiver)' },
  }).catch((e) => {
    throw new Error(`Save Page Now failed: ${e.message}`)
  })
  const final = res.url.match(/web\.archive\.org\/web\/(\d{14})\//) ? res.url : (res.headers.get('content-location') ?? '')
  const m = final.match(/\/web\/(\d{14})\//)
  if (!m) throw new Error(`Save Page Now did not return a snapshot (HTTP ${res.status}). Try again in a minute.`)
  const archiveUrl = final.startsWith('http') ? final : `https://web.archive.org${final}`
  return { archiveUrl, archivedAt: toIso(m[1]) }
}

await main()
