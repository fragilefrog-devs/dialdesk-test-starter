import { supabaseAdmin } from '@/lib/supabase/admin'
import { nowInTz } from '@/lib/time'
import { ollamaChat } from '@/lib/voice/ollama'

export interface AgentRow {
  id: string; org_id: string; name: string; greeting: string; voice: string; language: string; instructions: string
  business_hours: Record<string, [string, string]>; appointment_minutes: number; transfer_number: string | null; is_active: boolean
}

export function buildInstructions(org: { name: string; timezone: string; industry: string }, agent: AgentRow, channel: 'phone' | 'web') {
  const hours = Object.entries(agent.business_hours).map(([d, [a, b]]) => `${d}: ${a}-${b}`).join(', ') || 'not set'
  return [
    `You are ${agent.name}, the AI receptionist for ${org.name} (${org.industry}).`,
    `Current local time: ${nowInTz(org.timezone)} (${org.timezone}). Business hours: ${hours}.`,
    `Speak ${agent.language === 'en' ? 'English' : `the language with code "${agent.language}"`} unless the caller switches language. Keep replies to one or two short sentences — this is a spoken conversation.`,
    `The initial greeting has already been spoken: "${agent.greeting}". Make clear early that you are an AI assistant.`,
    channel === 'phone' ? 'This is a phone call.' : 'This is a website voice chat.',
    'Rules: never invent prices, availability, policies or medical/legal advice. Use search_knowledge for facts and check_availability before offering times. Confirm name, callback number and slot aloud before book_appointment. If someone describes an emergency, tell them to hang up and contact local emergency services immediately.',
    'If you cannot help, capture a lead with capture_lead and promise a callback.',
    agent.instructions && `Business-specific instructions:\n${agent.instructions}`,
  ].filter(Boolean).join('\n\n')
}

export async function loadCallContext(callId: string) {
  const db = supabaseAdmin()
  const { data: call } = await db.from('calls').select('*').eq('id', callId).maybeSingle()
  if (!call) return null
  const [{ data: org }, { data: agent }] = await Promise.all([
    db.from('organizations').select('*').eq('id', call.org_id).single(),
    db.from('agents').select('*').eq('id', call.agent_id ?? '').maybeSingle(),
  ])
  if (!org || !agent) return null
  return { call, org, agent: agent as AgentRow }
}

/** Persists transcript + duration, writes an AI summary, returns the summary. Idempotent per call. */
export async function finalizeCall(callId: string, transcript: { role: string; text: string }[], durationSeconds: number) {
  const db = supabaseAdmin()
  const clipped = transcript.slice(-400).map((t) => ({ role: t.role.slice(0, 12), text: t.text.slice(0, 2000) }))
  let summary: string | null = null
  if (clipped.length) {
    try {
      summary = await ollamaChat([
        { role: 'system', content: 'Summarize this business call in 2 sentences: who called, what they wanted, and the outcome. No preamble.' },
        { role: 'user', content: clipped.map((t) => `${t.role}: ${t.text}`).join('\n') },
      ])
    } catch (e) { console.error('[summary]', e) }
  }
  await db.from('calls').update({ transcript: clipped, summary }).eq('id', callId)
  // Duration/status: Twilio's status callback is authoritative for phone calls; this covers web calls
  await db.from('calls').update({
    duration_seconds: Math.max(0, Math.round(durationSeconds)), status: 'completed', ended_at: new Date().toISOString(),
  }).eq('id', callId).eq('status', 'in_progress')
  return summary
}
