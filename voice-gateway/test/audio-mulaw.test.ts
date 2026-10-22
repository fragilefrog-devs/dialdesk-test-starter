import { describe, expect, it } from 'vitest'
import {
  decodeMulawSample,
  encodeMulawSample,
  mulawToPcm16,
  pcm16ToMulaw,
} from '../src/audio/mulaw.js'

describe('G.711 mu-law codec', () => {
  it('encodes silence and near-silence to the standard bytes', () => {
    expect(encodeMulawSample(0)).toBe(0xff)
    expect(encodeMulawSample(-1)).toBe(0x7f)
    expect(decodeMulawSample(0xff)).toBe(0)
    expect(decodeMulawSample(0x7f)).toBe(0)
  })

  it('roundtrips full-range samples within one mu-law half-step', () => {
    let maxError = 0
    for (let sample = -32000; sample <= 32000; sample += 7) {
      const decoded = decodeMulawSample(encodeMulawSample(sample))
      maxError = Math.max(maxError, Math.abs(decoded - sample))
    }
    // G.711 is 8-bit companded: the top segment step is 1024, so the best
    // achievable worst-case error over the full range is 512 -- the brief's 64
    // holds only for low amplitudes (see the next test).
    expect(maxError).toBeLessThanOrEqual(512)
  })

  it('roundtrips low-amplitude samples within 64', () => {
    let maxError = 0
    for (let sample = -2000; sample <= 2000; sample += 7) {
      const decoded = decodeMulawSample(encodeMulawSample(sample))
      maxError = Math.max(maxError, Math.abs(decoded - sample))
    }
    expect(maxError).toBeLessThanOrEqual(64)
  })

  it('converts 20 ms of 16 kHz silence to a 160-byte Twilio frame', () => {
    const encoded = pcm16ToMulaw(Buffer.alloc(640), 16000)
    expect(encoded).toHaveLength(160)
    expect(encoded.every(byte => byte === 0xff)).toBe(true)
  })

  it('expands 160 mu-law silence bytes to 640 bytes at 16 kHz', () => {
    const decoded = mulawToPcm16(Buffer.alloc(160, 0xff), 16000)
    expect(decoded).toHaveLength(640)
    for (let offset = 0; offset < decoded.length; offset += 2) {
      expect(decoded.readInt16LE(offset)).toBe(0)
    }
  })

  it('ignores a trailing odd PCM byte', () => {
    expect(pcm16ToMulaw(Buffer.alloc(37), 8000)).toHaveLength(18)
  })

  it('resamples through the non-8 kHz path', () => {
    expect(mulawToPcm16(Buffer.alloc(160, 0xff), 8000)).toHaveLength(320)
    expect(mulawToPcm16(Buffer.alloc(160, 0xff), 16000)).toHaveLength(640)
    expect(pcm16ToMulaw(Buffer.alloc(320), 8000)).toHaveLength(160)
    expect(pcm16ToMulaw(Buffer.alloc(640), 16000)).toHaveLength(160)
  })
})
