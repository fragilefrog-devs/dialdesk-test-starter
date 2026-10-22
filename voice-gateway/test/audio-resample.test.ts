import { describe, expect, it } from 'vitest'
import { resamplePcm16 } from '../src/audio/resample.js'

function pcm16(samples: number[]): Buffer {
  const buffer = Buffer.alloc(samples.length * 2)
  samples.forEach((sample, index) => buffer.writeInt16LE(sample, index * 2))
  return buffer
}

function readPcm16(buffer: Buffer): number[] {
  const samples: number[] = []
  for (let offset = 0; offset + 1 < buffer.length; offset += 2) {
    samples.push(buffer.readInt16LE(offset))
  }
  return samples
}

describe('resamplePcm16', () => {
  it('returns the input unchanged at the same rate', () => {
    const pcm = pcm16([100, -200, 300])
    expect(resamplePcm16(pcm, 16000, 16000)).toBe(pcm)
  })

  it('doubles length at 8 kHz to 16 kHz and keeps source samples on the even grid', () => {
    const output = resamplePcm16(pcm16([100, 200, 300]), 8000, 16000)
    expect(output).toHaveLength(12)
    expect(readPcm16(output)).toEqual([100, 150, 200, 250, 300, 300])
    expect(output.readInt16LE(0)).toBe(100)
    expect(output.readInt16LE(4)).toBe(200)
    expect(output.readInt16LE(8)).toBe(300)
  })

  it('halves length at 16 kHz to 8 kHz', () => {
    const output = resamplePcm16(pcm16([100, 200, 300, 400]), 16000, 8000)
    expect(output).toHaveLength(4)
    expect(readPcm16(output)).toEqual([100, 300])
  })

  it('uses round(samples * to / from) at 22050 Hz to 16000 Hz', () => {
    const input = pcm16(new Array(2205).fill(0))
    const output = resamplePcm16(input, 22050, 16000)
    expect(output).toHaveLength(Math.round(2205 * 16000 / 22050) * 2)
  })

  it('returns an empty buffer for empty input', () => {
    expect(resamplePcm16(Buffer.alloc(0), 8000, 16000)).toHaveLength(0)
  })

  it('ignores a trailing odd byte', () => {
    const input = Buffer.concat([pcm16(new Array(320).fill(0)), Buffer.from([0x00])])
    expect(resamplePcm16(input, 16000, 8000)).toHaveLength(320)
  })

  it('throws RangeError for non-positive rates', () => {
    expect(() => resamplePcm16(Buffer.alloc(2), 0, 16000)).toThrow(RangeError)
    expect(() => resamplePcm16(Buffer.alloc(2), 8000, 0)).toThrow(RangeError)
    expect(() => resamplePcm16(Buffer.alloc(2), -1, 16000)).toThrow(RangeError)
  })

  it('retains a 440 Hz sine peak within 10%', () => {
    const rate = 22050
    const samples = Math.round(rate * 0.1)
    const input = Buffer.alloc(samples * 2)
    for (let i = 0; i < samples; i += 1) {
      input.writeInt16LE(Math.round(10000 * Math.sin((2 * Math.PI * 440 * i) / rate)), i * 2)
    }

    const output = resamplePcm16(input, rate, 16000)
    const peak = (buffer: Buffer) => {
      let max = 0
      for (const sample of readPcm16(buffer)) max = Math.max(max, Math.abs(sample))
      return max
    }

    expect(peak(output)).toBeGreaterThanOrEqual(peak(input) * 0.9)
  })
})
