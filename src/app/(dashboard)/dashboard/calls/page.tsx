import type { Metadata } from 'next'
import { ChevronDown } from 'lucide-react'
import { requireOrg } from '@/lib/auth'
import { Empty, OutcomeBadge, PageHeader, Panel, UrgencyBadge, fmtDate, fmtDur } from '@/components/ui'
export const metadata: Metadata = { title: 'Calls' }

export default async function Calls() {
  const { supabase, org } = await requireOrg()
  const { data: calls } = await supabase.from('calls').select('*').eq('org_id', org.id).order('started_at', { ascending: false }).limit(100)
  return (
    <>
      <PageHeader title="Calls" sub="The latest 100 calls, with summaries, transcripts and recordings." />
      {!calls?.length ? <Empty title="No calls yet" body="Every call to your number shows up here once it ends, with a summary and what happened." href="/dashboard/numbers" cta="Get a number" /> : (
        <Panel>
          {calls.map((c) => {
            const lines = Array.isArray(c.transcript) ? (c.transcript as { role: string; text: string }[]) : []
            return (
              <details key={c.id} className="group">
                <summary className="flex min-h-11 cursor-pointer items-start justify-between gap-4 p-6 transition hover:bg-surface-2">
                  <div className="min-w-0">
                    <p className="font-medium tabular-nums text-ink">{c.from_number ?? (c.channel === 'web' ? 'Website visitor' : 'Unknown caller')}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-muted">{c.summary ?? 'Summary appears when the call ends.'}</p>
                  </div>
                  <div className="flex shrink-0 items-start gap-4">
                    <div className="flex flex-col items-end gap-1 text-sm">
                      <span className="flex flex-wrap justify-end gap-x-3"><UrgencyBadge urgency={c.urgency} /><OutcomeBadge outcome={c.outcome} /></span>
                      <span className="text-xs text-faint">{fmtDate(c.started_at, org.timezone)}, {fmtDur(c.duration_seconds)}</span>
                    </div>
                    <ChevronDown className="chev mt-1 h-4 w-4 text-faint" aria-hidden />
                  </div>
                </summary>
                <div className="border-t border-line bg-surface-2 px-6 py-4">
                  {c.recording_url && <p className="mb-3 text-sm"><a href={c.recording_url} target="_blank" rel="noreferrer" className="font-medium text-primary underline underline-offset-4">Listen to the recording</a></p>}
                  {lines.length ? (
                    <ul className="max-w-prose space-y-2 text-sm">
                      {lines.map((t, i) => <li key={i}><span className="font-medium text-ink">{t.role === 'agent' ? 'Receptionist' : 'Caller'}</span> <span className="text-muted">{t.text}</span></li>)}
                    </ul>
                  ) : <p className="text-sm text-muted">No transcript for this call.</p>}
                </div>
              </details>
            )
          })}
        </Panel>
      )}
    </>
  )
}
