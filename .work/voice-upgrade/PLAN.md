# Voice runtime upgrade — implementation plan (Phases 0–3)

Scope: Phases 0–3 only. Phases 4–7 are out of scope; the only Phase-4 artifact pulled
forward is the shared session contract, defined in Task 10 because the Phase-2 module
split consumes it.

Ground truth: `.work/voice-upgrade/LEDGER.md` and the controller's scout facts
(2026-10-22). Briefs cite `file:line` where a fact matters.

## Global constraints (binding on every task)

1. **Stay shippable.** No task may leave the gateway unable to complete a call. Refactors
   must be behavior-identical and prove it with tests written in the same task.
2. **Runtime.** Node.js only (D1). App: Next.js 16, TypeScript strict. Gateway: ESM,
   NodeNext, Node 20. No Python, no Pipecat.
3. **Tests.** Vitest only, devDependency only, in both packages (D2). Must run on Windows
   (win32, bash available) and must not require Twilio, Stripe, Resend, or live Supabase.
   Use a fake app server, fake providers, and injected binaries.
4. **Audio invariants.** Twilio in = 8 kHz mu-law mono, 20 ms = **160 bytes**. Internal =
   16 kHz PCM16LE mono. Twilio out = **160-byte** mu-law frames paced **20 ms**. Browser
   in = base64 16 kHz PCM16LE. Browser out = base64 PCM16LE at the **provider's declared
   sampleRate** (Piper model rate read at runtime, never hardcoded).
5. **Tenant isolation.** Every DB access scoped by `org_id`. The app verifies the call
   token; the gateway never verifies independently (D8). Model output is untrusted; only
   `src/ai/tools.ts` allow-listed tools run.
6. **SQL additive only.** No `drop column`, no type changes, no `CHECK` on `calls.status`
   (live rows hold `in-progress`/`no-answer`). New columns nullable/defaulted. Migration
   is re-runnable (D10).
7. **No secrets/PII in logs.** Redact `token`, `pcm`, `transcript`, `secret`,
   `authorization`, `x-internal-secret`. Metrics labels only.
8. **No invented features.** No SMS, outbound calling, analytics dashboards, external APM.
   Observability = JSON logs + in-process Prometheus text (D11).
9. **Contracts pinned twice.** Any interface one task produces and another consumes is
   written verbatim in both briefs.
10. **Existing gates stay green:** `npm run type-check`, `npx eslint src`,
    `npm run type-check --prefix voice-gateway`, `npm run build --prefix voice-gateway`,
    `npm run build`. Do not "fix" them.
11. New env vars documented in `.env.example` and the README table by Task 14.
12. `calls.transcript` stays the JSONB column. No transcript table.

## Task table

