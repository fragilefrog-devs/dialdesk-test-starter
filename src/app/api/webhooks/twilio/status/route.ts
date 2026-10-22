import { supabaseAdmin } from '@/lib/supabase/admin'
import { validateTwilioSignature } from '@/lib/twilio'
import { appEnv } from '@/lib/env'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const params = Object.fromEntries(new URLSearchParams(await req.text())) as Record<string, string>
  const url = `${appEnv().NEXT_PUBLIC_APP_URL}/api/webhooks/twilio/status`
  if (!validateTwilioSignature(url, params, req.headers.get('x-twilio-signature'))) return new Response('Forbidden', { status: 403 })

  const final = ['completed', 'busy', 'failed', 'no-answer', 'canceled'].includes(params.CallStatus)
  await supabaseAdmin().from('calls').update({
    status: params.CallStatus,
    ...(final ? { ended_at: new Date().toISOString(), duration_seconds: Number(params.CallDuration ?? 0) || 0 } : {}),
  }).eq('provider_sid', params.CallSid)
  return new Response('ok')
}
