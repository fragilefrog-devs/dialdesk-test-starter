import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

type SpeechAudio = { pcm: Buffer; sampleRate: number }

const whisperPath = process.env.WHISPER_CPP_PATH ?? 'pwcpp'
const whisperModel = process.env.WHISPER_MODEL_PATH
const piperPath = process.env.PIPER_PATH ?? 'piper'
const piperModel = process.env.PIPER_MODEL_PATH

function run(command: string, args: string[], input?: string) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    let stdout = '', stderr = ''
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk })
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code) => code === 0
      ? resolve({ stdout, stderr })
      : reject(new Error(`${path.basename(command)} exited with code ${code}: ${stderr.slice(-1000)}`)))
    if (input !== undefined) child.stdin.end(input)
    else child.stdin.end()
  })
}

function wav(pcm: Buffer, sampleRate: number) {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8)
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22); header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34)
  header.write('data', 36); header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

function parseWav(file: Buffer): SpeechAudio {
  if (file.toString('ascii', 0, 4) !== 'RIFF' || file.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Piper returned an invalid WAV file')
  let sampleRate = 0, channels = 0, bits = 0, dataOffset = -1, dataLength = 0
  for (let offset = 12; offset + 8 <= file.length;) {
    const name = file.toString('ascii', offset, offset + 4)
    const size = file.readUInt32LE(offset + 4)
    const body = offset + 8
    if (name === 'fmt ') { channels = file.readUInt16LE(body + 2); sampleRate = file.readUInt32LE(body + 4); bits = file.readUInt16LE(body + 14) }
    if (name === 'data') { dataOffset = body; dataLength = size; break }
    offset = body + size + (size % 2)
  }
  if (!sampleRate || channels !== 1 || bits !== 16 || dataOffset < 0 || dataOffset + dataLength > file.length) {
    throw new Error('Piper WAV must contain mono 16-bit PCM')
  }
  return { pcm: file.subarray(dataOffset, dataOffset + dataLength), sampleRate }
}

function resample(pcm: Buffer, fromRate: number, toRate: number) {
  if (fromRate === toRate) return pcm
  const samples = Math.floor(pcm.length / 2), outputSamples = Math.floor(samples * toRate / fromRate)
  const output = Buffer.alloc(outputSamples * 2)
  for (let i = 0; i < outputSamples; i += 1) {
    const source = i * fromRate / toRate
    const left = Math.floor(source), right = Math.min(left + 1, samples - 1), fraction = source - left
    const value = pcm.readInt16LE(left * 2) * (1 - fraction) + pcm.readInt16LE(right * 2) * fraction
    output.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(value))), i * 2)
  }
  return output
}

function decodeMuLaw(data: Buffer) {
  const pcm = Buffer.alloc(data.length * 2)
  for (let i = 0; i < data.length; i += 1) {
    const value = (~data[i]) & 0xff
    const magnitude = (((value & 0x0f) << 3) + 0x84) << ((value & 0x70) >> 4)
    pcm.writeInt16LE((value & 0x80) ? 0x84 - magnitude : magnitude - 0x84, i * 2)
  }
  return pcm
}

function encodeMuLaw(pcm: Buffer) {
  const output = Buffer.alloc(Math.floor(pcm.length / 2))
  for (let i = 0; i < output.length; i += 1) {
    const sample = pcm.readInt16LE(i * 2)
    const sign = sample < 0 ? 0x80 : 0
    let magnitude = Math.min(32635, Math.abs(sample)) + 0x84
    let exponent = 7
    for (let mask = 0x4000; exponent > 0 && (magnitude & mask) === 0; mask >>= 1) exponent -= 1
    output[i] = (~(sign | (exponent << 4) | ((magnitude >> (exponent + 3)) & 0x0f))) & 0xff
  }
  return output
}

export function twilioAudioToPcm(payload: string) {
  return resample(decodeMuLaw(Buffer.from(payload, 'base64')), 8000, 16000)
}

export function pcmToTwilioAudio(pcm: Buffer, sampleRate: number) {
  return encodeMuLaw(resample(pcm, sampleRate, 8000)).toString('base64')
}

export async function transcribe(pcm16: Buffer, sampleRate = 16000) {
  if (!whisperModel) throw new Error('WHISPER_MODEL_PATH is required')
  const dir = await mkdtemp(path.join(tmpdir(), 'receptionist-whisper-'))
  const inputPath = path.join(dir, `${randomUUID()}.wav`)
  try {
    await writeFile(inputPath, wav(resample(pcm16, sampleRate, 16000), 16000))
    await run(whisperPath, [inputPath, '-m', whisperModel, '-otxt', '--no_timestamps', 'true', '--print_progress', 'false'])
    return (await readFile(`${inputPath}.txt`, 'utf8')).trim().replace(/\s+/g, ' ')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

export async function synthesize(text: string) {
  if (!piperModel) throw new Error('PIPER_MODEL_PATH is required')
  const dir = await mkdtemp(path.join(tmpdir(), 'receptionist-piper-'))
  const outputPath = path.join(dir, `${randomUUID()}.wav`)
  try {
    await run(piperPath, ['--model', piperModel, '--output_file', outputPath], text.replace(/[\r\n]/g, ' '))
    return parseWav(await readFile(outputPath))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}