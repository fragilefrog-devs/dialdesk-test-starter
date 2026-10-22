import { executeTool, TOOL_DEFS, type ToolCtx } from '@/ai/tools'
import { buildInstructions, loadCallContext } from '@/lib/voice/session'
import { ollamaChat } from '@/lib/voice/ollama'

type TurnMessage = { role: 'user' | 'assistant'; content: string }
type Action = { action: string; arguments?: Record<string, unknown>; text?: string }

const TOOL_NAMES: Set<string> = new Set(TOOL_DEFS.map((tool) => tool.name))

function parseAction(content: string): Action | null {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>
    if (typeof parsed.action !== 'string') return null
    const args = parsed.arguments && typeof parsed.arguments === 'object' && !Array.isArray(parsed.arguments)
      ? parsed.arguments as Record<string, unknown>
      : Object.fromEntries(Object.entries(parsed).filter(([key]) => key !== 'action'))
    return { action: parsed.action, arguments: args, text: typeof args.text === 'string' ? args.text : undefined }
  } catch {
    return null
  }
}

export async function respondToCall(callId: string, userText: string, history: TurnMessage[]) {
  const ctx = await loadCallContext(callId)
  if (!ctx) throw new Error('Call context unavailable')
  const channel: ToolCtx['channel'] = ctx.call.channel === 'phone' ? 'phone' : 'web'
  const toolList = TOOL_DEFS.map((tool) => `${tool.name}: ${tool.description}\nArguments: ${JSON.stringify(tool.parameters)}`).join('\n')
  const system = `${buildInstructions(ctx.org, ctx.agent, channel)}\n\nYou must return one JSON object only. Use {"action":"reply","arguments":{"text":"spoken response"}} to answer, or {"action":"tool_name","arguments":{...}} to call exactly one available tool. Available tools:\n${toolList}\nNever invent tool results or business facts. After a tool result, answer the caller using that result. Do not include markdown.`
  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: system },
    ...history.slice(-12),
    { role: 'user', content: userText.slice(0, 2000) },
  ]
  const toolCtx: ToolCtx = {
    orgId: ctx.org.id,
    agentId: ctx.agent.id,
    callId,
    callSid: ctx.call.provider_sid,
    channel,
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const action = parseAction(await ollamaChat(messages, true))
    if (!action) return 'Sorry, I had trouble understanding that. Could you say it another way?'
    if (action.action === 'reply') {
      return action.text?.trim().slice(0, 1200) || 'How else can I help you?'
    }
    if (!TOOL_NAMES.has(action.action)) return 'Sorry, I cannot complete that request right now. Can I take a message?'

    if (action.action === 'search_knowledge' && typeof action.arguments?.query === 'string' && /\[[^\]]+\]/.test(action.arguments.query)) {
      action.arguments.query = userText.slice(0, 200)
    }
    const result = await executeTool(toolCtx, action.action, action.arguments ?? {})
    messages.push(
      { role: 'assistant', content: JSON.stringify(action) },
      { role: 'user', content: `Result from ${action.action}: ${JSON.stringify(result)}. Now answer the caller in one or two short spoken sentences. If the result contains an error or no data, be honest and offer a callback.` },
    )
  }
  return 'I could not finish that just now. Would you like me to take a message?'
}