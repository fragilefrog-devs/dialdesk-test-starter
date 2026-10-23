import { describe, expect, it } from 'vitest'
import { allNav, filterNav } from '@/lib/nav'

describe('dashboard navigation', () => {
  it('lists every page exactly once', () => {
    const hrefs = allNav().map((item) => item.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
    expect(hrefs).toContain('/dashboard/billing')
    expect(hrefs).toContain('/appointment')
  })

  it('returns every page for an empty query', () => {
    expect(filterNav('  ')).toHaveLength(allNav().length)
  })

  it('matches page names case-insensitively', () => {
    expect(filterNav('CALL').map((item) => item.href)).toEqual(['/dashboard/calls'])
    expect(filterNav('appointment').map((item) => item.href)).toEqual(['/appointment'])
  })

  it('matches a section and returns nothing for an unknown query', () => {
    expect(filterNav('manage').map((item) => item.label)).toContain('Receptionist')
    expect(filterNav('zzzz')).toEqual([])
  })
})
