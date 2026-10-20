// One batch of new questions for one topic, without an orchestrating LLM: the steps of the /fermi-questions skill
// as a script. Haiku generators draft, `pnpm q prepare` checks mechanically, Sonnet verifiers judge and ingest.
// Added questions are counted from the pool, not from model text. Nothing from a session's output is ever printed
// (spoilers); only counts, categories and cost leave this module.

import { limitMessage } from './grow-report.ts'

export type AgentName = 'fermi-generator' | 'fermi-verifier'

export interface AgentResult {
  costUsd: number
  /** A usage-limit message, if the session hit one. */
  limit: string | null
}

export interface PipelineDeps {
  /** Runs one headless agent session with this brief. */
  runAgent(agent: AgentName, brief: string): Promise<AgentResult>
  /** Runs `pnpm q <args>` and returns its stdout. */
  cli(args: string[]): Promise<string>
}

export interface PipelineResult {
  added: number
  byCategory: Record<string, number>
  failedChecks: number
  rejected: number
  cost: Record<AgentName, number>
  /** The usage-limit message that stopped the run early, if any. */
  limit: string | null
}

export const DRAFTS_PER_GENERATOR = 5
export const DRAFTS_PER_VERIFIER = 5
export const MAX_PARALLEL = 4

/** Parses a `pnpm q batch` output: the new batch and the leftover batches it claimed. */
export function parseBatch(out: string) {
  const batch = /^batch (\S+)$/m.exec(out)?.[1]
  if (!batch) throw new Error('pnpm q batch printed no batch')
  const leftovers = [...out.matchAll(/^leftover (\S+) \d+ pending$/gm)].map((m) => m[1])
  return { batch, leftovers }
}

/** `✓ <id>` and `✗ <id>: …` lines from `pnpm q prepare`. Drafts still being written (`… <id>: not ready`) are neither. */
export function parsePrepare(out: string) {
  const passed = [...out.matchAll(/^✓ (\S+)/gm)].map((m) => m[1])
  const failed = [...out.matchAll(/^✗ ([^\s:]+)/gm)].map((m) => m[1])
  return { passed, failed }
}

/** `id<TAB>category<TAB>status` lines from `pnpm q list`. */
export function parseList(out: string) {
  const pool = new Map<string, { category: string; status: string }>()
  for (const line of out.split('\n')) {
    const [id, category, status] = line.split('\t')
    if (id && category && status) pool.set(id, { category, status })
  }
  return pool
}

export const generatorBrief = (batch: string, topic: string, n = DRAFTS_PER_GENERATOR) =>
  `Write ${n} drafts into \`${batch}/drafts/\`. Existing ids and categories: \`${batch}/existing.tsv\`; questions per ` +
  `category: \`${batch}/categories.tsv\`. Topic: ${topic}.`

