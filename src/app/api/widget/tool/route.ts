import { executeTool } from '@/ai/tools'
import { loadCallContext } from '@/lib/voice/session'
import { verifyCall } from '@/lib/token'
import { clientIp, rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const OPTIONS = () => new Response(null, { status: 204 })

export async function POST(req: Request) {
  if (!rateLimit(`wt:${clientIp(req)}`, 60, 60_000)) return Response.json({ error: 'Too many requests' }, { status: 429 })
  const { callId, token, name, args } = await req.json().catch(() => ({}))
  if (typeof callId !== 'string' || !verifyCall(callId, token)) return Response.json({ error: 'Forbidden' }, { status: 403 })
  const ctx = await loadCallContext(callId)
  if (!ctx || ctx.call.channel !== 'web') return Response.json({ error: 'Not found' }, { status: 404 })
  const result = await executeTool(
    { orgId: ctx.org.id, agentId: ctx.agent.id, callId, channel: 'web' },
    String(name), (args && typeof args === 'object' ? args : {}) as Record<string, unknown>,
  )
  return Response.json(result)
}
