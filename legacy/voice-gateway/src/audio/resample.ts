/**
 * Linear-interpolation PCM16LE resampler.
 *
 * Input and output are mono signed 16-bit little-endian samples. A trailing odd
 * byte is ignored (it cannot form a complete sample).
 */
export function resamplePcm16(pcm: Buffer, fromRate: number, toRate: number): Buffer {
  if (fromRate <= 0 || toRate <= 0) {
    throw new RangeError('sample rates must be positive')
  }
  if (fromRate === toRate) return pcm

  const samples = Math.floor(pcm.length / 2)
  if (samples === 0) return Buffer.alloc(0)

  const outputSamples = Math.max(1, Math.round((samples * toRate) / fromRate))
  const output = Buffer.alloc(outputSamples * 2)

  for (let i = 0; i < outputSamples; i += 1) {
    const source = (i * fromRate) / toRate
    const left = Math.floor(source)
    const right = Math.min(left + 1, samples - 1)
    const fraction = source - left
    const value =
      pcm.readInt16LE(left * 2) * (1 - fraction) + pcm.readInt16LE(right * 2) * fraction
    output.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(value))), i * 2)
  }

  return output
}