| # | Task | Owner | Files owned (primary) | Blocked by | Group |
|---|------|-------|------------------------|------------|-------|
| 1 | Test foundation (Vitest app+gateway, CI, baseline probe + `docs/VOICE_BASELINE.md`) | infra | `package.json`, `voice-gateway/package.json`, `vitest.config.ts`, `voice-gateway/vitest.config.ts`, `src/test/smoke.test.ts`, `voice-gateway/test/smoke.test.ts`, `scripts/voice-baseline.mjs`, `docs/VOICE_BASELINE.md`, `.github/workflows/ci.yml` | — | P0 |
| 2 | Env scoping: `internal-auth` + scoped accessors for webhooks/Twilio; tests | wired | `src/lib/internal-auth.ts`, `src/lib/env.ts`, `src/lib/twilio.ts`, `src/app/api/webhooks/twilio/{voice,status}/route.ts`, `src/test/internal-auth.test.ts`, `src/test/voice-config-route.test.ts` | 1 | P1 |
| 3 | Versioned expiring call token `v1.*` + all sign/verify sites + config token refresh | wired | `src/lib/token.ts`, `src/app/api/webhooks/twilio/voice/route.ts`, `src/app/api/realtime/session/route.ts`, `src/app/api/voice/{config,respond,finalize}/route.ts`, `src/test/token.test.ts` | 2 | P2 |
| 4 | Additive SQL: `calls.finalized_at/finalize_attempts/end_reason` + idempotent `finalize_call` RPC | datasmith | `supabase/migrations/20261022_voice_finalization.sql`, `supabase/schema.sql`, `src/test/sql-voice-upgrade.test.ts` | 1 | P1 |
| 5 | Call lifecycle: canonical status mapping, status webhook, idempotent finalize route | wired | `src/lib/calls/status.ts`, `src/lib/voice/session.ts`, `src/app/api/webhooks/twilio/status/route.ts`, `src/app/api/voice/finalize/route.ts`, `src/test/call-status.test.ts`, `src/test/finalize.test.ts`, `src/test/finalize-route.test.ts` | 2, 3, 4 | P3 |
| 6 | Synthetic-audio integration harness against today's gateway (fake app + fake speech, real WS) | infra | `voice-gateway/src/index.ts` (export + listen guard only), `voice-gateway/test/harness/{audio,fake-app,gateway}.ts`, `voice-gateway/test/integration/current-flow.test.ts` | 1 | P1 |
| 7 | Gateway leaf modules: `config.ts`, `observability/{logger,metrics}.ts`, `clients/app-api.ts` (+ retry), `protocol.ts` config types | api-developer | `voice-gateway/src/config.ts`, `voice-gateway/src/protocol.ts`, `voice-gateway/src/observability/{logger,metrics}.ts`, `voice-gateway/src/clients/app-api.ts`, `voice-gateway/test/{config,logger,metrics,app-api}.test.ts` | 1 | P1 |
| 8 | Gateway audio primitives: `audio/{mulaw,resample,frames,pacer,vad}.ts` | wired | `voice-gateway/src/audio/{mulaw,resample,frames,pacer,vad}.ts`, `voice-gateway/test/audio-*.test.ts` | 1 | P1 |
| 9 | Speech providers: batch STT, streaming Piper TTS, cancellation; `local-speech` compatibility wrapper | api-developer | `voice-gateway/src/speech/{stt,tts}.ts`, `voice-gateway/src/local-speech.ts`, `voice-gateway/test/speech-*.test.ts` | 7, 8 | P3 |
| 09b | Warm Piper worker pool: prewarmed `PiperVoice`, binary frame protocol, drain-on-cancel, CLI fallback | api-developer | `voice-gateway/piper/worker.py`, `voice-gateway/src/speech/piper-pool.ts`, `voice-gateway/src/speech/tts.ts` (fallback factory), `voice-gateway/test/piper-pool.test.ts`, `voice-gateway/test/fixtures/fake-piper-worker.mjs`, `voice-gateway/test/piper-worker-real.test.ts` | 7, 9 | P3 |
| 10 | Session contract: states, events, turnId, error codes, manager, limits, admission | wired | `voice-gateway/src/protocol.ts` (extend), `voice-gateway/src/sessions/{session,manager}.ts`, `voice-gateway/src/auth/limits.ts`, `voice-gateway/test/session-*.test.ts`, `voice-gateway/test/limits.test.ts` | 7 | P3 |
| 11 | Transports + index wiring: Twilio/browser adapters, `/metrics`, graceful shutdown, max-call goodbye, token refresh | wired | `voice-gateway/src/transports/{twilio,browser}.ts`, `voice-gateway/src/auth/token-refresh.ts`, `voice-gateway/src/index.ts`, delete `voice-gateway/src/local-speech.ts`, `voice-gateway/test/transports-*.test.ts`, `voice-gateway/test/integration/{current-flow,lifecycle}.test.ts` | 3, 5, 6, 9, 9b, 10 | P4 |
| 12 | Streaming turn manager: endpointing, streaming TTS/LLM (flagged), sentence aggregation | api-developer | `voice-gateway/src/turns/turn-manager.ts`, `voice-gateway/src/clients/app-api.ts` (extend), `voice-gateway/src/sessions/session.ts` (limits), `src/lib/voice/ollama.ts`, `src/lib/voice/respond.ts`, `src/app/api/voice/respond/route.ts`, `src/test/llm-stream*.test.ts`, `voice-gateway/test/turn-manager.test.ts` | 11 | P5 |
| 13 | Barge-in: phone `clear`, browser `interrupt`, widget flush + ungated mic, echo thresholds | forge | `voice-gateway/src/{sessions/session,turns/turn-manager,transports/twilio,transports/browser}.ts` (barge-in paths), `src/app/api/widget-script/route.ts`, `src/test/widget-script.test.ts`, `voice-gateway/test/integration/barge-in.test.ts` | 12 | P6 |
| 14 | Docs + final verification: architecture, protocol, limits, README/.env/DEPLOYMENT/CLAUDE | infra | `docs/VOICE_ARCHITECTURE.md`, `README.md`, `DEPLOYMENT.md`, `CLAUDE.md`, `.env.example` | 5, 13 | P7 |

