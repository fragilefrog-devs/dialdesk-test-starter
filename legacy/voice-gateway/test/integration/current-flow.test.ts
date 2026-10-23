import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { startFakeApp } from '../harness/fake-app.js'
import { startGateway, connect, collect } from '../harness/gateway.js'
import * as audio from '../harness/audio.js'

const { transcribeMock, synthesizeMock } = vi.hoisted(() => {
  return {
    transcribeMock: vi.fn(async () => 'I need an appointment'),
    synthesizeMock: vi.fn(async () => ({ pcm: audio.tone({ hz: 440, ms: 120, sampleRate: 22050, amplitude: 0.2 }), sampleRate: 22050 })),
  }
})

vi.mock('../src/local-speech.js', () => {
  return {
    transcribe: transcribeMock,
    synthesize: synthesizeMock,
    pcmToTwilioAudio: (pcm: Buffer, rate: number) => {
      const resampled = audio.resamplePcm16(pcm, rate, 8000)
      const mulaw = audio.encodeMulaw(resampled)
      return mulaw.toString('base64')
    },
    twilioAudioToPcm: (b64: string) => audio.decodeMulaw(Buffer.from(b64, 'base64')),
  }
})

describe('current flow', () => {
  let app: any
  let gw: any

  beforeEach(async () => {
    app = await startFakeApp({
      greeting: 'Thanks for calling Acme. How can I help?',
      reply: 'Sure, I can help with that.',
    })
    gw = await startGateway(app.url)
  })

  afterEach(async () => {
    if (gw) await gw.close()
    if (app) await app.close()
    vi.clearAllMocks()
  })

  it('health', async () => {
    const res = await fetch(gw.url.replace('ws://', 'http://') + '/health')
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toBe('ok')
  })

  it('phone greeting', async () => {
    const ws = await connect(gw.url, '/twilio')
    const c = collect(ws)
    ws.send(JSON.stringify({ event: 'start', start: { streamSid: 'MZ1', customParameters: { callId: '11111111-1111-4111-8111-111111111111', token: 'v1.test.token' } } }))
    await c.waitFor((m: any) => m.type === 'speaking' && m.value === true)
    const media = await c.waitFor((m: any) => m.event === 'media')
    expect(media.media.payload).toBeTruthy()
    const buf = Buffer.from(media.media.payload, 'base64')
    expect(buf.length).toBe(160)
    await c.waitFor((m: any) => m.type === 'speaking' && m.value === false)
    ws.close()
  })

  it('phone turn', async () => {
    const ws = await connect(gw.url, '/twilio')
    const c = collect(ws)
    ws.send(JSON.stringify({ event: 'start', start: { streamSid: 'MZ1', customParameters: { callId: '11111111-1111-4111-8111-111111111111', token: 'v1.test.token' } } }))
    await c.waitFor((m: any) => m.type === 'speaking' && m.value === false)

    // send 400 ms speech (20 frames of 8k mu-law tone at amplitude 0.5), then 900 ms silence (45 frames)
    const tone16k40ms = audio.tone({ hz: 440, ms: 40, sampleRate: 16000, amplitude: 0.5 })
    const mulaw40ms = audio.encodeMulaw(tone16k40ms) // should be 160 bytes for 40ms
    for (let i = 0; i < 20; i++) {
      const frame = Buffer.alloc(160)
      for (let j = 0; j < 160 && j < mulaw40ms.length; j++) {
        frame[j] = mulaw40ms[j % mulaw40ms.length]
      }
      ws.send(JSON.stringify({ event: 'media', media: { payload: frame.toString('base64') } }))
      await new Promise((r) => setTimeout(r, 20))
    }
    // 900 ms silence
    const silenceFrame = Buffer.alloc(160, 0xff)
    for (let i = 0; i < 45; i++) {
      ws.send(JSON.stringify({ event: 'media', media: { payload: silenceFrame.toString('base64') } }))
      await new Promise((r) => setTimeout(r, 20))
    }

    await c.waitFor((m: any) => m.type === 'transcript' && m.role === 'caller')
    await c.waitFor((m: any) => m.type === 'transcript' && m.role === 'agent')
    const mediaMsgs = c.messages.filter((m: any) => m.event === 'media')
    expect(mediaMsgs.length).toBeGreaterThan(0)
    const respondReq = app.requests.find((r: any) => r.path === '/api/voice/respond')
    expect(respondReq).toBeTruthy()
    ws.close()
  })

  it('finalize', async () => {
    const ws = await connect(gw.url, '/twilio')
    const c = collect(ws)
    ws.send(JSON.stringify({ event: 'start', start: { streamSid: 'MZ1', customParameters: { callId: '11111111-1111-4111-8111-111111111111', token: 'v1.test.token' } } }))
    await c.waitFor((m: any) => m.type === 'speaking' && m.value === false)
    ws.send(JSON.stringify({ event: 'stop' }))
    const closed = await c.closed
    expect(closed.code).toBe(1000)
    expect(app.finalizeBodies.length).toBe(1)
    expect(app.finalizeBodies[0].callId).toBe('11111111-1111-4111-8111-111111111111')
    expect(app.finalizeBodies[0].token).toBe('v1.test.token')
    expect(app.finalizeBodies[0].durationSeconds).toBeGreaterThan(0)
    expect(app.finalizeBodies[0].transcript.some((t: any) => t.role === 'agent')).toBe(true)
  })

  it('web greeting + audio', async () => {
    const ws = await connect(gw.url, '/web')
    const c = collect(ws)
    ws.send(JSON.stringify({ type: 'start', callId: '11111111-1111-4111-8111-111111111111', token: 'v1.test.token' }))
    await c.waitFor((m: any) => m.type === 'speaking' && m.value === true)
    const audioMsg = await c.waitFor((m: any) => m.type === 'audio')
    expect(audioMsg.sampleRate).toBe(22050)
    expect(audioMsg.pcm).toBeTruthy()
    await c.waitFor((m: any) => m.type === 'speaking' && m.value === false)
    ws.close()
  })

  it('web finalize', async () => {
    const ws = await connect(gw.url, '/web')
    const c = collect(ws)
    ws.send(JSON.stringify({ type: 'start', callId: '11111111-1111-4111-8111-111111111111', token: 'v1.test.token' }))
    await c.waitFor((m: any) => m.type === 'speaking' && m.value === false)
    ws.send(JSON.stringify({ type: 'stop' }))
    await c.closed
    expect(app.finalizeBodies.length).toBe(1)
  })
})
