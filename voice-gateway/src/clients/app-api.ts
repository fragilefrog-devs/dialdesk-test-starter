/**
 * Typed client for the app's internal voice endpoints.
 *
 * Every request carries `content-type: application/json` and `x-internal-secret`.
 * Tokens and bodies are never logged; failures surface as `AppApiError` with a stable
 * code so the gateway can map them to protocol errors.
 */

import type { Channel, VoiceSessionConfig } from '../protocol.js'

export type AppApiErrorCode = 'config_unavailable' | 'llm_failed' | 'finalize_failed' | 'http_error'

export class AppApiError extends Error {
  constructor(
    public readonly code: AppApiErrorCode,
    public readonly status?: number,
  ) {
    super(status === undefined ? code : `${code} (HTTP ${status})`)
    this.name = 'AppApiError'
  }
}

export interface AppApiOptions {
  baseUrl: string
  secret: string
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  timeoutMs?: number // default 10_000
  finalizeTimeoutMs?: number // default 5_000
}

export interface RespondInput {
  callId: string
  token: string
  userText: string
  history: { role: 'user' | 'assistant'; content: string }[]
}

export interface FinalizeInput {
  callId: string
  token: string
  transcript: { role: 'caller' | 'agent'; text: string }[]
  durationSeconds: number
  endReason: string
}

type Method = 'GET' | 'POST'

/** Delays before each finalize attempt (three attempts total). */
const FINALIZE_DELAYS: readonly number[] = [0, 500, 2000]

const defaultSleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms) })

/** Reads the `channel` claim out of a v1 token; the app does not repeat it in JSON. */
function channelFromToken(token: string): Channel | undefined {
  const parts = token.split('.')
  if (parts.length !== 3) return undefined
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as unknown
    if (payload && typeof payload === 'object') {
      const channel = (payload as { channel?: unknown }).channel
      if (channel === 'phone' || channel === 'web') return channel
    }
  } catch {
    // A malformed token is not this layer's problem; fall through to the default.
  }
  return undefined
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export class AppApiClient {
  private readonly baseUrl: string
  private readonly secret: string
  private readonly fetchImpl: typeof fetch
  private readonly sleep: (ms: number) => Promise<void>
  private readonly timeoutMs: number
  private readonly finalizeTimeoutMs: number

  constructor(opts: AppApiOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '')
    this.secret = opts.secret
    this.fetchImpl = opts.fetchImpl ?? fetch
    this.sleep = opts.sleep ?? defaultSleep
    this.timeoutMs = opts.timeoutMs ?? 10_000
    this.finalizeTimeoutMs = opts.finalizeTimeoutMs ?? 5_000
  }

  async getCallConfig(callId: string, token: string): Promise<VoiceSessionConfig> {
    const query = new URLSearchParams({ callId, token }).toString()

    let response: Response
    try {
      response = await this.send(`/api/voice/config?${query}`, 'GET', undefined, this.timeoutMs)
    } catch {
      throw new AppApiError('config_unavailable')
    }
    if (!response.ok) throw new AppApiError('config_unavailable', response.status)

    const body = await safeJson(response)
    if (!isRecord(body)) throw new AppApiError('config_unavailable', response.status)

    const session = isRecord(body.session) ? body.session : {}
    const refreshedToken = typeof body.token === 'string' && body.token ? body.token : token
    const bodyChannel = body.channel === 'phone' || body.channel === 'web' ? body.channel : undefined

    return {
      callId,
      orgId: typeof body.orgId === 'string' ? body.orgId : '',
      channel: bodyChannel ?? channelFromToken(refreshedToken) ?? 'phone',
      callSid: typeof body.callSid === 'string' ? body.callSid : '',
      greeting: typeof body.greeting === 'string' ? body.greeting : '',
      instructions: typeof session.instructions === 'string' ? session.instructions : '',
      token: refreshedToken,
      tokenExpiresAt: typeof body.tokenExpiresAt === 'number' ? body.tokenExpiresAt : 0,
    }
  }

  async respond(input: RespondInput): Promise<{ text: string }> {
    let response: Response
    try {
      response = await this.send('/api/voice/respond', 'POST', {
        callId: input.callId,
        token: input.token,
        userText: input.userText,
        history: input.history,
      }, this.timeoutMs)
    } catch {
      throw new AppApiError('llm_failed')
    }

    const body = await safeJson(response)
    if (!response.ok) throw new AppApiError('llm_failed', response.status)
    const text = isRecord(body) ? body.text : undefined
    if (typeof text !== 'string') throw new AppApiError('llm_failed', response.status)
    return { text }
  }

  async finalize(input: FinalizeInput): Promise<{ ok: boolean }> {
    let lastStatus: number | undefined

    for (let attempt = 0; attempt < FINALIZE_DELAYS.length; attempt += 1) {
      await this.sleep(FINALIZE_DELAYS[attempt])
      try {
        const response = await this.send('/api/voice/finalize', 'POST', {
          callId: input.callId,
          token: input.token,
          transcript: input.transcript,
          durationSeconds: input.durationSeconds,
          endReason: input.endReason,
        }, this.finalizeTimeoutMs)

        if (response.ok) {
          const body = await safeJson(response)
          const ok = isRecord(body) && body.ok === false ? false : true
          return { ok }
        }
        lastStatus = response.status
      } catch {
        lastStatus = undefined
      }
    }

    throw new AppApiError('finalize_failed', lastStatus)
  }

  private async send(path: string, method: Method, body: unknown, timeoutMs: number): Promise<Response> {
    const { signal, clear } = this.abortSignal(timeoutMs)
    try {
      return await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'content-type': 'application/json',
          'x-internal-secret': this.secret,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
      })
    } finally {
      clear()
    }
  }

  private abortSignal(timeoutMs: number): { signal: AbortSignal; clear: () => void } {
    if (typeof AbortSignal.timeout === 'function') {
      return { signal: AbortSignal.timeout(timeoutMs), clear: () => { /* no timer to clear */ } }
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    return { signal: controller.signal, clear: () => clearTimeout(timer) }
  }
}