## Dependency graph

```
P1  T2   T4   T6   T7 ──┬─ T8
P2  T3 (T2)
P3  T5 (T2,T3,T4)   T9 (T7,T8)   T10 (T7)
P3b T9b (T7,T9)
P4  T11 (T3,T5,T6,T9,T9b,T10)
P5  T12 (T11)
P6  T13 (T12)
P7  T14 (T5,T13)
```

Critical path: T1 → T2 → T3 → T5 → T11 → T12 → T13 → T14. T4 and T6 join that path; T7 → T9 and T7 → T10 are the other gateway branch.

## Parallel groups (file-disjoint; safe to dispatch together)

| Group | Tasks | Notes |
|-------|-------|-------|
| P0 | 1 | Must land first. Nothing is verifiable before it. |
| P1 | 2, 4, 6, 7, 8 | Disjoint. 2 = app auth/env; 4 = SQL; 6 = gateway test harness + one-line export in `index.ts`; 7/8 = new gateway modules only. |
| P2 | 3 | Needs 2 (voice routes must be runnable to test token enforcement). |
| P3 | 5, 9, 10 | 5 needs 2+3+4; 9 needs 7+8; 10 needs 7. All disjoint. |
| P3b | 9b | Needs 9 (TtsProvider/SpawnFn) and 7 (config/logger). Sole owner of `speech/tts.ts`/`speech/piper-pool.ts`/`piper/`. |
| P4 | 11 | Needs 3+5+6+9+10. Sole owner of `index.ts` after this point. |
| P5 | 12 | Needs 11. |
| P6 | 13 | Needs 12. |
| P7 | 14 | Needs 5+13. |

Sequential file overlaps that are intentional: `index.ts` (6 then 11), `app-api.ts`
(7 then 12), `local-speech.ts` (9 rewrites, 11 deletes), `twilio/voice/route.ts`
(2 then 3), `session.ts` gateway (10 then 12/13).

## Why this order

1. **Verification before change.** T1 creates the only test signal that exists in this
   repo (zero tests today) and captures the baseline in the same commit.
2. **Unbreak the routes before testing them.** `internal-auth.ts:7` calls full `env()`,
   so every `/api/voice/*` route throws without Stripe/Resend/Twilio. T2 must precede any
   route-level test.
3. **Auth before transport.** A WS gateway that accepts any socket is unsafe to test at
   scale. T3 (expiring token) lands before the gateway is rewired; the gateway's only auth
   is the app's `/api/voice/config` result, plus its own handshake deadline (T10/T11).
4. **Durability before the refactor.** T4/T5 make finalization idempotent and canonical
   while the old gateway still calls it. The streaming work then cannot regress data.
5. **Harness before split.** T6 gives a black-box regression signal against today's
   gateway. Every gateway refactor from T9 onward must keep T6's assertions green.
6. **Leaves before the wiring.** T7/T8/T9/T10 add tested modules with no behavior change,
   so T11 is a wiring switch with a known-good target.
