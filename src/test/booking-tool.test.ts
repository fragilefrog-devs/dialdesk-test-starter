import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  supabaseAdmin: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  runAfter: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: mocks.supabaseAdmin }))
vi.mock('@/lib/after', () => ({ runAfter: mocks.runAfter }))
vi.mock('@/lib/notify', () => ({ notifyOwner: vi.fn() }))
vi.mock('@/lib/sms', () => ({ sendSms: vi.fn() }))
vi.mock('@/lib/email', () => ({ sendTemplateEmail: vi.fn() }))

import { executeTool } from '@/ai/tools'

const nextDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

function makeQuery(table: string) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    update: vi.fn(() => query),
    upsert: vi.fn(() => query),
    single: vi.fn(async () => {
      if (table === 'organizations') return { data: { name: 'Alder Street Plumbing', timezone: 'UTC' }, error: null }
      if (table === 'agents') return {
        data: {
          service_zips: [], business_hours: Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((day) => [day, ['07:00', '19:00']])),
          arrival_windows: [['08:00', '12:00']], jobs_per_window: 2, appointment_minutes: 60,
        },
        error: null,
      }
      return { data: { id: 'contact-1' }, error: null }
    }),
    maybeSingle: vi.fn(async () => ({ data: { outcome: null, urgency: null }, error: null })),
  }
  return query
}

describe('booking tool', () => {
  beforeEach(() => {
    mocks.from.mockReset()
    mocks.rpc.mockReset()
    mocks.runAfter.mockReset()
    mocks.from.mockImplementation((table: string) => makeQuery(table))
    mocks.rpc.mockResolvedValue({ data: [{ out_id: 'appointment-1', out_status: 'booked' }], error: null })
    mocks.supabaseAdmin.mockReturnValue({ from: mocks.from, rpc: mocks.rpc })
  })

  const ctx = { orgId: 'org-1', agentId: 'agent-1', callId: 'call-1', callerNumber: '+17735550142' }
  const bookingArgs = {
    name: 'Morgan Lee',
    phone: '+17735550142',
    address: '17 Oak Street',
    postcode: '60614',
    issue: 'Kitchen drain blocked',
    start_local: `${nextDate}T08:00`,
  }

  it('will not create a booking unless the caller explicitly confirmed the read-back', async () => {
    const result = await executeTool(ctx, 'book_job', { ...bookingArgs, caller_confirmed: false })

    expect(result).toMatchObject({ error: expect.stringContaining('confirm the read-back') })
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('books the selected service window after caller confirmation', async () => {
    const result = await executeTool(ctx, 'book_job', { ...bookingArgs, caller_confirmed: true })

    expect(result).toMatchObject({ booked: true, window: '8 AM to 12 PM', date: nextDate })
    expect(mocks.rpc).toHaveBeenCalledWith('book_trade_job', expect.objectContaining({
      p_org: ctx.orgId,
      p_call: ctx.callId,
      p_starts: expect.any(String),
    }))
  })
})
