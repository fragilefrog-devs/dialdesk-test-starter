'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireOrg } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { limitsFor } from '@/lib/plans'
import { createNumber, deleteNumber, getNumber } from '@/lib/vapi'
import { syncAgent, syncOrgAgents } from '@/lib/vapi-sync'
import { cleanWindows, parseList, TIME_RE } from '@/lib/trades'
import { appEnv } from '@/lib/env'
import { sendTemplateEmail } from '@/lib/email'
import { DAY_KEYS } from '@/lib/time'
import { parseDomains, WIDGET_ACCENT_RE } from '@/lib/widget'

async function adminCtx() {
  const ctx = await requireOrg()
  if (ctx.role === 'member') redirect('/dashboard?error=' + encodeURIComponent('Admins only'))
  return ctx
}
const go = (path: string, key: 'error' | 'ok', msg: string): never => redirect(`${path}?${key}=${encodeURIComponent(msg)}`)

// ── Workspace settings ──
const workspaceSettingsSchema = z.object({
  name: z.string().trim().min(2).max(80),
  industry: z.enum(['plumbing', 'hvac', 'plumbing_hvac', 'other']),
  timezone: z.string().min(1).max(64),
})

export async function saveWorkspaceSettings(fd: FormData) {
  const { supabase, org } = await adminCtx()
  const parsed = workspaceSettingsSchema.safeParse(Object.fromEntries(fd))
  if (!parsed.success) return go('/dashboard/settings', 'error', 'Check the workspace name, industry, and time zone.')
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: parsed.data.timezone })
  } catch {
    return go('/dashboard/settings', 'error', 'Choose a valid time zone.')
  }

  const { error } = await supabase.from('organizations').update({
    name: parsed.data.name,
    industry: parsed.data.industry,
    timezone: parsed.data.timezone,
  }).eq('id', org.id)
  if (error) {
    console.error('[workspace-settings] Could not save workspace details', { organizationId: org.id, error })
    return go('/dashboard/settings', 'error', 'Could not save workspace details.')
  }

  const sync = await syncOrgAgents(org.id)
  revalidatePath('/dashboard/settings')
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/agent')
  revalidatePath('/dashboard/appointments')
  revalidatePath('/dashboard/calls')
  revalidatePath('/dashboard/leads')
  if (sync.errors.length) return go('/dashboard/settings', 'error', sync.errors[0])
  return go('/dashboard/settings', 'ok', 'Workspace settings saved.')
}

// ── Agent ──
const e164 = z.string().regex(/^\+[1-9][0-9]{7,14}$/, 'Use international format, like +15551234567')
const agentSchema = z.object({
  name: z.string().trim().min(1).max(60),
  greeting: z.string().trim().min(5).max(300),
  language: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/),
  voice: z.enum(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']),
  instructions: z.string().max(4000),
  transfer_number: e164.or(z.literal('')),
  oncall_number: e164.or(z.literal('')),
  notify_phone: e164.or(z.literal('')),
  notify_email: z.string().email().max(200).or(z.literal('')),
  jobs_per_window: z.coerce.number().int().min(1).max(50),
})
export async function saveAgent(fd: FormData) {
  const { supabase, org } = await adminCtx()
  const p = agentSchema.safeParse(Object.fromEntries(fd))
  if (!p.success) return go('/dashboard/agent', 'error', p.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' · '))
  const hours: Record<string, [string, string]> = {}
  for (const d of DAY_KEYS) {
    const o = String(fd.get(`${d}_open`) ?? ''), c = String(fd.get(`${d}_close`) ?? '')
    if (TIME_RE.test(o) && TIME_RE.test(c) && o < c) hours[d] = [o, c]
  }
  const windows = cleanWindows([0, 1, 2, 3].map((i) => [String(fd.get(`w${i}_start`) ?? ''), String(fd.get(`w${i}_end`) ?? '')]))
  if (!windows.length) return go('/dashboard/agent', 'error', 'Add at least one arrival window (start before end).')
  const id = String(fd.get('id'))
  const nullable = (v: string) => v || null
  const { error } = await supabase.from('agents').update({
    name: p.data.name, greeting: p.data.greeting, language: p.data.language, voice: p.data.voice, instructions: p.data.instructions,
    transfer_number: nullable(p.data.transfer_number), oncall_number: nullable(p.data.oncall_number),
    notify_phone: nullable(p.data.notify_phone), notify_email: nullable(p.data.notify_email),
    jobs_per_window: p.data.jobs_per_window, arrival_windows: windows, business_hours: hours,
    services: parseList(String(fd.get('services') ?? ''), 30), service_zips: parseList(String(fd.get('service_zips') ?? ''), 300, 12),
    emergency_service: fd.get('emergency_service') === 'on', record_consent_notice: fd.get('record_consent_notice') === 'on',
    is_active: fd.get('is_active') === 'on',
  }).eq('org_id', org.id).eq('id', id)
  if (error) return go('/dashboard/agent', 'error', 'Could not save.')
  revalidatePath('/dashboard/agent')
  const sync = await syncAgent(id)
  return sync.ok
    ? go('/dashboard/agent', 'ok', 'Saved. New calls use these settings.')
    : go('/dashboard/agent', 'error', sync.error)
}

