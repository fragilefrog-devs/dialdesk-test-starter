import { isVapiRequest } from '@/lib/vapi'
import { handleEndOfCall, handleToolCalls } from '@/lib/vapi-events'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/** Vapi "Server URL": tool calls (needs a JSON reply) and end-of-call reports. Authenticated by shared secret. */
export async function POST(req: Request) {
  if (!isVapiRequest(req)) return new Response('Unauthorized', { status: 401 })
  const body = await req.json().catch(() => null) as { message?: Record<string, unknown> } | null
  const message = body?.message
  if (!message || typeof message.type !== 'string') return Response.json({ ok: true })

  try {
    if (message.type === 'tool-calls') return Response.json(await handleToolCalls(message))
    if (message.type === 'end-of-call-report') { await handleEndOfCall(message); return Response.json({ ok: true }) }
  } catch (e) {
    console.error('[vapi webhook]', message.type, e)
    // Tool calls must still get a reply or the live call stalls
    if (message.type === 'tool-calls') return Response.json({ results: [] })
  }
  return Response.json({ ok: true })
}
