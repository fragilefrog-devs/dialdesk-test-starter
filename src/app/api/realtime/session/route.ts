import { supabaseAdmin } from '@/lib/supabase/admin'
import { loadCallContext } from '@/lib/voice/session'
import { signCall } from '@/lib/token'
import { canTakeCalls } from '@/lib/plans'
import { clientIp, rateLimit } from '@/lib/rate-limit'
import { voiceEnv } from '@/lib/env'

export const dynamic = 'force-dynamic'
const cors = (response: Response) => {
  response.headers.set('Access-Control-Allow-Origin', '*')
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type')
  return response
}
export const OPTIONS = () => cors(new Response(null, { status: 204 }))

/** Public (CORS) — starts a website voice session for a tenant slug. */
export async function POST(req: Request) {
  if (!rateLimit(`rt:${clientIp(req)}`, 5, 60_000)) return cors(Response.json({ error: 'Too many requests' }, { status: 429 }))
  const { slug } = await req.json().catch(() => ({}))
  if (typeof slug !== 'string') return cors(Response.json({ error: 'slug required' }, { status: 400 }))

  const db = supabaseAdmin()
  const { data: org } = await db.from('organizations').select('*').eq('slug', slug.toLowerCase()).maybeSingle()
  if (!org || !canTakeCalls(org)) return cors(Response.json({ error: 'Unavailable' }, { status: 404 }))
  const { data: agent } = await db.from('agents').select('id').eq('org_id', org.id).eq('is_active', true).order('created_at').limit(1).maybeSingle()
  if (!agent) return cors(Response.json({ error: 'Unavailable' }, { status: 404 }))

  const { data: call } = await db.from('calls').insert({ org_id: org.id, agent_id: agent.id, channel: 'web', direction: 'inbound' }).select('id').single()
  if (!call) return cors(Response.json({ error: 'Failed' }, { status: 500 }))
  const ctx = await loadCallContext(call.id)
  if (!ctx) return cors(Response.json({ error: 'Failed' }, { status: 500 }))

  const gatewayUrl = voiceEnv().VOICE_GATEWAY_WEB_URL ?? voiceEnv().VOICE_GATEWAY_URL.replace(/\/twilio\/?$/, '/web')
  return cors(Response.json({ callId: call.id, token: signCall(call.id), gatewayUrl }))
}
