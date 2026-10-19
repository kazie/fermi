// Duplicate detection for questions: text similarity, shared source quotes, and matching answers.

export const DUP_TEXT = 0.7
export const GREY_TEXT = 0.45
export const DUP_SAME_ANSWER_TEXT = 0.3
export const GREY_SAME_ANSWER_TEXT = 0.18
export const SAME_ANSWER_RATIO = 0.01
export const DUP_QUOTE = 0.6

const STOPWORDS = new Set(
  `a an the of in on at to for from by with and or is are was were be been being do does did how many much what which
  who whom whose that this these those it its as if into onto than then there their they them would could should will
  can approximately roughly about estimate guess total number amount all every each one per your you we our us`.split(/\s+/),
)

function stem(w: string): string {
  if (w.length > 5 && w.endsWith('ies')) return w.slice(0, -3) + 'y'
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3)
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2)
  if (w.length > 4 && w.endsWith('es') && /(s|x|z|ch|sh)es$/.test(w)) return w.slice(0, -2)
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}

export function normalizeText(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((w) => w && !STOPWORDS.has(w))
    .map(stem)
    .join(' ')
}

export function normalizeUrl(u: string): string {
  try {
    const url = new URL(u)
    const host = url.hostname.replace(/^(www\.|m\.)/, '').replace(/^([a-z]{2})\.m\.wikipedia/, '$1.wikipedia')
    const path = url.pathname.replace(/\/+$/, '')
    return `${host}${path}`.toLowerCase()
  } catch {
    return u.toLowerCase()
  }
}

function trigrams(s: string): Set<string> {
  const t = ` ${s} `
  const out = new Set<string>()
  for (let i = 0; i + 3 <= t.length; i++) out.add(t.slice(i, i + 3))
  return out
}

function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 1
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / (a.size + b.size - inter)
}

/** 0..1 similarity of two already-normalised texts (mix of word and character-trigram overlap). */
export function textSimilarity(normA: string, normB: string): number {
  const wa = new Set(normA.split(' ').filter(Boolean))
  const wb = new Set(normB.split(' ').filter(Boolean))
  return 0.5 * jaccard(wa, wb) + 0.5 * jaccard(trigrams(normA), trigrams(normB))
}

export interface Candidate {
  id: string
  question: string
  normText: string
  answer: number
  unit: string
  status: string
  sources: { urlNorm: string; quoteNorm: string }[]
  /** Rejections are compared by text only. */
  rejectionReason?: string
  template?: { id: string; slot: string }
}

export interface Match {
  id: string
  question: string
  similarity: number
  reasons: string[]
  hard: boolean
  rejectionReason?: string
}

export interface Incoming {
  normText: string
  answer: number
  unit: string
  sources: { urlNorm: string; quoteNorm: string }[]
  template?: { id: string; slot: string }
}

const slotKey = (s: string) => normalizeText(s) || s.toLowerCase().trim()

export function findMatches(q: Incoming, candidates: Candidate[]): Match[] {
  const out: Match[] = []
  for (const c of candidates) {
    // Template siblings differ only in the slot, so wording similarity says nothing about them.
    if (q.template && c.template && q.template.id === c.template.id && c.rejectionReason === undefined) {
      if (slotKey(q.template.slot) === slotKey(c.template.slot)) {
        out.push({ id: c.id, question: c.question, similarity: 1, reasons: ['same template and slot'], hard: true })
      } else if (q.sources.some((s) => c.sources.some((cs) => s.urlNorm === cs.urlNorm && s.quoteNorm === cs.quoteNorm))) {
        out.push({ id: c.id, question: c.question, similarity: 1, reasons: ['cites the exact same quote as a sibling'], hard: true })
      }
      continue
    }
    const sim = textSimilarity(q.normText, c.normText)
    const reasons: string[] = []
    let hard = false
    let grey = false

    if (c.rejectionReason !== undefined) {
      if (sim >= GREY_TEXT) {
        out.push({
          id: c.id,
          question: c.question,
          similarity: round(sim),
          reasons: [`similar to a previously rejected candidate`],
          hard: false,
          rejectionReason: c.rejectionReason,
        })
      }
      continue
    }

    if (sim >= DUP_TEXT) {
      hard = true
      reasons.push('near-identical wording')
    } else if (sim >= GREY_TEXT) {
      grey = true
      reasons.push('similar wording')
    }

    const sameAnswer = Math.abs(q.answer - c.answer) / Math.max(q.answer, c.answer) <= SAME_ANSWER_RATIO
    if (sameAnswer) {
      if (sim >= DUP_SAME_ANSWER_TEXT) {
        hard = true
        reasons.push('same answer and related wording')
      } else if (sim >= GREY_SAME_ANSWER_TEXT && q.unit.toLowerCase() === c.unit.toLowerCase()) {
        grey = true
        reasons.push('same answer and unit')
      }
    }

    for (const s of q.sources) {
      for (const cs of c.sources) {
        if (s.urlNorm === cs.urlNorm && quoteOverlap(s.quoteNorm, cs.quoteNorm) >= DUP_QUOTE) {
          hard = true
          reasons.push('cites the same passage of the same source')
        }
      }
    }

    if (hard || grey) out.push({ id: c.id, question: c.question, similarity: round(sim), reasons: [...new Set(reasons)], hard })
  }
  return out.sort((a, b) => Number(b.hard) - Number(a.hard) || b.similarity - a.similarity)
}

function quoteOverlap(a: string, b: string): number {
  if (!a || !b) return 0
  if (a.includes(b) || b.includes(a)) return 1
  return jaccard(trigrams(a), trigrams(b))
}

const round = (x: number) => Math.round(x * 100) / 100

/**
 * The quote with about `context` characters of page text on each side, or null if the page doesn't contain it.
 * Matches the way the ingest checks do (normalizeText: case, punctuation, stopwords and plurals ignored, and a quote
 * may start or end mid-word). The page is normalized word by word, remembering where each word came from, so the
 * excerpt can be cut from the readable page.
 */
export function quoteExcerpt(page: string | null, quote: string, context = 300): string | null {
  const wanted = normalizeText(quote)
  if (page === null || !wanted) return null
  let normalized = ''
  const words: { at: number; start: number; end: number }[] = [] // at: offset in `normalized`
  for (const m of page.matchAll(/[\p{L}\p{N}\p{M}]+/gu)) {
    const word = normalizeText(m[0])
    if (!word) continue
    if (normalized) normalized += ' '
    words.push({ at: normalized.length, start: m.index, end: m.index + m[0].length })
    normalized += word
  }
  const hit = normalized.indexOf(wanted)
  if (hit < 0) return null
  const first = words.findLast((w) => w.at <= hit)!
  const last = words.findLast((w) => w.at < hit + wanted.length)!
  const start = Math.max(0, first.start - context)
  const end = Math.min(page.length, last.end + context)
  return `${start > 0 ? '…' : ''}${page.slice(start, end).replace(/\s+/g, ' ').trim()}${end < page.length ? '…' : ''}`
}
