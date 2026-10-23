import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireOrg: vi.fn(),
  stripe: vi.fn(),
  planFromPriceId: vi.fn(),
  supabaseAdmin: vi.fn(),
  syncOrgAgents: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ requireOrg: mocks.requireOrg }))
vi.mock('@/lib/stripe', () => ({
  stripe: mocks.stripe,
  planFromPriceId: mocks.planFromPriceId,
}))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: mocks.supabaseAdmin }))
vi.mock('@/lib/vapi-sync', () => ({ syncOrgAgents: mocks.syncOrgAgents }))

import { POST } from '@/app/api/billing/confirm/route'

const org = { id: 'org-1', plan: 'trial', subscription_status: 'trialing', stripe_customer_id: 'cus-1' }
const subscription = {
  id: 'sub-1',
  customer: 'cus-1',
  status: 'active',
  created: 1,
  metadata: { org_id: 'org-1' },
  items: { data: [{ price: { id: 'price-starter' }, current_period_end: 1_800_000_000 }] },
}
const session = {
  id: 'cs_test_1',
  mode: 'subscription',
  status: 'complete',
  payment_status: 'paid',
  client_reference_id: 'org-1',
  customer: 'cus-1',
  metadata: { org_id: 'org-1', plan: 'starter' },
  subscription,
}

function request(body: unknown) {
  return new Request('https://app.example.test/api/billing/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('billing confirmation', () => {
  const updateQuery = {
    update: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
    maybeSingle: vi.fn(),
  }

  beforeEach(() => {
    updateQuery.update.mockReturnThis()
    updateQuery.eq.mockReturnThis()
    updateQuery.select.mockReturnThis()
    updateQuery.maybeSingle.mockResolvedValue({ data: { id: org.id }, error: null })
    mocks.requireOrg.mockResolvedValue({ org, role: 'owner' })
    mocks.planFromPriceId.mockReturnValue('starter')
    mocks.supabaseAdmin.mockReturnValue({ from: () => updateQuery })
    mocks.syncOrgAgents.mockResolvedValue({ errors: [] })
    mocks.stripe.mockReturnValue({
      checkout: { sessions: { retrieve: vi.fn().mockResolvedValue(session) } },
      subscriptions: { retrieve: vi.fn().mockResolvedValue(subscription) },
    })
  })

  it('persists a paid plan before confirming it to the UI', async () => {
    const response = await POST(request({ checkoutSessionId: session.id }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ status: 'synced', plan: 'starter' })
    expect(updateQuery.update).toHaveBeenCalledWith(expect.objectContaining({
      plan: 'starter',
      subscription_status: 'active',
      stripe_subscription_id: 'sub-1',
    }))
    expect(updateQuery.eq).toHaveBeenCalledWith('id', org.id)
    expect(updateQuery.eq).toHaveBeenCalledWith('stripe_customer_id', org.stripe_customer_id)
    expect(mocks.syncOrgAgents).toHaveBeenCalledWith(org.id)
  })

  it('does not activate a subscription while checkout payment is pending', async () => {
    mocks.stripe.mockReturnValue({
      checkout: { sessions: { retrieve: vi.fn().mockResolvedValue({ ...session, payment_status: 'unpaid' }) } },
    })

    const response = await POST(request({ checkoutSessionId: session.id }))

    expect(response.status).toBe(202)
    await expect(response.json()).resolves.toEqual({ status: 'pending' })
    expect(updateQuery.update).not.toHaveBeenCalled()
  })

  it('rejects a checkout session belonging to another workspace', async () => {
    mocks.stripe.mockReturnValue({
      checkout: { sessions: { retrieve: vi.fn().mockResolvedValue({ ...session, client_reference_id: 'other-org' }) } },
    })

    const response = await POST(request({ checkoutSessionId: session.id }))

    expect(response.status).toBe(403)
    expect(updateQuery.update).not.toHaveBeenCalled()
  })

  it('reports database persistence failures instead of claiming activation', async () => {
    updateQuery.maybeSingle.mockResolvedValue({ data: null, error: { message: 'database unavailable' } })

    const response = await POST(request({ checkoutSessionId: session.id }))

    expect(response.status).toBe(500)
    expect(mocks.syncOrgAgents).not.toHaveBeenCalled()
  })
})