export const verifierBrief = (batch: string, ids: string[]) =>
  `Batch \`${batch}\`. Check and ingest these drafts: ${ids.map((id) => `\`${batch}/drafts/${id}.json\``).join(', ')} ` +
  `(their \`.check.json\` files are next to them, with the page text around each quote).`

/** Runs `fn` on each item, at most `limit` at a time. */
async function eachLimit<T>(items: T[], limit: number, fn: (t: T) => Promise<void>) {
  let next = 0
  const worker = async () => {
    while (next < items.length) await fn(items[next++])
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

/** A tiny semaphore, so verifiers started from different generators' callbacks share one cap. */
function limiter(max: number) {
  let running = 0
  const waiting: (() => void)[] = []
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (running >= max) await new Promise<void>((r) => waiting.push(r))
    running++
    try {
      return await fn()
    } finally {
      running--
      waiting.shift()?.()
    }
  }
}

export async function runPipeline(topic: string, count: number, deps: PipelineDeps): Promise<PipelineResult> {
  const cost: Record<AgentName, number> = { 'fermi-generator': 0, 'fermi-verifier': 0 }
  let limit: string | null = null
  const { batch, leftovers } = parseBatch(await deps.cli(['batch']))
  const before = parseList(await deps.cli(['list']))

  const agent = async (name: AgentName, brief: string) => {
    if (limit) return
    const r = await deps.runAgent(name, brief)
    cost[name] += r.costUsd
    limit ??= r.limit
  }

  // Prepare runs one at a time per batch; the latest result per draft wins.
  const checks = new Map<string, boolean>()
  const sent = new Set<string>()
  const verifying: Promise<void>[] = []
  const verifySlot = limiter(MAX_PARALLEL)
  const prepareChains = new Map<string, Promise<unknown>>()
  const prepareAndVerify = (dir: string) => {
    const run = (prepareChains.get(dir) ?? Promise.resolve()).then(async () => {
      const { passed, failed } = parsePrepare(await deps.cli(['prepare', `${dir}/drafts`]))
      for (const id of failed) checks.set(id, false)
      for (const id of passed) checks.set(id, true)
      const fresh = passed.filter((id) => !sent.has(id))
      fresh.forEach((id) => sent.add(id))
      for (let i = 0; i < fresh.length; i += DRAFTS_PER_VERIFIER) {
        const ids = fresh.slice(i, i + DRAFTS_PER_VERIFIER)
        verifying.push(verifySlot(() => agent('fermi-verifier', verifierBrief(dir, ids))))
      }
    })
    prepareChains.set(dir, run)
    return run
  }

  const draftIds = () => new Set([...sent, ...checks.keys()])
  const addedNow = async () => {
    const after = parseList(await deps.cli(['list']))
    return [...draftIds()].filter((id) => !before.has(id) && after.get(id)?.status === 'active').map((id) => after.get(id)!.category)
  }

  // Leftover batches from runs that died: check and verify what they have.
  await Promise.all(leftovers.map((dir) => prepareAndVerify(dir)))

  // At most two rounds of drafting: the second only for what the first fell short of.
  let added: string[] = []
  for (let round = 0; round < 2 && !limit; round++) {
    const need = count - added.length
    if (need <= 0) break
    const generators = Math.ceil((need * 1.1) / DRAFTS_PER_GENERATOR)
    await eachLimit(Array.from({ length: generators }), MAX_PARALLEL, async () => {
      await agent('fermi-generator', generatorBrief(batch, topic))
      if (!limit) await prepareAndVerify(batch)
    })
    await Promise.all(prepareChains.values())
    await Promise.all(verifying)
    added = await addedNow()
  }

  const byCategory: Record<string, number> = {}
  for (const c of added) byCategory[c] = (byCategory[c] ?? 0) + 1
  return {
    added: added.length,
    byCategory,
    failedChecks: [...checks.values()].filter((ok) => !ok).length,
    rejected: Math.max(0, sent.size - added.length),
    cost,
    limit,
  }
}

/** The run's one printed line: counts, categories and cost only. Starts with `+<n> added`. */
export function formatReport(r: PipelineResult) {
  const cats = Object.entries(r.byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => `${c} ${n}`)
    .join(', ')
  const usd = (n: number) => `$${n.toFixed(2)}`
  const total = r.cost['fermi-generator'] + r.cost['fermi-verifier']
  return (
    `+${r.added} added${cats ? ` (${cats})` : ''} · ${r.failedChecks} failed checks · ${r.rejected} rejected · ` +
    `${usd(total)} (drafting ${usd(r.cost['fermi-generator'])}, verifying ${usd(r.cost['fermi-verifier'])})` +
    (r.added ? `, ${usd(total / r.added)} per question` : '')
  )
}

/** Reads a `claude -p --output-format json` result: its cost and any usage limit it hit. */
export function parseAgentOutput(out: string): AgentResult {
  let json: { total_cost_usd?: number; result?: string } = {}
  try {
    json = JSON.parse(out)
  } catch {
    /* no JSON: the session died */
  }
  return { costUsd: json.total_cost_usd ?? 0, limit: limitMessage(json.result ?? '') ?? limitMessage(out) }
}
