import { isInternalRequest } from '@/lib/internal-auth'
import { executeTool } from '@/ai/tools'
import { loadCallContext } from '@/lib/voice/session'
import { verifyCall } from '@/lib/token'

export const dynamic = 'force-dynamic'

/** Gateway → app: execute a tool the model invoked on a phone call. */
export async function POST(req: Request) {
  if (!isInternalRequest(req)) return new Response('Forbidden', { status: 403 })
  const { callId, token, name, args } = await req.json().catch(() => ({}))
  if (typeof callId !== 'string' || !verifyCall(callId, token)) return new Response('Forbidden', { status: 403 })
  const ctx = await loadCallContext(callId)
  if (!ctx) return new Response('Not found', { status: 404 })
  const result = await executeTool(
    { orgId: ctx.org.id, agentId: ctx.agent.id, callId, callSid: ctx.call.provider_sid, channel: 'phone' },
    String(name), (args && typeof args === 'object' ? args : {}) as Record<string, unknown>,
  )
  return Response.json(result)
}
