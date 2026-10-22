const BIAS = 0x84
const CLIP = 32635

function linearToMulawSample(sample: number): number {
  let sign = 0
  if (sample < 0) {
    sample = -sample
    sign = 0x80
  }
  if (sample > CLIP) sample = CLIP
  sample = sample + BIAS
  let exponent = 7
  for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; expMask >>= 1) {
    exponent--
  }
  const mantissa = (sample >> (exponent + 3)) & 0x0f
  const mulaw = ~(sign | (exponent << 4) | mantissa)
  return mulaw & 0xff
}

function mulawToLinearSample(mulaw: number): number {
  mulaw = ~mulaw & 0xff
  const sign = mulaw & 0x80
  const exponent = (mulaw >> 4) & 0x07
  const mantissa = mulaw & 0x0f
  let sample = ((mantissa << 3) + BIAS) << exponent
  sample = sample - BIAS
  if (sign !== 0) sample = -sample
  return sample
}

export function encodeMulaw(pcm16: Buffer): Buffer {
  // 16k PCM16 -> 8k mu-law by taking every other sample
  const out = Buffer.alloc(Math.floor(pcm16.length / 4))
  for (let i = 0, j = 0; i + 1 < pcm16.length && j < out.length; i += 4, j++) {
    const sample = pcm16.readInt16LE(i)
    out[j] = linearToMulawSample(sample)
  }
  return out
}

export function decodeMulaw(mulaw: Buffer): Buffer {
  // 8k mu-law -> 16k PCM16 by duplicating each sample
  const out = Buffer.alloc(mulaw.length * 4)
  for (let i = 0, j = 0; i < mulaw.length; i++, j += 4) {
    const sample = mulawToLinearSample(mulaw[i])
    out.writeInt16LE(sample, j)
    out.writeInt16LE(sample, j + 2)
  }
  return out
}

export function resamplePcm16(pcm: Buffer, from: number, to: number): Buffer {
  if (from === to) return Buffer.from(pcm)
  // Simple resampling for test purposes
  if (from === 22050 && to === 8000) {
    // downsample by ~2.75, take every ~2-3 samples
    const ratio = from / to
    const outSamples = Math.floor((pcm.length / 2) / ratio)
    const out = Buffer.alloc(outSamples * 2)
    for (let i = 0; i < outSamples; i++) {
      const srcIndex = Math.floor(i * ratio) * 2
      if (srcIndex + 1 < pcm.length) {
        out.writeInt16LE(pcm.readInt16LE(srcIndex), i * 2)
      }
    }
    return out
  }
  if (from === 16000 && to === 8000) {
    const out = Buffer.alloc(Math.floor(pcm.length / 2))
    for (let i = 0, j = 0; i + 1 < pcm.length; i += 4, j += 2) {
      out.writeInt16LE(pcm.readInt16LE(i), j)
    }
    return out
  }
  // Default: simple decimation
  const ratio = from / to
  const outSamples = Math.floor((pcm.length / 2) / ratio)
  const out = Buffer.alloc(outSamples * 2)
  for (let i = 0; i < outSamples; i++) {
    const srcIndex = Math.floor(i * ratio) * 2
    if (srcIndex + 1 < pcm.length) {
      out.writeInt16LE(pcm.readInt16LE(srcIndex), i * 2)
    }
  }
  return out
}

export function tone({ hz, ms, sampleRate, amplitude = 0.5 }: { hz: number; ms: number; sampleRate: number; amplitude?: number }): Buffer {
  const samples = Math.floor((sampleRate * ms) / 1000)
  const out = Buffer.alloc(samples * 2)
  const max = Math.floor(32767 * amplitude)
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate
    const val = Math.floor(max * Math.sin(2 * Math.PI * hz * t))
    out.writeInt16LE(val, i * 2)
  }
  return out
}

export function silence(ms: number, sampleRate: number): Buffer {
  const samples = Math.floor((sampleRate * ms) / 1000)
  return Buffer.alloc(samples * 2)
}

export function twilioMediaFrame(mulaw: Buffer): string {
  // base64 of exactly 160 bytes
  return mulaw.subarray(0, 160).toString('base64')
}
