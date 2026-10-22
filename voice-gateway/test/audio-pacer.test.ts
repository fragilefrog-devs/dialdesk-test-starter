import { afterEach, describe, expect, it, vi } from 'vitest'
import { Pacer } from '../src/audio/pacer.js'

function frame(value: number): Buffer {
  const buffer = Buffer.alloc(160)
  buffer[0] = value
  return buffer
}

describe('Pacer', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('sends five frames one per 20 ms tick, in order', async () => {
    vi.useFakeTimers()
    const sent: number[] = []
    const pacer = new Pacer({ send: value => { sent.push(value[0]) } })

    for (let i = 0; i < 5; i += 1) expect(pacer.enqueue(frame(i))).toBe('queued')
    expect(sent).toEqual([])

    for (let i = 0; i < 5; i += 1) {
      await vi.advanceTimersByTimeAsync(20)
      expect(sent).toEqual([0, 1, 2, 3, 4].slice(0, i + 1))
    }

    expect(pacer.active).toBe(false)
    await pacer.drain()
  })

  it('cancel stops further sends and resolves drain', async () => {
    vi.useFakeTimers()
    const sent: number[] = []
    const pacer = new Pacer({ send: value => { sent.push(value[0]) } })

    for (let i = 0; i < 5; i += 1) pacer.enqueue(frame(i))
    await vi.advanceTimersByTimeAsync(20)
    expect(sent).toEqual([0])

    pacer.cancel()
    expect(pacer.queuedFrames).toBe(0)
    await expect(pacer.drain()).resolves.toBeUndefined()

    await vi.advanceTimersByTimeAsync(200)
    expect(sent).toEqual([0])
  })

  it('drops the newest frame when the queue is full', () => {
    vi.useFakeTimers()
    const pacer = new Pacer({ send: () => {} })

    for (let i = 0; i < 250; i += 1) expect(pacer.enqueue(frame(0))).toBe('queued')
    expect(pacer.enqueue(frame(1))).toBe('dropped')
    expect(pacer.queuedFrames).toBe(250)
    pacer.cancel()
  })

  it('rejects frames larger than a Twilio frame', () => {
    const pacer = new Pacer({ send: () => {} })
    expect(pacer.enqueue(Buffer.alloc(161))).toBe('too_large')
  })

  it('does not overlap async sends', async () => {
    vi.useFakeTimers()
    const sent: number[] = []
    let releaseFirst: (() => void) | undefined
    const firstSend = new Promise<void>(resolve => { releaseFirst = resolve })

    const pacer = new Pacer({
      send: value => {
        sent.push(value[0])
        return value[0] === 0 ? firstSend : undefined
      },
    })

    pacer.enqueue(frame(0))
    pacer.enqueue(frame(1))

    await vi.advanceTimersByTimeAsync(20)
    expect(sent).toEqual([0])

    await vi.advanceTimersByTimeAsync(20)
    expect(sent).toEqual([0])

    releaseFirst?.()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(20)
    expect(sent).toEqual([0, 1])
    await pacer.drain()
  })
})
