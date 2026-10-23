import Link from 'next/link'
import { requireOrg } from '@/lib/auth'
import { signOut } from '@/app/(auth)/actions'
import { NavLink } from '@/components/NavLink'
import { canTakeCalls } from '@/lib/plans'

export const dynamic = 'force-dynamic'
const NAV = [
  ['/dashboard', 'Overview'], ['/dashboard/calls', 'Calls'], ['/dashboard/leads', 'Leads'], ['/dashboard/appointments', 'Jobs'],
  ['/dashboard/agent', 'Receptionist'], ['/dashboard/knowledge', 'Knowledge'], ['/dashboard/numbers', 'Phone numbers'],
  ['/dashboard/team', 'Team'], ['/dashboard/billing', 'Billing'],
]

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { org, user } = await requireOrg()
  const live = canTakeCalls(org)
  const trialDays = Math.max(0, Math.ceil((new Date(org.trial_ends_at).getTime() - Date.now()) / 86400000))
  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-brand-200/70 bg-white md:min-h-screen md:w-60 md:shrink-0 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-4 py-4 md:block">
          <Link href="/dashboard" className="font-bold text-brand-900">{org.name}</Link>
          <p className="hidden text-xs text-brand-800/60 md:block">{user.email}</p>
        </div>
        <nav aria-label="Dashboard" className="flex gap-1 overflow-x-auto px-3 pb-3 md:block md:space-y-1">
          {NAV.map(([h, l]) => <NavLink key={h} href={h}>{l}</NavLink>)}
        </nav>
        <form action={signOut} className="hidden px-3 pb-4 md:block"><button className="w-full rounded-lg px-3 py-2 text-left text-sm text-brand-800/70 hover:bg-brand-100">Sign out</button></form>
      </aside>
      <main className="min-w-0 flex-1 p-5 md:p-8">
        {org.plan === 'trial' && live && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-300 bg-brand-50 px-4 py-2.5 text-sm text-brand-900">
            <span>Free trial: <b>{trialDays} day{trialDays === 1 ? '' : 's'}</b> left.</span><Link href="/dashboard/billing" className="font-semibold text-brand-600 underline">Choose a plan</Link>
          </div>
        )}
        {!live && (
          <div role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">
            Your receptionist is <b>paused</b>. New calls are not being answered. <Link href="/dashboard/billing" className="font-semibold underline">Fix billing</Link>
          </div>
        )}
        {children}
      </main>
    </div>
  )
}
