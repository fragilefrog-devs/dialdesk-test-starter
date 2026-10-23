import { describe, expect, it } from 'vitest'
import { BargeInDetector, Vad, type VadEvent } from '../src/audio/vad.js'

const RATE = 16000
const FRAME_MS = 20

function pcmFrame(value: number): Buffer {
  const samples = Math.round((RATE * FRAME_MS) / 1000)
  const buffer = Buffer.alloc(samples * 2)
  for (let i = 0; i < samples; i += 1) buffer.writeInt16LE(value, i * 2)
  return buffer
}

function frames(value: number, count: number): Buffer[] {
  return Array.from({ length: count }, () => pcmFrame(value))
}

function drive(vad: Vad, input: Buffer[]): VadEvent[] {
  const events: VadEvent[] = []
  for (const frame of input) events.push(...vad.push(frame, RATE))
  return events
}

describe('Vad', () => {
  it('emits one speech_start and one speech_end for 300 ms of speech plus 800 ms of silence', () => {
    const vad = new Vad()
    const events = drive(vad, [...frames(1000, 15), ...frames(0, 40)])

    expect(events.map(event => event.type)).toEqual(['speech_start', 'speech_end'])
    const end = events[1]
    if (end.type !== 'speech_end') throw new Error('expected speech_end')
    expect((end as { durationMs: number }).durationMs).toBe(1100)
    expect(end.pcm).toHaveLength(55 * 640)
  })

  it('discards a blip shorter than minSpeechMs', () => {
    const vad = new Vad()
    const events = drive(vad, [...frames(1000, 5), ...frames(0, 40)])

    expect(events.map(event => event.type)).toEqual(['speech_start'])
    expect(vad.speaking).toBe(false)
  })

  it('honours a 700 ms endpointSilenceMs option', () => {
    const vad = new Vad({ endpointSilenceMs: 700 })
    const events = drive(vad, [...frames(1000, 45), ...frames(0, 35)])

    expect(events.map(event => event.type)).toEqual(['speech_start', 'speech_end'])
    const end = events[1]
    if (end.type !== 'speech_end') throw new Error('expected speech_end')
    expect((end as { durationMs: number }).durationMs).toBe(1600)
  })

  it('emits utterance_max at the configured maximum', () => {
    const vad = new Vad({ maxUtteranceMs: 1000 })
    const events = drive(vad, frames(1000, 50))

    expect(events.map(event => event.type)).toEqual(['speech_start', 'utterance_max'])
    const max = events[1]
    if (max.type !== 'utterance_max') throw new Error('expected utterance_max')
    expect((max as { durationMs: number }).durationMs).toBe(1000)
    expect(max.pcm).toHaveLength(50 * 640)
  })

  it('prepends the configured pre-roll to the utterance', () => {
    const vad = new Vad({ preRollMs: 200 })
    const events = drive(vad, [...frames(0, 10), ...frames(1000, 15), ...frames(0, 40)])

    expect(events.map(event => event.type)).toEqual(['speech_start', 'speech_end'])
    const end = events[1]
    if (end.type !== 'speech_end') throw new Error('expected speech_end')
    expect(end.pcm).toHaveLength(65 * 640)
    expect((end as { durationMs: number }).durationMs).toBe(1300)
    expect(end.pcm.readInt16LE(0)).toBe(0)
    expect(end.pcm.readInt16LE(10 * 640)).toBe(1000)
  })
})

describe('BargeInDetector', () => {
  it('fires once after 120 ms at 900 RMS and stays quiet until reset', () => {
    const detector = new BargeInDetector()

    for (let i = 0; i < 5; i += 1) expect(detector.push(pcmFrame(1000))).toBe(false)
    expect(detector.push(pcmFrame(1000))).toBe(true)

    for (let i = 0; i < 5; i += 1) expect(detector.push(pcmFrame(1000))).toBe(false)

    detector.reset()
    for (let i = 0; i < 5; i += 1) expect(detector.push(pcmFrame(1000))).toBe(false)
    expect(detector.push(pcmFrame(1000))).toBe(true)
  })

  it('requires the threshold to be sustained', () => {
    const detector = new BargeInDetector()
    expect(detector.push(pcmFrame(800))).toBe(false)
    for (let i = 0; i < 5; i += 1) expect(detector.push(pcmFrame(1000))).toBe(false)
    expect(detector.push(pcmFrame(1000))).toBe(true)
  })
})
