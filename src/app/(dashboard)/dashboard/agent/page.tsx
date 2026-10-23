import { SubmitButton } from '@/components/SubmitButton'
import type { Metadata } from 'next'
import Link from 'next/link'
import { requireOrg } from '@/lib/auth'
import { saveAgent } from '../actions'
import { cleanWindows } from '@/lib/trades'
import { btn, Card, input, label, Notice, PageHeader } from '@/components/ui'
export const metadata: Metadata = { title: 'Receptionist' }

const LANGS: [string, string][] = [['en', 'English'], ['es', 'Spanish'], ['fr', 'French'], ['pt', 'Portuguese']]
const VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']
const ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
const hint = 'mt-1 text-xs text-faint'

export default async function AgentPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string; setup?: string }> }) {
  const { error, ok, setup } = await searchParams
  const { supabase, org, role } = await requireOrg()
  const { data: a, error: loadError } = await supabase.from('agents').select('*').eq('org_id', org.id).order('created_at').limit(1).maybeSingle()
  if (loadError) console.error('Receptionist page: could not load receptionist settings', loadError)

  if (loadError || !a) {
    return (
      <>
        <PageHeader title="Receptionist" sub="How your assistant answers, books and escalates." />
        {loadError
          ? <Notice kind="error">We could not load your receptionist settings. <Link href="/dashboard/agent" className="font-semibold underline underline-offset-4">Try again</Link>.</Notice>
          : <Notice kind="error">Your receptionist is not set up yet. Set up your receptionist first, then <Link href="/dashboard/agent" className="font-semibold underline underline-offset-4">try again</Link>.</Notice>}
      </>
    )
  }

  const hours = a.business_hours as Record<string, [string, string]>
  const windows = cleanWindows(a.arrival_windows)
  const rows = [0, 1, 2, 3].map((i) => windows[i] ?? ['', ''])
  const ro = role === 'member'
  return (
    <>
      <PageHeader title="Receptionist" sub="How your assistant answers, books and escalates." />
      {setup && <Notice kind="success">Workspace created. Set your service area, arrival windows and alert numbers, then get a phone number.</Notice>}
      {error && <Notice kind="error">{error}</Notice>}
      {ok && <Notice kind="success">{ok}</Notice>}
      <form action={saveAgent} className="space-y-5">
        <input type="hidden" name="id" value={a.id} />
        <fieldset disabled={ro} className="space-y-5">
          <Card className="space-y-4">
            <h2 className="font-semibold text-ink">Greeting and voice</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <div><label htmlFor="name" className={label}>Assistant name</label><input id="name" name="name" defaultValue={a.name} required maxLength={60} className={input} /></div>
              <div><label htmlFor="voice" className={label}>Voice</label><select id="voice" name="voice" defaultValue={a.voice} className={input}>{VOICES.map((v) => <option key={v}>{v}</option>)}</select></div>
              <div><label htmlFor="language" className={label}>Language</label><select id="language" name="language" defaultValue={a.language} className={input}>{LANGS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></div>
            </div>
            <div><label htmlFor="greeting" className={label}>Greeting</label><input id="greeting" name="greeting" defaultValue={a.greeting} required maxLength={300} className={input} /><p className={hint}>A recording notice is added automatically when recording is on.</p></div>
            <div><label htmlFor="instructions" className={label}>Extra instructions</label><textarea id="instructions" name="instructions" rows={4} maxLength={4000} defaultValue={a.instructions} className={input} placeholder="Jobs you don’t take, brands you service, what to ask every caller…" /></div>
          </Card>

          <Card className="space-y-4">
            <h2 className="font-semibold text-ink">Services and service area</h2>
            <div><label htmlFor="services" className={label}>Services you offer</label><textarea id="services" name="services" rows={5} defaultValue={(a.services as string[]).join('\n')} className={input} placeholder={'Drain cleaning\nWater heater replacement\nAC repair'} /><p className={hint}>One per line. The assistant only books jobs that fit this list.</p></div>
            <div><label htmlFor="service_zips" className={label}>Postcodes you serve</label><textarea id="service_zips" name="service_zips" rows={3} defaultValue={(a.service_zips as string[]).join(', ')} className={input} placeholder="60614, 60657, 60618" /><p className={hint}>Separate with commas or new lines. Leave empty to accept every address.</p></div>
          </Card>

          <Card>
            <h2 className="mb-1 font-semibold text-ink">Arrival windows</h2>
            <p className="mb-3 text-sm text-muted">Callers book a window and a technician arrives inside it ({org.timezone}).</p>
            <div className="space-y-2">
              {rows.map(([s, e], i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <input type="time" name={`w${i}_start`} defaultValue={s} aria-label={`Window ${i + 1} starts`} className={`${input} !w-auto`} />
                  <span>to</span>
                  <input type="time" name={`w${i}_end`} defaultValue={e} aria-label={`Window ${i + 1} ends`} className={`${input} !w-auto`} />
                </div>
              ))}
            </div>
            <div className="mt-4 max-w-xs"><label htmlFor="jobs_per_window" className={label}>Jobs per window</label><input id="jobs_per_window" name="jobs_per_window" type="number" min={1} max={50} defaultValue={a.jobs_per_window} className={input} /><p className={hint}>How many technicians can take a job in the same window.</p></div>
          </Card>

          <Card>
            <h2 className="mb-3 font-semibold text-ink">Office hours <span className="font-normal text-faint">({org.timezone}). Leave blank for closed.</span></h2>
            <div className="space-y-2">
              {ORDER.map((d) => (
                <div key={d} className="flex items-center gap-3 text-sm">
                  <span className="w-10 font-medium">{d}</span>
                  <input type="time" name={`${d}_open`} defaultValue={hours[d]?.[0] ?? ''} aria-label={`${d} opens`} className={`${input} !w-auto`} />
                  <span>to</span>
                  <input type="time" name={`${d}_close`} defaultValue={hours[d]?.[1] ?? ''} aria-label={`${d} closes`} className={`${input} !w-auto`} />
                </div>
              ))}
            </div>
            <p className={hint}>Windows are only offered on open days.</p>
          </Card>

          <Card className="space-y-4">
            <h2 className="font-semibold text-ink">Emergencies and alerts</h2>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="emergency_service" defaultChecked={a.emergency_service} className="mt-1" /><span>We handle emergencies after hours. Emergency callers are sent to the on-call technician.</span></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label htmlFor="oncall_number" className={label}>On-call technician number</label><input id="oncall_number" name="oncall_number" defaultValue={a.oncall_number ?? ''} placeholder="+15551234567" className={input} /></div>
              <div><label htmlFor="transfer_number" className={label}>Office or owner number</label><input id="transfer_number" name="transfer_number" defaultValue={a.transfer_number ?? ''} placeholder="+15551234567" className={input} /><p className={hint}>Callers who ask for a person are transferred here during office hours.</p></div>
              <div><label htmlFor="notify_phone" className={label}>Text alerts to</label><input id="notify_phone" name="notify_phone" defaultValue={a.notify_phone ?? ''} placeholder="+15551234567" className={input} /><p className={hint}>New jobs, messages and emergencies. Falls back to the office number.</p></div>
              <div><label htmlFor="notify_email" className={label}>Email alerts to</label><input id="notify_email" name="notify_email" type="email" defaultValue={a.notify_email ?? ''} className={input} /></div>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="record_consent_notice" defaultChecked={a.record_consent_notice} /> Record calls (the greeting tells callers)</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" defaultChecked={a.is_active} /> Receptionist is active and answering calls</label>
          </Card>
        </fieldset>
        {!ro && <SubmitButton className={btn.primary}>Save changes</SubmitButton>}
      </form>
    </>
  )
}
