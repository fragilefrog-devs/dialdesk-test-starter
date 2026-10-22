import { isInternalRequest } from '@/lib/internal-auth'
import { buildInstructions, loadCallContext } from '@/lib/voice/session'
import { verifyCall } from '@/lib/token'

export const dynamic = 'force-dynamic'

/** Gateway → app: session config for a call. */
export async function GET(req: Request) {
  if (!isInternalRequest(req)) return new Response('Forbidden', { status: 403 })
  const u = new URL(req.url)
  const callId = u.searchParams.get('callId') ?? ''
  if (!verifyCall(callId, u.searchParams.get('token'))) return new Response('Forbidden', { status: 403 })
  const ctx = await loadCallContext(callId)
  if (!ctx) return new Response('Not found', { status: 404 })
  return Response.json({
    session: { instructions: buildInstructions(ctx.org, ctx.agent, 'phone') },
    callSid: ctx.call.provider_sid, orgId: ctx.org.id, greeting: ctx.agent.greeting,
  })
}
