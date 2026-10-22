import { resamplePcm16 } from './resample.js'

const BIAS = 0x84
const CLIP = 32635

/** EXP_LUT[i] is the index of the highest set bit of i (0 for i === 0). */
const EXP_LUT = new Uint8Array(256)
for (let i = 1; i < 256; i += 1) {
  let value = i
  let exponent = 0
  while (value > 1) {
    value >>= 1
    exponent += 1
  }
  EXP_LUT[i] = exponent
}

/** Encode one signed 16-bit PCM sample to a G.711 mu-law byte. */
export function encodeMulawSample(sample: number): number {
  let sign = 0
  if (sample < 0) {
    sign = 0x80
    sample = -sample
  }
  if (sample > CLIP) sample = CLIP
  sample += BIAS

  const exponent = EXP_LUT[(sample >> 7) & 0xff]
  const mantissa = (sample >> (exponent + 3)) & 0x0f

  return ~(sign | (exponent << 4) | mantissa) & 0xff
}

/** Decode one G.711 mu-law byte to a signed 16-bit PCM sample. */
export function decodeMulawSample(byte: number): number {
  const value = ~byte & 0xff
  let magnitude = (((value & 0x0f) << 3) + BIAS) << ((value >> 4) & 0x07)
  magnitude -= BIAS
  if (magnitude === 0) return 0
  return value & 0x80 ? -magnitude : magnitude
}

/**
 * Encode PCM16LE to 8 kHz mu-law. Non-8 kHz input is resampled first.
 * A trailing odd byte is ignored.
 */
export function pcm16ToMulaw(pcm: Buffer, sampleRate: number): Buffer {
  const pcm8k = sampleRate === 8000 ? pcm : resamplePcm16(pcm, sampleRate, 8000)
  const samples = Math.floor(pcm8k.length / 2)
  const output = Buffer.alloc(samples)
  for (let i = 0; i < samples; i += 1) {
    output[i] = encodeMulawSample(pcm8k.readInt16LE(i * 2))
  }
  return output
}

/** Decode 8 kHz mu-law to PCM16LE, resampling when the target rate differs. */
export function mulawToPcm16(mulaw: Buffer, sampleRate: number): Buffer {
  const pcm8k = Buffer.alloc(mulaw.length * 2)
  for (let i = 0; i < mulaw.length; i += 1) {
    pcm8k.writeInt16LE(decodeMulawSample(mulaw[i]), i * 2)
  }
  return sampleRate === 8000 ? pcm8k : resamplePcm16(pcm8k, 8000, sampleRate)
}
