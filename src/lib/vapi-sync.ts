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
    const { data: agent } = await db.from('agents').select('*').eq('id', agentId).maybeSingle()
    if (!agent) return { ok: false, error: 'Receptionist not found.' }
    const { data: org } = await db.from('organizations').select('*').eq('id', agent.org_id).single()
    if (!org) return { ok: false, error: 'Business not found.' }
    const row = agent as AgentRow
    const input = assistantInput(org, row)

    let assistantId = row.vapi_assistant_id
    if (assistantId) await updateAssistant(assistantId, input)
    else {
      assistantId = (await createAssistant(input)).id
      await db.from('agents').update({ vapi_assistant_id: assistantId }).eq('id', agent.id).eq('org_id', agent.org_id)
    }

    const live = row.is_active && canTakeCalls(org)
    const { data: nums } = await db.from('phone_numbers').select('provider_sid').eq('org_id', agent.org_id).eq('agent_id', agent.id)
    await Promise.all((nums ?? []).filter((n) => n.provider_sid).map((n) => setNumberAssistant(n.provider_sid as string, live ? assistantId : null)))
    return { ok: true }
  } catch (e) {
    console.error('[vapi-sync]', e)
    return { ok: false, error: 'Could not update the voice assistant. Your settings are saved; try again in a minute.' }
  }
}

export async function syncOrgAgents(orgId: string) {
  const { data } = await supabaseAdmin().from('agents').select('id').eq('org_id', orgId)
  await Promise.all((data ?? []).map((a) => syncAgent(a.id)))
}
