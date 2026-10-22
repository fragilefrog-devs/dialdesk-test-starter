import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadCallContext } from '@/lib/voice/session'
import { GET } from '@/app/api/voice/config/route'

vi.mock('@/lib/voice/session', () => ({ loadCallContext: vi.fn(), buildInstructions: () => 'sys' }))
vi.mock('@/lib/token', () => ({ verifyCall: () => true }))

const SECRET = 's'.repeat(32)
const KEYS = ['INTERNAL_API_SECRET', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
const original: Record<string, string | undefined> = {}

beforeAll(() => {
  for (const key of KEYS) original[key] = process.env[key]
  Object.assign(process.env, {
    INTERNAL_API_SECRET: SECRET,
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'ci',
  })
})

afterAll(() => {
  for (const key of KEYS) {
    if (original[key] === undefined) delete process.env[key]
    else process.env[key] = original[key]
  }
})

beforeEach(() => {
  vi.mocked(loadCallContext).mockReset()
})

function request(secret?: string) {
  return new Request('http://x/api/voice/config?callId=c1&token=t', {
    headers: secret === undefined ? undefined : { 'x-internal-secret': secret },
  })
}

const context = {
  call: { provider_sid: 'CA1', channel: 'phone' },
  org: { id: 'o1', name: 'Acme', timezone: 'UTC', industry: 'x' },
  agent: {
    id: 'a1', org_id: 'o1', name: 'R', greeting: 'Hi', voice: 'v', language: 'en', instructions: '',
    business_hours: {}, appointment_minutes: 30, transfer_number: null, is_active: true,
  },
}

describe('GET /api/voice/config', () => {
  it('rejects a request with no x-internal-secret', async () => {
    const res = await GET(request())
    expect(res.status).toBe(403)
    expect(await res.text()).toBe('Forbidden')
  })

  it('rejects a wrong secret', async () => {
    const res = await GET(request('t'.repeat(32)))
    expect(res.status).toBe(403)
  })

  it('returns 404 when the call is unknown', async () => {
    vi.mocked(loadCallContext).mockResolvedValue(null)
    const res = await GET(request(SECRET))
    expect(res.status).toBe(404)
  })

  it('returns the session config for a known call', async () => {
    vi.mocked(loadCallContext).mockResolvedValue(context)
    const res = await GET(request(SECRET))
    expect(res.status).toBe(200)
    expect((await res.json()).greeting).toBe('Hi')
  })
})