7. **One behavior change per task after the split.** T11 = structure (identical), T12 =
   streaming/endpointing, T13 = barge-in. Each has its own integration assertions.

## Shared limits (exact; repeated in briefs)

| Limit | Value | One-line justification |
|-------|-------|------------------------|
| `MAX_CONCURRENT_SESSIONS` | 64 | 4 vCPU host; bounds memory and STT/TTS child processes per instance. |
| `MAX_CONNECTIONS_PER_IP` | 4 | One widget call + reconnect retries; blocks socket-flood abuse. |
| `MAX_UPGRADES_PER_IP` | 10 / 60 s | Absorbs reconnect storms without permitting scan floods. |
| `HANDSHAKE_DEADLINE_MS` | 10 000 | Twilio `start` arrives <1 s; 10 s tolerates slow tunnels. |
| `IDLE_TIMEOUT_MS` | 30 000 | Ends silent calls; Twilio media arrives every 20 ms when alive. |
| `MAX_WS_MESSAGE_BYTES` | 65 536 | 2 s of 16 kHz PCM16; widget sends ~2.7 KB per 85 ms. |
| `MAX_UTTERANCE_SECONDS` | 15 | Caps Whisper CPU per turn (current implicit cap is 20 s). |
| `MAX_UTTERANCE_BYTES` | 480 000 | 15 s × 16 000 Hz × 2 bytes. |
| `OUTBOUND_QUEUE_MAX_FRAMES` | 250 | 5 s of 20 ms frames; bounds memory and flush cost. |
| `TURN_CONCURRENCY_PER_SESSION` | 1 | Barge-in cancels; one call never runs parallel STT/LLM/TTS. |
| `STT_GLOBAL_CONCURRENCY` | 4 | `pwcpp` is ~1 core per job; leaves cores for Node and Piper. |
| `LLM_GLOBAL_CONCURRENCY` | 8 | Ollama queues internally; caps stampede while keeping latency. |
| `TTS_GLOBAL_CONCURRENCY` | 4 | Piper is CPU-bound per process. |
| `SPEECH_RMS` | 500 | Matches today's threshold (`index.ts:125`). |
| `BARGE_IN_RMS` | 900 | ~+5 dB over 500; rejects speaker echo, accepts normal speech. |
| `BARGE_IN_CONFIRM_MS` | 120 | Three 40 ms VAD frames; prevents single-click false barge-in. |
| `ENDPOINT_SILENCE_MS` | 700 | Faster than today's 800 ms without clipping normal pauses. |
| `MIN_SPEECH_MS` | 250 | Matches today; rejects coughs and clicks. |
| `PRE_ROLL_MS` | 200 | Keeps the first phoneme after VAD triggers. |
| `CALL_TOKEN_TTL_SECONDS` | 900 | D8. |
| `TOKEN_REFRESH_AT_MS` | 720 000 | Refresh at 12 min, leaving 3 min of retry before the 15 min expiry. |
| `FINALIZE_ATTEMPTS` | 3 (0/500/2000 ms backoff, 5 s each) | D9. |
| `SHUTDOWN_DEADLINE_MS` | 8 000 | Fits the usual 10 s orchestrator kill grace. |
| `GOODBYE_BUDGET_MS` | 2 000 | Short phrase; caps close/shutdown latency. |
| `MAX_CALL_SECONDS` | 1 800 | Existing runaway-cost cap. |
| `WS_PING_INTERVAL_MS` | 15 000 | Detect dead sockets; terminate after 30 s without pong. |

## Wire protocol v1 (browser; pinned in T10/T11/T13)

Client → server: `{v:1,type:"start",callId,token}` then `{type:"audio",pcm}` and
`{type:"stop"}`. Server → client: `ready`, `transcript`, `speaking`, `audio` (with
`turnId`, `sampleRate`), `interrupt`, `error`, `closed`. Twilio has no `v`; the gateway
validates `start.mediaFormat` = mu-law/8000/1. `turnId = "t_" + monotonicSeq`; every
outbound audio/transcript/speaking frame carries it; stale turn frames are dropped.
Error codes: `unsupported_protocol_version`, `handshake_timeout`, `message_too_large`,
`invalid_message`, `invalid_audio_format`, `unauthorized`, `session_limit`, `ip_limit`,
`config_unavailable`, `stt_failed`, `llm_failed`, `tts_failed`, `turn_cancelled`,
`max_duration`, `server_shutdown`, `internal_error`.

