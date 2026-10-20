import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { CATEGORIES, fermeanieRelease, KEY_RE, toRevealed } from '@fermi/shared'
import { tx, type DB } from './db.ts'
import { RoomsFullError, type RoomRegistry } from './rooms.ts'
import { hashKey, rateLimiter } from './keys.ts'
import { randomUUID } from 'node:crypto'
import { checkPool, type CheckReport } from './questions/check.ts'
import { ingestQuestion } from './questions/ingest.ts'
import {
  addDispute,
  addRejection,
  countActive,
  exportAll,
  getQuestion,
  isPlayed,
  listRejections,
  listTexts,
  loadCandidates,
  openDisputes,
  purgeReplaced,
  resolveDisputes,
  setFlags,
  setStatus,
} from './questions/repo.ts'

export interface AppDeps {
  db: DB
  rooms: RoomRegistry
  adminToken?: string
  rateLimits?: typeof RATE_LIMITS
}

export const RATE_LIMITS = { rooms: { max: 10, windowMs: 60_000 }, disputes: { max: 20, windowMs: 3_600_000 } }

/** The client's address. Behind a reverse proxy set FERMI_TRUST_PROXY=1 to use X-Forwarded-For. */
function clientIp(c: Context): string {
  if (process.env.FERMI_TRUST_PROXY) {
    const fwd = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    if (fwd) return fwd
  }
  const env = c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined
  return env?.incoming?.socket?.remoteAddress ?? 'unknown'
}

