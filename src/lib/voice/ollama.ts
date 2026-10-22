type OllamaMessage = { role: 'system' | 'user' | 'assistant'; content: string }

type OllamaResponse = {
  choices?: { message?: { content?: string } }[]
  error?: { message?: string }
}

export async function ollamaChat(messages: OllamaMessage[], json = false): Promise<string> {
  const baseUrl = (process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434/v1').replace(/\/+$/, '')
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OLLAMA_MODEL ?? 'gemma3:1b',
      messages,
      temperature: 0.2,
      stream: false,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
    signal: AbortSignal.timeout(60_000),
  })

  const result = await response.json() as OllamaResponse
  if (!response.ok) throw new Error(result.error?.message ?? `Ollama request failed (${response.status})`)
  const content = result.choices?.[0]?.message?.content
  if (!content) throw new Error('Ollama returned an empty response')
  return content
}