## Risk register

| Risk | L | I | Mitigation |
|------|---|---|------------|
| Token (15 min TTL) expires during a 30 min call | H | H | T3 makes `/api/voice/config` return a fresh token; T11 refreshes at 12 min, retries 30 s, closes+finalizes by 13:30 with a still-valid token. |
| Gateway refactor breaks the live call path | M | H | T6 black-box harness; T11 must keep its assertions unchanged; behavior-identical brief. |
| Piper model sample-rate JSON missing | M | M | T9 reads `<model>.json` `audio.sample_rate`; on miss throws a named config error instead of guessing. |
| LLM streaming corrupts the JSON action protocol | M | H | Streaming only emits deltas after `"action":"reply"` is proven; otherwise suppresses and falls back to buffered JSON. Flag default off. |
| Echo triggers false barge-in | M | M | 900 RMS + 120 ms confirmation + echoCancellation; barge-in only legal in `speaking`. |
| `finalize_call` not applied to prod DB | M | H | Additive SQL + explicit deploy step in T4/T14; gateway retries; Twilio status webhook still writes status/duration. |
| App down for the whole finalize window | L | H | 3 retries; residual risk documented (no disk spool in scope). |
| Windows-only spawn quirks (Piper/pwcpp) | M | M | Providers take injected `spawn` in tests; production uses `node:child_process` with `windowsHide`. |
| In-process rate limits/limits break with >1 gateway instance | M | M | Documented; sticky routing already required by DEPLOYMENT.md. |
| Legacy statuses (`no-answer`) in live rows | H | L | Canonical mapping only on new writes; no destructive backfill. |
| `calls` UPDATE RLS still allows any org member | M | M | Out of scope; recorded in T14 residual risks. |
| Piper model load dominates first audio (measured 5334 ms) | H | H | 09b keeps the voice warm in a worker pool; CLI is fallback only. |
| Python worker adds a second runtime to deploy | M | M | Worker is ~100 lines, stdlib + the already-required `piper` package; no Flask, no new service port; Task 14 documents host prerequisites and the `PIPER_WORKER_ENABLED=false` escape hatch. |
| Two warm workers double ONNX memory per gateway instance | M | M | `PIPER_WORKER_COUNT` default 2; Task 14 documents measured RSS and the sizing rule. |
| Barge-in flush races in-flight Twilio media | M | L | Pacer `cancel()` clears the queue; one in-flight frame allowed by the test. |

## Cross-task interface registry

- `signCall({callId,orgId,channel}, nowMs?) => string`; `verifyCallToken(token, {nowMs?,callId?}) => payload|null`; `verifyCall(callId, token) => boolean` (legacy wrapper). Tasks 3, 5, 11.
- `VoiceSessionConfig = {callId,orgId,channel,callSid,greeting,instructions,token,tokenExpiresAt}`. Tasks 7, 10, 11, 12.
- `SttProvider.transcribe(pcm, sampleRate, {signal?,language?}) => Promise<{text,ms}>`; `TtsProvider.synthesize(text,{signal?}) => AsyncIterable<Buffer>` + `sampleRate`. Tasks 9, 11, 12, 13.
- `Transport` (channel, onStart/onAudio/onStop, sendAudio, interrupt, setSpeaking, sendTranscript, close). Tasks 10, 11, 12, 13.
- `finalize_call(p_org uuid, p_call uuid, p_transcript jsonb, p_duration_seconds int, p_end_reason text) returns table(finalized boolean)`. Tasks 4, 5.
- Browser protocol v1 message shapes. Tasks 10, 11, 13.