export function createApp({ db, rooms, adminToken, rateLimits = RATE_LIMITS }: AppDeps) {
  const app = new Hono()
  const roomLimit = rateLimiter(rateLimits.rooms.max, rateLimits.rooms.windowMs)
  const disputeLimit = rateLimiter(rateLimits.disputes.max, rateLimits.disputes.windowMs)
  /** Answers and disputes are hidden while the question is being played somewhere. */
  const lookupable = (id: string) => !!getQuestion(db, id) && isPlayed(db, id) && !rooms.liveQuestionIds().has(id)

  app.get('/api/health', (c) => c.json({ ok: true, questions: countActive(db), rooms: rooms.size }))

  app.post('/api/rooms', (c) => {
    if (!roomLimit(clientIp(c))) return c.json({ error: 'Slow down: too many new rooms. Try again in a minute.' }, 429)
    try {
      return c.json({ code: rooms.create().code }, 201)
    } catch (e) {
      if (e instanceof RoomsFullError) return c.json({ error: 'The server is full right now. Try again later.' }, 503)
      throw e
    }
  })

  app.get('/api/rooms/:code', (c) => {
    const room = rooms.get(c.req.param('code'))
    return room ? c.json({ code: room.code, exists: true }) : c.json({ exists: false }, 404)
  })

  app.get('/api/fermeanie', (c) => {
    const row = db.prepare('SELECT wins, games_played AS gamesPlayed FROM fermeanie WHERE id = 1').get() as {
      wins: number
      gamesPlayed: number
    }
    return c.json({ ...row, ...fermeanieRelease(row.wins) })
  })

  // ---------- recap & sources (only for questions that have been revealed in a game) ----------

  app.get('/api/games/:id', (c) => {
    const row = db
      .prepare('SELECT id, created_at AS createdAt, finished_at AS finishedAt, settings, rounds, final FROM games WHERE id = ?')
      .get(c.req.param('id')) as
      { id: string; createdAt: string; finishedAt: string | null; settings: string; rounds: string; final: string | null } | undefined
    if (!row) return c.json({ error: 'Game not found' }, 404)
    return c.json({
      ...row,
      settings: JSON.parse(row.settings),
      rounds: JSON.parse(row.rounds),
      final: row.final ? JSON.parse(row.final) : null,
    })
  })

  app.get('/api/questions/:id', (c) => {
    const id = c.req.param('id')
    const q = getQuestion(db, id)
    if (!q || !lookupable(id)) return c.json({ error: 'Question not found (it has to be played before it can be looked up)' }, 404)
    return c.json({ question: toRevealed(q.question), status: q.status, flags: q.flags })
  })

  const DisputeBody = z.object({ message: z.string().trim().min(5).max(2000), key: z.string().regex(KEY_RE).optional() })
  app.post('/api/questions/:id/dispute', async (c) => {
    const id = c.req.param('id')
    if (!lookupable(id)) return c.json({ error: 'Question not found' }, 404)
    const ip = clientIp(c)
    if (!disputeLimit(ip)) return c.json({ error: 'Too many disputes from here. Try again later.' }, 429)
    const body = DisputeBody.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'Please describe what looks wrong (at least a few words)' }, 400)
    const reporter = body.data.key ? `key:${hashKey(body.data.key)}` : `ip:${ip}`
    const added = addDispute(db, id, reporter, body.data.message)
    return c.json({ ok: true, alreadyReported: !added }, added ? 201 : 200)
  })

  // ---------- admin (question pipeline) ----------

  const admin = new Hono()
  admin.use('*', async (c, next) => {
    if (!adminToken) return c.json({ error: 'Admin API disabled: set FERMI_ADMIN_TOKEN' }, 403)
    if (c.req.header('authorization') !== `Bearer ${adminToken}`) return c.json({ error: 'Unauthorized' }, 401)
    await next()
  })

  const AddBody = z.object({
    questions: z.array(z.unknown()).min(1).max(200),
    batchId: z.string().max(80).optional(),
    replaces: z.string().optional(),
    /** Merge from an export: questions may carry _status/_flags/_replacedBy. */
    import: z.boolean().optional(),
    /** With replaces: a new wording of the same fact (see IngestOptions.reword). */
    reword: z.boolean().optional(),
    /** Validate and dedupe only; insert nothing. */
    dryRun: z.boolean().optional(),
  })
  admin.post('/questions', async (c) => {
    const body = AddBody.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'Expected { questions: [...], batchId?, replaces? }' }, 400)
    if (body.data.replaces && body.data.questions.length !== 1) return c.json({ error: 'replaces works with exactly one question' }, 400)
    const candidates = loadCandidates(db) // once per request, not once per question
    const results = body.data.questions.map((raw) => {
      if (!body.data.import)
        return ingestQuestion(db, raw, {
          batchId: body.data.batchId,
          replaces: body.data.replaces,
          reword: body.data.reword,
          dryRun: body.data.dryRun,
          candidates,
        })
      const { _status, _flags, _replacedBy, ...q } = (raw ?? {}) as { _status?: string; _flags?: string[]; _replacedBy?: unknown }
      const status = _status === 'disputed' || _status === 'retired' || _status === 'active' ? _status : undefined
      return ingestQuestion(db, q, {
        batchId: body.data.batchId,
        candidates,
        import: {
          status,
          flags: Array.isArray(_flags) ? _flags : [],
          replacedBy: typeof _replacedBy === 'string' ? _replacedBy : undefined,
        },
      })
    })
    if (body.data.replaces && !body.data.dryRun && results[0].status === 'added')
      resolveDisputes(db, body.data.replaces, `replaced by ${results[0].id}`)
    const anyConflict = results.some((r) => r.status === 'duplicate' || r.status === 'needs_review')
    const anyInvalid = results.some((r) => r.status === 'invalid')
    const status = body.data.dryRun
      ? 200
      : results.every((r) => r.status === 'added' || r.status === 'exists')
        ? 201
        : results.length === 1
          ? anyConflict
            ? 409
            : anyInvalid
              ? 422
              : 200
          : 200
    return c.json({ results }, status)
  })

  admin.get('/questions', (c) => c.json({ questions: listTexts(db) }))
  admin.get('/questions/export', (c) =>
    c.json({ exportedAt: new Date().toISOString(), questions: exportAll(db), rejections: listRejections(db) }),
  )
  admin.get('/questions/:id', (c) => {
    const q = getQuestion(db, c.req.param('id'))
    return q ? c.json(q) : c.json({ error: 'Not found' }, 404)
  })

  const StatusBody = z.object({ status: z.enum(['active', 'disputed', 'retired']), resolution: z.string().max(1000).optional() })
  admin.post('/questions/:id/status', async (c) => {
    const id = c.req.param('id')
    const body = StatusBody.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'Expected { status, resolution? }' }, 400)
    if (!getQuestion(db, id)) return c.json({ error: 'Not found' }, 404)
    setStatus(db, id, body.data.status)
    if (body.data.status !== 'disputed') resolveDisputes(db, id, body.data.resolution ?? body.data.status)
    return c.json({ ok: true })
  })

  // Deletes retired questions that a newer version replaced and nobody played (see purgeReplaced). Only a preview
  // unless the body says { confirm: true }.
  admin.post('/questions/purge', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { confirm?: unknown }
    const confirm = body?.confirm === true
    return c.json({ ids: purgeReplaced(db, { confirm }), deleted: confirm })
  })

  // Free-form markers on many questions at once, e.g. `reviewed:v1` from `pnpm review`. Unknown ids are skipped and
  // reported, not an error. `pnpm q check` only replaces its own flags.
  const FlagsBody = z.object({
    ids: z.array(z.string()).min(1).max(1000),
    add: z.array(z.string().min(1).max(100)).optional(),
    remove: z.array(z.string()).optional(),
  })
  admin.post('/questions/flags', async (c) => {
    const body = FlagsBody.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'Expected { ids, add?, remove? }' }, 400)
    const { ids, add = [], remove = [] } = body.data
    const missing: string[] = []
    let updated = 0
    tx(db, () => {
      for (const id of ids) {
        const q = getQuestion(db, id)
        if (!q) {
          missing.push(id)
          continue
        }
        setFlags(db, id, [...new Set([...q.flags.filter((f) => !remove.includes(f)), ...add])])
        updated++
      }
    })
    return c.json({ updated, missing })
  })

  const RejectBody = z.object({ question: z.string().min(5).max(500), reason: z.string().min(3).max(1000) })
  admin.post('/rejections', async (c) => {
    const body = RejectBody.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'Expected { question, reason }' }, 400)
    addRejection(db, body.data.question, body.data.reason)
    return c.json({ ok: true }, 201)
  })

  admin.get('/disputes', (c) => c.json({ disputes: openDisputes(db) }))

  // Link checks can take many minutes, so they run as a background job that the CLI polls.
  let checkJob: { id: string; links: boolean; startedAt: string; done: boolean; report?: CheckReport; error?: string } | null = null
  admin.post('/check', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { links?: boolean }
    if (!checkJob || checkJob.done) {
      const job = { id: randomUUID(), links: !!body?.links, startedAt: new Date().toISOString(), done: false } as NonNullable<
        typeof checkJob
      >
      checkJob = job
      checkPool(db, { links: job.links })
        .then((r) => (job.report = r))
        .catch((e) => (job.error = String(e?.message ?? e)))
        .finally(() => (job.done = true))
    }
    return c.json(checkJob, 202)
  })
  admin.get('/check', (c) => (checkJob ? c.json(checkJob) : c.json({ error: 'No check has run yet' }, 404)))

  admin.get('/stats', (c) =>
    c.json({
      byStatus: db.prepare('SELECT status, COUNT(*) AS n FROM questions GROUP BY status').all(),
      byCategory: activeByCategory(db),
      rejections: (db.prepare('SELECT COUNT(*) AS n FROM question_rejections').get() as { n: number }).n,
      openDisputes: openDisputes(db).length,
    }),
  )

  app.route('/api/admin', admin)
  app.all('/api/*', (c: Context) => c.json({ error: 'Not found' }, 404))
  return app
}

/** Active questions per category, every category included (empty ones too, so generation can find them), most first. */
function activeByCategory(db: DB) {
  const rows = db.prepare("SELECT category, SUM(status = 'active') AS n FROM questions GROUP BY category").all() as {
    category: string
    n: number
  }[]
  const counts = new Map(rows.map((r) => [r.category, r.n]))
  return CATEGORIES.map((category) => ({ category, n: counts.get(category) ?? 0 })).sort((a, b) => b.n - a.n)
}
