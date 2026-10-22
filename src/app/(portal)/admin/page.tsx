import type { Metadata } from 'next'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { Badge, Card, PageHeader, Stat, fmtDate } from '@/components/ui'
export const metadata: Metadata = { title: 'Admin', robots: { index: false } }

// Platform-operator view across ALL tenants (service role). Gated by ADMIN_EMAILS in the layout.
export default async function Admin() {
  const db = supabaseAdmin()
  const since = new Date(); since.setUTCDate(1); since.setUTCHours(0, 0, 0, 0)
  const [orgs, calls] = await Promise.all([
    db.from('organizations').select('id, name, slug, plan, subscription_status, created_at').order('created_at', { ascending: false }).limit(200),
    db.from('calls').select('org_id, duration_seconds').gte('started_at', since.toISOString()),
  ])
  const mins = new Map<string, number>()
  let total = 0
  for (const c of calls.data ?? []) { mins.set(c.org_id, (mins.get(c.org_id) ?? 0) + c.duration_seconds); total += c.duration_seconds }
  const paying = (orgs.data ?? []).filter((o) => o.plan !== 'trial' && o.subscription_status === 'active').length
  return (
    <>
      <PageHeader title="Platform admin" />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Tenants" value={orgs.data?.length ?? 0} /><Stat label="Paying" value={paying} /><Stat label="Minutes this month" value={Math.ceil(total / 60)} />
      </div>
      <Card className="overflow-x-auto !p-0">
        <table className="w-full text-left text-sm">
          <thead className="bg-brand-50 text-xs uppercase text-brand-800/70"><tr><th className="p-3">Business</th><th>Plan</th><th>Status</th><th>Minutes (mo)</th><th>Created</th></tr></thead>
          <tbody className="divide-y divide-brand-100">
            {(orgs.data ?? []).map((o) => (
              <tr key={o.id}><td className="p-3 font-medium">{o.name} <span className="text-brand-800/50">/{o.slug}</span></td><td className="capitalize">{o.plan}</td>
                <td><Badge tone={o.subscription_status === 'active' ? 'good' : 'neutral'}>{o.subscription_status}</Badge></td>
                <td className="tabular-nums">{Math.ceil((mins.get(o.id) ?? 0) / 60)}</td><td>{fmtDate(o.created_at)}</td></tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  )
}
