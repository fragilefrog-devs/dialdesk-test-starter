import { durationMs, rmsPcm16 } from './frames.js'

export interface VadOptions {
  speechRms: number
  minSpeechMs: number
  endpointSilenceMs: number
  maxUtteranceMs: number
  preRollMs: number
  frameMs: number
}

export type VadEvent =
  | { type: 'speech_start' }
  | { type: 'speech_end'; pcm: Buffer; durationMs: number }
  | { type: 'utterance_max'; pcm: Buffer; durationMs: number }

const DEFAULT_OPTIONS: VadOptions = {
  speechRms: 500,
  minSpeechMs: 250,
  endpointSilenceMs: 800,
  maxUtteranceMs: 20_000,
  preRollMs: 200,
  frameMs: 20,
}

type BufferedFrame = { pcm: Buffer; ms: number }

/**
 * Energy-based voice activity detector with pre-roll, endpointing and a maximum
 * utterance length. Mirrors the endpointing values used by the current gateway.
 */
export class Vad {
  private readonly opts: VadOptions
  private preRoll: BufferedFrame[] = []
  private preRollMs = 0
  private utterance: Buffer[] = []
  private utteranceMs = 0
  private speechMs = 0
  private silenceMs = 0
  private isSpeaking = false

  constructor(opts: Partial<VadOptions> = {}) {
    this.opts = { ...DEFAULT_OPTIONS, ...opts }
  }

  get speaking(): boolean {
    return this.isSpeaking
  }

  reset(): void {
    this.preRoll = []
    this.preRollMs = 0
    this.utterance = []
    this.utteranceMs = 0
    this.speechMs = 0
    this.silenceMs = 0
    this.isSpeaking = false
  }

  push(pcm: Buffer, sampleRate: number): VadEvent[] {
    if (pcm.length < 2) return []

    const events: VadEvent[] = []
    const ms = durationMs(pcm, sampleRate)
    const speech = rmsPcm16(pcm) > this.opts.speechRms

    if (!this.isSpeaking) {
      if (!speech) {
        this.addPreRoll(pcm, ms)
        return events
      }

      this.isSpeaking = true
      this.utterance = [...this.preRoll.map(frame => frame.pcm), pcm]
      this.utteranceMs = this.preRollMs + ms
      this.preRoll = []
      this.preRollMs = 0
      this.speechMs = ms
      this.silenceMs = 0
      events.push({ type: 'speech_start' })
      return events
    }

    this.utterance.push(pcm)
    this.utteranceMs += ms
    if (speech) {
      this.speechMs += ms
      this.silenceMs = 0
    } else {
      this.silenceMs += ms
    }

    if (this.silenceMs >= this.opts.endpointSilenceMs) {
      if (this.speechMs >= this.opts.minSpeechMs) {
        events.push({
          type: 'speech_end',
          pcm: Buffer.concat(this.utterance),
          durationMs: this.utteranceMs,
        })
      }
      this.reset()
    } else if (this.utteranceMs >= this.opts.maxUtteranceMs) {
      events.push({
        type: 'utterance_max',
        pcm: Buffer.concat(this.utterance),
        durationMs: this.utteranceMs,
      })
      this.reset()
    }

    return events
  }

  private addPreRoll(pcm: Buffer, ms: number): void {
    this.preRoll.push({ pcm, ms })
    this.preRollMs += ms
    while (this.preRollMs > this.opts.preRollMs && this.preRoll.length) {
      const dropped = this.preRoll.shift()
      if (dropped) this.preRollMs -= dropped.ms
    }
  }
}

/** Stricter onset detector used for barge-in (900 RMS sustained for 120 ms). */
export class BargeInDetector {
  private readonly rms: number
  private readonly confirmMs: number
  private readonly frameMs: number
  private streakMs = 0
  private fired = false

  constructor(opts: { rms?: number; confirmMs?: number; frameMs?: number } = {}) {
    this.rms = opts.rms ?? 900
    this.confirmMs = opts.confirmMs ?? 120
    this.frameMs = opts.frameMs ?? 20
  }

  /** Returns true exactly once per confirmed onset, until reset(). */
  push(pcm: Buffer): boolean {
    if (this.fired) return false

    if (rmsPcm16(pcm) >= this.rms) {
      this.streakMs += this.frameMs
      if (this.streakMs >= this.confirmMs) {
        this.fired = true
        return true
      }
    } else {
      this.streakMs = 0
    }

    return false
  }

  reset(): void {
    this.streakMs = 0
    this.fired = false
  }
}
