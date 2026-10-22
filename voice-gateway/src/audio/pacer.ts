import { TWILIO_FRAME_BYTES } from './frames.js'

export interface PacerOptions {
  send: (frame: Buffer) => void | Promise<void>
  /** Delay between frames. Default 20 ms. */
  frameMs?: number
  /** Maximum frames waiting to send. Default 250 (~5 s). */
  maxQueueFrames?: number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

type EnqueueResult = 'queued' | 'dropped' | 'too_large'

/**
 * Sends one frame per `frameMs`, never overlapping async sends. New frames are
 * dropped once the queue is full; frames larger than a Twilio frame are rejected.
 */
export class Pacer {
  private readonly sendFrame: (frame: Buffer) => void | Promise<void>
  private readonly frameMs: number
  private readonly maxQueueFrames: number
  private readonly setTimer: (fn: () => void, ms: number) => unknown
  private readonly clearTimer: (handle: unknown) => void

  private queue: Buffer[] = []
  private timer: unknown = undefined
  private sending = false
  private generation = 0
  private drainWaiters: Array<() => void> = []

  constructor(opts: PacerOptions) {
    this.sendFrame = opts.send
    this.frameMs = opts.frameMs ?? 20
    this.maxQueueFrames = opts.maxQueueFrames ?? 250
    this.setTimer =
      opts.setTimer ??
      ((fn, ms) => {
        const handle = setTimeout(fn, ms)
        if (typeof (handle as { unref?: () => void }).unref === 'function') {
          ;(handle as { unref: () => void }).unref()
        }
        return handle
      })
    this.clearTimer =
      opts.clearTimer ?? (handle => clearTimeout(handle as ReturnType<typeof setTimeout>))
  }

  get queuedFrames(): number {
    return this.queue.length
  }

  get active(): boolean {
    return this.sending || this.timer !== undefined || this.queue.length > 0
  }

  enqueue(frame: Buffer): EnqueueResult {
    if (frame.length > TWILIO_FRAME_BYTES) return 'too_large'
    if (this.queue.length >= this.maxQueueFrames) return 'dropped'

    this.queue.push(frame)
    if (this.timer === undefined && !this.sending) this.schedule()
    return 'queued'
  }

  cancel(): void {
    this.generation += 1
    this.queue = []
    if (this.timer !== undefined) {
      this.clearTimer(this.timer)
      this.timer = undefined
    }
    // cancel() must resolve drain() even if a send is still in flight.
    this.resolveDrains(true)
  }

  drain(): Promise<void> {
    if (!this.queue.length && !this.sending && this.timer === undefined) {
      return Promise.resolve()
    }
    return new Promise<void>(resolve => {
      this.drainWaiters.push(resolve)
    })
  }

  private schedule(): void {
    if (this.timer !== undefined || this.sending) return
    if (!this.queue.length) {
      this.resolveDrains()
      return
    }

    const generation = this.generation
    this.timer = this.setTimer(() => {
      if (generation !== this.generation) return
      this.timer = undefined
      void this.tick(generation)
    }, this.frameMs)
  }

  private async tick(generation: number): Promise<void> {
    if (generation !== this.generation) return

    const frame = this.queue.shift()
    if (!frame) {
      this.resolveDrains()
      return
    }

    this.sending = true
    try {
      await this.sendFrame(frame)
    } catch {
      // Keep pacing after a transport error; delivery failures are the caller's concern.
    }
    this.sending = false

    if (generation !== this.generation) {
      // cancel() happened while the send was in flight. Work enqueued afterwards
      // must still be paced, but the old timer chain must not be resumed.
      if (this.queue.length) this.schedule()
      else this.resolveDrains()
      return
    }

    if (this.queue.length) this.schedule()
    else this.resolveDrains()
  }

  private resolveDrains(force = false): void {
    if (this.sending && !force) return
    const waiters = this.drainWaiters
    this.drainWaiters = []
    for (const resolve of waiters) resolve()
  }
}
