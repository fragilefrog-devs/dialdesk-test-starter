import { supabaseAdmin } from '@/lib/supabase/admin'
import { transferCall } from '@/lib/twilio'
import { dayKey, zonedToUtc } from '@/lib/time'

/** Tool schemas shared by the local voice model across phone and web channels. */
export const TOOL_DEFS = [
  {
    type: 'function', name: 'search_knowledge',
    description: 'Look up business facts (services, prices, policies, location, FAQs). Always use before answering factual questions about the business.',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
  {
    type: 'function', name: 'check_availability',
    description: 'List open appointment slots for a given calendar date in the business timezone.',
    parameters: { type: 'object', properties: { date: { type: 'string', description: 'YYYY-MM-DD' } }, required: ['date'] },
  },
  {
    type: 'function', name: 'book_appointment',
    description: 'Book an appointment after the caller confirmed a slot returned by check_availability. Read details back first.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' }, phone: { type: 'string', description: 'Caller callback number' },
        service: { type: 'string' }, start_local: { type: 'string', description: 'YYYY-MM-DDTHH:mm in business timezone' },
        notes: { type: 'string' },
      },
      required: ['name', 'phone', 'start_local'],
    },
  },
  {
    type: 'function', name: 'capture_lead',
    description: 'Save a caller who wants follow-up (sales inquiry, quote request, callback) with their intent.',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string' }, intent: { type: 'string' }, summary: { type: 'string' } },
      required: ['name', 'phone', 'intent'],
    },
  },
  {
    type: 'function', name: 'transfer_to_human',
    description: 'Transfer the live phone call to a human. Use when the caller asks for a person, is upset, or it is an emergency the business handles.',
    parameters: { type: 'object', properties: { reason: { type: 'string' } }, required: ['reason'] },
  },
] as const

export interface ToolCtx { orgId: string; agentId: string | null; callId: string; callSid?: string | null; channel: 'phone' | 'web' }
type Args = Record<string, unknown>
const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const E164 = /^\+?[0-9][0-9\s\-().]{6,18}$/

async function upsertContact(orgId: string, name: string, phone: string, email?: string) {
  const db = supabaseAdmin()
  const clean = phone.replace(/[^+0-9]/g, '')
  const { data } = await db.from('contacts')
    .upsert({ org_id: orgId, name: name || null, phone: clean, email: email || null }, { onConflict: 'org_id,phone' })
    .select('id').single()
  return data?.id as string | undefined
}

export async function executeTool(ctx: ToolCtx, name: string, args: Args): Promise<unknown> {
  const db = supabaseAdmin()
  try {
    switch (name) {
      case 'search_knowledge': {
        const q = str(args.query, 200)
        if (!q) return { results: [] }
        const { data } = await db.rpc('search_knowledge', { p_org: ctx.orgId, p_query: q, p_limit: 3 })
        return { results: data ?? [], note: data?.length ? undefined : 'No matching info on file. Say you are not sure and offer a callback.' }
      }

      case 'check_availability': {
        const date = str(args.date, 10)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'date must be YYYY-MM-DD' }
        const [{ data: org }, { data: agent }] = await Promise.all([
          db.from('organizations').select('timezone').eq('id', ctx.orgId).single(),
          db.from('agents').select('business_hours, appointment_minutes').eq('id', ctx.agentId ?? '').maybeSingle(),
        ])
        const tz = org?.timezone ?? 'UTC'
        const hours = (agent?.business_hours as Record<string, [string, string]> | undefined)?.[dayKey(date)]
        if (!hours) return { slots: [], note: 'Closed that day.' }
        const step = agent?.appointment_minutes ?? 30
        const open = zonedToUtc(date, hours[0], tz), close = zonedToUtc(date, hours[1], tz)
        const { data: booked } = await db.from('appointments').select('starts_at, ends_at')
          .eq('org_id', ctx.orgId).eq('status', 'booked').lt('starts_at', close.toISOString()).gt('ends_at', open.toISOString())
        const slots: string[] = []
        for (let t = open.getTime(); t + step * 60000 <= close.getTime(); t += step * 60000) {
          const s = t, e = t + step * 60000
          if (s < Date.now() + 30 * 60000) continue
          if ((booked ?? []).some((b) => new Date(b.starts_at).getTime() < e && new Date(b.ends_at).getTime() > s)) continue
          slots.push(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(s)))
        }
        return { date, timezone: tz, slot_minutes: step, slots: slots.slice(0, 12) }
      }

      case 'book_appointment': {
        const name = str(args.name, 120), phone = str(args.phone, 30), start = str(args.start_local, 16)
        if (!name || !E164.test(phone)) return { error: 'Need a valid name and callback phone number.' }
        const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(start)
        if (!m) return { error: 'start_local must be YYYY-MM-DDTHH:mm' }
        const [{ data: org }, { data: agent }] = await Promise.all([
          db.from('organizations').select('timezone').eq('id', ctx.orgId).single(),
          db.from('agents').select('business_hours, appointment_minutes').eq('id', ctx.agentId ?? '').maybeSingle(),
        ])
        const tz = org?.timezone ?? 'UTC', step = agent?.appointment_minutes ?? 30
        const hours = (agent?.business_hours as Record<string, [string, string]> | undefined)?.[dayKey(m[1])]
        const starts = zonedToUtc(m[1], m[2], tz), ends = new Date(starts.getTime() + step * 60000)
        if (!hours || starts < zonedToUtc(m[1], hours[0], tz) || ends > zonedToUtc(m[1], hours[1], tz)) return { error: 'Outside business hours.' }
        if (starts.getTime() < Date.now()) return { error: 'That time is in the past.' }
        const contactId = await upsertContact(ctx.orgId, name, phone)
        const { data, error } = await db.from('appointments').insert({
          org_id: ctx.orgId, contact_id: contactId, call_id: ctx.callId, service: str(args.service, 120) || null,
          starts_at: starts.toISOString(), ends_at: ends.toISOString(), notes: str(args.notes, 500) || null,
        }).select('id').single()
        if (error?.code === '23P01') return { error: 'That slot was just taken. Offer another slot.' }
        if (error) return { error: 'Could not book. Offer a callback instead.' }
        return { booked: true, appointment_id: data.id, starts_local: start, minutes: step }
      }

      case 'capture_lead': {
        const name = str(args.name, 120), phone = str(args.phone, 30)
        if (!name || !E164.test(phone)) return { error: 'Need a valid name and phone number.' }
        const contactId = await upsertContact(ctx.orgId, name, phone, str(args.email, 200))
        const { error } = await db.from('leads').insert({
          org_id: ctx.orgId, contact_id: contactId, call_id: ctx.callId, intent: str(args.intent, 200), summary: str(args.summary, 1000) || null,
        })
        return error ? { error: 'Could not save lead.' } : { saved: true }
      }

      case 'transfer_to_human': {
        if (ctx.channel !== 'phone' || !ctx.callSid) return { transferred: false, note: 'Transfer only works on phone calls. Offer a callback.' }
        const { data: agent } = await db.from('agents').select('transfer_number').eq('id', ctx.agentId ?? '').maybeSingle()
        if (!agent?.transfer_number) return { transferred: false, note: 'No human line configured. Offer a callback and capture a lead.' }
        await transferCall(ctx.callSid, agent.transfer_number)
        return { transferred: true }
      }

      default:
        return { error: `Unknown tool ${name}` }
    }
  } catch (e) {
    console.error('[tool]', name, e)
    return { error: 'Tool failed. Apologize briefly and offer a callback.' }
  }
}
