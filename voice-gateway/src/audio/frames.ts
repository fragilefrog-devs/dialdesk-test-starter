export const BYTES_PER_SAMPLE = 2
/** 20 ms of 8 kHz mu-law, the exact payload size Twilio sends/receives. */
export const TWILIO_FRAME_BYTES = 160
/** 20 ms of 16 kHz PCM16LE mono. */
export const INTERNAL_FRAME_BYTES = 640

/** Split a buffer into fixed-size chunks, leaving a shorter final chunk. */
export function chunkBuffer(buf: Buffer, size: number): Buffer[] {
  if (size <= 0) throw new RangeError('chunk size must be positive')
  const chunks: Buffer[] = []
  for (let offset = 0; offset < buf.length; offset += size) {
    chunks.push(buf.subarray(offset, Math.min(offset + size, buf.length)))
  }
  return chunks
}

/** Number of complete 16-bit samples in a buffer (odd trailing byte ignored). */
export function pcm16Samples(pcm: Buffer): number {
  return Math.floor(pcm.length / BYTES_PER_SAMPLE)
}

/** Root-mean-square amplitude of all complete PCM16LE samples. */
export function rmsPcm16(pcm: Buffer): number {
  const samples = pcm16Samples(pcm)
  if (samples === 0) return 0
  let sum = 0
  for (let i = 0; i < samples; i += 1) {
    const value = pcm.readInt16LE(i * BYTES_PER_SAMPLE)
    sum += value * value
  }
  return Math.sqrt(sum / samples)
}

/** Duration of the complete samples in a buffer, in milliseconds. */
export function durationMs(pcm: Buffer, sampleRate: number): number {
  return (pcm16Samples(pcm) * 1000) / sampleRate
}

/** Copy signed 16-bit samples into a little-endian buffer. */
export function toPcm16le(samples: Int16Array): Buffer {
  const output = Buffer.alloc(samples.length * BYTES_PER_SAMPLE)
  for (let i = 0; i < samples.length; i += 1) {
    output.writeInt16LE(samples[i], i * BYTES_PER_SAMPLE)
  }
  return output
}
