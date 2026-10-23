/**
 * JSON line logger.
 *
 * One JSON object per line, written to stdout by default:
 * `{"ts":"<ISO>","level":"info","msg":"...",...bindings,...fields}`
 */

export type LogFields = Record<string, unknown>
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface Logger {
  child(bindings: LogFields): Logger
  debug(msg: string, fields?: LogFields): void
  info(msg: string, fields?: LogFields): void
  warn(msg: string, fields?: LogFields): void
  error(msg: string, fields?: LogFields): void
}

export interface LoggerOptions {
  level?: LogLevel
  sink?: (line: string) => void
  now?: () => Date
}

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }
const LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error']

/** Keys owned by the logger; bindings/fields can never override them. */
const RESERVED = new Set(['ts', 'level', 'msg'])

/** Keys whose *values* must never reach the log stream. */
const REDACTED_KEY = /token|secret|authorization|pcm|transcript/i

const SERIALIZE_FALLBACK = '{"level":"error","msg":"log_serialize_failed"}'

function normalizeLevel(value: string | undefined): LogLevel | undefined {
  if (!value) return undefined
  const candidate = value.trim().toLowerCase()
  return (LEVELS as readonly string[]).includes(candidate) ? (candidate as LogLevel) : undefined
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function stripReserved(fields: LogFields | undefined): LogFields {
  const out: LogFields = {}
  if (!fields) return out
  for (const [key, value] of Object.entries(fields)) {
    if (!RESERVED.has(key)) out[key] = value
  }
  return out
}

function redactValue(value: unknown, seen: Set<object>): unknown {
  if (value instanceof Error) {
    const serialized: LogFields = { name: value.name, message: value.message }
    if (value.stack) serialized.stack = value.stack
    return serialized
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) return '[circular]'
    seen.add(value)
    const out = value.map((item) => redactValue(item, seen))
    seen.delete(value)
    return out
  }

  if (isPlainObject(value)) {
    if (seen.has(value)) return '[circular]'
    seen.add(value)
    const out: LogFields = {}
    for (const [key, child] of Object.entries(value)) {
      out[key] = REDACTED_KEY.test(key) ? '[redacted]' : redactValue(child, seen)
    }
    seen.delete(value)
    return out
  }

  return value
}

/**
 * Creates a logger. `LOG_LEVEL` is consulted at call time (never at import time).
 */
export function createLogger(bindings: LogFields = {}, opts: LoggerOptions = {}): Logger {
  const level: LogLevel = opts.level ?? normalizeLevel(process.env.LOG_LEVEL) ?? 'info'
  const threshold = LEVEL_WEIGHT[level]
  const sink = opts.sink ?? ((line: string) => { console.log(line) })
  const now = opts.now ?? (() => new Date())
  const base = stripReserved(bindings)

  const emit = (entryLevel: LogLevel, msg: string, fields?: LogFields): void => {
    if (LEVEL_WEIGHT[entryLevel] < threshold) return

    const merged = { ...base, ...stripReserved(fields) }
    const body = redactValue(merged, new Set()) as LogFields
    const payload = { ts: now().toISOString(), level: entryLevel, msg, ...body }

    let line: string
    try {
      line = JSON.stringify(payload)
    } catch {
      try { sink(SERIALIZE_FALLBACK) } catch { /* logging must never throw */ }
      return
    }
    try { sink(line) } catch { /* logging must never throw */ }
  }

  return {
    child: (extra: LogFields) =>
      createLogger({ ...base, ...stripReserved(extra) }, { level, sink, now }),
    debug: (msg, fields) => emit('debug', msg, fields),
    info: (msg, fields) => emit('info', msg, fields),
    warn: (msg, fields) => emit('warn', msg, fields),
    error: (msg, fields) => emit('error', msg, fields),
  }
}
