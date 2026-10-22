/** Local speech gateway: Whisper.cpp STT + Ollama conversation turns + Piper TTS. */
import http from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'
import { pcmToTwilioAudio, synthesize, transcribe, twilioAudioToPcm } from './local-speech.js'

const APP_URL = required('APP_URL')                       // https://app.example.com
const SECRET = required('INTERNAL_API_SECRET')
const PORT = Number(process.env.PORT ?? 8080)
const MAX_CALL_SECONDS = Number(process.env.MAX_CALL_SECONDS ?? 1800) // hard cap protects against runaway cost

function required(k: string): string {
  const v = process.env[k]
  if (!v) { console.error(`Missing env ${k}`); process.exit(1) }
  return v
}

const internal = (path: string, init?: RequestInit) =>
  fetch(APP_URL + path, { ...init, headers: { 'content-type': 'application/json', 'x-internal-secret': SECRET, ...init?.headers } })

export const server = http.createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200); res.end('ok'); return }
  res.writeHead(404); res.end()
})
export const wss = new WebSocketServer({ noServer: true })

type Line = { role: 'caller' | 'agent'; text: string }
type HistoryLine = { role: 'user' | 'assistant'; content: string }
type VoiceSocket = WebSocket & { channel?: 'phone' | 'web' }

function handleConnection(socket: VoiceSocket, channel: 'phone' | 'web') {
  socket.channel = channel
  let streamSid = '', callId = '', token = ''
  let startedAt = Date.now()
  const transcript: Line[] = []
  const history: HistoryLine[] = []
  let finalized = false, cap: NodeJS.Timeout | undefined, processing = false, speaking = false
  let audioChunks: Buffer[] = [], silenceMs = 0, speechMs = 0, utteranceMs = 0

  const send = (message: object) => socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify(message))
  const toTwilio = (message: object) => send(message)

  async function finalize() {
    if (finalized || !callId) return
    finalized = true
    clearTimeout(cap)
    try {
      await internal('/api/voice/finalize', {
        method: 'POST',
        body: JSON.stringify({ callId, token, transcript, durationSeconds: (Date.now() - startedAt) / 1000 }),
      })
    } catch (e) { console.error('finalize failed', e) }
    socket.close()
  }

  async function begin() {
    const r = await internal(`/api/voice/config?callId=${encodeURIComponent(callId)}&token=${encodeURIComponent(token)}`)
    if (!r.ok) { console.error('config', r.status); socket.close(); return }
    const cfg = (await r.json()) as { greeting: string }
    cap = setTimeout(() => { void finalize() }, MAX_CALL_SECONDS * 1000)
    if (cfg.greeting) await speak(cfg.greeting)
  }

  async function speak(text: string) {
    if (!text.trim()) return
    speaking = true
    send({ type: 'speaking', value: true })
    transcript.push({ role: 'agent', text })
    history.push({ role: 'assistant', content: text })
    send({ type: 'transcript', role: 'agent', text })
    try {
      const audio = await synthesize(text)
      if (channel === 'phone') {
        const payload = Buffer.from(pcmToTwilioAudio(audio.pcm, audio.sampleRate), 'base64')
        for (let offset = 0; offset < payload.length && socket.readyState === WebSocket.OPEN; offset += 160) {
          toTwilio({ event: 'media', streamSid, media: { payload: payload.subarray(offset, offset + 160).toString('base64') } })
          await new Promise((resolve) => setTimeout(resolve, 20))
        }
      } else {
        send({ type: 'audio', pcm: audio.pcm.toString('base64'), sampleRate: audio.sampleRate })
      }
    } catch (error) {
      console.error('[speech] synthesis failed', error)
      send({ type: 'error', message: 'Speech synthesis is unavailable' })
    } finally {
      send({ type: 'speaking', value: false })
      speaking = false
    }
  }

  async function processTurn(pcm: Buffer, sampleRate: number) {
    if (processing || !callId || finalized) return
    processing = true
    try {
      const userText = await transcribe(pcm, sampleRate)
      if (!userText) return
      transcript.push({ role: 'caller', text: userText })
      history.push({ role: 'user', content: userText })
      send({ type: 'transcript', role: 'caller', text: userText })
      const response = await internal('/api/voice/respond', {
        method: 'POST',
        body: JSON.stringify({ callId, token, userText, history: history.slice(-12, -1) }),
      })
      const body = await response.json() as { text?: string; error?: string }
      if (!response.ok || !body.text) throw new Error(body.error ?? `Ollama turn failed (${response.status})`)
      await speak(body.text)
    } catch (error) {
      console.error('[voice] turn failed', error)
      await speak('Sorry, I had trouble with that. Could you please try again?')
    } finally {
      processing = false
    }
  }

  function feedAudio(pcm: Buffer, sampleRate: number) {
    if (processing || speaking || finalized) return
    const samples = Math.floor(pcm.length / 2)
    if (!samples) return
    let energy = 0
    for (let i = 0; i < samples; i += 8) {
      const value = pcm.readInt16LE(i * 2)
      energy += value * value
    }
    const rms = Math.sqrt(energy / Math.ceil(samples / 8))
    const frameMs = samples * 1000 / sampleRate
    if (rms > 500) {
      speechMs += frameMs
      utteranceMs += frameMs
      silenceMs = 0
      audioChunks.push(pcm)
    } else if (audioChunks.length) {
      silenceMs += frameMs
      utteranceMs += frameMs
      audioChunks.push(pcm)
    }
    if (silenceMs >= 800 && speechMs >= 250) {
      const utterance = Buffer.concat(audioChunks)
      audioChunks = []; silenceMs = 0; speechMs = 0; utteranceMs = 0
      void processTurn(utterance, sampleRate)
    } else if (utteranceMs >= 20000) {
      const utterance = Buffer.concat(audioChunks)
      audioChunks = []; silenceMs = 0; speechMs = 0; utteranceMs = 0
      void processTurn(utterance, sampleRate)
    }
  }

  socket.on('message', (raw) => {
    try {
      const m = JSON.parse(raw.toString())
      if (channel === 'phone') {
        if (m.event === 'start') {
          streamSid = m.start.streamSid
          callId = m.start.customParameters?.callId ?? ''
          token = m.start.customParameters?.token ?? ''
          startedAt = Date.now()
          void begin()
        } else if (m.event === 'media') {
          feedAudio(twilioAudioToPcm(m.media.payload), 16000)
        } else if (m.event === 'stop') {
          void finalize()
        }
      } else if (m.type === 'start') {
        callId = typeof m.callId === 'string' ? m.callId : ''
        token = typeof m.token === 'string' ? m.token : ''
        startedAt = Date.now()
        void begin()
      } else if (m.type === 'audio' && typeof m.pcm === 'string') {
        feedAudio(Buffer.from(m.pcm, 'base64'), 16000)
      } else if (m.type === 'stop') {
        void finalize()
      }
    } catch (error) { console.error('[gateway] invalid socket message', error) }
  })
  socket.on('close', () => { void finalize() })
  socket.on('error', (error) => console.error(`[${channel}] websocket`, error))
}

server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
  if (pathname !== '/twilio' && pathname !== '/web') {
    socket.destroy()
    return
  }
  wss.handleUpgrade(request, socket, head, (websocket) => {
    handleConnection(websocket, pathname === '/twilio' ? 'phone' : 'web')
  })
})

export { handleConnection }
export function start(port: number = PORT) {
  server.listen(port, () => console.log(`voice-gateway listening on :${port}`))
}
if (process.env.GATEWAY_NO_LISTEN !== '1') start()
