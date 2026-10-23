import { supabaseAdmin } from './supabase/admin'
import { canTakeCalls } from './plans'
import { TOOL_DEFS } from '@/ai/tools'
import { buildFirstMessage, buildSystemPrompt, transferDestinations, type AgentRow } from './trades-prompt'
import { createAssistant, updateAssistant, setNumberAssistant, type AssistantInput } from './vapi'

export function assistantInput(org: { id: string; name: string; timezone: string; industry: string }, agent: AgentRow): AssistantInput {
  return {
    name: `${org.name} Receptionist`,
    firstMessage: buildFirstMessage(org, agent),
    systemPrompt: buildSystemPrompt(org, agent),
    voiceId: agent.voice || 'alloy',
    language: agent.language || 'en',
    tools: TOOL_DEFS,
    transfers: transferDestinations(agent),
    record: agent.record_consent_notice,
    metadata: { org_id: org.id, agent_id: agent.id },
  }
}

/**
 * Pushes an agent's settings to Vapi (create or update) and attaches or detaches its numbers.
 * An inactive agent or a lapsed subscription detaches the numbers so calls stop being answered.
 */
export async function syncAgent(agentId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = supabaseAdmin()
  try {
    const { data: agent, error: agentError } = await db.from('agents').select('*').eq('id', agentId).maybeSingle()
    if (agentError) throw agentError
    if (!agent) return { ok: false, error: 'Receptionist not found.' }
    const { data: org, error: orgError } = await db.from('organizations').select('*').eq('id', agent.org_id).single()
    if (orgError) throw orgError
    if (!org) return { ok: false, error: 'Business not found.' }
    const row = agent as AgentRow
    const input = assistantInput(org, row)

    let assistantId = row.vapi_assistant_id
    if (assistantId) await updateAssistant(assistantId, input)
    else {
      assistantId = (await createAssistant(input)).id
      const { error } = await db.from('agents').update({ vapi_assistant_id: assistantId }).eq('id', agent.id).eq('org_id', agent.org_id)
      if (error) throw error
    }

    const live = row.is_active && canTakeCalls(org)
    const { data: nums, error: numbersError } = await db.from('phone_numbers').select('provider_sid').eq('org_id', agent.org_id).eq('agent_id', agent.id)
    if (numbersError) throw numbersError
    await Promise.all((nums ?? []).filter((n) => n.provider_sid).map((n) => setNumberAssistant(n.provider_sid as string, live ? assistantId : null)))
    return { ok: true }
  } catch (e) {
    console.error('[vapi-sync]', e)
    return { ok: false, error: 'Could not update the voice assistant. Your settings are saved; try again in a minute.' }
  }
}

export async function syncOrgAgents(orgId: string) {
  const { data, error } = await supabaseAdmin().from('agents').select('id').eq('org_id', orgId)
  if (error) {
    console.error('[vapi-sync] Could not load workspace receptionists', { organizationId: orgId, error })
    return { errors: ['Could not load workspace receptionists.'] }
  }
  const results = await Promise.all((data ?? []).map((agent) => syncAgent(agent.id)))
  const errors = results.flatMap((result) => result.ok ? [] : [result.error])
  return { errors }
}
