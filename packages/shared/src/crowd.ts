// FerMEANie's "wisdom of the crowd" estimate.
//
// Default: geometric mean (the mean in log space), which suits estimates spanning orders of magnitude.
// If any answer is a wild outlier in log space, FerMEANie "changes the rules" and uses the median,
// which a single silly answer can't drag around.

/** Fewer positive answers than this and FerMEANie sits the round out. */
export const MIN_CROWD = 3
/** An outlier is at least this many orders of magnitude from the crowd median… */
export const OUTLIER_MIN_ORDERS = 3
/** …and at least this many robust standard deviations (1.4826 × MAD) away. */
export const OUTLIER_MAD_K = 4

export interface CrowdStats {
  count: number
  geomean: number
  median: number
  mean: number
  official: number
  method: 'geomean' | 'median'
  /** Indices (into the input array) of positive answers flagged as outliers vs the crowd. */
  outliers: number[]
}

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * @param values one entry per answer; non-positive / non-finite values are ignored
 *   (they can't be placed in log space).
 */
export function crowdEstimate(values: (number | null)[]): CrowdStats | null {
  const idx: number[] = []
  const logs: number[] = []
  values.forEach((v, i) => {
    if (v !== null && Number.isFinite(v) && v > 0) {
      idx.push(i)
      logs.push(Math.log10(v))
    }
  })
  if (logs.length < MIN_CROWD) return null

  const logMedian = median(logs)
  const mad = median(logs.map((l) => Math.abs(l - logMedian)))
  const threshold = Math.max(OUTLIER_MIN_ORDERS, OUTLIER_MAD_K * 1.4826 * mad)
  const outliers = idx.filter((_, k) => Math.abs(logs[k] - logMedian) > threshold)

  const geomean = 10 ** (logs.reduce((a, b) => a + b, 0) / logs.length)
  const med = 10 ** logMedian
  const mean = idx.reduce((a, i) => a + (values[i] as number), 0) / idx.length
  const method = outliers.length > 0 ? 'median' : 'geomean'
  return {
    count: logs.length,
    geomean,
    median: med,
    mean,
    official: method === 'median' ? med : geomean,
    method,
    outliers,
  }
}
