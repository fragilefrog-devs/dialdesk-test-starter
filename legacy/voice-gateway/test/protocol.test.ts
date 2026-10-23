import { describe, it, expect } from 'vitest'
import {
  PROTOCOL_VERSION,
  parseBrowserMessage,
  parseTwilioMessage,
  serializeBrowserMessage,
  serializeTwilioClear,
  serializeTwilioMedia,
} from '../src/protocol.js'

describe('protocol constants', () => {
  it('exports protocol version 1', () => {
    expect(PROTOCOL_VERSION).toBe(1)
  })
})

describe('parseTwilioMessage', () => {
  it('parses a start frame with stream and custom parameters', () => {
    const result = parseTwilioMessage(JSON.stringify({
      event: 'start',
      start: {
        streamSid: 'MZ1',
        callSid: 'CA1',
        customParameters: { callId: 'c1', token: 'v1.x.y' },
        mediaFormat: { encoding: 'audio/x-mulaw', sampleRate: 8000, channels: 1 },
      },
    }))

    expect(result.ok).toBe(true)
    if (result.ok && result.message.event === 'start') {
      expect(result.message.start.streamSid).toBe('MZ1')
      expect(result.message.start.customParameters?.callId).toBe('c1')
    }
  })

  it('parses media frames', () => {
    const result = parseTwilioMessage(JSON.stringify({
      event: 'media',
      streamSid: 'MZ1',
      media: { payload: 'AAAA' },
    }))

    expect(result.ok).toBe(true)
    if (result.ok && result.message.event === 'media') {
      expect(result.message.media.payload).toBe('AAAA')
    }
  })

  it('rejects malformed JSON', () => {
    expect(parseTwilioMessage('{not json')).toEqual({ ok: false, error: 'invalid_json' })
  })

  it('rejects unknown events', () => {
    expect(parseTwilioMessage(JSON.stringify({ event: 'pizza' })))
      .toEqual({ ok: false, error: 'invalid_message' })
  })

  it('rejects a start frame without a streamSid', () => {
    expect(parseTwilioMessage(JSON.stringify({ event: 'start', start: {} })))
      .toEqual({ ok: false, error: 'invalid_message' })
  })

  it('rejects a media frame without a payload', () => {
    expect(parseTwilioMessage(JSON.stringify({ event: 'media', media: {} })))
      .toEqual({ ok: false, error: 'invalid_message' })
  })
})

describe('parseBrowserMessage', () => {
  it('accepts a v1 start frame', () => {
    const result = parseBrowserMessage(JSON.stringify({ v: 1, type: 'start', callId: 'c1', token: 'v1.x.y' }))

    expect(result.ok).toBe(true)
    if (result.ok && result.message.type === 'start') {
      expect(result.message.callId).toBe('c1')
    }
  })

  it('rejects a start frame without a version', () => {
    expect(parseBrowserMessage(JSON.stringify({ type: 'start', callId: 'c1' })))
      .toEqual({ ok: false, error: 'unsupported_protocol_version' })
  })

  it('rejects an unsupported version', () => {
    expect(parseBrowserMessage(JSON.stringify({ v: 2, type: 'start', callId: 'c1' })))
      .toEqual({ ok: false, error: 'unsupported_protocol_version' })
  })

  it('parses audio and stop frames', () => {
    const audio = parseBrowserMessage(JSON.stringify({ type: 'audio', pcm: 'AAAA' }))
    expect(audio.ok).toBe(true)
    expect(parseBrowserMessage(JSON.stringify({ type: 'stop' }))).toEqual({
      ok: true,
      message: { type: 'stop' },
    })
  })

  it('rejects audio without a pcm string', () => {
    expect(parseBrowserMessage(JSON.stringify({ type: 'audio' })))
      .toEqual({ ok: false, error: 'invalid_message' })
  })

  it('rejects unknown types and malformed JSON', () => {
    expect(parseBrowserMessage(JSON.stringify({ type: 'hello' })))
      .toEqual({ ok: false, error: 'invalid_message' })
    expect(parseBrowserMessage('nope')).toEqual({ ok: false, error: 'invalid_json' })
  })
})

describe('serializers', () => {
  it('serializes a Twilio media frame', () => {
    expect(JSON.parse(serializeTwilioMedia('MZ1', 'AAAA'))).toEqual({
      event: 'media',
      streamSid: 'MZ1',
      media: { payload: 'AAAA' },
    })
  })

  it('serializes the Twilio barge-in clear frame', () => {
    expect(JSON.parse(serializeTwilioClear('MZ1'))).toEqual({ event: 'clear', streamSid: 'MZ1' })
  })

  it('serializes browser frames, including interrupt', () => {
    expect(JSON.parse(serializeBrowserMessage({ type: 'interrupt' }))).toEqual({ type: 'interrupt' })
    expect(JSON.parse(serializeBrowserMessage({ type: 'closed', code: 1000, reason: 'done' })))
      .toEqual({ type: 'closed', code: 1000, reason: 'done' })
  })
})
