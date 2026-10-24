import Link from 'next/link'
import type { Metadata } from 'next'
import type { LucideIcon } from 'lucide-react'
import { CalendarDays, Clock3, Phone, Siren } from 'lucide-react'
import { requireOrg } from '@/lib/auth'
import { limitsFor } from '@/lib/plans'
import { CountUp } from '@/components/CountUp'
import { Card, OutcomeBadge, PageHeader, UrgencyBadge, fmtDate, fmtDur } from '@/components/ui'
export const metadata: Metadata = { title: 'Overview' }

function DashboardMetric({
  label,
  value,
  hint,
  icon: Icon,
  progress,
  warning = false,
}: {
  label: string
  value: string | number
  hint?: string
  icon: LucideIcon
  progress?: number
  warning?: boolean
}) {
  const ratio = progress !== undefined && Number.isFinite(progress) ? Math.max(0, progress) : undefined

  return (
    <Card className="!p-4 sm:!p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-muted">{label}</p>
        <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${warning ? 'bg-danger-soft text-danger' : 'bg-surface-2 text-primary'}`}>
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <p className="mt-3 font-display text-3xl font-extrabold leading-tight tracking-tight tabular-nums text-ink">
        <CountUp value={value} />
      </p>
      {ratio !== undefined && (
        <div
          role="progressbar"
          aria-label={`${label}, share of plan used`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(Math.min(ratio, 1) * 100)}
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2"
        >
          <div className={`bar-grow h-full origin-left rounded-full ${ratio > 1 ? 'bg-warn' : 'bg-primary'}`} style={{ transform: `scaleX(${Math.min(ratio, 1)})` }} />
        </div>
      )}
      {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}
    </Card>
  )
}

export default async function Overview({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { welcome } = await searchParams
  const { supabase, org } = await requireOrg()
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0)
  // server component: runs once per request, so reading the clock here is correct
  // eslint-disable-next-line react-hooks/purity
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
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardMetric label="Calls this month" value={usage.data?.calls ?? 0} hint="Current calendar month" icon={Phone} />
        <DashboardMetric
          label="Minutes used"
          value={`${used}/${limit}`}
          hint={used > limit ? 'Overage billing applies' : `${Math.max(0, limit - used)} minutes left`}
          icon={Clock3}
          progress={limit > 0 ? used / limit : undefined}
        />
        <DashboardMetric label="Emergencies" value={emergencies.count ?? 0} hint="Last 30 days" icon={Siren} warning={(emergencies.count ?? 0) > 0} />
        <DashboardMetric label="Upcoming jobs" value={booked.count ?? 0} hint="Booked appointments" icon={CalendarDays} />
      </div>
      <div className={`mt-7 grid items-start gap-5 ${doneCount < steps.length ? 'lg:grid-cols-[minmax(0,1.55fr)_minmax(17rem,0.8fr)]' : ''}`}>
        <section>
          <div className="mb-3 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-xl font-bold text-ink">Recent calls</h2>
              <p className="mt-1 text-sm text-muted">The latest conversations with your receptionist.</p>
            </div>
            <Link href="/dashboard/calls" className="shrink-0 text-sm font-semibold text-primary hover:underline">View all</Link>
          </div>
          <Card className="divide-y divide-line !p-0">
            {(calls.data ?? []).length === 0 && (
              <div className="p-5">
                <p className="text-sm font-medium text-ink">No calls yet</p>
                <p className="mt-1 text-sm text-muted">Once your phone number is connected, recent conversations will appear here.</p>
                <Link href="/dashboard/numbers" className="mt-3 inline-flex text-sm font-semibold text-primary hover:underline">Set up a phone number</Link>
              </div>
            )}
            {(calls.data ?? []).map((c) => (
              <Link key={c.id} href="/dashboard/calls" className="grid gap-3 p-4 transition-colors hover:bg-surface-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{c.from_number ?? (c.channel === 'web' ? 'Website visitor' : 'Unknown caller')}</p>
                  <p className="mt-1 truncate text-sm text-muted">{c.summary ?? 'Summary appears when the call ends.'}</p>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-faint sm:flex-col sm:items-end sm:justify-center">
                  <p>{fmtDate(c.started_at, org.timezone)} · {fmtDur(c.duration_seconds)}</p>
                  <p className="flex flex-wrap justify-end gap-x-2 gap-y-1"><UrgencyBadge urgency={c.urgency} /><OutcomeBadge outcome={c.outcome} /></p>
                </div>
              </Link>
            ))}
          </Card>
        </section>

        {doneCount < steps.length && (
          <Card className="!p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-ink">Finish setup</h2>
                <p className="mt-1 text-sm text-muted">Complete these steps to go live.</p>
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-muted">{doneCount}/{steps.length}</span>
            </div>
            <ul className="mt-4 space-y-1">
              {steps.map(([title, done, href]) => (
                <li key={title}>
                  <Link href={href} className="flex items-start gap-3 rounded-lg px-2 py-2.5 text-sm transition-colors hover:bg-surface-2">
                    <span aria-hidden className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-xs ${done ? 'bg-good text-primary-fg' : 'border border-control text-transparent'}`}>{done ? '✓' : ''}</span>
                    <span className={done ? 'text-muted' : 'font-medium text-ink'}>{title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  )
}
