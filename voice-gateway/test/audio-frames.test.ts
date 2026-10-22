import { describe, expect, it } from 'vitest'
import {
  BYTES_PER_SAMPLE,
  INTERNAL_FRAME_BYTES,
  TWILIO_FRAME_BYTES,
  chunkBuffer,
  durationMs,
  pcm16Samples,
  rmsPcm16,
  toPcm16le,
} from '../src/audio/frames.js'

function pcm16(samples: number[]): Buffer {
  const buffer = Buffer.alloc(samples.length * 2)
  samples.forEach((sample, index) => buffer.writeInt16LE(sample, index * 2))
  return buffer
}

describe('frame helpers', () => {
  it('exposes the framing constants', () => {
    expect(BYTES_PER_SAMPLE).toBe(2)
    expect(TWILIO_FRAME_BYTES).toBe(160)
    expect(INTERNAL_FRAME_BYTES).toBe(640)
  })

  it('chunks 1000 bytes into six full frames and a 40-byte tail', () => {
    const chunks = chunkBuffer(Buffer.alloc(1000, 1), 160)
    expect(chunks).toHaveLength(7)
    expect(chunks.map(chunk => chunk.length)).toEqual([160, 160, 160, 160, 160, 160, 40])
    expect(Buffer.concat(chunks).equals(Buffer.alloc(1000, 1))).toBe(true)
  })

  it('returns no chunks for empty input', () => {
    expect(chunkBuffer(Buffer.alloc(0), 160)).toEqual([])
  })

  it('throws RangeError for a non-positive chunk size', () => {
    expect(() => chunkBuffer(Buffer.alloc(10), 0)).toThrow(RangeError)
    expect(() => chunkBuffer(Buffer.alloc(10), -1)).toThrow(RangeError)
  })

  it('counts complete samples and ignores a trailing odd byte', () => {
    expect(pcm16Samples(Buffer.alloc(641))).toBe(320)
    expect(pcm16Samples(Buffer.alloc(0))).toBe(0)
  })

  it('computes RMS over all complete samples', () => {
    expect(rmsPcm16(pcm16(new Array(20).fill(1000)))).toBe(1000)
    expect(rmsPcm16(pcm16([-1000, 1000]))).toBe(1000)
    expect(rmsPcm16(Buffer.alloc(0))).toBe(0)
  })

  it('computes duration from complete samples', () => {
    expect(durationMs(Buffer.alloc(640), 16000)).toBe(20)
    expect(durationMs(Buffer.alloc(320), 16000)).toBe(10)
    expect(durationMs(Buffer.alloc(0), 16000)).toBe(0)
  })

  it('roundtrips Int16Array through a little-endian buffer', () => {
    const input = Int16Array.from([-32768, -1, 0, 1, 32767])
    const buffer = toPcm16le(input)
    expect(buffer).toHaveLength(input.length * BYTES_PER_SAMPLE)
    const output = new Int16Array(input.length)
    for (let i = 0; i < input.length; i += 1) output[i] = buffer.readInt16LE(i * 2)
    expect(Array.from(output)).toEqual(Array.from(input))
  })
})
