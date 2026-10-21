import type { Question } from '@fermi/shared'
import { nowIso, tx, type DB } from '../db.ts'
import { normalizeText, normalizeUrl, type Candidate } from './dedupe.ts'

export type QuestionStatus = 'active' | 'disputed' | 'retired'

interface Row {
  id: string
  data: string
  status: QuestionStatus
  flags: string
}

export function getQuestion(db: DB, id: string): { question: Question; status: QuestionStatus; flags: string[] } | undefined {
  const r = db.prepare('SELECT id, data, status, flags FROM questions WHERE id = ?').get(id) as Row | undefined
  return r && { question: JSON.parse(r.data), status: r.status, flags: JSON.parse(r.flags) }
}

export function insertQuestion(db: DB, q: Question, batchId?: string) {
  const now = nowIso()
  db.prepare(
    'INSERT INTO questions (id, data, status, category, answer, unit, norm_text, batch_id, created_at, updated_at, template_id, template_slot) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    q.id,
    JSON.stringify(q),
    'active',
    q.category,
    q.answer,
    q.unit,
    normalizeText(q.question),
    batchId ?? null,
    now,
    now,
    q.template?.id ?? null,
    q.template?.slot ?? null,
  )
  const ins = db.prepare('INSERT INTO question_sources (question_id, url_norm, quote_norm) VALUES (?, ?, ?)')
  for (const s of q.sources) ins.run(q.id, normalizeUrl(s.url), normalizeText(s.quote))
}

export function setStatus(db: DB, id: string, status: QuestionStatus, replacedBy?: string) {
  db.prepare('UPDATE questions SET status = ?, replaced_by = COALESCE(?, replaced_by), updated_at = ? WHERE id = ?').run(
    status,
    replacedBy ?? null,
    nowIso(),
    id,
  )
}

export function setFlags(db: DB, id: string, flags: string[]) {
  db.prepare('UPDATE questions SET flags = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(flags), nowIso(), id)
}

export function loadCandidates(db: DB, excludeId?: string): Candidate[] {
  // A version that was replaced by a corrected one is the same fact as its replacement, which is checked anyway:
  // leaving it out lets a question be corrected or reworded more than once.
  const rows = db
    .prepare(
      "SELECT id, data, status, norm_text, answer, unit, template_id, template_slot FROM questions WHERE NOT (status = 'retired' AND replaced_by IS NOT NULL)",
    )
    .all() as {
    template_id: string | null
    template_slot: string | null
    id: string
    data: string
    status: string
    norm_text: string
    answer: number
    unit: string
  }[]
  const sources = db.prepare('SELECT question_id, url_norm, quote_norm FROM question_sources').all() as {
    question_id: string
    url_norm: string
    quote_norm: string
  }[]
  const byQ = new Map<string, { urlNorm: string; quoteNorm: string }[]>()
  for (const s of sources) {
    const list = byQ.get(s.question_id) ?? []
    list.push({ urlNorm: s.url_norm, quoteNorm: s.quote_norm })
    byQ.set(s.question_id, list)
  }
  const out: Candidate[] = rows
    .filter((r) => r.id !== excludeId)
    .map((r) => ({
      id: r.id,
      question: (JSON.parse(r.data) as Question).question,
      normText: r.norm_text,
      answer: r.answer,
      unit: r.unit,
      status: r.status,
      sources: byQ.get(r.id) ?? [],
      template: r.template_id ? { id: r.template_id, slot: r.template_slot ?? '' } : undefined,
    }))
  const rej = db.prepare('SELECT id, question_text, norm_text, reason FROM question_rejections').all() as {
    id: number
    question_text: string
    norm_text: string
    reason: string
  }[]
  for (const r of rej) {
    out.push({
      id: `rejection-${r.id}`,
      question: r.question_text,
      normText: r.norm_text,
      answer: -1,
      unit: '',
      status: 'rejected',
      sources: [],
      rejectionReason: r.reason,
    })
  }
  return out
}

export function addRejection(db: DB, questionText: string, reason: string) {
  const norm = normalizeText(questionText)
  if (db.prepare('SELECT 1 FROM question_rejections WHERE norm_text = ? AND reason = ?').get(norm, reason)) return
  db.prepare('INSERT INTO question_rejections (question_text, norm_text, reason, at) VALUES (?, ?, ?, ?)').run(
    questionText,
    normalizeText(questionText),
    reason,
    nowIso(),
  )
}

/** IDs and texts only: safe to show a generator agent without spoiling answers. */
export function listTexts(db: DB) {
  return db
    .prepare("SELECT id, category, status, json_extract(data, '$.question') AS question FROM questions ORDER BY created_at")
    .all() as {
    id: string
    category: string
    status: string
    question: string
  }[]
}

/**
 * Deletes retired questions that were replaced by a newer version and never played. The newer version covers the
 * same fact in the duplicate check, and nobody has a `/q/<id>` link to them. Other retired questions are kept: they
 * stop the generator from recreating them. Anything that pointed at a deleted version (a played predecessor in a
 * chain) is pointed at its replacement instead. Returns the ids (deleted, or that would be without `confirm`).
 */
export function purgeReplaced(db: DB, { confirm = false } = {}): string[] {
  const select = db.prepare(
    "SELECT id, replaced_by FROM questions WHERE status = 'retired' AND replaced_by IS NOT NULL AND id NOT IN (SELECT question_id FROM played_questions) ORDER BY id",
  )
  if (!confirm) return (select.all() as { id: string }[]).map((r) => r.id)
  const repoint = db.prepare('UPDATE questions SET replaced_by = ? WHERE replaced_by = ?')
  const deletes = [
    'DELETE FROM disputes WHERE question_id = ?',
    'DELETE FROM player_seen WHERE question_id = ?',
    'DELETE FROM questions WHERE id = ?',
  ].map((sql) => db.prepare(sql)) // question_sources go with the question (ON DELETE CASCADE)
  return tx(db, () => {
    const rows = select.all() as { id: string; replaced_by: string }[]
    for (const r of rows) {
      repoint.run(r.replaced_by, r.id)
      for (const d of deletes) d.run(r.id)
    }
    return rows.map((r) => r.id)
  })
}

export function exportAll(db: DB) {
  const rows = db.prepare('SELECT id, data, status, flags, replaced_by FROM questions ORDER BY created_at').all() as unknown as (Row & {
    replaced_by: string | null
  })[]
  return rows.map((r) => ({
    ...JSON.parse(r.data),
    _status: r.status,
    _flags: JSON.parse(r.flags),
    ...(r.replaced_by ? { _replacedBy: r.replaced_by } : {}),
  }))
}

export function listRejections(db: DB) {
  return db.prepare('SELECT question_text AS question, reason, at FROM question_rejections ORDER BY id').all() as {
    question: string
    reason: string
    at: string
  }[]
}

export function allQuestions(db: DB) {
  return (db.prepare('SELECT id, data, status, flags FROM questions').all() as unknown as Row[]).map((r) => ({
    question: JSON.parse(r.data) as Question,
    status: r.status,
    flags: JSON.parse(r.flags) as string[],
  }))
}

export function countActive(db: DB): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM questions WHERE status = 'active'").get() as { n: number }).n
}

