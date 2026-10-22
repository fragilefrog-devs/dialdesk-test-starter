# Task 07 report — Gateway leaf modules: config, protocol, logger, metrics, app client

## Status: complete

Created the five leaf modules (plus one protocol test). No changes to `voice-gateway/src/index.ts`,
`src/**`, or `supabase/**`; no new dependencies; no commits.

## Files

New:
- `voice-gateway/src/config.ts`
- `voice-gateway/src/protocol.ts`
- `voice-gateway/src/observability/logger.ts`
- `voice-gateway/src/observability/metrics.ts`
- `voice-gateway/src/clients/app-api.ts`
- `voice-gateway/test/config.test.ts`
- `voice-gateway/test/logger.test.ts`
- `voice-gateway/test/metrics.test.ts`
- `voice-gateway/test/app-api.test.ts`
- `voice-gateway/test/protocol.test.ts` (extra — covers the protocol parsers/serializers; not in the brief's file list)

No module reads env at import time; no module calls `process.exit`. Imports use `.js`
specifiers; only dependency between new modules is `clients/app-api.ts` → `../protocol.js`.

## Exported API

### `src/config.ts`

```ts
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

export class ConfigError extends Error {
  constructor(public readonly missing: string[], kind?: ConfigErrorKind)
  // message: `${kind}: ${missing.join(', ')}`, name = 'ConfigError'
}

export function loadConfig(env?: NodeJS.ProcessEnv): GatewayConfig
export const REQUIRED_ENV_KEYS: readonly string[]
```

Defaults: `PORT=8080`, `MAX_CALL_SECONDS=1800`, `PIPER_PATH='piper'`, `WHISPER_CPP_PATH='pwcpp'`.
Required: `APP_URL`, `INTERNAL_API_SECRET`, `PIPER_MODEL_PATH`, `WHISPER_MODEL_PATH`.
Validated: `APP_URL` via `new URL()` then trailing `/` stripped; `PORT` integer 1–65535;
`MAX_CALL_SECONDS` integer 30–7200. Blank/whitespace env values count as absent.

#### How the config error surfaces

`loadConfig` collects every problem, de-duplicates and sorts the offending keys, then throws
one `ConfigError`. `missing` contains both absent and present-but-invalid keys (the brief
keeps the field name). The message prefix is:

- `Missing env: ...` when every offending key was absent/blank (or no key was present-invalid).
- `Invalid env: ...` as soon as at least one offending key was present with a bad value.

Callers detect it with `instanceof ConfigError` and can branch on `.missing` and `.message`;
Task 11's `index.ts` can log then `process.exit(1)` at the composition root, which is the
only place that decision now lives.

### `src/protocol.ts`

Task 07 contract (unchanged shape):

```ts
export type Channel = 'phone' | 'web'
export const PROTOCOL_VERSION = 1
export interface VoiceSessionConfig {
  callId: string
  orgId: string
  channel: Channel
  callSid: string
  greeting: string
  instructions: string
  token: string
  tokenExpiresAt: number // ms since epoch
}
```

Added for the controller's cross-task interface (wire types + parsers/serializers):

```ts
// Twilio inbound
export interface TwilioConnectedMessage
export interface TwilioStartMessage   // { event:'start'; start: { streamSid, customParameters?, mediaFormat?, ... } }
export interface TwilioMediaMessage   // { event:'media'; media:{ payload } }
export interface TwilioMarkMessage
export interface TwilioStopMessage
export type TwilioInboundMessage = ...

// Twilio outbound
export interface TwilioOutboundMediaMessage // { event:'media'; streamSid; media:{payload} }
export interface TwilioClearMessage         // { event:'clear'; streamSid }  ← barge-in
export type TwilioOutboundMessage = ...

// Browser inbound (v1)
export interface BrowserStartMessage  // { v: 1; type:'start'; callId; token }
export interface BrowserAudioMessage  // { type:'audio'; pcm } base64 16 kHz PCM16LE
export interface BrowserStopMessage
export type BrowserInboundMessage = ...

// Browser outbound
export interface BrowserReadyMessage
export interface BrowserTranscriptMessage // { type:'transcript'; role; text; turnId }
export interface BrowserSpeakingMessage   // { type:'speaking'; value; turnId }
export interface BrowserOutboundAudioMessage // { type:'audio'; pcm; sampleRate; turnId }
export interface BrowserInterruptMessage  // { type:'interrupt' }  ← barge-in
export interface BrowserErrorMessage      // { type:'error'; code }
export interface BrowserClosedMessage     // { type:'closed'; code; reason? }
export type BrowserOutboundMessage = ...

export type ProtocolParseError = 'invalid_json' | 'invalid_message' | 'unsupported_protocol_version'
export type ParseResult<T> = { ok: true; message: T } | { ok: false; error: ProtocolParseError }

export function parseTwilioMessage(raw: string): ParseResult<TwilioInboundMessage>
export function parseBrowserMessage(raw: string): ParseResult<BrowserInboundMessage>
export function serializeTwilioMedia(streamSid: string, payloadBase64: string): string
export function serializeTwilioClear(streamSid: string): string
export function serializeBrowserMessage(message: BrowserOutboundMessage): string
```

Parsers never throw; `parseBrowserMessage` reports `unsupported_protocol_version` when a
`start` frame's `v` is missing or not `1`. Task 10 can append session types below these
exports without touching them.

### `src/observability/logger.ts`

```ts
export type LogFields = Record<string, unknown>
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export interface Logger {
  child(bindings: LogFields): Logger
  debug(msg: string, fields?: LogFields): void
  info(msg: string, fields?: LogFields): void
  warn(msg: string, fields?: LogFields): void
  error(msg: string, fields?: LogFields): void
}
export interface LoggerOptions {
  level?: LogLevel
  sink?: (line: string) => void
  now?: () => Date
}
export function createLogger(bindings?: LogFields, opts?: LoggerOptions): Logger
```

Line shape: `{"ts":"<ISO>","level":"info","msg":"...",...bindings,...fields}`. Reserved keys
`ts`, `level`, `msg` are stripped from bindings and fields. `child()` merges (child wins).
Redaction regex `/token|secret|authorization|pcm|transcript/i` applies recursively to plain
objects and arrays, replacing the value with `"[redacted]"`; `Error` values become
`{name,message,stack?}`; cycles become `"[circular]"`; a serialization failure (e.g. BigInt)
emits exactly `{"level":"error","msg":"log_serialize_failed"}`. Default level is `LOG_LEVEL`
read inside `createLogger` (never at import), else `info`. Default sink is `console.log`.
Logger methods never throw.

### `src/observability/metrics.ts`

```ts
export type Labels = Record<string, string | number>
export const DEFAULT_HISTOGRAM_BUCKETS: readonly number[] // [250,500,1000,2000,4000,8000]
export class Metrics {
  constructor(buckets?: Record<string, number[]>)
  inc(name: string, labels?: Labels, value?: number): void
  observe(name: string, ms: number, labels?: Labels): void
  gauge(name: string, value: number, labels?: Labels): void
  render(): string
}
export const metrics: Metrics
```

Pre-registered metric names and types (blocks are only rendered once a series exists):

| Name | Type | Buckets |
| --- | --- | --- |
| `voice_sessions_total` | counter | — |
| `voice_turns_total` | counter | — |
| `voice_errors_total` | counter | — |
| `voice_barge_ins_total` | counter | — |
| `voice_finalize_failures_total` | counter | — |
| `voice_sessions_active` | gauge | — |
| `voice_turn_duration_ms` | histogram | `250,500,1000,2000,4000,8000` |

Labels are caller-supplied (the registry does not constrain them). The labels the plan's
later tasks use on these names: `voice_sessions_total{channel,result}` (Task 10),
`voice_sessions_active{channel}`, `voice_turns_total{result}` and
`voice_errors_total{code}` (Task 12).

Render rules implemented: `# HELP <name> <name>`, `# TYPE <name> <type>`, metric blocks and
series sorted deterministically, histogram `_bucket{le=...}` cumulative + `_sum` + `_count`
with `+Inf` last, `String(n)` formatting, label values escaping `\`, `"` and newlines,
invalid metric names (`^[a-zA-Z_:][a-zA-Z0-9_:]*$`) ignored silently, and `''` for a fresh
registry. `render()` ends with a newline when non-empty.

### `src/clients/app-api.ts`

```ts
export type AppApiErrorCode = 'config_unavailable' | 'llm_failed' | 'finalize_failed' | 'http_error'
export class AppApiError extends Error {
  constructor(public readonly code: AppApiErrorCode, public readonly status?: number)
  // name = 'AppApiError'; message = code, or `${code} (HTTP <status>)`
}
export interface AppApiOptions {
  baseUrl: string
  secret: string
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  timeoutMs?: number          // 10_000
  finalizeTimeoutMs?: number  // 5_000
}
export interface RespondInput { callId; token; userText; history }
export interface FinalizeInput { callId; token; transcript; durationSeconds; endReason }
export class AppApiClient {
  constructor(opts: AppApiOptions)
  getCallConfig(callId: string, token: string): Promise<VoiceSessionConfig>
  respond(input: RespondInput): Promise<{ text: string }>
  finalize(input: FinalizeInput): Promise<{ ok: boolean }>
}
```

Every request sends `content-type: application/json` and `x-internal-secret`. Timeouts use
`AbortSignal.timeout` when available, else `AbortController` + timer cleared in `finally`.
`getCallConfig` builds `?callId=&token=` with `URLSearchParams`; non-2xx → `config_unavailable`
with status. `respond` maps non-2xx or a non-string `text` to `llm_failed`. `finalize` makes
3 attempts with sleeps `[0, 500, 2000]` and a 5 s per-attempt timeout, then throws
`finalize_failed` (with the last HTTP status if any). Tokens and bodies are never logged and
never included in error messages.

## Ambiguities and calls made

1. **`protocol.ts` scope.** The brief's interface section lists only `Channel`,
   `PROTOCOL_VERSION`, `VoiceSessionConfig`, but the task assignment asks for WS message types
   and parsers/serializers including `interrupt`/`clear`. I added those additively and left the
   three required exports exactly as specified. Task 10 can append its session types without
   conflict; Task 11 may use or ignore the parsers.
2. **`ConfigError` prefix with mixed problems.** The brief names only `missing` but wants
   `Invalid env:` when a key was present. I added an optional second constructor argument
   (`kind`, default `'Missing env'`), so `new ConfigError(keys)` still produces the documented
   message. When problems are mixed, the prefix is `Invalid env` (the operator has at least one
   present-but-wrong value to fix).
3. **`VoiceSessionConfig.channel`.** `/api/voice/config` does not return `channel` (Task 03
   response has `session`, `callSid`, `orgId`, `greeting`, `token`, `tokenExpiresAt`). The client
   reads the `channel` claim from the returned (refreshed) v1 token payload, falling back to a
   `body.channel` if one ever appears, then to `'phone'`. No signature change was needed.
4. **Finalize sleep semantics.** The brief says 3 attempts with delays `0/500/2000` and the
   test plan says the first attempt has no delay. I call `sleep(delay)` before every attempt,
   so an injected fake records `[0, 500, 2000]` while the first attempt is effectively immediate.
5. **Empty `render()`.** Because six names are pre-registered at construction, "empty" is
   defined as "no series observed": metrics with zero series are omitted, so a fresh
   `new Metrics().render()` is `''`.
6. **Unknown metric names.** A valid, not-pre-registered name is auto-registered by the method
   used (`inc` → counter, `gauge` → gauge, `observe` → histogram; unknown histograms use
   `DEFAULT_HISTOGRAM_BUCKETS`). Using an existing name with a different type is ignored
   silently rather than corrupting the exposition.
7. **`http_error`** is exported because the brief's union includes it, but no specified method
   path maps to it; the three endpoints map to their dedicated codes.
8. **`finalize` 2xx with an unparsable body** returns `{ ok: true }` unless the body explicitly
   says `ok: false`; a 2xx is treated as a delivered finalize.
9. **Extra test file.** `test/protocol.test.ts` covers the added parsers/serializers; the
   brief's test plan did not list protocol tests, but untested parsers would be a gap.

## Gates (actual output)

Commands were invoked through a Node → `npm.cmd` wrapper because the sandbox denies bare
`npm` invocations.

### `npm test --prefix voice-gateway`

```
> voice-gateway@1.0.0 test
> vitest run

 RUN  v2.1.9 H:/ai-voice-receptionist-saas/starter/voice-gateway

 ✓ test/protocol.test.ts (16 tests) 29ms
 ✓ test/audio-resample.test.ts (8 tests) 80ms
 ✓ test/metrics.test.ts (12 tests) 33ms
 ✓ test/config.test.ts (19 tests) 40ms
 ✓ test/logger.test.ts (12 tests) 73ms
 ✓ test/audio-vad.test.ts (7 tests) 62ms
 ✓ test/app-api.test.ts (15 tests) 349ms
 ✓ test/smoke.test.ts (1 test) 5ms
 ✓ test/audio-frames.test.ts (8 tests) 16ms
 ✓ test/audio-mulaw.test.ts (7 tests) 40ms
 ✓ test/audio-pacer.test.ts (5 tests) 36ms

 Test Files  11 passed (11)
      Tests  110 passed (110)
   Start at  23:10:36
   Duration  11.82s
```

(Task 07 adds 74 of those tests: config 19, protocol 16, logger 12, metrics 12, app-api 15.
The `audio-*` files belong to other tasks already in the tree.)

### `npm run type-check --prefix voice-gateway`

```
> voice-gateway@1.0.0 type-check
> tsc --noEmit -p .
```

(exit 0, no diagnostics)

### `npm run build --prefix voice-gateway`

```
> voice-gateway@1.0.0 build
> tsc -p .
```

(exit 0, no diagnostics)

## Acceptance checklist

- [x] Four modules (plus protocol additions) compile under NodeNext with `.js` specifiers; no `any` exports.
- [x] No `process.exit`, no import-time env reads (config and `LOG_LEVEL` are read on call).
- [x] Logger emits single-line JSON and redacts the listed keys recursively.
- [x] Metrics render valid Prometheus text with deterministic ordering.
- [x] Finalize retries exactly 3 attempts and never leaks secret/token in errors.
- [x] `voice-gateway/src/index.ts` untouched by this task.

## Left open

- `AppApiClient` derives `channel` from the token; if Task 11 would rather pass the channel
  explicitly, an optional third `channel` argument to `getCallConfig` would be an additive
  change.
- The protocol parsers are available but not yet used by transports (Task 11 may reuse them or
  parse inline as its brief describes).
