import { requireOrg } from '@/lib/auth'
import { DashboardChrome } from '@/components/DashboardChrome'
import { adminEmails } from '@/lib/env'
import { canTakeCalls } from '@/lib/plans'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { org, user } = await requireOrg()
  const live = canTakeCalls(org)
  const isPlatformAdmin = adminEmails().includes((user.email ?? '').toLowerCase())
  const trialDays = Math.max(0, Math.ceil((new Date(org.trial_ends_at).getTime() - Date.now()) / 86400000))
  return (
    <DashboardChrome orgName={org.name} userEmail={user.email ?? ''} isPlatformAdmin={isPlatformAdmin}>
      {org.plan === 'trial' && live && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-2 px-4 py-3 text-sm text-ink">
          <span>Free trial: <span className="font-semibold">{trialDays} day{trialDays === 1 ? '' : 's'}</span> left.</span>
          <Link href="/dashboard/billing" className="font-semibold text-primary underline underline-offset-4">Choose a plan</Link>
        </div>
      )}
      {!live && (
        <div role="alert" className="mb-6 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          Your receptionist is <span className="font-semibold">paused</span>. New calls are not being answered. <Link href="/dashboard/billing" className="font-semibold underline underline-offset-4">Fix billing</Link>
        </div>
      )}
      {children}
    </DashboardChrome>
  )
}
