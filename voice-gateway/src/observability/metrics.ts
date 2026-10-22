/**
 * In-process metrics with Prometheus text exposition.
 *
 * Deliberately dependency-free and bounded: counters/gauges keep one number per label
 * set, histograms keep fixed buckets. `render()` is what `/metrics` returns.
 */

export type Labels = Record<string, string | number>

type MetricType = 'counter' | 'gauge' | 'histogram'

interface HistogramSeries {
  /** Non-cumulative observation counts per bucket index. */
  counts: number[]
  sum: number
  count: number
}

interface Series {
  labels: Record<string, string>
  value?: number
  histogram?: HistogramSeries
}

interface MetricEntry {
  type: MetricType
  buckets?: number[]
  series: Map<string, Series>
}

export const DEFAULT_HISTOGRAM_BUCKETS: readonly number[] = [250, 500, 1000, 2000, 4000, 8000]

const METRIC_NAME = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/

const PREREGISTERED: ReadonlyArray<readonly [string, MetricType]> = [
  ['voice_sessions_total', 'counter'],
  ['voice_turns_total', 'counter'],
  ['voice_errors_total', 'counter'],
  ['voice_barge_ins_total', 'counter'],
  ['voice_finalize_failures_total', 'counter'],
  ['voice_sessions_active', 'gauge'],
  ['voice_turn_duration_ms', 'histogram'],
]

function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
}

function normalizeLabels(labels: Labels): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(labels)) out[key] = String(value)
  return out
}

/** Renders `{a="b",c="d"}`, or `''` for an empty set. Keys are sorted. */
function renderLabels(labels: Record<string, string>, extra?: Record<string, string>): string {
  const merged = extra ? { ...labels, ...extra } : labels
  const keys = Object.keys(merged).sort()
  if (keys.length === 0) return ''
  return `{${keys.map((key) => `${key}="${escapeLabelValue(merged[key])}"`).join(',')}}`
}

function formatNumber(value: number): string {
  return String(value)
}

function compareStrings(a: string, b: string): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}

export class Metrics {
  private readonly entries = new Map<string, MetricEntry>()
  private readonly bucketOverrides: Record<string, number[]>

  constructor(buckets: Record<string, number[]> = {}) {
    this.bucketOverrides = {}
    for (const [name, values] of Object.entries(buckets)) {
      this.bucketOverrides[name] = [...values].sort((a, b) => a - b)
    }
    for (const [name, type] of PREREGISTERED) {
      this.entries.set(name, this.createEntry(type, name))
    }
  }

  inc(name: string, labels: Labels = {}, value = 1): void {
    const entry = this.entryFor(name, 'counter')
    if (!entry) return
    const normalized = normalizeLabels(labels)
    const key = renderLabels(normalized)
    const series = entry.series.get(key)
    if (series) series.value = (series.value ?? 0) + value
    else entry.series.set(key, { labels: normalized, value })
  }

  observe(name: string, ms: number, labels: Labels = {}): void {
    const entry = this.entryFor(name, 'histogram')
    if (!entry) return
    const normalized = normalizeLabels(labels)
    const key = renderLabels(normalized)
    let series = entry.series.get(key)
    if (!series) {
      const buckets = entry.buckets ?? []
      series = {
        labels: normalized,
        histogram: { counts: buckets.map(() => 0), sum: 0, count: 0 },
      }
      entry.series.set(key, series)
    }
    const histogram = series.histogram as HistogramSeries
    const buckets = entry.buckets ?? []
    const bucketIndex = buckets.findIndex((bucket) => ms <= bucket)
    if (bucketIndex >= 0) histogram.counts[bucketIndex] += 1
    histogram.sum += ms
    histogram.count += 1
  }

  gauge(name: string, value: number, labels: Labels = {}): void {
    const entry = this.entryFor(name, 'gauge')
    if (!entry) return
    const normalized = normalizeLabels(labels)
    const key = renderLabels(normalized)
    const series = entry.series.get(key)
    if (series) series.value = value
    else entry.series.set(key, { labels: normalized, value })
  }

  render(): string {
    const names = [...this.entries.entries()]
      .filter(([, entry]) => entry.series.size > 0)
      .map(([name]) => name)
      .sort(compareStrings)

    const lines: string[] = []
    for (const name of names) {
      const entry = this.entries.get(name) as MetricEntry
      lines.push(`# HELP ${name} ${name}`)
      lines.push(`# TYPE ${name} ${entry.type}`)

      const series = [...entry.series.values()].sort((a, b) =>
        compareStrings(renderLabels(a.labels), renderLabels(b.labels)))

      for (const item of series) {
        if (entry.type === 'histogram') {
          const histogram = item.histogram as HistogramSeries
          const buckets = entry.buckets ?? []
          let cumulative = 0
          for (let index = 0; index < buckets.length; index += 1) {
            cumulative += histogram.counts[index]
            const labels = renderLabels(item.labels, { le: formatNumber(buckets[index]) })
            lines.push(`${name}_bucket${labels} ${formatNumber(cumulative)}`)
          }
          const infLabels = renderLabels(item.labels, { le: '+Inf' })
          lines.push(`${name}_bucket${infLabels} ${formatNumber(histogram.count)}`)
          lines.push(`${name}_sum${renderLabels(item.labels)} ${formatNumber(histogram.sum)}`)
          lines.push(`${name}_count${renderLabels(item.labels)} ${formatNumber(histogram.count)}`)
        } else {
          lines.push(`${name}${renderLabels(item.labels)} ${formatNumber(item.value ?? 0)}`)
        }
      }
    }

    return lines.length === 0 ? '' : `${lines.join('\n')}\n`
  }

  private entryFor(name: string, type: MetricType): MetricEntry | undefined {
    if (!METRIC_NAME.test(name)) return undefined
    const existing = this.entries.get(name)
    if (existing) return existing.type === type ? existing : undefined
    const entry = this.createEntry(type, name)
    this.entries.set(name, entry)
    return entry
  }

  private createEntry(type: MetricType, name: string): MetricEntry {
    const entry: MetricEntry = { type, series: new Map() }
    if (type === 'histogram') {
      entry.buckets = this.bucketOverrides[name] ?? [...DEFAULT_HISTOGRAM_BUCKETS]
    }
    return entry
  }
}

/** Process-wide metrics registry used by the gateway. */
export const metrics = new Metrics()
