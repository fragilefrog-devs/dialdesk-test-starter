import { supabaseAdmin } from '@/lib/supabase/admin'
import { validateTwilioSignature } from '@/lib/twilio'
import { signCall } from '@/lib/token'
import { canTakeCalls } from '@/lib/plans'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'
const xml = (body: string) => new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, { headers: { 'Content-Type': 'text/xml' } })
const esc = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`)

export async function POST(req: Request) {
  const params = Object.fromEntries(new URLSearchParams(await req.text())) as Record<string, string>
  const url = `${env().NEXT_PUBLIC_APP_URL}/api/webhooks/twilio/voice`
  if (!validateTwilioSignature(url, params, req.headers.get('x-twilio-signature'))) return new Response('Forbidden', { status: 403 })

  const db = supabaseAdmin()
  const { data: num } = await db.from('phone_numbers').select('org_id, agent_id, organizations(*)').eq('e164', params.To).eq('status', 'active').maybeSingle()
  const org = num?.organizations as unknown as { plan: string; subscription_status: string; trial_ends_at: string } | null
  if (!num || !org) return xml('<Say>This number is not in service. Goodbye.</Say><Hangup/>')
  if (!canTakeCalls(org)) return xml('<Say>Sorry, we are unable to take your call right now. Please try again later.</Say><Hangup/>')

  const { data: agent } = await db.from('agents').select('id, is_active').eq('id', num.agent_id ?? '').maybeSingle()
  if (!agent?.is_active) return xml('<Say>Sorry, no one is available to take your call. Goodbye.</Say><Hangup/>')

  const { data: call, error } = await db.from('calls').upsert({
    org_id: num.org_id, agent_id: agent.id, channel: 'phone', direction: 'inbound',
    from_number: params.From, to_number: params.To, provider_sid: params.CallSid, status: 'in_progress',
  }, { onConflict: 'provider_sid' }).select('id').single()
  if (error || !call) return xml('<Say>Sorry, something went wrong. Please call again.</Say><Hangup/>')

  return xml(
    `<Connect><Stream url="${esc(env().VOICE_GATEWAY_URL)}">` +
    `<Parameter name="callId" value="${call.id}"/><Parameter name="token" value="${signCall(call.id)}"/>` +
    `</Stream></Connect>`,
  )
}
