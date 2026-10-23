import type { Metadata } from 'next'
import Link from 'next/link'
import { Building2, Clock3, CreditCard } from 'lucide-react'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { Badge, Card, Empty, Notice, PageHeader, Stat, fmtDate } from '@/components/ui'
export const metadata: Metadata = { title: 'Admin', robots: { index: false } }

// Platform-operator view across ALL tenants (service role). Gated by ADMIN_EMAILS in the layout.
export default async function Admin({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams
  const requestedPage = Number(params.page)
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const pageSize = 50
  const db = supabaseAdmin()
  const since = new Date(); since.setUTCDate(1); since.setUTCHours(0, 0, 0, 0)
  const [orgs, paying, calls] = await Promise.all([
    db.from('organizations').select('id, name, slug, plan, subscription_status, created_at', { count: 'exact' }).order('created_at', { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1),
    db.from('organizations').select('id', { count: 'exact', head: true }).neq('plan', 'trial').eq('subscription_status', 'active'),
    db.from('calls').select('org_id, duration_seconds').gte('started_at', since.toISOString()),
  ])
  const mins = new Map<string, number>()
  let total = 0
  for (const c of calls.data ?? []) { mins.set(c.org_id, (mins.get(c.org_id) ?? 0) + c.duration_seconds); total += c.duration_seconds }
  const tenantError = orgs.error
  const payingError = paying.error
  const callsError = calls.error
  const tenantCount = orgs.count ?? 0
  const totalPages = Math.max(1, Math.ceil(tenantCount / pageSize))
  return (
    <>
      <PageHeader title="Platform admin" sub="Monitor tenant accounts and this month's call usage." />
      {tenantError && <Notice kind="error">We could not load the tenant list. Refresh the page to try again.</Notice>}
      {payingError && <Notice kind="error">The paying account total could not be loaded.</Notice>}
      {callsError && <Notice kind="error">Call minutes could not be loaded. Tenant records are still available below.</Notice>}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Tenants" value={tenantError ? 'Unavailable' : tenantCount} icon={Building2} />
        <Stat label="Paying" value={payingError ? 'Unavailable' : paying.count ?? 0} icon={CreditCard} />
        <Stat label="Minutes this month" value={callsError ? 'Unavailable' : Math.ceil(total / 60)} icon={Clock3} />
      </div>
      {orgs.data?.length ? (
        <Card className="overflow-x-auto !p-0">
          <table className="w-full min-w-[720px] text-left text-sm">
            <caption className="sr-only">Business accounts on DialDesk</caption>
            <thead className="bg-surface-2 text-xs uppercase text-muted">
              <tr>
                <th scope="col" className="p-3">Business</th>
                <th scope="col" className="p-3">Plan</th>
                <th scope="col" className="p-3">Status</th>
                <th scope="col" className="p-3">Minutes (month)</th>
                <th scope="col" className="p-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {orgs.data.map((org) => (
                <tr key={org.id} className="transition-colors hover:bg-surface-2">
                  <td className="p-3 font-medium text-ink">{org.name}<span className="ml-2 text-faint">/{org.slug}</span></td>
                  <td className="p-3 capitalize">{org.plan}</td>
                  <td className="p-3"><Badge tone={org.subscription_status === 'active' ? 'good' : 'neutral'}>{org.subscription_status}</Badge></td>
                  <td className="p-3 tabular-nums">{callsError ? 'Unavailable' : Math.ceil((mins.get(org.id) ?? 0) / 60)}</td>
                  <td className="p-3 whitespace-nowrap">{fmtDate(org.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : !tenantError ? (
        tenantCount > 0
          ? <Empty title="No businesses on this page" body="This page is outside the available tenant list. Return to the last page to view current accounts." href={`/admin?page=${totalPages}`} cta="Go to last page" />
          : <Empty title="No businesses yet" body="New business accounts will appear here after signup." />
      ) : null}
      {!tenantError && tenantCount > 0 && page <= totalPages && (
        <nav aria-label="Tenant pages" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
          <p>Page {page} of {totalPages}. Showing {orgs.data?.length ?? 0} of {tenantCount} businesses.</p>
          <div className="flex gap-2">
            {page > 1 && <Link href={`/admin?page=${page - 1}`} className="inline-flex min-h-11 items-center rounded-lg border border-control bg-surface px-4 font-medium text-ink hover:bg-surface-2">Previous</Link>}
            {page < totalPages && <Link href={`/admin?page=${page + 1}`} className="inline-flex min-h-11 items-center rounded-lg border border-control bg-surface px-4 font-medium text-ink hover:bg-surface-2">Next</Link>}
          </div>
        </nav>
      )}
    </>
  )
}
