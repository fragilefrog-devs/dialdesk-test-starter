import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { supabaseServer } from '@/lib/supabase/server'
import { createOrganization } from './actions'
import { btn, input, label, Notice } from '@/components/ui'
export const metadata: Metadata = { title: 'Set up your business' }
export const dynamic = 'force-dynamic'

const INDUSTRIES = [['clinic', 'Medical clinic'], ['dental', 'Dental'], ['real_estate', 'Real estate'], ['home_services', 'Home services'], ['salon', 'Salon / spa'], ['legal', 'Law firm'], ['restaurant', 'Restaurant'], ['other', 'Other']]
const ZONES = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['UTC']

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  const supabase = await supabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: m } = await supabase.from('memberships').select('org_id').eq('user_id', user.id).limit(1)
  if (m?.length) redirect('/dashboard')

  return (
    <main className="mx-auto max-w-lg px-5 py-14">
      <h1 className="text-2xl font-bold text-brand-950">Set up your business</h1>
      <p className="mb-6 mt-1 text-sm text-brand-800/70">Takes about a minute. You can change everything later.</p>
      {error && <Notice kind="error">{error}</Notice>}
      <form action={createOrganization} className="space-y-4 rounded-2xl border border-brand-200/70 bg-white p-6 shadow-card">
        <div><label htmlFor="name" className={label}>Business name</label><input id="name" name="name" required minLength={2} maxLength={80} className={input} placeholder="Bright Smile Dental" /></div>
        <div><label htmlFor="slug" className={label}>Web address</label><input id="slug" name="slug" required minLength={3} maxLength={40} pattern="[a-zA-Z0-9\- ]+" className={input} placeholder="bright-smile" /><p className="mt-1 text-xs text-brand-800/60">Used for your public page and website widget.</p></div>
        <div><label htmlFor="industry" className={label}>Industry</label><select id="industry" name="industry" className={input}>{INDUSTRIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div><label htmlFor="timezone" className={label}>Time zone</label><select id="timezone" name="timezone" defaultValue="UTC" className={input}>{ZONES.map((z) => <option key={z}>{z}</option>)}</select></div>
        <button className={`${btn.primary} w-full`}>Create workspace</button>
      </form>
    </main>
  )
}
