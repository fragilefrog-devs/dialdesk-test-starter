# Task 07 — Gateway leaf modules: config, protocol types, logger, metrics, app client

## Goal
Add the four dependency-free gateway modules that everything else will import, with
tested behavior and no wiring changes to `src/index.ts`.

## Context you need
- The gateway is ESM + NodeNext (`voice-gateway/tsconfig.json`), Node 20, `ws` only.
  Imports between gateway files must use `.js` specifiers.
- Today `voice-gateway/src/index.ts:5-17` reads env with `required()` and calls
  `process.exit(1)`. New code must not exit the process; it must throw a typed error.
- App routes used by the gateway: `GET /api/voice/config?callId&token`,
  `POST /api/voice/respond`, `POST /api/voice/finalize`; all require
  `x-internal-secret` and a v1 token (Task 03).
- `/api/voice/config` returns `{ session: { instructions }, callSid, orgId, greeting,
  token, tokenExpiresAt }` after Task 03.
- Observability decision D11: JSON logs to stdout, Prometheus text from memory, no APM.
- Task 10 appends session state/event types to `protocol.ts`; Task 12 extends
  `app-api.ts` with streaming. Leave clean extension points, do not pre-build them.

## Files to create/modify
- `voice-gateway/src/config.ts` (new)
- `voice-gateway/src/protocol.ts` (new; Task 10 appends to it)
- `voice-gateway/src/observability/logger.ts` (new)
- `voice-gateway/src/observability/metrics.ts` (new)
- `voice-gateway/src/clients/app-api.ts` (new)
- `voice-gateway/test/config.test.ts` (new)
- `voice-gateway/test/logger.test.ts` (new)
- `voice-gateway/test/metrics.test.ts` (new)
- `voice-gateway/test/app-api.test.ts` (new)

No changes to `src/index.ts`, `src/local-speech.ts`, or the app package.

## Interface / contract

`src/protocol.ts` (Task 07 portion):
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

`src/config.ts`:
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
export class ConfigError extends Error {
  constructor(public readonly missing: string[]) // message: `Missing env: ${missing.join(', ')}`
}
export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig
```
Defaults: `PORT=8080`, `MAX_CALL_SECONDS=1800`, `PIPER_PATH='piper'`,
`WHISPER_CPP_PATH='pwcpp'`. Required: `APP_URL`, `INTERNAL_API_SECRET`,
`PIPER_MODEL_PATH`, `WHISPER_MODEL_PATH`. Validate `APP_URL` via `new URL()`, strip a
trailing `/`; `PORT` integer 1–65535; `MAX_CALL_SECONDS` integer 30–7200. Invalid values
throw `ConfigError` with the offending key in `missing` (the field is named `missing` for
both absent and invalid; message prefix is `Invalid env:` when a key was present).
Collect **all** problems before throwing, sorted alphabetically.

`src/observability/logger.ts`:
```ts
export type LogFields = Record<string, unknown>
export interface Logger {
  child(bindings: LogFields): Logger
  debug(msg: string, fields?: LogFields): void
  info(msg: string, fields?: LogFields): void
  warn(msg: string, fields?: LogFields): void
  error(msg: string, fields?: LogFields): void
}
export function createLogger(bindings: LogFields = {}, opts?: {
  level?: 'debug' | 'info' | 'warn' | 'error'
  sink?: (line: string) => void
  now?: () => Date
}): Logger
```
Line shape: `{"ts":"<ISO>","level":"info","msg":"...",...bindings,...fields}` with
bindings never overriding `ts/level/msg`. `child()` merges bindings. Redaction: any key
matching `/token|secret|authorization|pcm|transcript/i` is replaced with `'[redacted]'`,
recursively for plain objects/arrays; `Error` values become `{name,message,stack?}`.
Serialization failures fall back to `{"level":"error","msg":"log_serialize_failed"}`.
Default level from `LOG_LEVEL`, else `info`. Default sink `console.log`.

`src/observability/metrics.ts`:
```ts
export type Labels = Record<string, string | number>
export class Metrics {
  inc(name: string, labels?: Labels, value?: number): void
  observe(name: string, ms: number, labels?: Labels): void
  gauge(name: string, value: number, labels?: Labels): void
  render(): string
}
export const metrics = new Metrics()
```
Histogram buckets are fixed per metric name; register via constructor constant:
`voice_turn_duration_ms` → `[250,500,1000,2000,4000,8000]`.
Pre-registered names/types: counters `voice_sessions_total`, `voice_turns_total`,
`voice_errors_total`, `voice_barge_ins_total`, `voice_finalize_failures_total`; gauge
`voice_sessions_active`; histogram `voice_turn_duration_ms`.
Render rules: `# HELP <name> <name>`, `# TYPE <name> counter|gauge|histogram`, series
sorted by rendered label string, `_bucket{le="..."}` + `_sum` + `_count` for histograms,
`+Inf` bucket last. Values use `String(n)` (no exponent for integers < 1e21). Names must
match `^[a-zA-Z_:][a-zA-Z0-9_:]*$`; invalid names are ignored silently. Label values
escape `\` `"` and newlines. Empty `render()` returns `''`.

