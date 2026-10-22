# Task 09b — Warm Piper worker pool (primary TTS path)

## Goal
Keep the Piper voice loaded inside long-lived worker processes so TTS stops paying a
~5.3 s ONNX model load per utterance, and stream PCM chunks out of the warm voice.

## Context you need
Measured on this machine (see `docs/VOICE_BASELINE.md` and Task 01 report):

| Stage | Cost |
|---|---|
| `piper` CLI, full WAV, warm OS cache | 5689–6359 ms |
| `piper --output-raw` first byte | 5286 ms |
| python import (`import piper`) | 429 ms |
| **`PiperVoice.load(model)`** | **5334 ms** |
| `voice.synthesize(text)` with a loaded voice | **202–266 ms** per ~2.5 s sentence |

Conclusion: per-process startup is the entire latency problem. Streaming the CLI buys
~573 ms; a prewarmed voice saves ~5.1 s per utterance.

Task 09 defines `TtsProvider`, `TtsSynthesis`, `SpeechError`, `spawnStream`/`runBuffered`
and the CLI `--output-raw` provider. This task adds a warm pool **behind the same
interface**, with the CLI provider as fallback. Read
`.work/voice-upgrade/briefs/09-speech-providers.md` and `07-gateway-config-observability.md`
before starting.

## Files to create/modify
- `voice-gateway/piper/worker.py` (new)
- `voice-gateway/src/speech/piper-pool.ts` (new)
- `voice-gateway/src/speech/tts.ts` (modify: add `createTtsProviderWithFallback`)
- `voice-gateway/test/piper-pool.test.ts` (new)
- `voice-gateway/test/fixtures/fake-piper-worker.mjs` (new)
- `voice-gateway/test/piper-worker-real.test.ts` (new, env-gated)

Do not touch `voice-gateway/src/index.ts`, transports, sessions, or the app package.
Do not modify `local-speech.ts`. Do not add npm dependencies.

## Interface / contract

### Worker wire protocol v1 (binary, stdin/stdout, little-endian)

Startup, stdout, exactly one line then frames:
```json
{"v":1,"ready":true,"sampleRate":22050,"channels":1,"sampleWidth":2}
```
On load failure: `{"v":1,"ready":false,"error":"<message>"}` on stdout, then exit 1.

Requests (stdin): `uint32le headerLen` + UTF-8 JSON `{"id":<uint32>,"text":"<string>"}`.

Responses (stdout), per request, in request order:
- data frame: `uint32le frameLen` + `int32le requestId` + PCM16LE bytes, where
  `frameLen = 4 + pcmBytes`.
- end frame: `uint32le 4` + `int32le requestId`, no PCM.
- `frameLen` must never exceed `1_048_576`. If a chunk would exceed it, split.

Rules:
- All diagnostics go to **stderr only**; stdout carries protocol bytes only.
- Text is sanitized with `text.replace(/[\r\n]+/g, ' ')`. Empty/whitespace text emits a
  start frame immediately followed by an end frame, without invoking the model.
- Single-request-at-a-time: do not read the next header until the current request's end
  frame is written.
- Use `PiperVoice.load(model_path)` once, then
  `voice.synthesize(text)`; each chunk exposes `audio_int16_bytes` and `sample_rate`.
  Write `sampleRate` from the first chunk (fall back to `voice.config.sample_rate`).
- Worker accepts `--model <path>`; optional `--data-dir`.
- Flush stdout after each frame (`sys.stdout.buffer.flush()`).

### `src/speech/piper-pool.ts`

```ts
export interface PiperPoolOptions {
  pythonPath: string          // PIPER_PYTHON_PATH ?? 'python'
  workerScript: string        // absolute path to voice-gateway/piper/worker.py
  modelPath: string           // PIPER_MODEL_PATH
  workers?: number            // PIPER_WORKER_COUNT ?? 2
  readyTimeoutMs?: number     // 15_000
  acquireTimeoutMs?: number   // 5_000
  spawnImpl?: SpawnFn         // from speech/process.ts (Task 09)
  logger?: Logger             // from observability/logger.ts (Task 07)
}

export interface PiperPoolHealth { workers: number; ready: number; degraded: boolean }

export interface PiperPool {
  readonly sampleRate: number
  synthesize(text: string, opts?: { signal?: AbortSignal }): AsyncIterable<Buffer>
  healthy(): PiperPoolHealth
  close(): Promise<void>
}

export async function createPiperPool(o: PiperPoolOptions): Promise<PiperPool>
```

Behavior:
- Spawn `workers` children as
  `pythonPath workerScript --model modelPath` with `windowsHide: true`,
  `stdio: ['pipe','pipe','pipe']`.
- Wait for each ready line up to `readyTimeoutMs`. `sampleRate` = first ready line's
  value; all workers must agree — if they disagree, treat the pool as degraded.
- **Never throw from `createPiperPool` because zero workers became ready.** Resolve a
  degraded pool whose `synthesize()` throws `SpeechError('config_unavailable')`, so the
  caller can fall back to the CLI provider.
- `synthesize` acquires an idle ready worker FIFO. Timeout → `SpeechError('tts_failed',
  'tts_busy')`. Writes the request header, then yields PCM buffers in frame order until
  the end frame, then releases the worker.
