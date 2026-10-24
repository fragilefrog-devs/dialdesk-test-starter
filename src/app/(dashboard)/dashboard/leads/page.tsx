import type { Metadata } from 'next'
import Link from 'next/link'
import { requireOrg } from '@/lib/auth'
import { setLeadStatus } from '../actions'
import { SubmitButton } from '@/components/SubmitButton'
import { btn, Card, Empty, Notice, PageHeader, UrgencyBadge, fmtDate, input } from '@/components/ui'
export const metadata: Metadata = { title: 'Leads' }
const STATUSES = ['new', 'contacted', 'qualified', 'won', 'lost']

export default async function Leads({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { error: actionError, ok } = await searchParams
  const { supabase, org } = await requireOrg()
  const { data: leads, error: loadError } = await supabase.from('leads').select('id, status, intent, summary, urgency, address, zip, issue, created_at, contacts(name, phone, email)').eq('org_id', org.id).order('created_at', { ascending: false }).limit(200)
  if (loadError) console.error('[leads] Could not load workspace leads', { organizationId: org.id, error: loadError })
  return (
    <>
      <PageHeader title="Messages" sub="Callers who need a callback or an estimate." />
      {actionError && <Notice kind="error">{actionError}</Notice>}
      {ok && <Notice kind="success">{ok}</Notice>}
      {loadError
        ? <Notice kind="error">We could not load your messages. <Link href="/dashboard/leads" className="font-semibold underline underline-offset-4">Try again</Link>.</Notice>
        : !leads?.length ? <Empty title="No messages yet" body="When a caller needs a callback or an estimate, they appear here, so nothing waits for a return call." href="/dashboard/agent" cta="Review receptionist settings" /> : (
        <div className="space-y-3">
          {leads.map((l) => {
            const c = l.contacts as unknown as { name: string | null; phone: string | null; email: string | null } | null
            return (
              <Card key={l.id} className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{c?.name ?? 'Unknown'} <span className="font-normal text-muted">· {c?.phone}</span></p>
                  <p className="flex items-center gap-2 text-sm text-ink"><UrgencyBadge urgency={l.urgency} />{l.intent}</p>
                  {l.address && <p className="text-sm text-muted">{l.address}{l.zip ? ` ${l.zip}` : ''}</p>}
                  {l.summary && <p className="mt-1 text-sm text-muted">{l.summary}</p>}
                  <p className="mt-1 text-xs text-faint">{fmtDate(l.created_at, org.timezone)}{c?.email ? ` · ${c.email}` : ''}</p>
                </div>
                <form action={setLeadStatus} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={l.id} />
                  <select name="status" defaultValue={l.status} aria-label="Lead status" className={`${input} !w-auto !py-1.5`}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
                  <SubmitButton className={btn.secondary} pending="Updating">Update</SubmitButton>
                </form>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}
