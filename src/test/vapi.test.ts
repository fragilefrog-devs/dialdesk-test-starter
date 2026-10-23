import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildAssistantPayload, isVapiRequest } from '@/lib/vapi'
import { TOOL_DEFS } from '@/ai/tools'
import { mapTranscript, parseCallMeta, parseEndReport, parseToolCalls } from '@/lib/vapi-parse'

const SECRET = 'test-secret-value-1234567890'
beforeEach(() => {
  vi.stubEnv('VAPI_API_KEY', 'key')
  vi.stubEnv('VAPI_WEBHOOK_SECRET', SECRET)
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com')
})
const req = (h: Record<string, string>) => new Request('https://x.test', { method: 'POST', headers: h })

describe('webhook auth', () => {
  it('accepts the bearer token and the legacy header', () => {
    expect(isVapiRequest(req({ authorization: `Bearer ${SECRET}` }))).toBe(true)
    expect(isVapiRequest(req({ 'x-vapi-secret': SECRET }))).toBe(true)
  })
  it('rejects missing, wrong and wrong-length secrets', () => {
    expect(isVapiRequest(req({}))).toBe(false)
    expect(isVapiRequest(req({ authorization: 'Bearer nope' }))).toBe(false)
    expect(isVapiRequest(req({ 'x-vapi-secret': SECRET.replace('t', 'x') }))).toBe(false)
  })
})

describe('assistant payload', () => {
  const input = {
    name: 'Alder Street Plumbing Receptionist', firstMessage: 'Hi', systemPrompt: 'prompt', voiceId: 'alloy', language: 'en',
    tools: TOOL_DEFS, transfers: [{ number: '+15551234567', description: 'on call' }], record: true, metadata: { org_id: 'o', agent_id: 'a' },
  }
  it('points the assistant at our webhook with the secret and the right server messages', () => {
    const p = buildAssistantPayload(input)
    expect(p.server).toEqual({ url: 'https://app.example.com/api/vapi/webhook', secret: SECRET })
    expect(p.serverMessages).toEqual(['tool-calls', 'end-of-call-report'])
    expect(p.clientMessages).toEqual(['transcript'])
    expect(p.artifactPlan.recordingEnabled).toBe(true)
  })
  it('uses a credential id instead of the inline secret when configured', async () => {
    vi.stubEnv('VAPI_SERVER_CREDENTIAL_ID', 'cred-1')
    vi.resetModules() // env accessors cache their first read
    const fresh = await import('@/lib/vapi')
    expect(fresh.buildAssistantPayload(input).server).toEqual({ url: 'https://app.example.com/api/vapi/webhook', credentialId: 'cred-1' })
  })
  it('exposes every tool plus a transfer tool only when numbers exist', () => {
    const p = buildAssistantPayload(input)
    const names = p.model.tools.map((t) => ('function' in t ? t.function.name : t.type))
    expect(names).toEqual([...TOOL_DEFS.map((t) => t.name), 'transferCall'])
    expect(buildAssistantPayload({ ...input, transfers: [] }).model.tools).toHaveLength(TOOL_DEFS.length)
  })
})

describe('payload parsing', () => {
  it('reads both tool call shapes and string arguments', () => {
    const calls = parseToolCalls({ toolCallList: [
      { id: '1', name: 'check_availability', arguments: { date: '2026-10-26' } },
      { id: '2', function: { name: 'book_job', arguments: '{"name":"Maria"}' } },
      { id: '', name: 'ignored' },
    ] })
    expect(calls).toEqual([
      { id: '1', name: 'check_availability', args: { date: '2026-10-26' } },
      { id: '2', name: 'book_job', args: { name: 'Maria' } },
    ])
  })
  it('extracts call metadata', () => {
    expect(parseCallMeta({ call: { id: 'c1', assistantId: 'a1', customer: { number: '+17735550142' } } }))
      .toEqual({ providerCallId: 'c1', assistantId: 'a1', callerNumber: '+17735550142', toNumber: null, isWeb: false })
  })
  it('maps transcript roles and drops system turns', () => {
    const lines = mapTranscript({ artifact: { messages: [
      { role: 'system', message: 'prompt' }, { role: 'bot', message: 'Hello' }, { role: 'user', message: 'Leak' }, { role: 'assistant', message: ' ' },
    ] } })
    expect(lines).toEqual([{ role: 'agent', text: 'Hello' }, { role: 'caller', text: 'Leak' }])
  })
  it('falls back to the plain transcript string', () => {
    expect(mapTranscript({ artifact: { transcript: 'AI: How can I help?\nUser: My sink is leaking' } }))
      .toEqual([{ role: 'agent', text: 'How can I help?' }, { role: 'caller', text: 'My sink is leaking' }])
  })
  it('builds an end report with duration from timestamps and https-only recordings', () => {
    const r = parseEndReport({
      startedAt: '2026-10-26T15:00:00Z', endedAt: '2026-10-26T15:02:30Z', endedReason: 'customer-ended-call',
      analysis: { summary: ' Booked a drain job. ' }, artifact: { recordingUrl: 'http://insecure.example/r.wav' },
    })
    expect(r).toMatchObject({ durationSeconds: 150, summary: 'Booked a drain job.', endedReason: 'customer-ended-call', recordingUrl: null })
  })
})
