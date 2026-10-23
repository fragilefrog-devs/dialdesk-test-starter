import type { Metadata } from 'next'
import { requireOrg } from '@/lib/auth'
import { Card, Empty, OutcomeBadge, PageHeader, UrgencyBadge, fmtDate, fmtDur } from '@/components/ui'
export const metadata: Metadata = { title: 'Calls' }

export default async function Calls() {
  const { supabase, org } = await requireOrg()
  const { data: calls } = await supabase.from('calls').select('*').eq('org_id', org.id).order('started_at', { ascending: false }).limit(100)
  return (
    <>
      <PageHeader title="Calls" sub="Latest 100 calls, with summaries and transcripts." />
      {!calls?.length ? <Empty title="No calls yet" body="Calls to your number show up here once they end." href="/dashboard/numbers" cta="Get a number" /> : (
        <div className="space-y-3">
          {calls.map((c) => (
            <Card key={c.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-brand-950">{c.from_number ?? 'Unknown caller'}</p>
                <p className="flex flex-wrap items-center gap-2 text-xs text-brand-800/60"><UrgencyBadge urgency={c.urgency} /><OutcomeBadge outcome={c.outcome} />{fmtDate(c.started_at, org.timezone)} · {fmtDur(c.duration_seconds)}</p>
              </div>
              {c.summary && <p className="mt-2 text-sm text-brand-900">{c.summary}</p>}
              {c.recording_url && <p className="mt-2 text-sm"><a href={c.recording_url} target="_blank" rel="noreferrer" className="font-medium text-brand-600 underline">Listen to the recording</a></p>}
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
