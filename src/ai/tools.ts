import { supabaseAdmin } from '@/lib/supabase/admin'
import { runAfter } from '@/lib/after'
import { notifyOwner } from '@/lib/notify'
import { sendSms } from '@/lib/sms'
import type { ToolDef } from '@/lib/vapi'
import {
  asHazard, asUrgency, bestOutcome, cleanWindows, inServiceArea, isOfficeOpen, LIFE_SAFETY_HAZARDS,
  SAFETY_SCRIPT, windowsForDate, type Outcome, type Urgency,
} from '@/lib/trades'

/** Tool schemas the Vapi assistant is created with. The ONLY place business actions are implemented is executeTool below. */
export const TOOL_DEFS: readonly ToolDef[] = [
  {
    name: 'get_current_time',
    description: 'Get the current local date and time for the business and whether the office is open right now. Call once before offering times.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'search_knowledge',
    description: 'Look up facts the company has written down (services, policies, areas, FAQs). Never use for prices unless the result states them.',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
  {
    name: 'check_service_area',
    description: 'Check whether a postcode or ZIP code is inside the area the company serves.',
    parameters: { type: 'object', properties: { postcode: { type: 'string' } }, required: ['postcode'] },
  },
  {
    name: 'check_availability',
    description: 'List open arrival windows on a date (business timezone). A technician arrives sometime inside the window.',
    parameters: { type: 'object', properties: { date: { type: 'string', description: 'YYYY-MM-DD' } }, required: ['date'] },
  },
  {
    name: 'book_job',
    description: 'Book a service visit in an arrival window returned by check_availability, after the caller confirmed the details read back to them.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        phone: { type: 'string', description: 'Callback number' },
        address: { type: 'string', description: 'Service address' },
        postcode: { type: 'string' },
        issue: { type: 'string', description: 'What is wrong, in a short sentence' },
        urgency: { type: 'string', enum: ['emergency', 'same_day', 'routine'] },
        service: { type: 'string', description: 'Which listed service this is' },
        start_local: { type: 'string', description: 'Window start, exactly as returned: YYYY-MM-DDTHH:mm' },
        notes: { type: 'string' },
      },
      required: ['name', 'phone', 'address', 'postcode', 'issue', 'start_local'],
    },
  },
  {
    name: 'flag_emergency',
    description: 'Record an emergency and alert the owner by text immediately. Call as soon as you know the hazard and have any callback number.',
    parameters: {
      type: 'object',
      properties: {
        hazard: { type: 'string', enum: ['gas', 'co', 'flood', 'sewage', 'electrical', 'no_heat', 'no_cooling', 'other'] },
        issue: { type: 'string' },
        name: { type: 'string' },
        phone: { type: 'string' },
        address: { type: 'string' },
        postcode: { type: 'string' },
      },
      required: ['hazard', 'issue'],
    },
  },
  {
    name: 'capture_lead',
    description: 'Save a message or callback request when you cannot book: estimate requests, out-of-hours messages, existing-customer questions.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' }, phone: { type: 'string' }, intent: { type: 'string', description: 'Why they called, in a few words' },
        summary: { type: 'string' }, address: { type: 'string' }, postcode: { type: 'string' }, issue: { type: 'string' },
        urgency: { type: 'string', enum: ['emergency', 'same_day', 'routine'] },
      },
      required: ['name', 'phone', 'intent'],
    },
  },
]

export interface ToolCtx { orgId: string; agentId: string; callId: string; callerNumber: string | null }
type Args = Record<string, unknown>

const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const PHONE_OK = /^\+?[0-9][0-9\s\-().]{6,18}$/

