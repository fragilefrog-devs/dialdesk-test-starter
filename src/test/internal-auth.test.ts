import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const SECRET = 's'.repeat(32)
const MINIMAL = { INTERNAL_API_SECRET: SECRET }
const STRIP = [
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_STARTER',
  'STRIPE_PRICE_GROWTH', 'STRIPE_PRICE_SCALE', 'RESEND_API_KEY', 'EMAIL_FROM',
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN',
]
const KEYS = [...STRIP, 'INTERNAL_API_SECRET', 'NEXT_PUBLIC_APP_URL']
const original: Record<string, string | undefined> = {}

beforeAll(() => {
  for (const key of KEYS) original[key] = process.env[key]
})

afterAll(() => {
  for (const key of KEYS) {
    if (original[key] === undefined) delete process.env[key]
    else process.env[key] = original[key]
  }
})

/** Replaces the tracked env keys with exactly `vars`. `scoped()` caches per module instance. */
function setEnv(vars: Record<string, string>) {
  for (const key of KEYS) delete process.env[key]
  Object.assign(process.env, vars)
}

function request(secret?: string) {
  return new Request('http://x', secret === undefined ? undefined : { headers: { 'x-internal-secret': secret } })
}

async function loadIsInternalRequest() {
  const { isInternalRequest } = await import('@/lib/internal-auth')
  return isInternalRequest
}

beforeEach(() => {
  vi.resetModules()
})

describe('isInternalRequest', () => {
  it('missing header rejected', async () => {
    setEnv(MINIMAL)
    const isInternalRequest = await loadIsInternalRequest()
    expect(isInternalRequest(request())).toBe(false)
  })

  it('wrong secret same length rejected', async () => {
    setEnv(MINIMAL)
    const isInternalRequest = await loadIsInternalRequest()
    expect(isInternalRequest(request('t'.repeat(32)))).toBe(false)
  })

  it('wrong secret different length rejected', async () => {
    setEnv(MINIMAL)
    const isInternalRequest = await loadIsInternalRequest()
    expect(isInternalRequest(request('short'))).toBe(false)
  })

  it('correct secret accepted', async () => {
    setEnv(MINIMAL)
    const isInternalRequest = await loadIsInternalRequest()
    expect(isInternalRequest(request(SECRET))).toBe(true)
  })

  it('works without billing credentials', async () => {
    setEnv(MINIMAL) // deletes every Stripe/Resend/Twilio key
    const isInternalRequest = await loadIsInternalRequest()
    expect(isInternalRequest(request(SECRET))).toBe(true)
  })
})

describe('appEnv', () => {
  it('only needs NEXT_PUBLIC_APP_URL', async () => {
    setEnv({ NEXT_PUBLIC_APP_URL: 'https://acme.test' })
    vi.resetModules()
    const { appEnv } = await import('@/lib/env')
    expect(appEnv().NEXT_PUBLIC_APP_URL).toBe('https://acme.test')

    setEnv({})
    vi.resetModules()
    const reloaded = await import('@/lib/env')
    expect(() => reloaded.appEnv()).toThrow(/NEXT_PUBLIC_APP_URL/)
  })
})
