import { timingSafeEqual } from 'node:crypto'
import { vapiEnv } from './env'

const API = 'https://api.vapi.ai'

export class VapiError extends Error {
  constructor(public status: number, public body: string) { super(`Vapi ${status}: ${body.slice(0, 300)}`) }
}

async function vapi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API + path, {
    ...init,
    headers: { Authorization: `Bearer ${vapiEnv().VAPI_API_KEY}`, 'Content-Type': 'application/json', ...init?.headers },
  })
  const text = await res.text()
  if (!res.ok) throw new VapiError(res.status, text)
  return (text ? JSON.parse(text) : {}) as T
}

/** Constant-time check of the shared secret Vapi sends as `Authorization: Bearer` or legacy `X-Vapi-Secret`. */
export function isVapiRequest(req: Request): boolean {
  const want = Buffer.from(vapiEnv().VAPI_WEBHOOK_SECRET)
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const given = Buffer.from(bearer || req.headers.get('x-vapi-secret') || '')
  return given.length === want.length && timingSafeEqual(given, want)
}

export interface ToolDef { name: string; description: string; parameters: Record<string, unknown> }
export interface TransferDest { number: string; description: string }

export interface AssistantInput {
  name: string
  firstMessage: string
  systemPrompt: string
  voiceId: string
  language: string
  tools: readonly ToolDef[]
  transfers: TransferDest[]
  record: boolean
  metadata: Record<string, string>
}

/** Pure: builds the Vapi assistant body so it can be unit-tested without the network. */
export function buildAssistantPayload(input: AssistantInput) {
  const e = vapiEnv()
  const url = `${e.NEXT_PUBLIC_APP_URL}/api/vapi/webhook`
  const functionTools = input.tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }))
  const transferTool = input.transfers.length
    ? [{
        type: 'transferCall',
        destinations: input.transfers.map((d) => ({ type: 'number', number: d.number, description: d.description })),
      }]
    : []
  return {
    name: input.name.slice(0, 40),
    firstMessage: input.firstMessage,
    firstMessageInterruptionsEnabled: true,
    model: {
      provider: e.VAPI_MODEL_PROVIDER,
      model: e.VAPI_MODEL,
      temperature: 0.3,
      messages: [{ role: 'system', content: input.systemPrompt }],
      tools: [...functionTools, ...transferTool],
    },
    voice: {
      provider: e.VAPI_VOICE_PROVIDER,
      ...(e.VAPI_VOICE_PROVIDER === 'openai' && e.VAPI_VOICE_MODEL ? { model: e.VAPI_VOICE_MODEL } : {}),
      voiceId: input.voiceId,
    },
    transcriber: {
      provider: e.VAPI_TRANSCRIBER_PROVIDER,
      model: e.VAPI_TRANSCRIBER_PROVIDER === 'deepgram'
        && e.VAPI_TRANSCRIBER_MODEL === 'flux-general-en'
        && !input.language.toLowerCase().startsWith('en')
        ? 'nova-3'
        : e.VAPI_TRANSCRIBER_MODEL,
      language: input.language,
    },
    server: e.VAPI_SERVER_CREDENTIAL_ID
      ? { url, credentialId: e.VAPI_SERVER_CREDENTIAL_ID }
      : { url, secret: e.VAPI_WEBHOOK_SECRET },
    serverMessages: ['tool-calls', 'end-of-call-report'],
    clientMessages: ['transcript'],
    artifactPlan: { recordingEnabled: input.record },
    endCallFunctionEnabled: true,
    maxDurationSeconds: 900,
    silenceTimeoutSeconds: 30,
    backgroundDenoisingEnabled: true,
    metadata: input.metadata,
  }
}

export const createAssistant = (input: AssistantInput) =>
  vapi<{ id: string }>('/assistant', { method: 'POST', body: JSON.stringify(buildAssistantPayload(input)) })
export const updateAssistant = (id: string, input: AssistantInput) =>
  vapi<{ id: string }>(`/assistant/${id}`, { method: 'PATCH', body: JSON.stringify(buildAssistantPayload(input)) })
export const deleteAssistant = (id: string) => vapi(`/assistant/${id}`, { method: 'DELETE' }).catch(() => undefined)

/** Provisions a Vapi-hosted US number for an area code and attaches the assistant. */
export const createNumber = (areaCode: string, assistantId: string, name: string) =>
  vapi<{ id: string; number?: string }>('/phone-number', {
    method: 'POST',
    body: JSON.stringify({ provider: 'vapi', numberDesiredAreaCode: areaCode, assistantId, name: name.slice(0, 40) }),
  })
export const getNumber = (id: string) => vapi<{ id: string; number?: string }>(`/phone-number/${id}`)
/** assistantId null detaches the assistant, which stops the number answering (paused account). */
export const setNumberAssistant = (id: string, assistantId: string | null) =>
  vapi(`/phone-number/${id}`, { method: 'PATCH', body: JSON.stringify({ assistantId }) })
export const deleteNumber = (id: string) => vapi(`/phone-number/${id}`, { method: 'DELETE' }).catch(() => undefined)
