import Link from 'next/link'
import { LogOut } from 'lucide-react'
import { requireOrg } from '@/lib/auth'
import { signOut } from '@/app/(auth)/actions'
import { NavLink } from '@/components/NavLink'
import { canTakeCalls } from '@/lib/plans'

export const dynamic = 'force-dynamic'
const GROUPS: [string, [string, string, string][]][] = [
  ['Work', [['/dashboard', 'Overview', 'overview'], ['/dashboard/calls', 'Calls', 'calls'], ['/dashboard/leads', 'Messages', 'messages'], ['/dashboard/appointments', 'Jobs', 'jobs']]],
  ['Setup', [['/dashboard/agent', 'Receptionist', 'receptionist'], ['/dashboard/knowledge', 'Knowledge', 'knowledge'], ['/dashboard/numbers', 'Phone numbers', 'numbers'], ['/dashboard/install', 'Website widget', 'install']]],
  ['Account', [['/dashboard/team', 'Team', 'team'], ['/dashboard/billing', 'Billing', 'billing']]],
]

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { org, user } = await requireOrg()
  const live = canTakeCalls(org)
  const trialDays = Math.max(0, Math.ceil((new Date(org.trial_ends_at).getTime() - Date.now()) / 86400000))
  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-line bg-surface md:sticky md:top-0 md:flex md:h-screen md:w-64 md:shrink-0 md:flex-col md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-4 py-4 md:block md:px-6 md:py-6">
          <Link href="/dashboard" className="flex items-center gap-2 font-display text-xl font-semibold text-ink"><span aria-hidden className="h-4 w-4 rounded-sm bg-signal" />{org.name}</Link>
          <form action={signOut} className="md:hidden"><button aria-label="Sign out" className="grid h-11 w-11 place-items-center rounded-lg text-muted hover:bg-surface-2"><LogOut className="h-4 w-4" aria-hidden /></button></form>
        </div>
        <nav aria-label="Dashboard" className="flex gap-1 overflow-x-auto px-4 pb-4 md:flex-1 md:flex-col md:gap-6 md:overflow-y-auto md:px-4 md:pb-0">
          {GROUPS.map(([group, items]) => (
            <div key={group} className="flex gap-1 md:block md:space-y-1">
              <p className="hidden px-3 pb-1 text-xs font-medium text-faint md:block">{group}</p>
              {items.map(([h, l, i]) => <NavLink key={h} href={h} icon={i}>{l}</NavLink>)}
            </div>
          ))}
        </nav>
        <div className="hidden border-t border-line p-4 md:block">
          <p className="truncate px-3 pb-2 text-xs text-faint">{user.email}</p>
          <form action={signOut}><button className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted transition hover:bg-surface-2 hover:text-ink"><LogOut className="h-4 w-4" aria-hidden />Sign out</button></form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">
        <div className="mx-auto max-w-5xl">
          {org.plan === 'trial' && live && (
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-2 px-4 py-3 text-sm text-ink">
              <span>Free trial: <span className="font-semibold">{trialDays} day{trialDays === 1 ? '' : 's'}</span> left.</span>
              <Link href="/dashboard/billing" className="font-medium text-primary underline underline-offset-4">Choose a plan</Link>
            </div>
          )}
          {!live && (
            <div role="alert" className="mb-6 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
              Your receptionist is <span className="font-semibold">paused</span>. New calls are not being answered. <Link href="/dashboard/billing" className="font-semibold underline underline-offset-4">Fix billing</Link>
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  )
}
