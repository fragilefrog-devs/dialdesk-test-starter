import { SubmitButton } from '@/components/SubmitButton'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { supabaseServer } from '@/lib/supabase/server'
import { getTimeZoneOptions, INDUSTRY_OPTIONS } from '@/lib/workspace-settings'
import { createOrganization } from './actions'
import { btn, input, label, Notice } from '@/components/ui'
export const metadata: Metadata = { title: 'Set up your company' }
export const dynamic = 'force-dynamic'

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  const supabase = await supabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: m } = await supabase.from('memberships').select('org_id').eq('user_id', user.id).limit(1)
  if (m?.length) redirect('/dashboard')
  const timezoneOptions = getTimeZoneOptions()

  return (
    <main className="mx-auto max-w-lg px-5 py-14">
      <h1 className="font-display text-3xl font-semibold text-ink">Set up your company</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Takes a minute. Service area, arrival windows and alert numbers come next.</p>
      {error && <Notice kind="error">{error}</Notice>}
      <form action={createOrganization} className="space-y-4 rounded-xl border border-line bg-surface p-6 shadow-card">
        <div><label htmlFor="name" className={label}>Company name</label><input id="name" name="name" required minLength={2} maxLength={80} className={input} placeholder="Alder Street Plumbing" /></div>
        <div><label htmlFor="slug" className={label}>Web address</label><input id="slug" name="slug" required minLength={3} maxLength={40} pattern="[a-zA-Z0-9\- ]+" className={input} placeholder="alder-street" /><p className="mt-1 text-xs text-faint">A short unique name for your workspace.</p></div>
        <div><label htmlFor="industry" className={label}>What do you do?</label><select id="industry" name="industry" className={input}>{INDUSTRY_OPTIONS.map(({ value, label: text }) => <option key={value} value={value}>{text}</option>)}</select></div>
        <div><label htmlFor="timezone" className={label}>Time zone</label>
          <select id="timezone" name="timezone" defaultValue="America/Chicago" className={input}>
            <optgroup label="United States">{timezoneOptions.us.map((timezone) => <option key={timezone}>{timezone}</option>)}</optgroup>
            <optgroup label="Other">{timezoneOptions.other.map((timezone) => <option key={timezone}>{timezone}</option>)}</optgroup>
          </select></div>
        <SubmitButton className={`${btn.primary} w-full`}>Create workspace</SubmitButton>
      </form>
    </main>
  )
}
