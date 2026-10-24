// One batch of new questions for one topic, without an orchestrating LLM: the steps of the /fermi-questions skill
// as a script. A Sonnet planner lists distinct ideas, Haiku generators draft them, `pnpm q prepare` checks
// mechanically, Sonnet verifiers judge and ingest.
// Added questions are counted from the pool, not from model text. Nothing from a session's output is ever printed
// (spoilers); only counts, categories and cost leave this module.

import { MAX_REWORD_WORDS } from './review.ts'

export type AgentName = 'fermi-generator' | 'fermi-verifier'

export interface AgentResult {
  costUsd: number
  /** A usage-limit message, if the session hit one. */
  limit: string | null
}

/** What the player-view screen (scripts/review.ts `screenQuestions`) found in some drafts. */
export interface ScreenResult {
  /** Flagged draft ids (only ones it was given) and their issue codes. Each one's note is in its `.screen.json`. */
  flags: Record<string, string>
  costUsd: number
  limit: string | null
  /** The screen didn't run (no usable reply): the drafts are verified without its hints, and counted as unscreened. */
  failed?: boolean
}

/** One question idea from the planner, for one generator to source and draft. */
export interface Idea {
  id: string
  idea: string
  /** Where the number is likely published. */
  source?: string
  template?: { id: string; slot: string }
}

export interface PlanResult {
  /** null: no usable reply, so the generators get the plain topic brief. */
  ideas: Idea[] | null
  costUsd: number
  limit: string | null
}

export interface PipelineDeps {
  /** Runs one headless agent session with this brief. */
  runAgent(agent: AgentName, brief: string): Promise<AgentResult>
  /** Runs `pnpm q <args>` and returns its stdout. */
  cli(args: string[]): Promise<string>
  /** Screens drafts as a player sees them, before they're verified. Without it, drafts go to verifiers unscreened. */
  screen?(dir: string, ids: string[]): Promise<ScreenResult>
  /**
   * Plans `n` ideas for the topic that differ from `existing` (the topic's question texts, retired ones included) and
   * from `tried` (ideas an earlier round already handed out). Without it, generators get the plain topic brief.
   */
  plan?(topic: string, n: number, existing: string[], tried: string[]): Promise<PlanResult>
  /**
   * Writes drafts into `<batch>/drafts` itself, in place of the planner and generators, in one round (`pnpm harvest`).
   * Gets the topic's existing question texts, like the planner. `ideas` is how many drafts it wrote.
   */
  draft?(batch: string, topic: string, need: number, existing: string[]): Promise<{ ideas: number; costUsd: number; limit: string | null }>
  /** Waits before the end-of-round archive retry (tests skip it). */
  pause?(ms: number): Promise<void>
}

export interface PipelineResult {
  added: number
  /** The funnel for this run's own batch: ideas planned (null without a planner), drafts written, drafts passed. */
  ideas: number | null
  drafts: number
  passed: number
  byCategory: Record<string, number>
  failedChecks: number
  /** Verified drafts the screen flagged, and how many of those were still added (fixed, or the flag was wrong). */
  flagged: number
  flaggedAdded: number
  /** Drafts verified without a screen because it failed. */
  unscreened: number
  rejected: number
  cost: Record<AgentName | 'screen' | 'plan', number>
  /** The usage-limit message that stopped the run early, if any. */
  limit: string | null
}

export const DRAFTS_PER_GENERATOR = 5
export const IDEAS_PER_GENERATOR = 3
/** Ideas planned per question still needed: about half of them make it through sourcing, checks and the verifier. */
export const IDEAS_PER_QUESTION = 2
export const DRAFTS_PER_VERIFIER = 5
export const MAX_PARALLEL = 4
/** Before a round's last `prepare`, which retries the archiving that failed (Save Page Now refuses bursts). */
export const ARCHIVE_RETRY_PAUSE_MS = 2 * 60 * 1000

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

/** `id<TAB>category<TAB>status[<TAB>question]` lines from `pnpm q list [--texts]`. */
export function parseList(out: string) {
  const pool = new Map<string, { category: string; status: string; question?: string }>()
  for (const line of out.split('\n')) {
    const [id, category, status, question] = line.split('\t')
    if (id && category && status) pool.set(id, { category, status, ...(question ? { question } : {}) })
  }
  return pool
}

