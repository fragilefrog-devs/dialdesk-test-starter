/**
 * Gateway configuration.
 *
 * Nothing here reads `process.env` at import time — call `loadConfig()` once during
 * startup. Invalid or absent values throw a `ConfigError` instead of exiting the
 * process so callers (and tests) decide what to do.
 */

export type GatewayConfig = {
  appUrl: string
  internalSecret: string
  port: number
  maxCallSeconds: number
  piperPath: string
  piperModelPath: string
  whisperPath: string
  whisperModelPath: string
}

export type ConfigErrorKind = 'Missing env' | 'Invalid env'

/**
 * Thrown when one or more environment variables are absent or malformed.
 *
 * `missing` contains every offending key (sorted) whether it was absent or present
 * but invalid. The message prefix is `Invalid env` when at least one key was present
 * with a bad value, otherwise `Missing env`.
 */
export class ConfigError extends Error {
  constructor(
    public readonly missing: string[],
    kind: ConfigErrorKind = 'Missing env',
  ) {
    super(`${kind}: ${missing.join(', ')}`)
    this.name = 'ConfigError'
  }
}

const REQUIRED = ['APP_URL', 'INTERNAL_API_SECRET', 'PIPER_MODEL_PATH', 'WHISPER_MODEL_PATH'] as const

const DEFAULTS = {
  PORT: 8080,
  MAX_CALL_SECONDS: 1800,
  PIPER_PATH: 'piper',
  WHISPER_CPP_PATH: 'pwcpp',
} as const

/** Returns a trimmed value, or `undefined` when the key is absent/blank. */
function present(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const raw = env[key]
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  return trimmed === '' ? undefined : trimmed
}

function parseInteger(raw: string): number | undefined {
  if (!/^[+-]?\d+$/.test(raw)) return undefined
  const value = Number(raw)
  return Number.isSafeInteger(value) ? value : undefined
}

/**
 * Loads and validates the gateway configuration.
 *
 * Collects every problem before throwing (sorted alphabetically) so an operator can
 * fix the deployment in one pass.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const problems: string[] = []
  let sawInvalid = false

  const markInvalid = (key: string) => {
    problems.push(key)
    sawInvalid = true
  }
  const markMissing = (key: string) => problems.push(key)

  const rawAppUrl = present(env, 'APP_URL')
  let appUrl = ''
  if (!rawAppUrl) {
    markMissing('APP_URL')
  } else {
    try {
      // Validation only — the configured origin (with any path prefix) is kept as-is.
      new URL(rawAppUrl)
      appUrl = rawAppUrl.replace(/\/+$/, '')
    } catch {
      markInvalid('APP_URL')
    }
  }

  const internalSecret = present(env, 'INTERNAL_API_SECRET')
  if (!internalSecret) markMissing('INTERNAL_API_SECRET')

  const piperModelPath = present(env, 'PIPER_MODEL_PATH')
  if (!piperModelPath) markMissing('PIPER_MODEL_PATH')

  const whisperModelPath = present(env, 'WHISPER_MODEL_PATH')
  if (!whisperModelPath) markMissing('WHISPER_MODEL_PATH')

  let port: number = DEFAULTS.PORT
  const rawPort = present(env, 'PORT')
  if (rawPort !== undefined) {
    const parsed = parseInteger(rawPort)
    if (parsed === undefined || parsed < 1 || parsed > 65535) markInvalid('PORT')
    else port = parsed
  }

  let maxCallSeconds: number = DEFAULTS.MAX_CALL_SECONDS
  const rawMaxCallSeconds = present(env, 'MAX_CALL_SECONDS')
  if (rawMaxCallSeconds !== undefined) {
    const parsed = parseInteger(rawMaxCallSeconds)
    if (parsed === undefined || parsed < 30 || parsed > 7200) markInvalid('MAX_CALL_SECONDS')
    else maxCallSeconds = parsed
  }

  const piperPath = present(env, 'PIPER_PATH') ?? DEFAULTS.PIPER_PATH
  const whisperPath = present(env, 'WHISPER_CPP_PATH') ?? DEFAULTS.WHISPER_CPP_PATH

  if (problems.length > 0) {
    const sorted = [...new Set(problems)].sort()
    throw new ConfigError(sorted, sawInvalid ? 'Invalid env' : 'Missing env')
  }

  return {
    appUrl,
    internalSecret: internalSecret as string,
    port,
    maxCallSeconds,
    piperPath,
    piperModelPath: piperModelPath as string,
    whisperPath,
    whisperModelPath: whisperModelPath as string,
  }
}

/** The keys that must be provided by the deployment. Exported for operators/tests. */
export const REQUIRED_ENV_KEYS: readonly string[] = REQUIRED
