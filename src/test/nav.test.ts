import { describe, expect, it } from 'vitest'
import { allNav, filterNav, NAV_GROUPS, PROFILE_LINKS } from '@/lib/nav'

describe('dashboard navigation', () => {
  it('lists every page exactly once', () => {
    const hrefs = allNav().map((item) => item.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
    expect(hrefs).toContain('/dashboard/billing')
    expect(hrefs).toContain('/appointment')
    expect(hrefs).toContain('/dashboard/settings')
  })

  it('keeps billing out of the sidebar and exposes account links in the profile menu', () => {
    const sidebarHrefs = NAV_GROUPS.flatMap(({ items }) => items.map((item) => item.href))
    const profileHrefs = PROFILE_LINKS.map((item) => item.href)

    expect(sidebarHrefs).not.toContain('/dashboard/billing')
    expect(profileHrefs).toContain('/dashboard/billing')
    expect(profileHrefs).toContain('/dashboard/widget-setup')
    expect(PROFILE_LINKS.find((item) => item.href === '/dashboard/widget-setup')?.label).toBe('Widget setup')
    expect(allNav().map((item) => item.href)).toContain('/dashboard/billing')
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
