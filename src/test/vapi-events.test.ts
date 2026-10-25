import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  executeTool: vi.fn(),
  supabaseAdmin: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@/ai/tools', () => ({ executeTool: mocks.executeTool }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: mocks.supabaseAdmin }))

import { handleToolCalls } from '@/lib/vapi-events'

function queryFor(table: string) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    upsert: vi.fn(async () => ({ error: null })),
    maybeSingle: vi.fn(async () => {
      if (table === 'agents') return { data: { id: 'agent-1', org_id: 'org-1', is_active: true } }
      return { data: { id: 'call-1', outcome: null } }
    }),
    single: vi.fn(async () => ({ data: { plan: 'trial', subscription_status: 'trialing', trial_ends_at: '2099-01-01T00:00:00.000Z' } })),
  }
  return query
}

const message = {
  call: { id: 'provider-call-1', assistantId: 'assistant-1', customer: { number: '+13075550123' } },
  toolCallList: [
    { id: 'tool-call-1', name: 'check_service_area', arguments: { postcode: '60614' } },
    { id: 'tool-call-2', name: 'check_availability', arguments: { date: '2026-10-26' } },
  ],
}

describe('Vapi tool-call replies', () => {
  beforeEach(() => {
    mocks.executeTool.mockReset()
    mocks.supabaseAdmin.mockReset()
    mocks.from.mockReset()
    mocks.from.mockImplementation((table: string) => queryFor(table))
    mocks.supabaseAdmin.mockReturnValue({ from: mocks.from })
    mocks.executeTool.mockResolvedValue({ ok: true })
  })

  it('returns one correlated result per tool call when call context resolution fails', async () => {
    mocks.supabaseAdmin.mockImplementation(() => { throw new Error('database unavailable') })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const result = await handleToolCalls(message)

    expect(result.results).toHaveLength(2)
    expect(result.results.map((item) => item.toolCallId)).toEqual(['tool-call-1', 'tool-call-2'])
    expect(result.results.map((item) => JSON.parse(item.result))).toEqual([
      { error: expect.stringContaining('service is unavailable') },
      { error: expect.stringContaining('service is unavailable') },
    ])
    expect(mocks.executeTool).not.toHaveBeenCalled()
  })

  it('returns an explicit correlated error for one failed tool and preserves other results', async () => {
    mocks.executeTool
      .mockRejectedValueOnce(new Error('tool failure'))
      .mockResolvedValueOnce({ windows: [] })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const result = await handleToolCalls(message)

    expect(result.results).toHaveLength(2)
    expect(result.results[0]).toMatchObject({
      name: 'check_service_area',
      toolCallId: 'tool-call-1',
      result: expect.stringContaining('could not be completed'),
    })
    expect(JSON.parse(result.results[1].result)).toEqual({ windows: [] })
  })
})
