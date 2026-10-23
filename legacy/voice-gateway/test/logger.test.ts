import { afterEach, describe, it, expect, vi } from 'vitest'
import { createLogger } from '../src/observability/logger.js'

const NOW = new Date('2026-01-02T03:04:05.000Z')

function recorder() {
  const lines: string[] = []
  return { lines, sink: (line: string) => { lines.push(line) } }
}

function parsed(lines: string[]): Record<string, unknown>[] {
  return lines.map((line) => JSON.parse(line) as Record<string, unknown>)
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('createLogger', () => {
  it('emits one JSON line per call with the documented shape', () => {
    const { lines, sink } = recorder()
    const logger = createLogger({ service: 'voice-gateway' }, { sink, now: () => NOW })

    logger.info('call started', { callId: 'c1' })

    expect(lines).toHaveLength(1)
    expect(lines[0]).not.toContain('\n')
    expect(parsed(lines)).toEqual([
      { ts: NOW.toISOString(), level: 'info', msg: 'call started', service: 'voice-gateway', callId: 'c1' },
    ])
  })

  it('emits every level at or above the threshold', () => {
    const { lines, sink } = recorder()
    const logger = createLogger({}, { sink, now: () => NOW, level: 'debug' })

    logger.debug('d')
    logger.info('i')
    logger.warn('w')
    logger.error('e')

    expect(parsed(lines).map((line) => line.level)).toEqual(['debug', 'info', 'warn', 'error'])
  })

  it('suppresses levels below the threshold', () => {
    const { lines, sink } = recorder()
    const logger = createLogger({}, { sink, now: () => NOW, level: 'warn' })

    logger.debug('d')
    logger.info('i')
    logger.warn('w')
    logger.error('e')

    expect(parsed(lines).map((line) => line.msg)).toEqual(['w', 'e'])
  })

  it('reads LOG_LEVEL at creation time, defaulting to info', () => {
    const { lines, sink } = recorder()
    vi.stubEnv('LOG_LEVEL', 'error')
    const logger = createLogger({}, { sink, now: () => NOW })

    logger.warn('dropped')
    logger.error('kept')

    expect(parsed(lines).map((line) => line.msg)).toEqual(['kept'])
  })

  it('ignores an unknown LOG_LEVEL', () => {
    const { lines, sink } = recorder()
    vi.stubEnv('LOG_LEVEL', 'verbose')
    const logger = createLogger({}, { sink, now: () => NOW })

    logger.info('kept')

    expect(lines).toHaveLength(1)
  })

  it('merges child bindings, with the child winning over the parent', () => {
    const { lines, sink } = recorder()
    const parent = createLogger({ service: 'gateway', region: 'eu' }, { sink, now: () => NOW })
    const child = parent.child({ callId: 'c1' })
    const grandchild = child.child({ callId: 'c2', turnId: 't_1' })

    parent.info('p')
    child.info('c')
    grandchild.info('g')

    expect(parsed(lines)).toEqual([
      { ts: NOW.toISOString(), level: 'info', msg: 'p', service: 'gateway', region: 'eu' },
      { ts: NOW.toISOString(), level: 'info', msg: 'c', service: 'gateway', region: 'eu', callId: 'c1' },
      {
        ts: NOW.toISOString(), level: 'info', msg: 'g', service: 'gateway', region: 'eu',
        callId: 'c2', turnId: 't_1',
      },
    ])
  })

  it('never lets bindings or fields override ts, level or msg', () => {
    const { lines, sink } = recorder()
    const logger = createLogger({ ts: 'fake', level: 'fake', msg: 'fake' }, { sink, now: () => NOW })

    logger.info('real', { ts: 'fake', level: 'fake', msg: 'fake' })

    expect(parsed(lines)).toEqual([{ ts: NOW.toISOString(), level: 'info', msg: 'real' }])
  })

  it('redacts sensitive keys at the top level and recursively', () => {
    const { lines, sink } = recorder()
    const logger = createLogger({ token: 'binding-token', callId: 'c1' }, { sink, now: () => NOW })

    logger.info('redact', {
      secret: 's3cr3t',
      authorization: 'Bearer abc',
      nested: {
        token: 'tok',
        pcm: 'base64audio',
        transcript: [{ role: 'caller', text: 'hello' }],
        keep: 1,
      },
      list: [{ token: 't1' }, { safe: 'ok' }],
      tokenExpiresAt: 123,
    })

    const line = parsed(lines)[0]
    expect(line.token).toBe('[redacted]')
    expect(line.secret).toBe('[redacted]')
    expect(line.authorization).toBe('[redacted]')
    expect(line.nested).toEqual({
      token: '[redacted]',
      pcm: '[redacted]',
      transcript: '[redacted]',
      keep: 1,
    })
    expect(line.list).toEqual([{ token: '[redacted]' }, { safe: 'ok' }])
    expect(line.tokenExpiresAt).toBe('[redacted]')
    expect(lines[0]).not.toContain('s3cr3t')
    expect(lines[0]).not.toContain('binding-token')
  })

  it('serializes Error values as {name, message, stack}', () => {
    const { lines, sink } = recorder()
    const logger = createLogger({}, { sink, now: () => NOW })
    const error = new Error('boom')

    logger.error('failed', { err: error })

    const serialized = parsed(lines)[0].err as Record<string, unknown>
    expect(serialized.name).toBe('Error')
    expect(serialized.message).toBe('boom')
    expect(typeof serialized.stack).toBe('string')
  })

  it('does not throw on circular structures', () => {
    const { lines, sink } = recorder()
    const logger = createLogger({}, { sink, now: () => NOW })
    const node: Record<string, unknown> = { name: 'root' }
    node.self = node
    const list: unknown[] = []
    list.push(list)

    expect(() => logger.info('circular', { node, list })).not.toThrow()

    const line = parsed(lines)[0]
    expect(line.node).toEqual({ name: 'root', self: '[circular]' })
    expect(line.list).toEqual(['[circular]'])
  })

  it('falls back to a single-line error when serialization fails', () => {
    const { lines, sink } = recorder()
    const logger = createLogger({}, { sink, now: () => NOW })

    expect(() => logger.info('bigint', { value: 1n })).not.toThrow()

    expect(lines).toEqual(['{"level":"error","msg":"log_serialize_failed"}'])
  })

  it('routes the default sink through console.log', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    createLogger({}, { now: () => NOW }).info('default sink')

    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0][0]).toContain('"msg":"default sink"')
  })
})
