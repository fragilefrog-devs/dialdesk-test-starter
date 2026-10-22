'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireOrg } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { limitsFor } from '@/lib/plans'
import { buyNumber, releaseNumber } from '@/lib/twilio'
import { sendEmail, escapeHtml } from '@/lib/email'
import { DAY_KEYS } from '@/lib/time'

async function adminCtx() {
  const ctx = await requireOrg()
  if (ctx.role === 'member') redirect('/dashboard?error=' + encodeURIComponent('Admins only'))
  return ctx
}
const go = (path: string, key: 'error' | 'ok', msg: string): never => redirect(`${path}?${key}=${encodeURIComponent(msg)}`)

// ── Agent ──
const agentSchema = z.object({
  name: z.string().trim().min(1).max(60),
  greeting: z.string().trim().min(5).max(300),
  language: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/),
  instructions: z.string().max(4000),
  transfer_number: z.string().regex(/^\+?[0-9]{7,15}$/).or(z.literal('')),
  appointment_minutes: z.coerce.number().int().min(5).max(480),
})
export async function saveAgent(fd: FormData) {
  const { supabase, org } = await adminCtx()
  const p = agentSchema.safeParse(Object.fromEntries(fd))
  if (!p.success) return go('/dashboard/agent', 'error', 'Check the highlighted fields: ' + p.error.issues.map((i) => i.path.join('.')).join(', '))
  const hours: Record<string, [string, string]> = {}
  for (const d of DAY_KEYS) {
    const o = String(fd.get(`${d}_open`) ?? ''), c = String(fd.get(`${d}_close`) ?? '')
    if (/^\d{2}:\d{2}$/.test(o) && /^\d{2}:\d{2}$/.test(c) && o < c) hours[d] = [o, c]
  }
  const { error } = await supabase.from('agents').update({
    ...p.data!, transfer_number: p.data!.transfer_number || null, business_hours: hours, is_active: fd.get('is_active') === 'on',
  }).eq('org_id', org.id).eq('id', String(fd.get('id')))
  if (error) return go('/dashboard/agent', 'error', 'Could not save.')
  revalidatePath('/dashboard/agent')
  return go('/dashboard/agent', 'ok', 'Saved. New calls use these settings immediately.')
}

// ── Knowledge ──
export async function addDoc(fd: FormData) {
  const { supabase, org } = await adminCtx()
  const p = z.object({ title: z.string().trim().min(2).max(120), content: z.string().trim().min(10).max(8000) }).safeParse(Object.fromEntries(fd))
  if (!p.success) return go('/dashboard/knowledge', 'error', 'Add a title and at least a sentence of content.')
  const { count } = await supabase.from('knowledge_docs').select('id', { count: 'exact', head: true }).eq('org_id', org.id)
  if ((count ?? 0) >= 100) return go('/dashboard/knowledge', 'error', 'Document limit reached (100).')
  await supabase.from('knowledge_docs').insert({ org_id: org.id, ...p.data! })
  revalidatePath('/dashboard/knowledge')
}
export async function deleteDoc(fd: FormData) {
  const { supabase, org } = await adminCtx()
  await supabase.from('knowledge_docs').delete().eq('org_id', org.id).eq('id', String(fd.get('id')))
  revalidatePath('/dashboard/knowledge')
}

// ── Numbers ──
export async function purchaseNumber(fd: FormData) {
  const { supabase, org } = await adminCtx()
  const e164 = String(fd.get('e164') ?? '')
  if (!/^\+[1-9][0-9]{7,14}$/.test(e164)) return go('/dashboard/numbers', 'error', 'Invalid number.')
  const { data: owned } = await supabase.from('phone_numbers').select('id').eq('org_id', org.id)
  if ((owned?.length ?? 0) >= limitsFor(org.plan).numbers) return go('/dashboard/numbers', 'error', 'Number limit reached — upgrade your plan for more.')
  const { data: agent } = await supabase.from('agents').select('id').eq('org_id', org.id).order('created_at').limit(1).maybeSingle()
  let bought
  try { bought = await buyNumber(e164) } catch (e) { console.error(e); return go('/dashboard/numbers', 'error', 'That number is no longer available.') }
  const { error } = await supabaseAdmin().from('phone_numbers').insert({ org_id: org.id, agent_id: agent?.id ?? null, e164: bought.phone_number, provider_sid: bought.sid })
  if (error) { await releaseNumber(bought.sid); return go('/dashboard/numbers', 'error', 'Could not attach number.') }
  return go('/dashboard/numbers', 'ok', `${bought.phone_number} is live.`)
}
export async function removeNumber(fd: FormData) {
  const { supabase, org } = await adminCtx()
  const { data: n } = await supabase.from('phone_numbers').select('id, provider_sid').eq('org_id', org.id).eq('id', String(fd.get('id'))).maybeSingle()
  if (!n) return
  if (n.provider_sid) await releaseNumber(n.provider_sid)
  await supabase.from('phone_numbers').delete().eq('id', n.id).eq('org_id', org.id)
  revalidatePath('/dashboard/numbers')
}

// ── Team ──
export async function inviteMember(fd: FormData) {
  const { supabase, org, user } = await adminCtx()
  const p = z.object({ email: z.string().email().max(200), role: z.enum(['admin', 'member']) }).safeParse(Object.fromEntries(fd))
  if (!p.success) return go('/dashboard/team', 'error', 'Enter a valid email.')
  const { count } = await supabase.from('memberships').select('user_id', { count: 'exact', head: true }).eq('org_id', org.id)
  if ((count ?? 0) >= limitsFor(org.plan).seats) return go('/dashboard/team', 'error', 'Seat limit reached — upgrade for more seats.')
  const { data: inv, error } = await supabase.from('invites').insert({ org_id: org.id, ...p.data! }).select('token').single()
  if (error || !inv) return go('/dashboard/team', 'error', 'Could not create invite.')
  const link = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${inv.token}`
  await sendEmail(p.data!.email, `${org.name} invited you to Receptionist AI`,
    `<p>${escapeHtml(user.email ?? 'A teammate')} invited you to join <b>${escapeHtml(org.name)}</b>.</p><p><a href="${link}">Accept invitation</a> (expires in 7 days)</p>`)
  return go('/dashboard/team', 'ok', 'Invitation sent.')
}
export async function removeMember(fd: FormData) {
  const { supabase, org, user } = await adminCtx()
  const id = String(fd.get('user_id'))
  if (id === user.id) return
  await supabase.from('memberships').delete().eq('org_id', org.id).eq('user_id', id) // RLS blocks removing owners
  revalidatePath('/dashboard/team')
}

// ── Leads / appointments ──
export async function setLeadStatus(fd: FormData) {
  const { supabase, org } = await requireOrg()
  const status = z.enum(['new', 'contacted', 'qualified', 'won', 'lost']).safeParse(fd.get('status'))
  if (!status.success) return
  await supabase.from('leads').update({ status: status.data }).eq('org_id', org.id).eq('id', String(fd.get('id')))
  revalidatePath('/dashboard/leads')
}
export async function cancelAppointment(fd: FormData) {
  const { supabase, org } = await requireOrg()
  await supabase.from('appointments').update({ status: 'cancelled' }).eq('org_id', org.id).eq('id', String(fd.get('id')))
  revalidatePath('/dashboard/appointments')
}
