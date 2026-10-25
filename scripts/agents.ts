// The headless sessions behind `pnpm grow` and `pnpm harvest` (scripts/pipeline.ts's dependencies), and one pipeline
// run with a heartbeat. Session output is only parsed, never printed: it could hold question texts.

import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { askModel, ROOT, runClaude, runCli } from './claude.ts'
import { parseAgentOutput } from './grow-report.ts'
import {
  formatReport,
  runPipeline,
  type AgentName,
  type AgentResult,
  type PipelineDeps,
  type PipelineResult,
  type PlanResult,
  type ScreenResult,
} from './pipeline.ts'
import { parseIdeas, planPrompt, planSystem } from './plan.ts'
import { rulesSection, screenFilePath, screenQuestions, type ScreenFile, type ScreenItem } from './review.ts'

export interface RunOutcome {
  /** How many questions it added, or null if it failed or hit a usage limit. */
  added: number | null
  report: string
  /** The usage-limit message that stopped the run, if one did. */
  limit?: string
  /** API-equivalent cost of the run. */
  spent: number
}

export const runCost = (r: PipelineResult) => r.cost['fermi-generator'] + r.cost.screen + r.cost['fermi-verifier'] + r.cost.plan

/** The pipeline's agents, planner and screen, billing the account in `configDir`. */
export function pipelineAgents(configDir: string) {
  const allRules = readFileSync(join(ROOT, 'content', 'QUESTION_RULES.md'), 'utf8')
  const rules = rulesSection(allRules)
  const templates = readFileSync(join(ROOT, 'content', 'question-templates.md'), 'utf8')
  /**
   * The rules go into every agent's system prompt rather than being read in the session: the same text in every session
   * is cached once, instead of each session paying to load the file (and carrying it through every turn as a tool result).
   */
  const rulesPrompt = `The question rules (content/QUESTION_RULES.md) are below; you don't need to read the file.\n\n<rules>\n${allRules}\n</rules>`

  /** One headless agent session; its output is only read for cost and usage limits, never printed. */
  function runAgent(agent: AgentName, brief: string, heartbeat: string): Promise<AgentResult> {
    const model = agent === 'fermi-generator' ? ['--model', 'haiku', '--effort', 'low'] : ['--model', 'sonnet']
    const args = ['-p', '--agent', agent, ...model, '--permission-mode', 'dontAsk', '--output-format', 'json']
    return runClaude([...args, '--append-system-prompt', rulesPrompt, brief], configDir, { FERMI_HEARTBEAT: heartbeat }).then(
      parseAgentOutput,
    )
  }

  /** One planner call (scripts/plan.ts). Its reply holds question ideas: parsed, never printed. */
  async function planIdeas(topic: string, n: number, existing: string[], tried: string[]): Promise<PlanResult> {
    const a = await askModel('sonnet', planSystem(allRules, templates), planPrompt(topic, n, existing, tried), configDir)
    return { ideas: a.limit ? null : parseIdeas(a.text), costUsd: a.costUsd, limit: a.limit }
  }

  /**
   * The player-view screen of `pnpm review`, on drafts before they're verified. Each flagged draft gets a `.screen.json`
   * with what the screen saw and its note, for the verifier and `pnpm q approve`. Drafts that can't be read are left out.
   */
  async function screenDrafts(dir: string, ids: string[]): Promise<ScreenResult> {
    const items: ScreenItem[] = []
    const draftPath = (id: string) => join(ROOT, dir, 'drafts', `${id}.json`)
    for (const id of ids) {
      try {
        const d = JSON.parse(readFileSync(draftPath(id), 'utf8'))
        items.push({ id, category: String(d.category), question: String(d.question), unit: String(d.unit) })
      } catch {
        // still being written or broken: prepare passed it, so this is rare; screen the rest
      }
    }
    const r: ScreenResult = { flags: {}, costUsd: 0, limit: null }
    if (!items.length) return r
    const hits = await screenQuestions(
      async (system, prompt) => {
        const a = await askModel('haiku', system, prompt, configDir)
        r.costUsd += a.costUsd
        r.limit ??= a.limit
        return a.limit ? null : a.text
      },
      rules,
      items,
    )
    if (!hits) return { ...r, failed: !r.limit }
    for (const f of hits) {
      const item = items.find((q) => q.id === f.id)!
      const file: ScreenFile = { issue: f.issue, note: f.note, question: item.question, unit: item.unit }
      writeFileSync(screenFilePath(draftPath(f.id)), JSON.stringify(file, null, 2))
      r.flags[f.id] = f.issue
    }
    return r
  }

  /**
   * One batch for one topic (scripts/pipeline.ts). While it runs, a heartbeat file is touched every minute; its batch
   * records the path, so other runs know it's alive (scripts/batch.ts). `extra` replaces steps (e.g. harvest's drafting).
   */
  async function run(topic: string, count: number, extra: Partial<PipelineDeps> = {}): Promise<RunOutcome> {
    const aliveDir = join(ROOT, '.fermi-work', '.alive')
    mkdirSync(aliveDir, { recursive: true })
    const heartbeat = join(aliveDir, `${process.pid}-${randomBytes(3).toString('hex')}`)
    writeFileSync(heartbeat, '')
    const beat = setInterval(() => utimesSync(heartbeat, new Date(), new Date()), 60_000)
    try {
      const r = await runPipeline(topic, count, {
        runAgent: (agent, brief) => runAgent(agent, brief, heartbeat),
        cli: (args) => runCli(args, { FERMI_HEARTBEAT: heartbeat }),
        screen: screenDrafts,
        plan: planIdeas,
        ...extra,
      })
      if (r.limit) {
        const report = `${formatReport(r)} · stopped: ${r.limit}`
        return { added: null, report, limit: r.limit, spent: runCost(r) }
      }
      return { added: r.added, report: formatReport(r), spent: runCost(r) }
    } catch (e) {
      return { added: null, report: (e as Error).message, spent: 0 }
    } finally {
      clearInterval(beat)
      rmSync(heartbeat, { force: true })
    }
  }

  return { run, allRules, templates }
}
