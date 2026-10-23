/** Pure parsing of Vapi server messages. Kept separate from I/O so payload handling is unit-testable. */

export interface ParsedToolCall { id: string; name: string; args: Record<string, unknown> }
export interface TranscriptLine { role: 'agent' | 'caller'; text: string }

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

function asArgs(v: unknown): Record<string, unknown> {
  if (isObj(v)) return v
  if (typeof v === 'string') {
    try { const p = JSON.parse(v); return isObj(p) ? p : {} } catch { return {} }
  }
  return {}
}

/** Accepts both `{id,name,arguments}` and OpenAI-style `{id,function:{name,arguments}}` entries. */
export function parseToolCalls(message: Obj): ParsedToolCall[] {
  const list = Array.isArray(message.toolCallList) ? message.toolCallList
    : Array.isArray(message.toolCalls) ? message.toolCalls : []
  const out: ParsedToolCall[] = []
  for (const item of list) {
    if (!isObj(item)) continue
    const fn = isObj(item.function) ? item.function : {}
    const name = typeof item.name === 'string' ? item.name : typeof fn.name === 'string' ? fn.name : ''
    const id = typeof item.id === 'string' ? item.id : ''
    if (name && id) out.push({ id, name, args: asArgs(item.arguments ?? fn.arguments) })
  }
  return out
}

export interface CallMeta {
  providerCallId: string | null
  assistantId: string | null
  callerNumber: string | null
  toNumber: string | null
}

export function parseCallMeta(message: Obj): CallMeta {
  const call = isObj(message.call) ? message.call : {}
  const customer = isObj(call.customer) ? call.customer : isObj(message.customer) ? message.customer : {}
  const phone = isObj(message.phoneNumber) ? message.phoneNumber : isObj(call.phoneNumber) ? call.phoneNumber : {}
  const assistant = isObj(message.assistant) ? message.assistant : {}
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null)
  return {
    providerCallId: str(call.id),
    assistantId: str(call.assistantId) ?? str(assistant.id),
    callerNumber: str(customer.number),
    toNumber: str(phone.number),
  }
}

/** Vapi labels the AI side "assistant" or "bot"; system and tool turns are dropped. */
export function mapTranscript(message: Obj): TranscriptLine[] {
  const artifact = isObj(message.artifact) ? message.artifact : {}
  const lines: TranscriptLine[] = []
  const msgs = Array.isArray(artifact.messages) ? artifact.messages : []
  for (const m of msgs) {
    if (!isObj(m)) continue
    const text = typeof m.message === 'string' ? m.message : typeof m.content === 'string' ? m.content : ''
    if (!text.trim()) continue
    if (m.role === 'user') lines.push({ role: 'caller', text: text.slice(0, 2000) })
    else if (m.role === 'assistant' || m.role === 'bot') lines.push({ role: 'agent', text: text.slice(0, 2000) })
  }
  if (!lines.length) {
    const t = typeof artifact.transcript === 'string' ? artifact.transcript : typeof message.transcript === 'string' ? message.transcript : ''
    for (const raw of t.split('\n')) {
      const m = /^(AI|User|Assistant|Caller)\s*:\s*(.+)$/i.exec(raw.trim())
      if (m) lines.push({ role: /^(ai|assistant)$/i.test(m[1]) ? 'agent' : 'caller', text: m[2].slice(0, 2000) })
    }
  }
  return lines.slice(-400)
}

export function parseEndReport(message: Obj) {
  const artifact = isObj(message.artifact) ? message.artifact : {}
  const analysis = isObj(message.analysis) ? message.analysis : {}
  const started = typeof message.startedAt === 'string' ? Date.parse(message.startedAt) : NaN
  const ended = typeof message.endedAt === 'string' ? Date.parse(message.endedAt) : NaN
  const dur = typeof message.durationSeconds === 'number' ? message.durationSeconds
    : Number.isFinite(started) && Number.isFinite(ended) ? (ended - started) / 1000 : 0
  return {
    transcript: mapTranscript(message),
    summary: typeof analysis.summary === 'string' && analysis.summary.trim() ? analysis.summary.trim().slice(0, 1500) : null,
    durationSeconds: Math.max(0, Math.round(dur)),
    endedReason: typeof message.endedReason === 'string' ? message.endedReason.slice(0, 120) : null,
    recordingUrl: typeof artifact.recordingUrl === 'string' && artifact.recordingUrl.startsWith('https://') ? artifact.recordingUrl : null,
  }
}
