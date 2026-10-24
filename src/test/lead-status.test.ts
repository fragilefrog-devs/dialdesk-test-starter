import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireOrg: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ requireOrg: mocks.requireOrg }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))

import { setLeadStatus } from '@/app/(dashboard)/dashboard/actions'

describe('lead status action', () => {
  const leadId = '1b4e28ba-2fa1-11d2-883f-0016d3cca427'
  const query = {
    update: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
    maybeSingle: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    query.update.mockReturnValue(query)
    query.eq.mockReturnValue(query)
    query.select.mockReturnValue(query)
    query.maybeSingle.mockResolvedValue({ data: { id: leadId }, error: null })
    mocks.requireOrg.mockResolvedValue({
      supabase: { from: vi.fn(() => query) },
      org: { id: 'workspace-1' },
    })
    mocks.redirect.mockImplementation((path: string) => { throw new Error(`REDIRECT:${path}`) })
  })

  it('updates only the requested lead in the signed-in workspace and confirms the result', async () => {
    const form = new FormData()
    form.set('id', leadId)
    form.set('status', 'contacted')

    await expect(setLeadStatus(form)).rejects.toThrow('REDIRECT:/dashboard/leads?ok=Lead%20status%20updated.')

    expect(query.update).toHaveBeenCalledWith({ status: 'contacted' })
    expect(query.eq).toHaveBeenNthCalledWith(1, 'org_id', 'workspace-1')
    expect(query.eq).toHaveBeenNthCalledWith(2, 'id', leadId)
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/leads')
  })

  it('rejects invalid form values without attempting a database update', async () => {
    const form = new FormData()
    form.set('id', leadId)
    form.set('status', 'deleted')

    await expect(setLeadStatus(form)).rejects.toThrow('REDIRECT:/dashboard/leads?error=Choose%20a%20valid%20lead%20and%20status.')

    expect(query.update).not.toHaveBeenCalled()
  })

  it('reports database failures rather than showing a successful update', async () => {
    query.maybeSingle.mockResolvedValue({ data: null, error: { message: 'database unavailable' } })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const form = new FormData()
    form.set('id', leadId)
    form.set('status', 'won')

    await expect(setLeadStatus(form)).rejects.toThrow('REDIRECT:/dashboard/leads?error=Could%20not%20update%20this%20lead.%20Please%20try%20again.')
    expect(console.error).toHaveBeenCalled()
  })
})
