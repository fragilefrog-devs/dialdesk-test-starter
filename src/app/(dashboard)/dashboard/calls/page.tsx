import type { Metadata } from 'next'
import { requireOrg } from '@/lib/auth'
import { Badge, Card, Empty, PageHeader, fmtDate, fmtDur } from '@/components/ui'
export const metadata: Metadata = { title: 'Calls' }

export default async function Calls() {
  const { supabase, org } = await requireOrg()
  const { data: calls } = await supabase.from('calls').select('*').eq('org_id', org.id).order('started_at', { ascending: false }).limit(100)
  return (
    <>
      <PageHeader title="Calls" sub="Latest 100 conversations, with transcripts and AI summaries." />
      {!calls?.length ? <Empty title="No calls yet" body="Calls to your number and website widget sessions show up here." href="/dashboard/install" cta="Try the widget" /> : (
        <div className="space-y-3">
          {calls.map((c) => (
            <Card key={c.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-brand-950">{c.from_number ?? 'Website visitor'}</p>
                <p className="flex items-center gap-2 text-xs text-brand-800/60"><Badge>{c.channel}</Badge><Badge tone={c.status === 'completed' ? 'good' : 'neutral'}>{c.status}</Badge>{fmtDate(c.started_at, org.timezone)} · {fmtDur(c.duration_seconds)}</p>
              </div>
              {c.summary && <p className="mt-2 text-sm text-brand-900">{c.summary}</p>}
              {Array.isArray(c.transcript) && c.transcript.length > 0 && (
                <details className="mt-3"><summary className="cursor-pointer text-sm font-medium text-brand-600">Transcript</summary>
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {(c.transcript as { role: string; text: string }[]).map((t, i) => (
                      <li key={i}><span className="font-semibold">{t.role === 'agent' ? 'Receptionist' : 'Caller'}:</span> {t.text}</li>
                    ))}
                  </ul>
                </details>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