- **Cancellation (barge-in): do not kill the worker.** On `signal` abort or consumer
  `return`, mark the worker `draining`, keep consuming and discarding frames until the
  end frame, then return it to the pool. A sentence finishes in ~250 ms, so killing
  would cost a 5.3 s reload. Put this reasoning in a comment.
- Validate every frame: `frameLen` in `[4, 1_048_576]`, `requestId` matches, PCM length
  even. Violation → reject `SpeechError('tts_failed','protocol')`, recycle that worker.
- Worker exit → reject in-flight request with `SpeechError('tts_failed','worker_exit')`;
  respawn with backoff `250/500/1000 ms`; after 3 consecutive failures mark `degraded`
  and stop respawning.
- `close()`: `stdin.end()`, `SIGTERM`, `SIGKILL` after 1000 ms; resolve when all exit or
  after 3000 ms.
- Log one structured event per state change: `worker_ready`, `worker_exit`,
  `worker_respawn`, `pool_degraded`, `worker_draining`. Log text **length only**, never
  the text or transcript.

### `src/speech/tts.ts` addition

```ts
export interface TtsFactoryOptions extends TtsOptions {
  pythonPath?: string        // PIPER_PYTHON_PATH
  workerScript?: string      // default: <gateway root>/piper/worker.py
  workerEnabled?: boolean    // PIPER_WORKER_ENABLED !== 'false'
  logger?: Logger
}
export async function createTtsProviderWithFallback(
  o: TtsFactoryOptions,
): Promise<TtsProvider & { mode: 'worker' | 'cli' }>
```
- Use the pool when `workerEnabled` is true, `pythonPath` is set, `modelPath` is set, and
  `workerScript` exists on disk and `healthy().ready > 0`.
- Otherwise return the Task 09 CLI provider with `mode: 'cli'`.
- On pool construction failure or `degraded`, log once and fall back; do not throw.
- Returned object must satisfy `TtsProvider` so Task 11 consumes it unchanged.

## Exact values
- `PIPER_WORKER_COUNT` default `2`; ready timeout `15_000 ms`; acquire timeout `5_000 ms`.
- Max frame `1_048_576` bytes; respawn backoff `250/500/1000 ms`; max 3 consecutive
  failures; kill escalation `1_000 ms`; close deadline `3_000 ms`.
- Protocol version literal `1`; ready keys `v, ready, sampleRate, channels, sampleWidth`.

## Test plan
`test/fixtures/fake-piper-worker.mjs`: Node script implementing the protocol. Reads
`--model`, writes a ready line with sampleRate 22050, echoes one PCM frame per request
(16 bytes of `0x01`) plus an end frame, supports `--crash-after <n>`,
`--never-ready`, `--bad-id`, and `--odd-frame` modes via argv.

`test/piper-pool.test.ts`:
1. `createPiperPool` with 2 fake workers → `sampleRate === 22050`, `healthy()` `{workers:2,ready:2,degraded:false}`.
2. One request yields exactly the fake PCM bytes.
3. Two concurrent requests get distinct ids and no crossover.
4. Abort mid-stream: consumer stops, second request then succeeds on the same pool, and the fake worker process was not killed (assert `exit` not emitted / still responsive).
5. `--crash-after 1`: in-flight rejects `tts_failed`, pool respawns, `healthy().ready` returns to 2.
6. `--never-ready` → degraded pool, `synthesize` throws `config_unavailable`, construction did not throw.
7. `--bad-id` and `--odd-frame` → `tts_failed` and worker recycled.
8. `close()` resolves within 3 s and all children exit.
9. Empty text: no request written, no PCM yielded.
10. `createTtsProviderWithFallback` returns `mode: 'cli'` when `workerEnabled: false` and `mode: 'worker'` when a fake worker is supplied.

`test/piper-worker-real.test.ts` (skip unless `RUN_SPEECH_BINARIES === '1'` and
`PIPER_MODEL_PATH` set): spawn the real `worker.py` with `PIPER_PYTHON_PATH ?? 'python'`,
assert ready `sampleRate === 22050`, synthesize `"Thanks for calling."`, assert the first
chunk arrives **< 1500 ms after the ready line**, total PCM even-length and > 0.

Run exactly:
```bash
npm test --prefix voice-gateway
npm run type-check --prefix voice-gateway
npm run build --prefix voice-gateway
```
Optionally, to prove the real path on this machine:
```bash
RUN_SPEECH_BINARIES=1 PIPER_MODEL_PATH=<model> npm test --prefix voice-gateway
```

## Acceptance criteria
- [ ] Warm pool returns first PCM in < 1500 ms after ready on this machine (real test).
- [ ] No dependency added; `worker.py` uses only stdlib + installed `piper`.
- [ ] `TtsProvider` contract unchanged; Task 11 can consume `createTtsProviderWithFallback`.
- [ ] Abort/consumer-return leaves the pool usable without a 5.3 s reload.
- [ ] Zero ready workers never throws at construction and never hangs a call.
- [ ] No spoken text or transcript appears in logs or in error messages.
- [ ] `voice-gateway/dist/` does not contain `piper/worker.py` (Python file is not compiled).

## Out of scope
- Auto-installing Python or the `piper` package; host prerequisites are documented in Task 14.
- Warm Whisper STT (separate follow-up; document only).
- Multi-voice or per-agent voice selection.
- Cross-instance worker sharing.

## Report path
`.work/voice-upgrade/reports/09b-warm-piper-pool.md`
