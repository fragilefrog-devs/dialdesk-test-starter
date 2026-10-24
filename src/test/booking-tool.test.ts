import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  supabaseAdmin: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  runAfter: vi.fn(),
  sendTemplateEmail: vi.fn(),
  consentUpdate: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: mocks.supabaseAdmin }))
vi.mock('@/lib/after', () => ({ runAfter: mocks.runAfter }))
vi.mock('@/lib/notify', () => ({ notifyOwner: vi.fn() }))
vi.mock('@/lib/sms', () => ({ sendSms: vi.fn() }))
vi.mock('@/lib/email', () => ({ sendTemplateEmail: mocks.sendTemplateEmail }))

import { executeTool } from '@/ai/tools'

const nextDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

function makeQuery(table: string) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    update: vi.fn((values: unknown) => {
      void values
      return query
    }),
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
    maybeSingle: vi.fn(async (): Promise<{
      data: { id?: string; outcome?: null; urgency?: null } | null
      error: { message: string } | null
    }> => ({ data: { outcome: null, urgency: null }, error: null })),
  }
  if (table === 'appointments') {
    query.maybeSingle.mockResolvedValue({ data: { id: 'appointment-1' }, error: null })
    query.update.mockImplementation((values: unknown) => {
      mocks.consentUpdate(values)
      return query
    })
  }
  return query
}

describe('booking tool', () => {
  beforeEach(() => {
    mocks.from.mockReset()
    mocks.rpc.mockReset()
    mocks.runAfter.mockReset()
    mocks.sendTemplateEmail.mockReset()
    mocks.consentUpdate.mockReset()
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

  it('retries with the installed booking RPC signature when the database has not been migrated', async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST202', message: 'Could not find the function public.book_trade_job with the supplied arguments' },
      })
      .mockResolvedValueOnce({ data: [{ out_id: 'appointment-1', out_status: 'booked' }], error: null })

    const result = await executeTool(ctx, 'book_job', { ...bookingArgs, caller_confirmed: true })

    expect(result).toMatchObject({ booked: true })
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
    expect(mocks.rpc.mock.calls[1][1]).not.toHaveProperty('p_email_confirmation_consented_at')
  })

  it('persists consent separately before emailing when it had to use the older RPC', async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST202', message: 'Could not find the function public.book_trade_job with the supplied arguments' },
      })
      .mockResolvedValueOnce({ data: [{ out_id: 'appointment-1', out_status: 'booked' }], error: null })
    mocks.sendTemplateEmail.mockResolvedValue(true)

    const result = await executeTool(ctx, 'book_job', {
      ...bookingArgs, caller_confirmed: true, email: 'caller@example.test', email_confirmation_consent: true,
    })

    expect(result).toMatchObject({ booked: true, email_confirmation: 'sent' })
    expect(mocks.consentUpdate).toHaveBeenCalledWith({ email_confirmation_consented_at: expect.any(String) })
    expect(mocks.sendTemplateEmail).toHaveBeenCalledOnce()
  })

  it('does not retry non-signature database failures as if they were an outdated RPC', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '23503', message: 'appointment foreign key violation' },
    })

    const result = await executeTool(ctx, 'book_job', { ...bookingArgs, caller_confirmed: true })

    expect(result).toMatchObject({ error: expect.stringContaining('Could not book') })
    expect(mocks.rpc).toHaveBeenCalledOnce()
    expect(mocks.runAfter).not.toHaveBeenCalled()
  })

  it('offers a different window when capacity has filled without recording an unsuccessful booking', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [{ out_id: null, out_status: 'full' }], error: null })

    const result = await executeTool(ctx, 'book_job', { ...bookingArgs, caller_confirmed: true })

    expect(result).toMatchObject({ error: expect.stringContaining('window just filled up') })
    expect(mocks.rpc).toHaveBeenCalledOnce()
    expect(mocks.runAfter).not.toHaveBeenCalled()
  })

  it('does not send a caller email when consent cannot be persisted', async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST202', message: 'Could not find the function public.book_trade_job with the supplied arguments' },
      })
      .mockResolvedValueOnce({ data: [{ out_id: 'appointment-1', out_status: 'booked' }], error: null })
    mocks.from.mockImplementation((table: string) => {
      const query = makeQuery(table)
      if (table === 'appointments') query.maybeSingle.mockResolvedValue({ data: null, error: { message: 'column missing' } })
      return query
    })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const result = await executeTool(ctx, 'book_job', {
      ...bookingArgs, caller_confirmed: true, email: 'caller@example.test', email_confirmation_consent: true,
    })

    expect(result).toMatchObject({ booked: true, email_confirmation: 'failed' })
    expect(mocks.sendTemplateEmail).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith('[booking-email] Could not persist caller consent for the booking', expect.any(Object))
  })
})
