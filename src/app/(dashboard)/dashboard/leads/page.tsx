import type { Metadata } from 'next'
import { requireOrg } from '@/lib/auth'
import { setLeadStatus } from '../actions'
import { Card, Empty, PageHeader, fmtDate, input } from '@/components/ui'
export const metadata: Metadata = { title: 'Leads' }
const STATUSES = ['new', 'contacted', 'qualified', 'won', 'lost']

export default async function Leads() {
  const { supabase, org } = await requireOrg()
  const { data: leads } = await supabase.from('leads').select('id, status, intent, summary, created_at, contacts(name, phone, email)').eq('org_id', org.id).order('created_at', { ascending: false }).limit(200)
  return (
    <>
      <PageHeader title="Leads" sub="People the receptionist captured for follow-up." />
      {!leads?.length ? <Empty title="No leads yet" body="When a caller wants a quote or callback, they’ll appear here." /> : (
        <div className="space-y-3">
          {leads.map((l) => {
            const c = l.contacts as unknown as { name: string | null; phone: string | null; email: string | null } | null
            return (
              <Card key={l.id} className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-brand-950">{c?.name ?? 'Unknown'} <span className="font-normal text-brand-800/70">· {c?.phone}</span></p>
                  <p className="text-sm text-brand-900">{l.intent}</p>
                  {l.summary && <p className="mt-1 text-sm text-brand-800/70">{l.summary}</p>}
                  <p className="mt-1 text-xs text-brand-800/60">{fmtDate(l.created_at, org.timezone)}{c?.email ? ` · ${c.email}` : ''}</p>
                </div>
                <form action={setLeadStatus} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={l.id} />
                  <select name="status" defaultValue={l.status} aria-label="Lead status" className={`${input} !w-auto !py-1.5`}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
                  <button className="text-sm font-semibold text-brand-600">Update</button>
                </form>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}
