import { finalizeCall } from '@/lib/voice/session'
import { verifyCall } from '@/lib/token'
import { clientIp, rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const OPTIONS = () => new Response(null, { status: 204 })

export async function POST(req: Request) {
  if (!rateLimit(`wf:${clientIp(req)}`, 10, 60_000)) return Response.json({ error: 'Too many requests' }, { status: 429 })
  const { callId, token, transcript, durationSeconds } = await req.json().catch(() => ({}))
  if (typeof callId !== 'string' || !verifyCall(callId, token)) return Response.json({ error: 'Forbidden' }, { status: 403 })
  await finalizeCall(callId, Array.isArray(transcript) ? transcript : [], Math.min(Number(durationSeconds) || 0, 1800))
  return Response.json({ ok: true })
}
