import type { Metadata } from 'next'
import { requireOrg } from '@/lib/auth'
import { saveAgent } from '../actions'
import { btn, Card, input, label, Notice, PageHeader } from '@/components/ui'
export const metadata: Metadata = { title: 'Receptionist' }

const LANGS: [string, string][] = [['en', 'English'], ['bn', 'Bengali'], ['hi', 'Hindi'], ['ur', 'Urdu'], ['es', 'Spanish'], ['fr', 'French'], ['ar', 'Arabic'], ['id', 'Indonesian'], ['ms', 'Malay']]
const ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

export default async function AgentPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { error, ok } = await searchParams
  const { supabase, org, role } = await requireOrg()
  const { data: a } = await supabase.from('agents').select('*').eq('org_id', org.id).order('created_at').limit(1).single()
  if (!a) return null
  const hours = a.business_hours as Record<string, [string, string]>
  const ro = role === 'member'
  return (
    <>
      <PageHeader title="Receptionist" sub="How your AI answers the phone." />
      {error && <Notice kind="error">{error}</Notice>}
      {ok && <Notice kind="success">{ok}</Notice>}
      <form action={saveAgent} className="space-y-5">
        <input type="hidden" name="id" value={a.id} />
        <fieldset disabled={ro} className="space-y-5">
          <Card className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label htmlFor="name" className={label}>Name</label><input id="name" name="name" defaultValue={a.name} required maxLength={60} className={input} /></div>
              <p className="text-sm text-brand-800/70">Speech voice is configured on the voice gateway.</p>
              <div><label htmlFor="language" className={label}>Primary language</label><select id="language" name="language" defaultValue={a.language} className={input}>{LANGS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></div>
              <div><label htmlFor="appointment_minutes" className={label}>Appointment length (minutes)</label><input id="appointment_minutes" name="appointment_minutes" type="number" min={5} max={480} defaultValue={a.appointment_minutes} className={input} /></div>
            </div>
            <div><label htmlFor="greeting" className={label}>Greeting</label><input id="greeting" name="greeting" defaultValue={a.greeting} required maxLength={300} className={input} /></div>
            <div><label htmlFor="instructions" className={label}>Extra instructions</label><textarea id="instructions" name="instructions" rows={5} maxLength={4000} defaultValue={a.instructions} className={input} placeholder="Tone, services you don’t offer, what to ask every caller…" /></div>
            <div><label htmlFor="transfer_number" className={label}>Transfer to a human at (optional)</label><input id="transfer_number" name="transfer_number" defaultValue={a.transfer_number ?? ''} placeholder="+15551234567" className={input} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" defaultChecked={a.is_active} /> Receptionist is active (answers calls)</label>
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold text-brand-950">Business hours <span className="font-normal text-brand-800/60">({org.timezone}) — leave blank for closed</span></h2>
            <div className="space-y-2">
              {ORDER.map((d) => (
                <div key={d} className="flex items-center gap-3 text-sm">
                  <span className="w-10 font-medium uppercase">{d}</span>
                  <input type="time" name={`${d}_open`} defaultValue={hours[d]?.[0] ?? ''} aria-label={`${d} opens`} className={`${input} !w-auto`} />
                  <span>to</span>
                  <input type="time" name={`${d}_close`} defaultValue={hours[d]?.[1] ?? ''} aria-label={`${d} closes`} className={`${input} !w-auto`} />
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-brand-800/60">Appointments are only offered inside these hours.</p>
          </Card>
        </fieldset>
        {!ro && <button className={btn.primary}>Save changes</button>}
      </form>
    </>
  )
}