/**
 * Picks an active question, preferring ones the fewest players in the room have seen,
 * never repeating within a game.
 */
export function pickQuestion(db: DB, playerIds: string[], exclude: string[], excludeTemplates: string[] = []): Question | undefined {
  const ph = (n: number) => Array.from({ length: n }, () => '?').join(',') || "''"
  const sql = `
    SELECT q.data,
      (SELECT COUNT(*) FROM player_seen s WHERE s.question_id = q.id AND s.player_id IN (${ph(playerIds.length)})) AS seen
    FROM questions q
    WHERE q.status = 'active' AND q.id NOT IN (${ph(exclude.length)})
      AND (q.template_id IS NULL OR q.template_id NOT IN (${ph(excludeTemplates.length)}))
    ORDER BY seen ASC, RANDOM()
    LIMIT 1`
  const row = db.prepare(sql).get(...playerIds, ...exclude, ...excludeTemplates) as { data: string } | undefined
  return row && JSON.parse(row.data)
}

export function markSeen(db: DB, playerIds: string[], questionId: string) {
  const st = db.prepare('INSERT OR REPLACE INTO player_seen (player_id, question_id, seen_at) VALUES (?, ?, ?)')
  const now = nowIso()
  for (const p of playerIds) st.run(p, questionId, now)
}

export function markPlayed(db: DB, questionId: string) {
  db.prepare('INSERT OR IGNORE INTO played_questions (question_id, first_played_at) VALUES (?, ?)').run(questionId, nowIso())
}

export function isPlayed(db: DB, questionId: string): boolean {
  return !!db.prepare('SELECT 1 FROM played_questions WHERE question_id = ?').get(questionId)
}

/**
 * Player disputes take a question out of rotation only once this many different people agree, and only people who
 * were dealt it count: keys are free to make up, but `player_seen` only has the ones that played it.
 */
export const DISPUTES_TO_DISABLE = 2

/** A dispute's reporter for a player key: its hash, the same one `player_seen` stores, behind this prefix. */
const KEY_REPORTER = 'key:'
export const keyReporter = (keyHash: string) => KEY_REPORTER + keyHash

/**
 * @param reporter who disputes (a hashed player key or `ip:…`); null = the system itself (e.g. `q check`),
 *   which takes the question out of rotation straight away.
 * @returns false if this reporter already has an open dispute on the question.
 */
export function addDispute(db: DB, questionId: string, reporter: string | null, message: string): boolean {
  if (
    reporter &&
    db.prepare('SELECT 1 FROM disputes WHERE question_id = ? AND player_id = ? AND resolved_at IS NULL').get(questionId, reporter)
  ) {
    return false
  }
  db.prepare('INSERT INTO disputes (question_id, player_id, message, at) VALUES (?, ?, ?, ?)').run(questionId, reporter, message, nowIso())
  const { n } = db
    .prepare(
      `SELECT COUNT(DISTINCT d.player_id) AS n FROM disputes d
       WHERE d.question_id = ? AND d.resolved_at IS NULL AND d.player_id IS NOT NULL
         AND d.player_id LIKE ? || '%'
         AND EXISTS (SELECT 1 FROM player_seen s WHERE s.player_id = substr(d.player_id, ?) AND s.question_id = d.question_id)`,
    )
    .get(questionId, KEY_REPORTER, KEY_REPORTER.length + 1) as { n: number }
  if (reporter === null || n >= DISPUTES_TO_DISABLE) {
    db.prepare("UPDATE questions SET status = 'disputed', updated_at = ? WHERE id = ? AND status = 'active'").run(nowIso(), questionId)
  }
  return true
}

export function openDisputes(db: DB) {
  return db.prepare('SELECT id, question_id AS questionId, message, at FROM disputes WHERE resolved_at IS NULL ORDER BY at').all() as {
    id: number
    questionId: string
    message: string
    at: string
  }[]
}

export function resolveDisputes(db: DB, questionId: string, resolution: string) {
  db.prepare('UPDATE disputes SET resolved_at = ?, resolution = ? WHERE question_id = ? AND resolved_at IS NULL').run(
    nowIso(),
    resolution,
    questionId,
  )
}
