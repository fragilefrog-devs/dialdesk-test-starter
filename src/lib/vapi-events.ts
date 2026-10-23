import { executeTool } from '@/ai/tools'
import { supabaseAdmin } from './supabase/admin'
import { canTakeCalls } from './plans'
import { bestOutcome, type Outcome } from './trades'
import { parseCallMeta, parseEndReport, parseToolCalls } from './vapi-parse'

type Obj = Record<string, unknown>

/** Finds the tenant from the assistant that took the call, and makes sure a call row exists. */
async function resolveCall(message: Obj) {
  const meta = parseCallMeta(message)
  if (!meta.providerCallId || !meta.assistantId) return null
  const db = supabaseAdmin()
  const { data: agent } = await db.from('agents').select('id, org_id, is_active').eq('vapi_assistant_id', meta.assistantId).maybeSingle()
  if (!agent) return null
  const { data: org } = await db.from('organizations').select('plan, subscription_status, trial_ends_at').eq('id', agent.org_id).single()
  await db.from('calls').upsert({
    org_id: agent.org_id, agent_id: agent.id, channel: 'phone', direction: 'inbound',
    from_number: meta.callerNumber, to_number: meta.toNumber, provider_sid: meta.providerCallId, status: 'in_progress',
  }, { onConflict: 'provider_sid', ignoreDuplicates: true })
  const { data: call } = await db.from('calls').select('id, outcome').eq('org_id', agent.org_id).eq('provider_sid', meta.providerCallId).maybeSingle()
  if (!call) return null
  return { agent, org, call, meta, live: agent.is_active && !!org && canTakeCalls(org) }
}

const asResult = (v: unknown) => JSON.stringify(v)

export async function handleToolCalls(message: Obj) {
  const calls = parseToolCalls(message)
  const ctx = await resolveCall(message)
  const results = await Promise.all(calls.map(async (c) => {
    if (!ctx || !ctx.live) {
      return { name: c.name, toolCallId: c.id, result: asResult({ error: 'The service is unavailable right now. Apologize and ask the caller to try again later.' }) }
    }
    const out = await executeTool(
      { orgId: ctx.agent.org_id, agentId: ctx.agent.id, callId: ctx.call.id, callerNumber: ctx.meta.callerNumber },
      c.name, c.args,
    )
    return { name: c.name, toolCallId: c.id, result: asResult(out) }
  }))
  return { results }
}

/** Idempotent: a re-delivered end-of-call-report finalizes once. */
export async function handleEndOfCall(message: Obj) {
  const ctx = await resolveCall(message)
  if (!ctx) return
  const db = supabaseAdmin()
  const report = parseEndReport(message)
  const { data: fin, error } = await db.rpc('finalize_call', {
    p_org: ctx.agent.org_id, p_call: ctx.call.id, p_transcript: report.transcript,
    p_duration_seconds: report.durationSeconds, p_end_reason: report.endedReason,
  })
  if (error) { console.error('[vapi] finalize_call', error); return }
  const first = Array.isArray(fin) ? fin[0]?.finalized : (fin as { finalized?: boolean } | null)?.finalized
  if (first === false) return

  const fallback: Outcome = report.durationSeconds < 10 ? 'abandoned' : 'info_only'
  await db.from('calls').update({
    summary: report.summary, recording_url: report.recordingUrl,
    outcome: bestOutcome(ctx.call.outcome as Outcome | null, fallback),
  }).eq('org_id', ctx.agent.org_id).eq('id', ctx.call.id)
}
