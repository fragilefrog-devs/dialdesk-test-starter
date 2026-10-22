#!/usr/bin/env node
/**
 * Pre-upgrade voice latency baseline.
 *
 * Measures the local speech stack exactly as the gateway uses it today:
 * Piper (file + raw stdout), pwcpp, and an Ollama OpenAI-compatible stream.
 * Prints a single JSON object on stdout. Exits 0 when the local binaries or
 * models are absent so CI can run it without speech dependencies.
 *
 * Usage: node scripts/voice-baseline.mjs
 */
import { spawn } from 'node:child_process'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const PIPER_PATH = process.env.PIPER_PATH ?? ''
const PIPER_MODEL_PATH = process.env.PIPER_MODEL_PATH ?? ''
const WHISPER_CPP_PATH = process.env.WHISPER_CPP_PATH ?? ''
const WHISPER_MODEL_PATH = process.env.WHISPER_MODEL_PATH ?? ''
const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434/v1').replace(/\/+$/, '')
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'gemma3:1b'

const RUNS = 2
const TIMEOUT_MS = 120_000
const PIPER_TEXT = 'Thanks for calling. How can I help you today?'
const SAMPLE_RATE = 16_000
const WAV_SECONDS = 3.0
const SILENCE_SECONDS = 0.5
const TONE_HZ = 440
const AMPLITUDE = 0.2

const missing = []
const warnings = []
let workDir
let fileCounter = 0

const round = (value) => Math.round(value * 10) / 10

async function exists(target) {
  if (!target) return false
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

/**
 * Kill a child and wait for it to actually exit. On Windows the OS can still hold the
 * child's temp-file handles briefly after kill(), so callers must not clean up the temp
 * directory until the process is gone (otherwise rm can hit EBUSY/EPERM).
 */
function killAndWait(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve()
      return
    }
    let fallback
    const finish = () => {
      clearTimeout(fallback)
      resolve()
    }
    child.once('close', finish)
    child.once('error', finish)
    fallback = setTimeout(finish, 5_000)
    child.kill()
  })
}

function runToClose(command, args, input) {
  return new Promise((resolve, reject) => {
    const started = performance.now()
    const child = spawn(command, args, { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true })
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      // Wait for the process to exit so its temp-file handle is released before cleanup.
      void killAndWait(child).then(
        () => reject(new Error(`timed out after ${TIMEOUT_MS}ms`)),
        reject,
      )
    }, TIMEOUT_MS)

    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code === 0) resolve(performance.now() - started)
      else reject(new Error(`exited with code ${code}${stderr ? `: ${stderr.trim().slice(-300)}` : ''}`))
    })
    child.stdin.end(input)
  })
}

function measurePiperFirstRawByte() {
  return new Promise((resolve, reject) => {
    const started = performance.now()
    const child = spawn(PIPER_PATH, ['--model', PIPER_MODEL_PATH, '--output-raw'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      // Wait for the process to exit so its temp-file handle is released before cleanup.
      void killAndWait(child).then(
        () => reject(new Error(`timed out after ${TIMEOUT_MS}ms waiting for first raw byte`)),
        reject,
      )
    }, TIMEOUT_MS)

    child.stdout.on('data', (chunk) => {
      if (settled || !chunk || chunk.length === 0) return
      settled = true
      clearTimeout(timer)
      const elapsed = performance.now() - started
      child.kill()
      resolve(elapsed)
    })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(new Error(`exited with code ${code} before first raw byte${stderr ? `: ${stderr.trim().slice(-300)}` : ''}`))
    })
    child.stdin.end(PIPER_TEXT)
  })
}

async function measurePiperFull() {
  const outputPath = path.join(workDir, `piper-${fileCounter++}.wav`)
  const elapsed = await runToClose(PIPER_PATH, ['--model', PIPER_MODEL_PATH, '--output_file', outputPath], PIPER_TEXT)
  const file = await readFile(outputPath)
  if (file.length <= 44 || file.toString('ascii', 0, 4) !== 'RIFF') {
    throw new Error('piper did not produce a valid WAV file')
  }
  return elapsed
}

