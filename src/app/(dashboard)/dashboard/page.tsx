import Link from 'next/link'
import type { Metadata } from 'next'
import { requireOrg } from '@/lib/auth'
import { limitsFor } from '@/lib/plans'
import { Badge, Card, PageHeader, Stat, fmtDate, fmtDur } from '@/components/ui'
export const metadata: Metadata = { title: 'Overview' }

export default async function Overview({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { welcome } = await searchParams
  const { supabase, org } = await requireOrg()
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0)
  const since30 = new Date(Date.now() - 30 * 86400000).toISOString()

  const [usage, leads, appts, calls, docs, nums, agent] = await Promise.all([
    supabase.from('org_usage_monthly').select('calls, minutes').eq('org_id', org.id).eq('month', monthStart.toISOString()).maybeSingle(),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('org_id', org.id).gte('created_at', since30),
    supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('org_id', org.id).eq('status', 'booked').gte('starts_at', new Date().toISOString()),
    supabase.from('calls').select('id, from_number, channel, status, duration_seconds, summary, started_at').eq('org_id', org.id).order('started_at', { ascending: false }).limit(6),
    supabase.from('knowledge_docs').select('id', { count: 'exact', head: true }).eq('org_id', org.id),
    supabase.from('phone_numbers').select('id', { count: 'exact', head: true }).eq('org_id', org.id),
    supabase.from('agents').select('instructions, transfer_number').eq('org_id', org.id).limit(1).maybeSingle(),
  ])
  const limit = limitsFor(org.plan).minutes
  const used = usage.data?.minutes ?? 0
  const steps = [
    ['Teach it your business', (docs.count ?? 0) > 0, '/dashboard/knowledge'],
    ['Customize your receptionist', !!agent.data?.instructions || !!agent.data?.transfer_number, '/dashboard/agent'],
    ['Get a phone number', (nums.count ?? 0) > 0, '/dashboard/numbers'],
    ['Add the widget to your website', false, '/dashboard/install'],
  ] as const
  const doneCount = steps.filter((s) => s[1]).length

  return (
    <>
      <PageHeader title={welcome ? `Welcome, ${org.name}` : 'Overview'} sub="How your receptionist is doing this month." />
      {doneCount < 3 && (
        <Card className="mb-6">
          <p className="font-semibold text-brand-950">Get live in 4 steps <span className="font-normal text-brand-800/60">({doneCount}/4 done)</span></p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {steps.map(([t, done, href]) => (
              <li key={t}><Link href={href} className="flex items-center gap-2 rounded-lg border border-brand-200 px-3 py-2 text-sm hover:bg-brand-50">
                <span aria-hidden className={`grid h-5 w-5 place-items-center rounded-full text-xs ${done ? 'bg-accent-500 text-white' : 'border border-brand-300'}`}>{done ? '✓' : ''}</span>{t}</Link></li>
            ))}
          </ul>
        </Card>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Calls this month" value={usage.data?.calls ?? 0} />
        <Stat label="Minutes used" value={`${used}/${limit}`} hint={used > limit ? 'Overage billing applies' : `${Math.max(0, limit - used)} left`} />
        <Stat label="New leads (30d)" value={leads.count ?? 0} />
        <Stat label="Upcoming appointments" value={appts.count ?? 0} />
      </div>
      <h2 className="mb-3 mt-8 text-lg font-semibold text-brand-950">Recent calls</h2>
      <Card className="divide-y divide-brand-100 !p-0">
        {(calls.data ?? []).length === 0 && <p className="p-5 text-sm text-brand-800/70">No calls yet. Try the website widget demo or call your number.</p>}
        {(calls.data ?? []).map((c) => (
          <Link key={c.id} href="/dashboard/calls" className="flex items-start justify-between gap-4 p-4 hover:bg-brand-50/60">
            <div className="min-w-0"><p className="text-sm font-medium text-brand-950">{c.from_number ?? 'Website visitor'}</p><p className="truncate text-sm text-brand-800/70">{c.summary ?? '—'}</p></div>
            <div className="shrink-0 text-right text-xs text-brand-800/60"><p>{fmtDate(c.started_at, org.timezone)}</p><p><Badge>{c.channel}</Badge> {fmtDur(c.duration_seconds)}</p></div>
          </Link>
        ))}
      </Card>
    </>
  )
}
