import { describe, it, expect } from 'vitest'
import { AppApiClient, AppApiError } from '../src/clients/app-api.js'

const BASE = 'https://app.example.com'
const SECRET = 'internal-secret-value'

function tokenFor(channel: 'phone' | 'web', callId = 'c1'): string {
  const payload = { callId, orgId: 'o1', channel, iat: 1, exp: 2 }
  return `v1.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.deadbeef`
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

type Handler = (url: string, init: RequestInit, call: number) => Response | Promise<Response>

function fakeFetch(handler: Handler) {
  const calls: { url: string; init: RequestInit }[] = []
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    calls.push({ url, init: init ?? {} })
    return handler(url, init ?? {}, calls.length)
  }) as typeof fetch
  return { calls, impl }
}

function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError')
}

/** A fetch that only settles when its AbortSignal fires. */
const hangingFetch = ((_input: string | URL | Request, init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal
    if (!signal) {
      reject(new Error('request was not given an abort signal'))
      return
    }
    if (signal.aborted) {
      reject(abortError())
      return
    }
    signal.addEventListener('abort', () => reject(abortError()), { once: true })
  })) as typeof fetch

describe('AppApiClient.getCallConfig', () => {
  it('builds the query, sends internal headers, and maps the response', async () => {
    const refreshed = tokenFor('web', 'call 1')
    const { calls, impl } = fakeFetch(() => json({
      session: { instructions: 'Be helpful.' },
      callSid: 'CA_test',
      orgId: 'o1',
      greeting: 'Thanks for calling Acme.',
      token: refreshed,
      tokenExpiresAt: 1_760_000_000_000,
    }))
    const client = new AppApiClient({ baseUrl: `${BASE}/`, secret: SECRET, fetchImpl: impl })

    const config = await client.getCallConfig('call 1', tokenFor('phone', 'call 1'))

    expect(calls).toHaveLength(1)
    const url = new URL(calls[0].url)
    expect(url.origin).toBe(BASE)
    expect(url.pathname).toBe('/api/voice/config')
    expect(url.searchParams.get('callId')).toBe('call 1')
    expect(url.searchParams.get('token')).toBe(tokenFor('phone', 'call 1'))

    const headers = new Headers(calls[0].init.headers)
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('x-internal-secret')).toBe(SECRET)
    expect(calls[0].init.signal).toBeDefined()

    expect(config).toEqual({
      callId: 'call 1',
      orgId: 'o1',
      channel: 'web',
      callSid: 'CA_test',
      greeting: 'Thanks for calling Acme.',
      instructions: 'Be helpful.',
      token: refreshed,
      tokenExpiresAt: 1_760_000_000_000,
    })
  })

  it('falls back to the supplied token and its channel claim', async () => {
    const token = tokenFor('phone')
    const { impl } = fakeFetch(() => json({ callSid: 'CA_test', orgId: 'o1', greeting: 'Hi' }))
    const client = new AppApiClient({ baseUrl: BASE, secret: SECRET, fetchImpl: impl })

    const config = await client.getCallConfig('c1', token)

    expect(config.token).toBe(token)
    expect(config.channel).toBe('phone')
    expect(config.tokenExpiresAt).toBe(0)
    expect(config.instructions).toBe('')
  })

  it('maps a non-2xx response to config_unavailable with the status', async () => {
    const { impl } = fakeFetch(() => json({ error: 'nope' }, 403))
    const client = new AppApiClient({ baseUrl: BASE, secret: SECRET, fetchImpl: impl })

    const error = await client.getCallConfig('c1', tokenFor('phone')).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(AppApiError)
    expect((error as AppApiError).code).toBe('config_unavailable')
    expect((error as AppApiError).status).toBe(403)
  })

  it('maps an unreachable app to config_unavailable without a status', async () => {
    const { impl } = fakeFetch(() => { throw new Error('ECONNREFUSED') })
    const client = new AppApiClient({ baseUrl: BASE, secret: SECRET, fetchImpl: impl })

    await expect(client.getCallConfig('c1', tokenFor('phone'))).rejects.toMatchObject({
      code: 'config_unavailable',
      status: undefined,
    })
  })

  it('maps a timeout to config_unavailable', async () => {
    const client = new AppApiClient({
      baseUrl: BASE, secret: SECRET, fetchImpl: hangingFetch, timeoutMs: 20,
    })

    await expect(client.getCallConfig('c1', tokenFor('phone'))).rejects.toMatchObject({
      code: 'config_unavailable',
    })
  })
})