/** Callback number to E.164: keeps +numbers, prefers the caller ID when it matches, assumes US/CA for 10 digits. */
export function toE164(phone: string, callerNumber: string | null): string | null {
  const digits = phone.replace(/\D/g, '')
  if (phone.trim().startsWith('+')) return `+${digits}`
  const callerDigits = (callerNumber ?? '').replace(/\D/g, '')
  if (callerDigits && digits && callerDigits.endsWith(digits)) return `+${callerDigits}`
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

async function agentConfig(ctx: ToolCtx) {
  const db = supabaseAdmin()
  const [{ data: org }, { data: agent }] = await Promise.all([
    db.from('organizations').select('name, timezone').eq('id', ctx.orgId).single(),
    db.from('agents').select('business_hours, arrival_windows, jobs_per_window, service_zips, oncall_number, emergency_service, appointment_minutes')
      .eq('org_id', ctx.orgId).eq('id', ctx.agentId).single(),
  ])
  return { org, agent }
}

async function upsertContact(orgId: string, name: string, phone: string, email?: string) {
  const clean = phone.replace(/[^+0-9]/g, '')
  const { data } = await supabaseAdmin().from('contacts')
    .upsert({ org_id: orgId, name: name || null, phone: clean, email: email || null }, { onConflict: 'org_id,phone' })
    .select('id').single()
  return data?.id as string | undefined
}

/** Keeps the strongest outcome seen on the call (an emergency is never downgraded by a later lead). */
async function markCall(ctx: ToolCtx, outcome: Outcome, urgency?: Urgency | null) {
  const db = supabaseAdmin()
  const { data: call } = await db.from('calls').select('outcome, urgency').eq('org_id', ctx.orgId).eq('id', ctx.callId).maybeSingle()
  await db.from('calls').update({
    outcome: bestOutcome(call?.outcome as Outcome | null, outcome),
    urgency: call?.urgency === 'emergency' ? 'emergency' : urgency ?? call?.urgency ?? null,
  }).eq('org_id', ctx.orgId).eq('id', ctx.callId)
}

export async function executeTool(ctx: ToolCtx, name: string, args: Args): Promise<unknown> {
  const db = supabaseAdmin()
  try {
    switch (name) {
      case 'get_current_time': {
        const { org, agent } = await agentConfig(ctx)
        const tz = org?.timezone ?? 'UTC'
        const now = new Date()
        const o = isOfficeOpen(agent?.business_hours as Record<string, [string, string]> | undefined, tz, now)
        return {
          now_local: new Intl.DateTimeFormat('en-US', { timeZone: tz, dateStyle: 'full', timeStyle: 'short' }).format(now),
          date: o.date, timezone: tz, office_open_now: o.open, office_hours_today: o.hoursToday ?? 'closed today',
        }
      }

      case 'search_knowledge': {
        const q = str(args.query, 200)
        if (!q) return { results: [] }
        const { data } = await db.rpc('search_knowledge', { p_org: ctx.orgId, p_query: q, p_limit: 3 })
        return { results: data ?? [], note: data?.length ? undefined : 'Nothing on file. Say you are not sure and offer a callback.' }
      }

      case 'check_service_area': {
        const postcode = str(args.postcode, 12)
        if (!postcode) return { error: 'Need a postcode.' }
        const { agent } = await agentConfig(ctx)
        const ok = inServiceArea((agent?.service_zips as string[] | undefined) ?? [], postcode)
        return { in_service_area: ok, note: ok ? undefined : 'Outside the service area. Say so kindly and do not book.' }
      }

      case 'check_availability': {
        const date = str(args.date, 10)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'date must be YYYY-MM-DD' }
        const { org, agent } = await agentConfig(ctx)
        if (!org || !agent) return { error: 'Not configured. Offer a callback.' }
        const slots = windowsForDate(date, cleanWindows(agent.arrival_windows), agent.business_hours as Record<string, [string, string]>, org.timezone)
        if (!slots.length) return { windows: [], note: 'No windows that day (closed or too soon). Offer another day.' }
        const first = slots[0].startsAt.toISOString(), last = slots[slots.length - 1].endsAt.toISOString()
        const { data: booked } = await db.from('appointments').select('starts_at, ends_at')
          .eq('org_id', ctx.orgId).eq('status', 'booked').gte('starts_at', first).lte('ends_at', last)
        const cap = agent.jobs_per_window as number
        const open = slots.map((s) => ({
          start_local: s.start_local, label: s.label,
          spots_left: cap - (booked ?? []).filter((b) => new Date(b.starts_at).getTime() === s.startsAt.getTime()).length,
        })).filter((s) => s.spots_left > 0)
        return open.length
          ? { date, timezone: org.timezone, windows: open.map(({ start_local, label }) => ({ start_local, label })) }
          : { windows: [], note: 'Fully booked that day. Offer another day.' }
      }

      case 'book_job': {
        const name = str(args.name, 120), phoneRaw = str(args.phone, 30), address = str(args.address, 200)
        const postcode = str(args.postcode, 12), issue = str(args.issue, 300), start = str(args.start_local, 16)
        if (!name || !PHONE_OK.test(phoneRaw)) return { error: 'Need a valid name and callback number.' }
        if (address.length < 5 || !postcode || !issue) return { error: 'Need the service address, postcode and the issue.' }
        const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(start)
        if (!m) return { error: 'start_local must be a window start exactly as returned by check_availability.' }
        const { org, agent } = await agentConfig(ctx)
        if (!org || !agent) return { error: 'Not configured. Offer a callback with capture_lead.' }
        if (!inServiceArea(agent.service_zips as string[], postcode)) return { error: 'Outside the service area. Do not book; apologize.' }
        const slot = windowsForDate(m[1], cleanWindows(agent.arrival_windows), agent.business_hours as Record<string, [string, string]>, org.timezone, new Date(), 0)
          .find((s) => s.start_local === start)
        if (!slot) return { error: 'That is not an open window. Call check_availability again and offer one of those.' }
        const urgency = asUrgency(args.urgency) ?? 'routine'
        const contactId = await upsertContact(ctx.orgId, name, phoneRaw)
        const { data, error } = await db.rpc('book_trade_job', {
          p_org: ctx.orgId, p_call: ctx.callId, p_contact: contactId ?? null, p_service: str(args.service, 120) || null,
          p_starts: slot.startsAt.toISOString(), p_ends: slot.endsAt.toISOString(), p_capacity: agent.jobs_per_window,
          p_address: address, p_zip: postcode, p_issue: issue, p_urgency: urgency, p_notes: str(args.notes, 500) || null,
        })
        const row = Array.isArray(data) ? data[0] : data
        if (error || !row) return { error: 'Could not book. Offer a callback with capture_lead.' }
        if (row.out_status === 'full') return { error: 'That window just filled up. Offer another window.' }
        await markCall(ctx, 'booked', urgency)
        const when = `${slot.label} on ${m[1]}`
        runAfter(async () => {
          await notifyOwner(ctx.orgId, ctx.agentId, `New job booked: ${name}`, `${issue}\n${address} ${postcode}\n${when}\nCallback: ${phoneRaw}`)
          const to = toE164(phoneRaw, ctx.callerNumber)
          if (to) await sendSms(to, `${org.name}: you're booked for ${when}. A technician will arrive within that window. Reply to this number if you need to change it.`)
        })
        return { booked: true, window: slot.label, date: m[1], tell_caller: 'A technician arrives sometime inside that window, and a text confirmation is on its way.' }
      }

      case 'flag_emergency': {
        const hazard = asHazard(args.hazard)
        const issue = str(args.issue, 300), name = str(args.name, 120), address = str(args.address, 200)
        const phoneRaw = str(args.phone, 30) || ctx.callerNumber || ''
        const { agent } = await agentConfig(ctx)
        let contactId: string | undefined
        if (phoneRaw && PHONE_OK.test(phoneRaw)) contactId = await upsertContact(ctx.orgId, name, phoneRaw)
        await db.from('leads').insert({
          org_id: ctx.orgId, contact_id: contactId ?? null, call_id: ctx.callId, intent: `EMERGENCY: ${hazard}`,
          summary: issue || null, urgency: 'emergency', address: address || null, zip: str(args.postcode, 12) || null, issue: issue || null,
        })
        await markCall(ctx, 'emergency_escalated', 'emergency')
        const alert = await notifyOwner(ctx.orgId, ctx.agentId, `EMERGENCY (${hazard})`, `${issue}\n${address || 'address not given'}\nCaller: ${name || 'unknown'} ${phoneRaw || ''}`.trim())
        return {
          alerted: alert.sms || alert.email,
          oncall_transfer_available: !!agent?.oncall_number && agent.emergency_service !== false,
          safety_first: LIFE_SAFETY_HAZARDS.has(hazard) ? SAFETY_SCRIPT : undefined,
          next: 'Confirm the callback number, then follow your emergency steps.',
        }
      }

      case 'capture_lead': {
        const name = str(args.name, 120), phoneRaw = str(args.phone, 30)
        if (!name || !PHONE_OK.test(phoneRaw)) return { error: 'Need a name and a valid phone number.' }
        const urgency = asUrgency(args.urgency) ?? 'routine'
        const contactId = await upsertContact(ctx.orgId, name, phoneRaw)
        const intent = str(args.intent, 200)
        const { error } = await db.from('leads').insert({
          org_id: ctx.orgId, contact_id: contactId ?? null, call_id: ctx.callId, intent, summary: str(args.summary, 1000) || null,
          urgency, address: str(args.address, 200) || null, zip: str(args.postcode, 12) || null, issue: str(args.issue, 300) || null,
        })
        if (error) return { error: 'Could not save. Apologize and ask them to call back.' }
        await markCall(ctx, 'lead_captured', urgency)
        runAfter(() => notifyOwner(ctx.orgId, ctx.agentId, `${urgency === 'emergency' ? 'URGENT message' : 'New message'}: ${name}`, `${intent}\n${str(args.summary, 400)}\nCallback: ${phoneRaw}`))
        return { saved: true, tell_caller: 'Someone will call them back.' }
      }

      default:
        return { error: `Unknown tool ${name}` }
    }
  } catch (e) {
    console.error('[tool]', name, e)
    return { error: 'Tool failed. Apologize briefly and offer a callback.' }
  }
}
