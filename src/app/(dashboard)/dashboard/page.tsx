import Link from 'next/link'
import type { Metadata } from 'next'
import { requireOrg } from '@/lib/auth'
import { limitsFor } from '@/lib/plans'
import { Card, OutcomeBadge, PageHeader, Stat, UrgencyBadge, fmtDate, fmtDur } from '@/components/ui'
export const metadata: Metadata = { title: 'Overview' }

export default async function Overview({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { welcome } = await searchParams
  const { supabase, org } = await requireOrg()
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0)
  const since30 = new Date(Date.now() - 30 * 86400000).toISOString()

  const [usage, emergencies, booked, calls, nums, agent, anyCall] = await Promise.all([
    supabase.from('org_usage_monthly').select('calls, minutes').eq('org_id', org.id).eq('month', monthStart.toISOString()).maybeSingle(),
    supabase.from('calls').select('id', { count: 'exact', head: true }).eq('org_id', org.id).eq('urgency', 'emergency').gte('started_at', since30),
    supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('org_id', org.id).eq('status', 'booked').gte('starts_at', new Date().toISOString()),
    supabase.from('calls').select('id, from_number, channel, status, outcome, urgency, duration_seconds, summary, started_at').eq('org_id', org.id).order('started_at', { ascending: false }).limit(6),
    supabase.from('phone_numbers').select('id', { count: 'exact', head: true }).eq('org_id', org.id),
    supabase.from('agents').select('service_zips, notify_phone, notify_email, transfer_number').eq('org_id', org.id).limit(1).maybeSingle(),
    supabase.from('calls').select('id', { count: 'exact', head: true }).eq('org_id', org.id),
  ])
  const limit = limitsFor(org.plan).minutes
  const used = usage.data?.minutes ?? 0
  const a = agent.data
  const steps = [
    ['Set your service area and arrival windows', (a?.service_zips?.length ?? 0) > 0, '/dashboard/agent'],
    ['Add where emergency and job alerts go', !!(a?.notify_phone || a?.notify_email || a?.transfer_number), '/dashboard/agent'],
    ['Get a phone number', (nums.count ?? 0) > 0, '/dashboard/numbers'],
    ['Place a test call, then forward your line', (anyCall.count ?? 0) > 0, '/dashboard/numbers'],
  ] as const
  const doneCount = steps.filter((s) => s[1]).length

  return (
    <>
      <PageHeader title={welcome ? `Welcome, ${org.name}` : 'Overview'} sub="What your receptionist did this month." />
      {doneCount < steps.length && (
        <Card className="mb-6">
          <p className="font-semibold text-ink">Get live <span className="font-normal text-faint">({doneCount} of {steps.length} done)</span></p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {steps.map(([t, done, href]) => (
              <li key={t}><Link href={href} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm hover:bg-surface-2">
                <span aria-hidden className={`grid h-5 w-5 place-items-center rounded-full text-xs ${done ? 'bg-good text-primary-fg' : 'border border-control'}`}>{done ? '✓' : ''}</span>{t}</Link></li>
            ))}
          </ul>
        </Card>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Calls this month" value={usage.data?.calls ?? 0} />
        <Stat label="Minutes used" value={`${used}/${limit}`} hint={used > limit ? 'Overage billing applies' : `${Math.max(0, limit - used)} left`} />
        <Stat label="Emergencies (30 days)" value={emergencies.count ?? 0} />
        <Stat label="Upcoming jobs" value={booked.count ?? 0} />
      </div>
      <h2 className="mb-3 mt-8 font-display text-xl font-semibold text-ink">Recent calls</h2>
      <Card className="divide-y divide-line !p-0">
        {(calls.data ?? []).length === 0 && <p className="p-5 text-sm text-muted">No calls yet. Call your number to hear how it sounds.</p>}
        {(calls.data ?? []).map((c) => (
          <Link key={c.id} href="/dashboard/calls" className="flex items-start justify-between gap-4 p-4 hover:bg-surface-2">
            <div className="min-w-0"><p className="text-sm font-medium text-ink">{c.from_number ?? (c.channel === 'web' ? 'Website visitor' : 'Unknown caller')}</p><p className="truncate text-sm text-muted">{c.summary ?? 'Summary appears when the call ends.'}</p></div>
            <div className="shrink-0 space-y-1 text-right text-xs text-faint"><p>{fmtDate(c.started_at, org.timezone)} · {fmtDur(c.duration_seconds)}</p><p className="flex justify-end gap-1"><UrgencyBadge urgency={c.urgency} /><OutcomeBadge outcome={c.outcome} /></p></div>
          </Link>
        ))}
      </Card>
    </>
  )
}
