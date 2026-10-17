// Locale-neutral number formatting: `.` decimal, narrow no-break space digit groups (31 622 400).

export const GROUP = '\u202F'

const SUPER: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '-': '⁻',
}

export function superscript(n: number | string): string {
  return String(n)
    .split('')
    .map((c) => SUPER[c] ?? c)
    .join('')
}

function group(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP)
}

function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s
}

/** `3.16 × 10¹⁵` */
export function formatScientific(v: number, sig = 3): string {
  if (v === 0) return '0'
  const exp = Math.floor(Math.log10(Math.abs(v)))
  let mant = v / 10 ** exp
  let e = exp
  let m = trimZeros(mant.toFixed(sig - 1))
  if (Math.abs(Number(m)) >= 10) {
    // rounding pushed 9.995 → 10.0
    e += 1
    mant = v / 10 ** e
    m = trimZeros(mant.toFixed(sig - 1))
  }
  return m === '1' ? `10${superscript(e)}` : m === '-1' ? `-10${superscript(e)}` : `${m} × 10${superscript(e)}`
}

/** Exact-ish display for the calculator's result column. */
export function formatNumber(v: number): string {
  if (!Number.isFinite(v)) return String(v)
  if (v === 0) return '0'
  const a = Math.abs(v)
  if (a >= 1e15 || a < 1e-4) return formatScientific(v, 4)
  const intDigits = a >= 1 ? Math.floor(Math.log10(a)) + 1 : 1
  const decimals = Math.min(6, Math.max(0, 10 - intDigits))
  let s = trimZeros(a.toFixed(decimals))
  const [i, d] = s.split('.')
  s = group(i) + (d ? '.' + d : '')
  return (v < 0 ? '-' : '') + s
}

const WORDS: [number, string][] = [
  [1e15, 'quadrillion'],
  [1e12, 'trillion'],
  [1e9, 'billion'],
  [1e6, 'million'],
  [1e3, 'thousand'],
]

/** Compact human reading: `31.6 million`, `4 200`, `3.2 × 10²⁰`. */
export function formatCompact(v: number, sig = 3): string {
  if (!Number.isFinite(v)) return String(v)
  const a = Math.abs(v)
  if (a >= 1e18 || (a > 0 && a < 1e-3)) return formatScientific(v, sig)
  const r = Number(a.toPrecision(sig))
  if (r >= 1e6) {
    for (const [scale, word] of WORDS) {
      if (r >= scale) return `${v < 0 ? '-' : ''}${trimZeros(String(Number((r / scale).toPrecision(sig))))} ${word}`
    }
  }
  return formatNumber(Number(v.toPrecision(sig)))
}

/** `≈ 31.6 million` when it adds something to the exact value, otherwise undefined. */
export function formatApprox(v: number): string | undefined {
  const a = Math.abs(v)
  if (!Number.isFinite(v) || a < 1e6) return undefined
  return `≈ ${formatCompact(v)}`
}

/** How many times off: `exact`, `2.4×`, `3 200×`, `4.1 million×`, `3.2 × 10²⁰×`. */
export function formatFactor(f: number): string {
  if (!Number.isFinite(f)) return '∞×'
  if (f < 1.0005) return 'exact'
  if (f < 10) return `${trimZeros(f.toFixed(f < 1.1 ? 2 : 1))}×`
  if (f < 1e6) return `${formatNumber(Number(f.toPrecision(2)))}×`
  return `${formatCompact(f, 2)}×`
}
