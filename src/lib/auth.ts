import { redirect } from 'next/navigation'
import { supabaseServer } from './supabase/server'
import { adminEmails } from './env'

export type Role = 'owner' | 'admin' | 'member'
export interface OrgRow {
  id: string; name: string; slug: string; industry: string; timezone: string; plan: string
  subscription_status: string; trial_ends_at: string; current_period_end: string | null; stripe_customer_id: string | null
}

/** Resolves the signed-in user and their active org (first membership). Redirects if missing. */
export async function requireOrg() {
  const supabase = await supabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: m } = await supabase
    .from('memberships').select('role, organizations(*)').eq('user_id', user.id).order('created_at').limit(1).maybeSingle()
  const org = (m?.organizations as unknown as OrgRow | null) ?? null
  if (!m || !org) redirect('/onboarding')
  return { supabase, user, org, role: m.role as Role }
}

export async function requireAdmin() {
  const supabase = await supabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !adminEmails().includes((user.email ?? '').toLowerCase())) redirect('/')
  return user
}