// ── Website widget ──
const widgetAppearanceSchema = z.object({
  label: z.string().trim().min(1).max(32),
  position: z.enum(['left', 'right']),
  accent: z.string().regex(WIDGET_ACCENT_RE, 'Choose a valid six-digit hex color.'),
})

export async function saveWidget(fd: FormData) {
  const { supabase, org } = await adminCtx()
  const enabled = fd.get('enabled') === 'on'
  const domains = parseDomains(String(fd.get('domains') ?? ''))
  const appearance = widgetAppearanceSchema.safeParse({
    label: fd.get('label'),
    position: fd.get('position'),
    accent: fd.get('accent'),
  })
  if (!appearance.success) return go('/dashboard/widget-setup', 'error', 'Enter a label and choose a valid accent color and position.')
  if (enabled && !domains.length) return go('/dashboard/widget-setup', 'error', 'Add at least one website domain, like example.com, or turn the widget off.')
  const { error } = await supabase.from('agents').update({
    widget_enabled: enabled,
    widget_domains: domains,
    widget_label: appearance.data.label,
    widget_position: appearance.data.position,
    widget_accent: appearance.data.accent.toLowerCase(),
  }).eq('org_id', org.id)
  if (error) return go('/dashboard/widget-setup', 'error', 'Could not save.')
  revalidatePath('/dashboard/widget-setup')
  return go('/dashboard/widget-setup', 'ok', enabled ? 'Widget settings saved. It only loads on your listed sites.' : 'Widget settings saved. The widget is turned off.')
}
/** Invalidates the old embed snippet, for example if the token leaked onto a site you do not own. */
export async function rotateWidgetToken() {
  const { supabase, org } = await adminCtx()
  await supabase.from('agents').update({ widget_token: crypto.randomUUID().replace(/-/g, '') }).eq('org_id', org.id)
  revalidatePath('/dashboard/widget-setup')
  return go('/dashboard/widget-setup', 'ok', 'New embed code created. Update the snippet on your site.')
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
  const area = String(fd.get('area') ?? '').trim()
  if (!/^[2-9][0-9]{2}$/.test(area)) return go('/dashboard/numbers', 'error', 'Enter a 3-digit US area code, like 312.')
  const { data: owned } = await supabase.from('phone_numbers').select('id').eq('org_id', org.id)
  if ((owned?.length ?? 0) >= limitsFor(org.plan).numbers) return go('/dashboard/numbers', 'error', 'Number limit reached. Upgrade your plan for more.')
  const { data: agent } = await supabase.from('agents').select('id, vapi_assistant_id').eq('org_id', org.id).order('created_at').limit(1).maybeSingle()
  if (!agent) return go('/dashboard/numbers', 'error', 'Set up your receptionist first.')
  let assistantId = agent.vapi_assistant_id as string | null
  if (!assistantId) {
    const sync = await syncAgent(agent.id)
    if (!sync.ok) return go('/dashboard/numbers', 'error', sync.error)
    assistantId = (await supabaseAdmin().from('agents').select('vapi_assistant_id').eq('id', agent.id).single()).data?.vapi_assistant_id ?? null
  }
  if (!assistantId) return go('/dashboard/numbers', 'error', 'Could not prepare the receptionist. Try again.')
  let created: { id: string; number?: string }
  try { created = await createNumber(area, assistantId, org.name) } catch (e) { console.error(e); return go('/dashboard/numbers', 'error', 'No number available for that area code. Try a nearby one.') }
  const number = created.number ?? (await getNumber(created.id).catch(() => null))?.number
  if (!number) { await deleteNumber(created.id); return go('/dashboard/numbers', 'error', 'That number was not ready. Try another area code.') }
  const { error } = await supabaseAdmin().from('phone_numbers').insert({ org_id: org.id, agent_id: agent.id, e164: number, provider: 'vapi', provider_sid: created.id })
  if (error) { await deleteNumber(created.id); return go('/dashboard/numbers', 'error', 'Could not attach the number.') }
  return go('/dashboard/numbers', 'ok', `${number} is live.`)
}
export async function removeNumber(fd: FormData) {
  const { supabase, org } = await adminCtx()
  const { data: n } = await supabase.from('phone_numbers').select('id, provider_sid').eq('org_id', org.id).eq('id', String(fd.get('id'))).maybeSingle()
  if (!n) return
  if (n.provider_sid) await deleteNumber(n.provider_sid)
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
  const appUrl = appEnv().NEXT_PUBLIC_APP_URL
  const { data: inv, error } = await supabase.from('invites').insert({ org_id: org.id, ...p.data! }).select('id, token').single()
  if (error || !inv) return go('/dashboard/team', 'error', 'Could not create invite.')
  const delivered = await sendTemplateEmail(p.data!.email, {
    kind: 'team-invite',
    inviterEmail: user.email ?? 'A teammate',
    organizationName: org.name,
    inviteUrl: `${appUrl}/invite/${inv.token}`,
  })
  if (!delivered) {
    const { error: deleteError } = await supabase.from('invites').delete().eq('org_id', org.id).eq('id', inv.id)
    if (deleteError) console.error('[team-invite] Could not remove undelivered invite', { organizationId: org.id, error: deleteError.message })
    return go('/dashboard/team', 'error', 'The invitation email could not be sent. Please try again.')
  }
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
  const id = z.string().uuid().safeParse(fd.get('id'))
  const status = z.enum(['new', 'contacted', 'qualified', 'won', 'lost']).safeParse(fd.get('status'))
  if (!id.success || !status.success) return go('/dashboard/leads', 'error', 'Choose a valid lead and status.')
  const { data, error } = await supabase.from('leads').update({ status: status.data })
    .eq('org_id', org.id).eq('id', id.data).select('id').maybeSingle()
  if (error) {
    console.error('[lead-status] Could not update lead status', { organizationId: org.id, leadId: id.data, error })
    return go('/dashboard/leads', 'error', 'Could not update this lead. Please try again.')
  }
  if (!data) return go('/dashboard/leads', 'error', 'This lead was not found in your workspace.')
  revalidatePath('/dashboard/leads')
  return go('/dashboard/leads', 'ok', 'Lead status updated.')
}
export async function cancelAppointment(fd: FormData) {
  const { supabase, org } = await requireOrg()
  await supabase.from('appointments').update({ status: 'cancelled' }).eq('org_id', org.id).eq('id', String(fd.get('id')))
  revalidatePath('/dashboard/appointments')
}
