import type { Metadata } from 'next'
import { requireOrg } from '@/lib/auth'
import { PLANS, limitsFor } from '@/lib/plans'
import { CheckoutButton, PortalButton } from '@/components/BillingButtons'
import { BillingConfirmation } from '@/components/BillingConfirmation'
import { Badge, Card, PageHeader, fmtDate } from '@/components/ui'
export const metadata: Metadata = { title: 'Billing' }

export default async function Billing({ searchParams }: { searchParams: Promise<{ status?: string; session_id?: string }> }) {
  const { status, session_id: checkoutSessionId } = await searchParams
  const { supabase, org, role } = await requireOrg()
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0)
  const { data: u } = await supabase.from('org_usage_monthly').select('minutes').eq('org_id', org.id).eq('month', monthStart.toISOString()).maybeSingle()
  const lim = limitsFor(org.plan)
  const admin = role !== 'member'
  return (
    <>
      <PageHeader title="Billing" />
      {(status === 'success' || status === 'refresh') && (
        <BillingConfirmation checkoutSessionId={status === 'success' ? checkoutSessionId : undefined} />
      )}
      <Card className="mb-6">
        <p className="text-sm text-muted">Current plan</p>
        <p className="mt-1 flex items-center gap-2 text-2xl font-semibold capitalize text-ink">{org.plan}<Badge tone={org.subscription_status === 'active' ? 'good' : 'warn'}>{org.subscription_status}</Badge></p>
        <p className="mt-2 text-sm text-muted">{u?.minutes ?? 0} of {lim.minutes} minutes used this month.
          {org.plan === 'trial' ? ` Trial ends ${fmtDate(org.trial_ends_at, org.timezone)}.` : org.current_period_end ? ` Renews ${fmtDate(org.current_period_end, org.timezone)}.` : ''}</p>
        {admin && org.stripe_customer_id && <div className="mt-4"><PortalButton /></div>}
      </Card>
      {admin ? (
        <div className="grid gap-4 md:grid-cols-3">
          {Object.values(PLANS).map((p) => (
            <Card key={p.id} className={p.id === org.plan ? 'border-primary' : ''}>
              <p className="font-semibold text-ink">{p.name}</p><p className="text-2xl font-extrabold">${p.priceUsd}<span className="text-sm font-normal text-faint">/mo</span></p>
              <ul className="my-3 space-y-1 text-sm text-ink">{p.features.map((f) => <li key={f}>✓ {f}</li>)}</ul>
              {p.id === org.plan ? <Badge tone="good">Current</Badge> : <CheckoutButton plan={p.id} label={org.plan === 'trial' ? `Choose ${p.name}` : `Switch to ${p.name}`} primary={p.highlight} />}
            </Card>
          ))}
        </div>
      ) : <p className="text-sm text-muted">Only owners and admins can change the plan.</p>}
    </>
  )
}