describe('AppApiClient.respond', () => {
  it('posts the turn and returns the text', async () => {
    const { calls, impl } = fakeFetch(() => json({ text: 'Sure, I can help.' }))
    const client = new AppApiClient({ baseUrl: BASE, secret: SECRET, fetchImpl: impl })
    const history = [{ role: 'user' as const, content: 'hi' }]

    const result = await client.respond({
      callId: 'c1', token: tokenFor('phone'), userText: 'I need an appointment', history,
    })

    expect(result).toEqual({ text: 'Sure, I can help.' })
    expect(calls[0].url).toBe(`${BASE}/api/voice/respond`)
    expect(calls[0].init.method).toBe('POST')
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      callId: 'c1',
      token: tokenFor('phone'),
      userText: 'I need an appointment',
      history,
    })
    const headers = new Headers(calls[0].init.headers)
    expect(headers.get('x-internal-secret')).toBe(SECRET)
  })

  it('maps a non-2xx response to llm_failed', async () => {
    const { impl } = fakeFetch(() => json({ error: 'upstream' }, 502))
    const client = new AppApiClient({ baseUrl: BASE, secret: SECRET, fetchImpl: impl })

    await expect(client.respond({
      callId: 'c1', token: tokenFor('phone'), userText: 'hi', history: [],
    })).rejects.toMatchObject({ code: 'llm_failed', status: 502 })
  })

  it('maps a reply without text to llm_failed', async () => {
    const { impl } = fakeFetch(() => json({ ok: true }))
    const client = new AppApiClient({ baseUrl: BASE, secret: SECRET, fetchImpl: impl })

    await expect(client.respond({
      callId: 'c1', token: tokenFor('phone'), userText: 'hi', history: [],
    })).rejects.toMatchObject({ code: 'llm_failed' })
  })

  it('maps a timeout to llm_failed without leaking the token or secret', async () => {
    const token = tokenFor('phone')
    const client = new AppApiClient({
      baseUrl: BASE, secret: SECRET, fetchImpl: hangingFetch, timeoutMs: 20,
    })

    const error = await client.respond({
      callId: 'c1', token, userText: 'hi', history: [],
    }).catch((e: unknown) => e)

    expect((error as AppApiError).code).toBe('llm_failed')
    expect((error as Error).message).not.toContain(token)
    expect((error as Error).message).not.toContain(SECRET)
    expect((error as Error).stack ?? '').not.toContain(token)
  })
})

describe('AppApiClient.finalize', () => {
  const input = {
    callId: 'c1',
    token: tokenFor('phone'),
    transcript: [{ role: 'caller' as const, text: 'hi' }, { role: 'agent' as const, text: 'hello' }],
    durationSeconds: 42.5,
    endReason: 'hangup',
  }

  it('succeeds after two failures within three attempts', async () => {
    const sleeps: number[] = []
    const { calls, impl } = fakeFetch((_url, _init, call) =>
      call < 3 ? json({ error: 'busy' }, 503) : json({ ok: true }))
    const client = new AppApiClient({
      baseUrl: BASE, secret: SECRET, fetchImpl: impl,
      sleep: async (ms) => { sleeps.push(ms) },
    })

    const result = await client.finalize(input)

    expect(result).toEqual({ ok: true })
    expect(calls).toHaveLength(3)
    expect(sleeps).toEqual([0, 500, 2000])
    expect(JSON.parse(String(calls[0].init.body))).toEqual(input)
    expect(calls[0].url).toBe(`${BASE}/api/voice/finalize`)
    expect(calls[0].init.method).toBe('POST')
  })

  it('throws finalize_failed after three attempts', async () => {
    const sleeps: number[] = []
    const { calls, impl } = fakeFetch(() => json({ error: 'down' }, 500))
    const client = new AppApiClient({
      baseUrl: BASE, secret: SECRET, fetchImpl: impl,
      sleep: async (ms) => { sleeps.push(ms) },
    })

    await expect(client.finalize(input)).rejects.toMatchObject({
      code: 'finalize_failed',
      status: 500,
    })
    expect(calls).toHaveLength(3)
    expect(sleeps).toEqual([0, 500, 2000])
  })

  it('retries network errors too', async () => {
    const { calls, impl } = fakeFetch(() => { throw new Error('ECONNRESET') })
    const client = new AppApiClient({
      baseUrl: BASE, secret: SECRET, fetchImpl: impl, sleep: async () => {},
    })

    await expect(client.finalize(input)).rejects.toMatchObject({ code: 'finalize_failed' })
    expect(calls).toHaveLength(3)
  })

  it('uses the finalize timeout and maps a timeout to finalize_failed', async () => {
    const client = new AppApiClient({
      baseUrl: BASE, secret: SECRET, fetchImpl: hangingFetch,
      sleep: async () => {}, finalizeTimeoutMs: 20,
    })

    await expect(client.finalize(input)).rejects.toMatchObject({ code: 'finalize_failed' })
  })

  it('does not leak the secret or token in errors', async () => {
    const { impl } = fakeFetch(() => json({ error: 'down' }, 500))
    const client = new AppApiClient({
      baseUrl: BASE, secret: SECRET, fetchImpl: impl, sleep: async () => {},
    })

    const error = await client.finalize(input).catch((e: unknown) => e)
    expect((error as Error).message).not.toContain(SECRET)
    expect((error as Error).message).not.toContain(input.token)
  })
})

describe('AppApiClient timeout implementation', () => {
  it('falls back to AbortController when AbortSignal.timeout is unavailable', async () => {
    const original = AbortSignal.timeout
    // @ts-expect-error deliberately remove the static helper to exercise the fallback
    AbortSignal.timeout = undefined
    try {
      const client = new AppApiClient({
        baseUrl: BASE, secret: SECRET, fetchImpl: hangingFetch, timeoutMs: 20,
      })

      await expect(client.getCallConfig('c1', tokenFor('phone'))).rejects.toMatchObject({
        code: 'config_unavailable',
      })
    } finally {
      AbortSignal.timeout = original
    }
  })
})
