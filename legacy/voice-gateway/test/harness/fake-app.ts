import http from 'node:http'

export interface RecordedRequest {
  path: string
  secret: string | null
  body: any
}

export interface FakeApp {
  url: string
  requests: RecordedRequest[]
  finalizeBodies: any[]
  close(): Promise<void>
  reset(): void
}

export async function startFakeApp(opts?: {
  greeting?: string
  reply?: string
  configStatus?: number
}): Promise<FakeApp> {
  const greeting = opts?.greeting ?? 'Thanks for calling Acme. How can I help?'
  const reply = opts?.reply ?? 'Sure, I can help with that.'
  const configStatus = opts?.configStatus ?? 200

  const requests: RecordedRequest[] = []
  const finalizeBodies: any[] = []

  const server = http.createServer(async (req, res) => {
    const secret = (req.headers['x-internal-secret'] as string) || null
    if (secret !== 'test-secret') {
      res.writeHead(403)
      res.end()
      return
    }

    let body: any = null
    if (req.method === 'POST') {
      const chunks: Buffer[] = []
      for await (const chunk of req) {
        chunks.push(chunk as Buffer)
      }
      const raw = Buffer.concat(chunks).toString()
      try {
        body = raw ? JSON.parse(raw) : null
      } catch {
        body = raw
      }
    }

    requests.push({ path: req.url || '', secret, body })

    if (req.method === 'GET' && req.url?.startsWith('/api/voice/config')) {
      if (configStatus !== 200) {
        res.writeHead(configStatus)
        res.end()
        return
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ greeting, callSid: 'CA_test' }))
      return
    }

    if (req.method === 'POST' && req.url === '/api/voice/respond') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ text: reply }))
      return
    }

    if (req.method === 'POST' && req.url === '/api/voice/finalize') {
      finalizeBodies.push(body)
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
      return
    }

    res.writeHead(404)
    res.end()
  })

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const addr = server.address()
  const port = typeof addr === 'object' && addr ? addr.port : 0
  const url = `http://127.0.0.1:${port}`

  return {
    url,
    requests,
    finalizeBodies,
    close: () => new Promise((resolve) => server.close(() => resolve())),
    reset: () => {
      requests.length = 0
      finalizeBodies.length = 0
    },
  }
}