`src/clients/app-api.ts`:
```ts
export type AppApiErrorCode = 'config_unavailable' | 'llm_failed' | 'finalize_failed' | 'http_error'
export class AppApiError extends Error {
  constructor(public readonly code: AppApiErrorCode, public readonly status?: number)
}
export interface AppApiOptions {
  baseUrl: string
  secret: string
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  timeoutMs?: number       // default 10_000
  finalizeTimeoutMs?: number // default 5_000
}
export class AppApiClient {
  constructor(opts: AppApiOptions)
  getCallConfig(callId: string, token: string): Promise<VoiceSessionConfig>
  respond(input: { callId: string; token: string; userText: string;
    history: { role: 'user' | 'assistant'; content: string }[] }): Promise<{ text: string }>
  finalize(input: { callId: string; token: string;
    transcript: { role: 'caller' | 'agent'; text: string }[];
    durationSeconds: number; endReason: string }): Promise<{ ok: boolean }>
}
```
Behavior: `getCallConfig` appends `?callId=&token=` via `URLSearchParams`, maps a
non-2xx to `config_unavailable` with status. `respond` maps non-2xx/missing `text` to
`llm_failed`. `finalize` retries 3 attempts total with delays `0/500/2000` and a 5 s
per-attempt timeout, then throws `finalize_failed`. Every request sends
`content-type: application/json` and `x-internal-secret`. Timeouts use
`AbortSignal.timeout` when available, else `AbortController` + timer (clear the timer).
Never log tokens or bodies.

## Exact values
- Required env: `APP_URL`, `INTERNAL_API_SECRET`, `PIPER_MODEL_PATH`,
  `WHISPER_MODEL_PATH`.
- `PORT` 1–65535 default 8080; `MAX_CALL_SECONDS` 30–7200 default 1800.
- Log levels `debug|info|warn|error`; default `info`; redaction regex as above.
- Histogram buckets `[250,500,1000,2000,4000,8000]`.
- Retry delays `[0,500,2000]`; timeouts 10 000 ms generic, 5 000 ms finalize.

## Test plan
`config.test.ts`: valid minimal env returns typed config with defaults; trailing slash
stripped; missing keys are all reported sorted; invalid `PORT`/`MAX_CALL_SECONDS`/`APP_URL`
throw `ConfigError`; no `process.exit` (spy) is called.

`logger.test.ts`: emit levels; below-threshold suppressed; `child` merging; injected sink
captures one JSON line per call; redacts `token`, `secret`, `pcm`, `transcript`,
`authorization` at top level and nested; Error serialized; circular object does not throw.

`metrics.test.ts`: counter increments accumulate; gauge replaces; histogram emits
cumulative `_bucket` values with `+Inf` equal to count, plus `_sum`/`_count`; label
escaping; invalid metric names ignored; deterministic sorted output.

`app-api.test.ts` (fake `fetchImpl` returning `Response`): config URL/headers/parse;
respond happy/`llm_failed`; finalize succeeds after 2 failures in 3 attempts; finalize
throws `finalize_failed` after 3; injected `sleep` records `[0,500,2000]` semantics (the
first attempt has no delay); timeout path maps to the right code using a fetch that
respects `signal`.

Run exactly:
```bash
npm test --prefix voice-gateway
npm run type-check --prefix voice-gateway
```

## Acceptance criteria
- [ ] All four modules compile under NodeNext with `.js` specifiers and no `any` exports.
- [ ] No module calls `process.exit` or reads env at import time.
- [ ] Logger output is single-line JSON and redacts the listed keys recursively.
- [ ] Metrics render valid Prometheus text with deterministic ordering.
- [ ] App client retries finalize exactly 3 times and never leaks the secret/token.
- [ ] `src/index.ts` is untouched.

## Out of scope
- Wiring these modules into `index.ts` (Task 11).
- Streaming LLM response parsing (Task 12).
- Session limits/admission (Task 10).
- OpenTelemetry or external log shipping.

## Report path
`.work/voice-upgrade/reports/07-gateway-config-observability.md`