function buildSineWav() {
  const totalSamples = Math.round(SAMPLE_RATE * WAV_SECONDS)
  const silenceSamples = Math.round(SAMPLE_RATE * SILENCE_SECONDS)
  const toneSamples = totalSamples - silenceSamples
  const pcm = Buffer.alloc(totalSamples * 2)
  for (let i = 0; i < toneSamples; i += 1) {
    const sample = Math.sin((2 * Math.PI * TONE_HZ * i) / SAMPLE_RATE) * AMPLITUDE
    pcm.writeInt16LE(Math.round(sample * 32767), i * 2)
  }

  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(SAMPLE_RATE, 24)
  header.writeUInt32LE(SAMPLE_RATE * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

async function measureWhisper() {
  const inputPath = path.join(workDir, `whisper-${fileCounter++}.wav`)
  await writeFile(inputPath, buildSineWav())
  return runToClose(
    WHISPER_CPP_PATH,
    [inputPath, '-m', WHISPER_MODEL_PATH, '-otxt', '--no_timestamps', 'true', '--no_context', 'true'],
    undefined,
  )
}

async function measureOllamaOnce() {
  const started = performance.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [{ role: 'user', content: 'Say hello in five words.' }],
        temperature: 0.2,
        stream: true,
      }),
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`)
    }
    if (!response.body) throw new Error('response body is empty')

    const decoder = new TextDecoder()
    let buffer = ''
    let firstTokenMs = null

    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true })
      let newline = buffer.indexOf('\n')
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (line.startsWith('data:')) {
          const payload = line.slice(5).trim()
          if (payload !== '[DONE]') {
            try {
              const parsed = JSON.parse(payload)
              const content = parsed?.choices?.[0]?.delta?.content
              if (firstTokenMs === null && typeof content === 'string' && content.length > 0) {
                firstTokenMs = performance.now() - started
              }
            } catch {
              // ignore keep-alive or non-JSON SSE lines
            }
          }
        }
        newline = buffer.indexOf('\n')
      }
    }

    return { firstTokenMs, fullMs: performance.now() - started }
  } finally {
    clearTimeout(timer)
  }
}

async function best(label, fn) {
  let bestMs = Infinity
  for (let run = 0; run < RUNS; run += 1) {
    try {
      const elapsed = await fn()
      if (typeof elapsed === 'number' && Number.isFinite(elapsed) && elapsed >= 0 && elapsed < bestMs) {
        bestMs = elapsed
      }
    } catch (error) {
      warnings.push(`${label}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return Number.isFinite(bestMs) ? round(bestMs) : null
}

async function main() {
  const hasPiperBinary = await exists(PIPER_PATH)
  const hasPiperModel = await exists(PIPER_MODEL_PATH)
  const hasWhisperBinary = await exists(WHISPER_CPP_PATH)
  const hasWhisperModel = await exists(WHISPER_MODEL_PATH)

  if (!hasPiperBinary) missing.push('PIPER_PATH')
  if (!hasPiperModel) missing.push('PIPER_MODEL_PATH')
  if (!hasWhisperBinary) missing.push('WHISPER_CPP_PATH')
  if (!hasWhisperModel) missing.push('WHISPER_MODEL_PATH')

  if (missing.length === 4) {
    process.stdout.write(`${JSON.stringify({ skipped: true, missing })}\n`)
    return
  }

  workDir = await mkdtemp(path.join(tmpdir(), 'dialdesk-voice-baseline-'))

  try {
    const hasPiper = hasPiperBinary && hasPiperModel
    const hasWhisper = hasWhisperBinary && hasWhisperModel

    // Measurement order is intentionally sequential: these binaries compete for CPU.
    const piperFullMs = hasPiper ? await best('piper_full_ms', measurePiperFull) : null
    const piperFirstRawByteMs = hasPiper ? await best('piper_first_raw_byte_ms', measurePiperFirstRawByte) : null
    const whisper3sMs = hasWhisper ? await best('whisper_3s_ms', measureWhisper) : null

    const ollamaFirstTokenMs = await best('ollama_first_token_ms', async () => {
      const { firstTokenMs } = await measureOllamaOnce()
      if (firstTokenMs === null) throw new Error('stream ended without a content delta')
      return firstTokenMs
    })
    const ollamaFullMs = await best('ollama_full_ms', async () => (await measureOllamaOnce()).fullMs)

    const result = {
      measuredAt: new Date().toISOString(),
      platform: `${process.platform} ${process.arch}`,
      node: process.version,
      piperFullMs,
      piperFirstRawByteMs,
      whisper3sMs,
      ollamaFirstTokenMs,
      ollamaFullMs,
      missing,
      warnings: [...new Set(warnings)],
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } finally {
    // maxRetries/retryDelay absorb Windows' brief handle-release window after a kill.
    await rm(workDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error)
  process.exitCode = 1
})