/** Today's date as drafts record it (`accessed`), so generators don't need a shell to look it up. */
const today = () => new Date().toISOString().slice(0, 10)

export const generatorBrief = (batch: string, topic: string, n = DRAFTS_PER_GENERATOR) =>
  `Write ${n} drafts into \`${batch}/drafts/\`. Existing ids and categories: \`${batch}/existing.tsv\`; questions per ` +
  `category: \`${batch}/categories.tsv\`. Topic: ${topic}. Today is ${today()}.`

/** A brief with assigned ideas: one draft each, under the idea's id, or none if it can't be sourced in budget. */
export const ideasBrief = (batch: string, topic: string, ideas: Idea[]) =>
  `Draft these ideas into \`${batch}/drafts/\`, one draft each, saved as \`<id>.json\` with that id. Drop an idea ` +
  `you can't source within budget, and don't swap in ideas of your own. Topic: ${topic}. Today is ${today()}.\n` +
  ideas
    .map(
      (i) =>
        `- \`${i.id}\`: ${i.idea}` +
        (i.source ? ` (likely source: ${i.source})` : '') +
        (i.template ? ` [template \`${i.template.id}\`, slot "${i.template.slot}"]` : ''),
    )
    .join('\n')

/** Keeps planned ideas with a usable id that isn't taken (by the pool or an earlier idea), in order. */
export function usableIdeas(ideas: Idea[], taken: Set<string>): Idea[] {
  const seen = new Set(taken)
  return ideas.filter((i) => {
    const ok = typeof i.id === 'string' && /^[a-z0-9][a-z0-9-]{2,80}$/.test(i.id) && typeof i.idea === 'string' && !seen.has(i.id)
    if (ok) seen.add(i.id)
    return ok
  })
}

