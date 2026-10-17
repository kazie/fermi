// One HTML → text conversion for every source check (prepare, quote, check --links), so they agree.

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  minus: '−',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
  times: '×',
  deg: '°',
  middot: '·',
  thinsp: ' ',
  ensp: ' ',
  emsp: ' ',
  shy: '',
  zwj: '',
  zwnj: '',
}

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m
    }
    return NAMED[code.toLowerCase()] ?? m
  })
}

export function htmlToText(html: string): string {
  return decodeEntities(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, ' ').replace(/<[^>]+>/g, ' '))
}

export async function fetchPageText(url: string, fetchImpl: typeof fetch = fetch, timeoutMs = 30_000): Promise<string | null> {
  try {
    const res = await fetchImpl(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'user-agent': 'Mozilla/5.0 (fermi source check)' },
      redirect: 'follow',
    })
    if (!res.ok) return null
    return htmlToText(await res.text())
  } catch {
    return null
  }
}
