import { isInternalRequest } from '@/lib/internal-auth'
import { loadCallContext } from '@/lib/voice/session'
import { respondToCall } from '@/lib/voice/respond'
import { verifyCall } from '@/lib/token'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  if (!isInternalRequest(req)) return new Response('Forbidden', { status: 403 })
  const body = await req.json().catch(() => ({}))
  if (typeof body.callId !== 'string' || !verifyCall(body.callId, body.token)) return new Response('Forbidden', { status: 403 })
  const ctx = await loadCallContext(body.callId)
  if (!ctx || !['phone', 'web'].includes(ctx.call.channel)) return new Response('Not found', { status: 404 })
  if (typeof body.userText !== 'string' || !body.userText.trim()) return Response.json({ error: 'Speech was not recognized' }, { status: 400 })

  const history = Array.isArray(body.history)
    ? body.history.filter((m: unknown) => m && typeof m === 'object' && ['user', 'assistant'].includes((m as { role?: string }).role ?? '') && typeof (m as { content?: unknown }).content === 'string')
      .slice(-12).map((m: { role: 'user' | 'assistant'; content: string }) => ({ role: m.role, content: m.content.slice(0, 2000) }))
    : []
  try {
    const text = await respondToCall(body.callId, body.userText, history)
    return Response.json({ text })
  } catch (error) {
    console.error('[voice] Ollama turn failed', error)
    return Response.json({ error: 'Voice service unavailable' }, { status: 502 })
  }
}