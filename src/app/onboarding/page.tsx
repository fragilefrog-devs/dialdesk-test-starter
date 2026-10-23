import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { supabaseServer } from '@/lib/supabase/server'
import { createOrganization } from './actions'
import { btn, input, label, Notice } from '@/components/ui'
export const metadata: Metadata = { title: 'Set up your company' }
export const dynamic = 'force-dynamic'

const TRADES = [['plumbing', 'Plumbing'], ['hvac', 'Heating and cooling (HVAC)'], ['plumbing_hvac', 'Plumbing and HVAC']]
const US_ZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu']
const OTHER_ZONES = (typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['UTC']).filter((z) => !US_ZONES.includes(z))

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  const supabase = await supabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: m } = await supabase.from('memberships').select('org_id').eq('user_id', user.id).limit(1)
  if (m?.length) redirect('/dashboard')

  return (
    <main className="mx-auto max-w-lg px-5 py-14">
      <h1 className="font-display text-3xl font-bold text-brand-950">Set up your company</h1>
      <p className="mb-6 mt-1 text-sm text-brand-800/70">Takes a minute. Service area, arrival windows and alert numbers come next.</p>
      {error && <Notice kind="error">{error}</Notice>}
      <form action={createOrganization} className="space-y-4 rounded-xl border border-brand-200/70 bg-white p-6 shadow-card">
        <div><label htmlFor="name" className={label}>Company name</label><input id="name" name="name" required minLength={2} maxLength={80} className={input} placeholder="Alder Street Plumbing" /></div>
        <div><label htmlFor="slug" className={label}>Web address</label><input id="slug" name="slug" required minLength={3} maxLength={40} pattern="[a-zA-Z0-9\- ]+" className={input} placeholder="alder-street" /><p className="mt-1 text-xs text-brand-800/60">Used in your account URL.</p></div>
        <div><label htmlFor="industry" className={label}>What do you do?</label><select id="industry" name="industry" className={input}>{TRADES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div><label htmlFor="timezone" className={label}>Time zone</label>
          <select id="timezone" name="timezone" defaultValue="America/Chicago" className={input}>
            <optgroup label="United States">{US_ZONES.map((z) => <option key={z}>{z}</option>)}</optgroup>
            <optgroup label="Other">{OTHER_ZONES.map((z) => <option key={z}>{z}</option>)}</optgroup>
          </select></div>
        <button className={`${btn.primary} w-full`}>Create workspace</button>
      </form>
    </main>
  )
}
