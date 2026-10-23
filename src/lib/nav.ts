/** Dashboard navigation: the single source for the sidebar and the command palette. */
export type NavItem = { href: string; label: string; icon: string }
export type NavGroup = { group: string; items: NavItem[] }

export const NAV_GROUPS: NavGroup[] = [
  {
    group: 'Workspace',
    items: [
      { href: '/dashboard', label: 'Overview', icon: 'overview' },
      { href: '/dashboard/calls', label: 'Calls', icon: 'calls' },
      { href: '/dashboard/leads', label: 'Leads', icon: 'messages' },
      { href: '/appointment', label: 'Appointments', icon: 'jobs' },
    ],
  },
  {
    group: 'Manage',
    items: [
      { href: '/dashboard/agent', label: 'Receptionist', icon: 'receptionist' },
      { href: '/dashboard/knowledge', label: 'Knowledge', icon: 'knowledge' },
      { href: '/dashboard/numbers', label: 'Phone numbers', icon: 'numbers' },
      { href: '/dashboard/install', label: 'Website widget', icon: 'install' },
      { href: '/dashboard/team', label: 'Team', icon: 'team' },
      { href: '/dashboard/billing', label: 'Billing', icon: 'billing' },
    ],
  },
]

export const allNav = (): (NavItem & { group: string })[] =>
  NAV_GROUPS.flatMap(({ group, items }) => items.map((item) => ({ ...item, group })))

export function filterNav(query: string) {
  const normalized = query.trim().toLowerCase()
  return allNav().filter((item) =>
    !normalized ||
    item.label.toLowerCase().includes(normalized) ||
    item.group.toLowerCase().includes(normalized),
  )
}
