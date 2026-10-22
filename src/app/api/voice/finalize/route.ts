import { isInternalRequest } from '@/lib/internal-auth'
import { finalizeCall } from '@/lib/voice/session'
import { verifyCall } from '@/lib/token'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  if (!isInternalRequest(req)) return new Response('Forbidden', { status: 403 })
  const { callId, token, transcript, durationSeconds } = await req.json().catch(() => ({}))
  if (typeof callId !== 'string' || !verifyCall(callId, token)) return new Response('Forbidden', { status: 403 })
  const summary = await finalizeCall(callId, Array.isArray(transcript) ? transcript : [], Number(durationSeconds) || 0)
  return Response.json({ ok: true, summary })
}
