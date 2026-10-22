import { describe, it, expect, vi } from 'vitest'
import { ConfigError, loadConfig } from '../src/config.js'

const VALID = {
  APP_URL: 'https://app.example.com',
  INTERNAL_API_SECRET: 's'.repeat(32),
  PIPER_MODEL_PATH: '/models/piper.onnx',
  WHISPER_MODEL_PATH: '/models/ggml-base.en.bin',
} as const

function capture(env: NodeJS.ProcessEnv): ConfigError {
  try {
    loadConfig(env)
  } catch (error) {
    if (error instanceof ConfigError) return error
    throw error
  }
  throw new Error('expected loadConfig to throw ConfigError')
}

describe('loadConfig', () => {
  it('returns a typed config with documented defaults', () => {
    const config = loadConfig({ ...VALID })

    expect(config).toEqual({
      appUrl: 'https://app.example.com',
      internalSecret: 's'.repeat(32),
      port: 8080,
      maxCallSeconds: 1800,
      piperPath: 'piper',
      piperModelPath: '/models/piper.onnx',
      whisperPath: 'pwcpp',
      whisperModelPath: '/models/ggml-base.en.bin',
    })
  })

  it('honours optional overrides', () => {
    const config = loadConfig({
      ...VALID,
      PORT: '3000',
      MAX_CALL_SECONDS: '60',
      PIPER_PATH: '/opt/piper',
      WHISPER_CPP_PATH: '/opt/whisper',
    })

    expect(config.port).toBe(3000)
    expect(config.maxCallSeconds).toBe(60)
    expect(config.piperPath).toBe('/opt/piper')
    expect(config.whisperPath).toBe('/opt/whisper')
  })

  it('accepts the inclusive boundaries for PORT and MAX_CALL_SECONDS', () => {
    expect(loadConfig({ ...VALID, PORT: '1' }).port).toBe(1)
    expect(loadConfig({ ...VALID, PORT: '65535' }).port).toBe(65535)
    expect(loadConfig({ ...VALID, MAX_CALL_SECONDS: '30' }).maxCallSeconds).toBe(30)
    expect(loadConfig({ ...VALID, MAX_CALL_SECONDS: '7200' }).maxCallSeconds).toBe(7200)
  })

  it('strips trailing slashes from APP_URL', () => {
    expect(loadConfig({ ...VALID, APP_URL: 'https://app.example.com/' }).appUrl)
      .toBe('https://app.example.com')
    expect(loadConfig({ ...VALID, APP_URL: 'https://app.example.com/base///' }).appUrl)
      .toBe('https://app.example.com/base')
  })

  it('reports every missing key sorted alphabetically', () => {
    const error = capture({})

    expect(error).toBeInstanceOf(ConfigError)
    expect(error.name).toBe('ConfigError')
    expect(error.missing).toEqual([
      'APP_URL',
      'INTERNAL_API_SECRET',
      'PIPER_MODEL_PATH',
      'WHISPER_MODEL_PATH',
    ])
    expect(error.message).toBe(
      'Missing env: APP_URL, INTERNAL_API_SECRET, PIPER_MODEL_PATH, WHISPER_MODEL_PATH',
    )
  })

  it('treats blank required values as missing', () => {
    const error = capture({ ...VALID, APP_URL: '   ' })
    expect(error.missing).toEqual(['APP_URL'])
    expect(error.message).toBe('Missing env: APP_URL')
  })

  it('rejects an APP_URL that is not a URL', () => {
    const error = capture({ ...VALID, APP_URL: 'not a url' })

    expect(error.missing).toEqual(['APP_URL'])
    expect(error.message).toBe('Invalid env: APP_URL')
  })

  it.each(['0', '65536', 'abc', '1.5', '-1'])('rejects PORT=%s', (port) => {
    const error = capture({ ...VALID, PORT: port })

    expect(error.missing).toEqual(['PORT'])
    expect(error.message).toBe('Invalid env: PORT')
  })

  it('treats blank optional values as unset', () => {
    const config = loadConfig({ ...VALID, PORT: ' ', MAX_CALL_SECONDS: '', PIPER_PATH: ' ' })
    expect(config.port).toBe(8080)
    expect(config.maxCallSeconds).toBe(1800)
    expect(config.piperPath).toBe('piper')
  })

  it.each(['29', '7201', 'abc', '1.5'])('rejects MAX_CALL_SECONDS=%s', (seconds) => {
    const error = capture({ ...VALID, MAX_CALL_SECONDS: seconds })

    expect(error.missing).toEqual(['MAX_CALL_SECONDS'])
    expect(error.message).toBe('Invalid env: MAX_CALL_SECONDS')
  })

  it('collects missing and invalid keys together, sorted', () => {
    const error = capture({ APP_URL: 'nope', PORT: '0' })

    expect(error.missing).toEqual([
      'APP_URL',
      'INTERNAL_API_SECRET',
      'PIPER_MODEL_PATH',
      'PORT',
      'WHISPER_MODEL_PATH',
    ])
    expect(error.message.startsWith('Invalid env: ')).toBe(true)
  })

  it('never calls process.exit', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit must not be called')
    }) as never)

    expect(() => loadConfig({ ...VALID })).not.toThrow()
    capture({})

    expect(exit).not.toHaveBeenCalled()
  })
})