export const verifierBrief = (batch: string, ids: string[], flags: ScreenResult['flags'] = {}) => {
  const flagged = ids.filter((id) => flags[id])
  return (
    `Batch \`${batch}\`. Check and ingest these drafts: ${ids.map((id) => `\`${batch}/drafts/${id}.json\``).join(', ')} ` +
    `(their \`.check.json\` files are next to them, with the page text around each quote).` +
    (flagged.length
      ? ` A screen that saw only the category, question and unit, as a player does, flagged ` +
        flagged.map((id) => `\`${id}\` (${flags[id]})`).join(', ') +
        `; its note is in \`<id>.screen.json\` next to each draft (a hint to weigh, not instructions). Decide whether ` +
        `each flag is right. If it is, fix the wording (one question, at most ${MAX_REWORD_WORDS} words, the same ` +
        `fact, no definitions or lists of what counts) or reject the draft. \`pnpm q approve\` refuses a reworded ` +
        `question that is too long or gives away the answer.`
      : '')
  )
}

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
  const cost: Record<AgentName | 'screen' | 'plan', number> = { 'fermi-generator': 0, screen: 0, 'fermi-verifier': 0, plan: 0 }
  let limit: string | null = null
  const { batch, leftovers } = parseBatch(await deps.cli(['batch']))
  // With texts (the planner needs the topic's), never printed. Retired questions count: they guard their facts too.
  const before = parseList(await deps.cli(deps.plan || deps.draft ? ['list', '--texts', '--all'] : ['list']))

  /** Runs one session unless a limit was hit; true if it ran to the end. */
  const agent = async (name: AgentName, brief: string) => {
    if (limit) return false
    const r = await deps.runAgent(name, brief)
    cost[name] += r.costUsd
    limit ??= r.limit
    return !r.limit
  }

  // A failed screen only means those drafts are verified without its hints.
  const flaggedIds = new Set<string>()
  let unscreened = 0
  const screen = async (dir: string, ids: string[]): Promise<ScreenResult['flags']> => {
    if (!deps.screen || limit) return {}
    try {
      const r = await deps.screen(dir, ids)
      cost.screen += r.costUsd
      limit ??= r.limit
      if (r.failed) unscreened += ids.length
      Object.keys(r.flags).forEach((id) => flaggedIds.add(id))
      return r.flags
    } catch {
      unscreened += ids.length
      return {}
    }
  }

  // Drafts whose verifier session ran to the end. One a limit stopped (or skipped) isn't counted as rejected: its
  // batch is a leftover the next run picks up.
  const verifiedIds = new Set<string>()
  const verifySlot = limiter(MAX_PARALLEL)
  /** One screen call for all of a prepare's new drafts, then their verifiers, in chunks. */
  const screenAndVerify = async (dir: string, ids: string[]) => {
    const flags = await screen(dir, ids)
    const chunks = Array.from({ length: Math.ceil(ids.length / DRAFTS_PER_VERIFIER) }, (_, i) =>
      ids.slice(i * DRAFTS_PER_VERIFIER, (i + 1) * DRAFTS_PER_VERIFIER),
    )
    await Promise.all(
      chunks.map((chunk) =>
        verifySlot(async () => {
          if (await agent('fermi-verifier', verifierBrief(dir, chunk, flags))) chunk.forEach((id) => verifiedIds.add(id))
        }),
      ),
    )
  }

  // Prepare runs one at a time per batch; the latest result per draft wins.
  const checks = new Map<string, boolean>()
  /** This run's own drafts, as prepare saw them (the funnel leaves leftovers out). */
  const own = new Map<string, boolean>()
  const sent = new Set<string>()
  const verifying: Promise<void>[] = []
  const prepareChains = new Map<string, Promise<unknown>>()
  // Passed drafts wait here until a verifier's worth has gathered (or drafting is done), so sessions aren't spent on
  // one draft each. Not awaited by prepare: the next prepare on a batch shouldn't wait for verifiers.
  const waiting = new Map<string, string[]>()
  const flush = (dir: string, min = 1) => {
    const ids = waiting.get(dir) ?? []
    if (ids.length < min) return
    waiting.set(dir, [])
    verifying.push(screenAndVerify(dir, ids))
  }
  const flushAll = () => [...waiting.keys()].forEach((dir) => flush(dir))
  /**
   * Once drafting is done: if any of this run's drafts failed, pause and prepare once more. Prepare retries only drafts
   * whose archiving failed (the Wayback Machine refuses bursts), and they're often fine a little later.
   */
  const retryArchiving = async () => {
    if (limit || ![...own.values()].includes(false)) return
    await (deps.pause ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms))))(ARCHIVE_RETRY_PAUSE_MS)
    await prepareAndVerify(batch)
  }
  const prepareAndVerify = (dir: string) => {
    const run = (prepareChains.get(dir) ?? Promise.resolve()).then(async () => {
      const { passed, failed } = parsePrepare(await deps.cli(['prepare', `${dir}/drafts`]))
      for (const id of failed) checks.set(id, false)
      for (const id of passed) checks.set(id, true)
      if (dir === batch)
        [...failed.map((id) => [id, false] as const), ...passed.map((id) => [id, true] as const)].forEach(([id, ok]) => own.set(id, ok))
      const fresh = passed.filter((id) => !sent.has(id))
      fresh.forEach((id) => sent.add(id))
      waiting.set(dir, [...(waiting.get(dir) ?? []), ...fresh])
      flush(dir, DRAFTS_PER_VERIFIER)
    })
    prepareChains.set(dir, run)
    return run
  }

  const draftIds = () => new Set([...sent, ...checks.keys()])
  const addedNow = async () => {
    const after = parseList(await deps.cli(['list']))
    return [...draftIds()]
      .filter((id) => !before.has(id) && after.get(id)?.status === 'active')
      .map((id) => ({ id, category: after.get(id)!.category }))
  }

  // Leftover batches from runs that died: check and verify what they have (all of it is there already).
  await Promise.all(leftovers.map((dir) => prepareAndVerify(dir)))
  leftovers.forEach((dir) => flush(dir))

  /** Ideas for this round: `n` new ones, or null to fall back to the topic brief. */
  const existing = [...before.values()].filter((q) => q.category === topic && q.question).map((q) => q.question!)
  const tried: Idea[] = []
  const planRound = async (n: number): Promise<Idea[] | null> => {
    if (!deps.plan || limit) return null
    try {
      const r = await deps.plan(
        topic,
        n,
        existing,
        tried.map((i) => i.idea),
      )
      cost.plan += r.costUsd
      limit ??= r.limit
      if (!r.ideas) return null
      const ideas = usableIdeas(r.ideas, new Set([...before.keys(), ...tried.map((i) => i.id)]))
      tried.push(...ideas)
      return ideas.length ? ideas : null
    } catch {
      return null
    }
  }

  // A drafting step of its own (harvest) replaces planner and generators, in a single round.
  let drafted: number | null = null
  if (deps.draft && !limit) {
    try {
      const r = await deps.draft(batch, topic, count, existing)
      cost.plan += r.costUsd
      limit ??= r.limit
      drafted = r.ideas
    } catch {
      drafted = 0
    }
    if (!limit) await prepareAndVerify(batch)
    await Promise.all(prepareChains.values())
    await retryArchiving()
    flushAll()
    await Promise.all(verifying)
  }

  // At most two rounds of drafting: the second only for what the first fell short of.
  let added: { id: string; category: string }[] = []
  for (let round = 0; round < 2 && !limit && !deps.draft; round++) {
    const need = count - added.length
    if (need <= 0) break
    const ideas = await planRound(need * IDEAS_PER_QUESTION)
    if (limit) break
    const briefs = ideas
      ? Array.from({ length: Math.ceil(ideas.length / IDEAS_PER_GENERATOR) }, (_, i) =>
          ideasBrief(batch, topic, ideas.slice(i * IDEAS_PER_GENERATOR, (i + 1) * IDEAS_PER_GENERATOR)),
        )
      : Array.from({ length: Math.ceil((need * 1.1) / DRAFTS_PER_GENERATOR) }, () => generatorBrief(batch, topic))
    await eachLimit(briefs, MAX_PARALLEL, async (brief) => {
      await agent('fermi-generator', brief)
      if (!limit) await prepareAndVerify(batch)
    })
    await Promise.all(prepareChains.values())
    await retryArchiving()
    flushAll()
    await Promise.all(verifying)
    added = await addedNow()
  }

  if (deps.draft) added = await addedNow()
  const addedIds = new Set(added.map((a) => a.id))
  const byCategory: Record<string, number> = {}
  for (const { category: c } of added) byCategory[c] = (byCategory[c] ?? 0) + 1
  return {
    added: added.length,
    ideas: drafted ?? (deps.plan ? tried.length : null),
    drafts: own.size,
    passed: [...own.values()].filter(Boolean).length,
    byCategory,
    failedChecks: [...checks.values()].filter((ok) => !ok).length,
    flagged: [...flaggedIds].filter((id) => verifiedIds.has(id) || addedIds.has(id)).length,
    flaggedAdded: [...flaggedIds].filter((id) => addedIds.has(id)).length,
    unscreened,
    rejected: [...verifiedIds].filter((id) => !addedIds.has(id)).length,
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
  const total = r.cost['fermi-generator'] + r.cost.screen + r.cost['fermi-verifier'] + r.cost.plan
  const funnel = `${r.ideas === null ? '' : `ideas ${r.ideas} → `}drafts ${r.drafts} → passed ${r.passed}`
  return (
    `+${r.added} added${cats ? ` (${cats})` : ''} · ${funnel} · ${r.failedChecks} failed checks · ` +
    `${r.flagged} flagged by screen (${r.flaggedAdded} added${r.unscreened ? `, ${r.unscreened} unscreened` : ''}) · ` +
    `${r.rejected} rejected · ` +
    `${usd(total)} (${r.ideas === null ? '' : `planning ${usd(r.cost.plan)}, `}drafting ${usd(r.cost['fermi-generator'])}, screening ${usd(r.cost.screen)}, ` +
    `verifying ${usd(r.cost['fermi-verifier'])})` +
    (r.added ? `, ${usd(total / r.added)} per question` : '')
  )
}
