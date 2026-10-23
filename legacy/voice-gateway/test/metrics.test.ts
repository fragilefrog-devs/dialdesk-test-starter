import { describe, it, expect } from 'vitest'
import { Metrics } from '../src/observability/metrics.js'

describe('Metrics', () => {
  it('renders nothing before any observation', () => {
    expect(new Metrics().render()).toBe('')
  })

  it('accumulates counters per label set', () => {
    const metrics = new Metrics()

    metrics.inc('voice_turns_total')
    metrics.inc('voice_turns_total', { channel: 'phone' })
    metrics.inc('voice_turns_total', { channel: 'phone' }, 2)

    const text = metrics.render()
    expect(text).toContain('# HELP voice_turns_total voice_turns_total')
    expect(text).toContain('# TYPE voice_turns_total counter')
    expect(text).toContain('voice_turns_total 1')
    expect(text).toContain('voice_turns_total{channel="phone"} 3')
  })

  it('replaces gauges instead of accumulating them', () => {
    const metrics = new Metrics()

    metrics.gauge('voice_sessions_active', 3)
    metrics.gauge('voice_sessions_active', 1, { channel: 'web' })
    metrics.gauge('voice_sessions_active', 5, { channel: 'web' })

    const text = metrics.render()
    expect(text).toContain('# TYPE voice_sessions_active gauge')
    expect(text).toContain('voice_sessions_active 3')
    expect(text).toContain('voice_sessions_active{channel="web"} 5')
  })

  it('emits cumulative histogram buckets, +Inf, _sum and _count', () => {
    const metrics = new Metrics()

    metrics.observe('voice_turn_duration_ms', 100)
    metrics.observe('voice_turn_duration_ms', 300)
    metrics.observe('voice_turn_duration_ms', 9000)

    const text = metrics.render()
    expect(text).toContain('# TYPE voice_turn_duration_ms histogram')
    expect(text).toContain('voice_turn_duration_ms_bucket{le="250"} 1')
    expect(text).toContain('voice_turn_duration_ms_bucket{le="500"} 2')
    expect(text).toContain('voice_turn_duration_ms_bucket{le="1000"} 2')
    expect(text).toContain('voice_turn_duration_ms_bucket{le="2000"} 2')
    expect(text).toContain('voice_turn_duration_ms_bucket{le="4000"} 2')
    expect(text).toContain('voice_turn_duration_ms_bucket{le="8000"} 2')
    expect(text).toContain('voice_turn_duration_ms_bucket{le="+Inf"} 3')
    expect(text).toContain('voice_turn_duration_ms_sum 9400')
    expect(text).toContain('voice_turn_duration_ms_count 3')
  })

  it('treats bucket boundaries as inclusive', () => {
    const metrics = new Metrics()

    metrics.observe('voice_turn_duration_ms', 250)

    const text = metrics.render()
    expect(text).toContain('voice_turn_duration_ms_bucket{le="250"} 1')
    expect(text).toContain('voice_turn_duration_ms_bucket{le="500"} 1')
  })

  it('includes labels on every histogram series line', () => {
    const metrics = new Metrics()

    metrics.observe('voice_turn_duration_ms', 100, { channel: 'phone' })

    const text = metrics.render()
    expect(text).toContain('voice_turn_duration_ms_bucket{channel="phone",le="250"} 1')
    expect(text).toContain('voice_turn_duration_ms_bucket{channel="phone",le="+Inf"} 1')
    expect(text).toContain('voice_turn_duration_ms_sum{channel="phone"} 100')
    expect(text).toContain('voice_turn_duration_ms_count{channel="phone"} 1')
  })

  it('escapes backslashes, quotes and newlines in label values', () => {
    const metrics = new Metrics()

    metrics.inc('voice_errors_total', { reason: 'bad "quote" \\ slash\nnewline' })

    const text = metrics.render()
    expect(text).toContain('voice_errors_total{reason="bad \\"quote\\" \\\\ slash\\nnewline"} 1')
  })

  it('ignores invalid metric names silently', () => {
    const metrics = new Metrics()

    metrics.inc('not a name')
    metrics.inc('9starts_with_digit')
    metrics.gauge('has-dash', 1)

    expect(metrics.render()).toBe('')
  })

  it('ignores a metric used with the wrong type', () => {
    const metrics = new Metrics()

    metrics.inc('voice_sessions_active')

    expect(metrics.render()).toBe('')
  })

  it('omits pre-registered metrics that have no series', () => {
    const metrics = new Metrics()

    metrics.inc('voice_turns_total')

    const text = metrics.render()
    expect(text).toContain('voice_turns_total')
    expect(text).not.toContain('voice_sessions_total')
    expect(text).not.toContain('voice_turn_duration_ms')
  })

  it('renders metric blocks and series in deterministic sorted order', () => {
    const metrics = new Metrics()

    metrics.inc('voice_turns_total', { z: '9', a: '1' })
    metrics.inc('voice_errors_total')
    metrics.inc('voice_turns_total', { a: '0' })

    const text = metrics.render()
    expect(text.indexOf('# HELP voice_errors_total')).toBeLessThan(
      text.indexOf('# HELP voice_turns_total'),
    )
    expect(text.indexOf('voice_turns_total{a="0"}')).toBeLessThan(
      text.indexOf('voice_turns_total{a="1",z="9"}'),
    )
  })

  it('ends with a newline so the exposition is line-oriented', () => {
    const metrics = new Metrics()
    metrics.inc('voice_turns_total')

    expect(metrics.render().endsWith('\n')).toBe(true)
  })
})
