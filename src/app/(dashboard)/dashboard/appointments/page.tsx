import type { Metadata } from 'next'
import { requireOrg } from '@/lib/auth'
import { cancelAppointment } from '../actions'
import { Badge, btn, Card, Empty, PageHeader, UrgencyBadge, fmtDate } from '@/components/ui'
export const metadata: Metadata = { title: 'Appointments' }

export default async function Appointments() {
  const { supabase, org } = await requireOrg()
  const { data: rows } = await supabase.from('appointments').select('id, service, starts_at, ends_at, status, notes, address, zip, issue, urgency, contacts(name, phone)')
    // server component: runs once per request, so reading the clock here is correct
    // eslint-disable-next-line react-hooks/purity
    .eq('org_id', org.id).gte('starts_at', new Date(Date.now() - 86400000).toISOString()).order('starts_at').limit(200)
  return (
    <>
      <PageHeader title="Jobs" sub={`Arrival windows, shown in ${org.timezone}.`} />
      {!rows?.length ? <Empty title="Nothing booked yet" body="Jobs your receptionist books appear here with the address, the problem and the arrival window." href="/dashboard/agent" cta="Set arrival windows" /> : (
        <div className="space-y-3">
          {rows.map((a) => {
            const c = a.contacts as unknown as { name: string | null; phone: string | null } | null
            return (
              <Card key={a.id} className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink">{fmtDate(a.starts_at, org.timezone)} to {new Intl.DateTimeFormat('en-US', { timeZone: org.timezone, timeStyle: 'short' }).format(new Date(a.ends_at))} <UrgencyBadge urgency={a.urgency} /> <Badge tone={a.status === 'booked' ? 'good' : 'neutral'}>{a.status}</Badge></p>
                  <p className="text-sm text-ink">{c?.name ?? 'Unknown'} · {c?.phone}{a.service ? ` · ${a.service}` : ''}</p>
                  {(a.address || a.issue) && <p className="text-sm text-ink">{a.issue}{a.address ? ` · ${a.address}${a.zip ? ` ${a.zip}` : ''}` : ''}</p>}
                  {a.notes && <p className="text-sm text-muted">{a.notes}</p>}
                </div>
                {a.status === 'booked' && <form action={cancelAppointment}><input type="hidden" name="id" value={a.id} /><button className={btn.danger}>Cancel</button></form>}
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}
