import { WebSocket } from 'ws'

export interface RunningGateway {
  url: string
  close(): Promise<void>
}

export async function startGateway(appUrl: string): Promise<RunningGateway> {
  process.env.APP_URL = appUrl
  process.env.INTERNAL_API_SECRET = 'test-secret'
  process.env.PORT = '0'
  process.env.MAX_CALL_SECONDS = '30'
  process.env.GATEWAY_NO_LISTEN = '1'

  // Dynamic import after setting env
  const mod = await import('../../src/index.ts?' + Date.now())
  mod.start(0)

  const addr = mod.server.address()
  const port = typeof addr === 'object' && addr ? addr.port : 0
  const url = `ws://127.0.0.1:${port}`

  return {
    url,
    close: async () => {
      // Close all clients
      for (const client of mod.wss.clients) {
        try {
          client.close()
        } catch {}
      }
      await new Promise<void>((resolve) => {
        mod.server.close(() => resolve())
      })
    },
  }
}

export function connect(url: string, path: '/twilio' | '/web'): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url + path)
    ws.on('open', () => resolve(ws))
    ws.on('error', reject)
  })
}

export function collect(socket: WebSocket) {
  const messages: any[] = []
  socket.on('message', (data) => {
    try {
      messages.push(JSON.parse(data.toString()))
    } catch {
      messages.push(data.toString())
    }
  })
  const closed = new Promise<{ code: number }>((resolve) => {
    socket.on('close', (code) => resolve({ code }))
  })
  return {
    messages,
    waitFor: async <T,>(p: (m: any) => boolean, ms = 8000): Promise<T> => {
      const start = Date.now()
      while (Date.now() - start < ms) {
        const found = messages.find(p)
        if (found) return found as T
        await new Promise((r) => setTimeout(r, 10))
      }
      throw new Error(`Timeout waiting for message: ${JSON.stringify(messages)}`)
    },
    closed,
  }
}

export async function waitFor<T>(messages: any[], p: (m: any) => boolean, ms = 8000): Promise<T> {
  const start = Date.now()
  while (Date.now() - start < ms) {
    const found = messages.find(p)
    if (found) return found as T
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error(`Timeout waiting for message: ${JSON.stringify(messages)}`)
}
