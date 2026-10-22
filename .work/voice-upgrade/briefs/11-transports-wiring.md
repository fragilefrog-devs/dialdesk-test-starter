# Task 11 — Twilio/browser transports and gateway wiring

## Goal
Split the gateway: transports translate wire messages, the session owns behavior, and
`index.ts` becomes composition only. Delete `local-speech.ts`, add `/metrics`,
handshake/admission guards, token refresh, graceful shutdown, and a goodbye on call caps.

## Context you need
- `voice-gateway/src/index.ts` today contains everything (env, HTTP, upgrade, all call
  logic). Task 06 exports `server`, `wss`, `handleConnection`, `start()` and guards listen
  with `GATEWAY_NO_LISTEN !== '1'`; its integration test asserts greeting/turn/finalize.
  After this task the test must still pass with **unchanged assertions**; you may only
  repoint its `vi.mock` from `../../src/local-speech.js` to the new speech modules.
- Twilio messages: `connected`, `start` (`start.streamSid`,
  `start.customParameters.callId/token`, `start.mediaFormat.{encoding,sampleRate,channels}`),
  `media` (`media.payload` base64 mu-law), `mark`, `stop`.
- Browser protocol v1: client `{v:1,type:'start',callId,token}`, `{type:'audio',pcm}`
  (base64 16 kHz PCM16LE), `{type:'stop'}`. Server `{type:'ready'}`,
  `{type:'transcript',role,text,turnId}`, `{type:'speaking',value,turnId}`,
  `{type:'audio',pcm,sampleRate,turnId}`, `{type:'interrupt'}`, `{type:'error',code}`,
  `{type:'closed',code,reason}`.
- Task 03: `/api/voice/config` returns `{greeting, orgId, callSid, token, tokenExpiresAt,
  session:{instructions}}`. TTL 900 s, max call 1800 s → refresh at 12 min.
- Task 09 TTS stream must be canceled on interrupt/close (generator `return()` kills
  Piper). Task 10 session handles pacing, interruption, timers, close codes.
- Task 07 provides `AppApiClient`, `loadConfig`, `metrics`, `createLogger`.
  Task 08 provides `mulawToPcm16`/`pcm16ToMulaw`, `MAX_UTTERANCE_SECONDS`.
- `local-speech.ts` is now a wrapper (Task 09) and is deleted here.

## Files to create/modify
- `voice-gateway/src/transports/twilio.ts` (new)
- `voice-gateway/src/transports/browser.ts` (new)
- `voice-gateway/src/auth/token-refresh.ts` (new; documented addition)
- `voice-gateway/src/index.ts` (rewrite as composition only)
- `voice-gateway/src/local-speech.ts` (**delete**)
- `voice-gateway/test/transports-twilio.test.ts` (new)
- `voice-gateway/test/transports-browser.test.ts` (new)
- `voice-gateway/test/token-refresh.test.ts` (new)
- `voice-gateway/test/integration/current-flow.test.ts` (mock target only)
- `voice-gateway/test/integration/lifecycle.test.ts` (new: metrics, shutdown, max call)

## Interface / contract

`src/transports/twilio.ts`:
```ts
export interface TwilioStart { callId: string; token: string; streamSid: string }
export class TwilioTransport implements Transport {
  constructor(socket: WebSocket, opts: { logger: Logger; maxMessageBytes?: number })
  readonly channel = 'phone' as const
  waitForStart(deadlineMs: number): Promise<TwilioStart>   // rejects 'handshake_timeout'
  readonly streamSid: string
  isOpen(): boolean
  sendAudio(frame: Buffer, meta: { turnId: string; sampleRate: number }): void
  sendTranscript(event: TranscriptEvent): void            // no-op (Twilio has no transcript)
  setSpeaking(event: SpeakEvent): void                    // no-op
  interrupt(): void
  sendError(code: ErrorCode): void                        // no-op; close carries the code
  close(code?: number, reason?: string): void
  onUtterance(cb: (pcm: Buffer, sampleRate: number) => void): void
  onStop(cb: () => void): void
  onClose(cb: () => void): void
}
```
`waitForStart` resolves on `start`; validates `mediaFormat.encoding === 'audio/x-mulaw'`,
`sampleRate === 8000`, `channels === 1`; on mismatch sends `invalid_audio_format` then
closes with `1002` and rejects `'invalid_audio_format'`. `media` handlers decode with
`mulawToPcm16(payload, 16000)` and call the utterance callback. `sendAudio` converts to
mu-law, chunks into **160-byte** frames, and sends
`{event:'media',streamSid,media:{payload:base64}}` (the session already paced 20 ms).
`interrupt()` sends `{event:'clear',streamSid}`. Ignore malformed JSON silently except
for one `warn` log.

`src/transports/browser.ts`:
```ts
export interface BrowserStart { callId: string; token: string }
export class BrowserTransport implements Transport {
  constructor(socket: WebSocket, opts: { logger: Logger; maxMessageBytes?: number })
  readonly channel = 'web' as const
  waitForStart(deadlineMs: number): Promise<BrowserStart>
  // same methods as TwilioTransport, plus sendReady()
}
```
On `start`: `v` must equal `1` (missing also fails) → else send
`{type:'error',code:'unsupported_protocol_version'}` and close `1002`. On `audio`:
base64 must decode to an even number of bytes and ≤ `maxMessageBytes` (65 536) → else
`invalid_audio_format` + close `1002`. `sendAudio` sends `{type:'audio',
pcm: frame.toString('base64'),sampleRate,turnId}`; `setSpeaking` sends
`{type:'speaking',value,turnId}`; `sendTranscript` sends
`{type:'transcript',role,text,turnId}`; `interrupt()` sends `{type:'interrupt'}`;
`sendError` sends `{type:'error',code}`; `close` sends `{type:'closed',code,reason}` then
`socket.close(code)`.

`src/auth/token-refresh.ts`:
```ts
export interface TokenRefreshOptions {
  refresh: () => Promise<{ token: string; tokenExpiresAt: number }>
  apply: (token: string, tokenExpiresAt: number) => void
  atMs?: number          // 720_000
  deadlineMs?: number    // 810_000
  retryMs?: number       // 30_000
  timers?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout }
  now?: () => number
}
export class TokenRefresh {
  constructor(opts: TokenRefreshOptions)
  start(): void
  stop(): void
  get state(): 'idle' | 'waiting' | 'refreshing' | 'refreshed' | 'expired'
}
```
Refreshes once at `atMs`; on failure retries every `retryMs` until `deadlineMs`; on
deadline calls the `onExpired` callback (5th option `onExpired: (reason:
'token_refresh_failed') => void`) and stops. Success calls `apply` and stops.

## `index.ts` composition (normative)
1. `const config = loadConfig()`; on `ConfigError` log and `process.exit(1)` (same
   production behavior as today).
2. `const app = new AppApiClient({ baseUrl: config.appUrl, secret: config.internalSecret })`.
3. `createLogger`, `metrics` singleton; `AdmissionController` + `SessionManager`.
4. HTTP: `/health` → 200 `ok`; `/metrics` → 200 `text/plain; version=0.0.4;
   charset=utf-8` with `metrics.render()`; everything else 404.
5. Upgrade: only `/twilio` and `/web`; reject otherwise (`socket.destroy()`). IP =
   first `x-forwarded-for` hop trimmed, else `request.socket.remoteAddress ?? 'unknown'`.
   If `!admission.allowUpgrade(ip)` → `socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n')`
   then destroy. `wss` is created with `maxPayload: 65_536`.
6. Per connection (strict order — a session needs `VoiceSessionConfig` at construction):
   - build the transport and attach its socket listeners immediately.
   - handshake timer `10_000 ms`; `await transport.waitForStart(deadline)`; clear the timer.
     On timeout: `sendError('handshake_timeout')`, close `1008`, release nothing.
   - `GET /api/voice/config` through `AppApiClient`; failure → `sendError('config_unavailable')`
     + close `1011`. Do not admit or create a session before config succeeds.
   - `manager.open(...)` (admits by IP); if `!ok` → `transport.sendError(reason)`,
     `transport.close(1013)`, return. The `createSession` closure captures the fetched
     config. Until the transport's callbacks are attached, buffer at most one utterance
     worth of inbound audio (15 s) and drop the oldest beyond that.
   - `onGreeting`: `const tts = await createTtsProvider(...); const a = tts.synthesize(greeting);
     session.speak(greeting, a.stream, a.sampleRate)`.
   - `onUtterance` (buffered, behavior-identical to today): `stt.transcribe` →
     `app.respond` → `tts.synthesize` → `session.speak`. Check `session.isStale(turnId)`
     before every stage and before playback; drop stale work. On provider failure speak
     exactly `'Sorry, I had trouble with that. Could you please try again?'`. Push caller
     and agent lines into a per-connection `transcript` array (400-line cap).
   - `session.start()` after all callbacks are attached.
   - `onClose`: stop token refresh; `app.finalize({callId, token, transcript,
     durationSeconds, endReason})`; log failure, never throw.
   - Token refresh: `new TokenRefresh({ refresh: () => app.getCallConfig(callId, token),
     apply: (t, exp) => { token = t }, onExpired: () => void session.close('token_refresh_failed') })`.
   - `transport.onStop` → `session.close('hangup')`; socket close → same (idempotent).
7. Max call: session's `maxCallSeconds`; pass `onMaxDuration` that attempts one goodbye —
   `session.speak('Thanks for calling. Goodbye.', tts.synthesize(...).stream, rate)` — and
   never throws; the session then closes `max_duration` (its own 2 000 ms budget bounds
   the hook). `GOODBYE_BUDGET_MS = 2_000` is the same constant.
8. Shutdown: on SIGTERM/SIGINT (only when signals enabled, i.e. not `VITEST`): stop
   accepting, `manager.closeAll('server_shutdown', 8_000)`, `server.close()`, exit 0.
9. `start(port)` unchanged; still auto-starts unless `GATEWAY_NO_LISTEN === '1'`.

Keep `handleConnection` exported for Task 06's test compatibility; its new signature may
be `(socket, channel)` still, using module-level singletons.

## Exact values
- Handshake 10 000 ms; max payload 65 536; upgrades 10/60 s; close codes per Task 10.
- Twilio frame 160 bytes; browser audio 16 kHz PCM16LE base64.
- Token refresh 720 000 ms, retry 30 000 ms, deadline 810 000 ms.
- Goodbye budget 2 000 ms; shutdown deadline 8 000 ms.
- Fallback line exactly `'Sorry, I had trouble with that. Could you please try again?'`.
- Transcript cap 400 entries.

## Test plan
`transports-twilio.test.ts` (FakeSocket: EventEmitter with `send`, `close`, `readyState`):
start parsing; invalid `mediaFormat` → error + 1002; media callback decodes 160 bytes
mu-law to 640 bytes PCM16; outbound audio produces 160-byte base64 frames with streamSid;
`interrupt` sends `clear`; malformed JSON warns once and does not throw.

`transports-browser.test.ts`: v1 start accepted; missing `v` and `v:2` rejected with
`unsupported_protocol_version` + 1002; odd-length audio rejected; oversized audio
rejected; outbound shapes carry `turnId` + declared `sampleRate`; `close` sends `closed`
then closes; handshake timeout rejects.

`token-refresh.test.ts` (fake timers): refresh at 720 s; success applies once and stops;
failure retries every 30 s; `onExpired` at 810 s and no further calls; `stop()` cancels.

`lifecycle.test.ts` (uses Task 06 harness): `/metrics` exposes
`voice_sessions_active` after a connection; SIGTERM path is not tested via signals —
call `manager.closeAll('server_shutdown', 8_000)` directly and assert all sockets close;
max call with `MAX_CALL_SECONDS` set low (e.g. `2`) plays a goodbye then closes `4000`.

`current-flow.test.ts`: repoint the two `vi.mock` factories to
`../../src/speech/stt.js` and `../../src/speech/tts.js`; assertions unchanged.

Run exactly:
```bash
npm test --prefix voice-gateway
npm run type-check --prefix voice-gateway
npm run build --prefix voice-gateway
```

## Acceptance criteria
- [ ] `index.ts` contains no VAD, pacing, codec, or turn logic — composition only.
- [ ] `local-speech.ts` is deleted and nothing imports it.
- [ ] Twilio and browser paths pass the unchanged Task 06 assertions.
- [ ] Handshake, admission, payload cap, refresh, and shutdown behave per values.
- [ ] Goodbye plays on `max_duration` within 2 s, then close code `4000`.
- [ ] `/metrics` serves valid Prometheus text; `/health` unchanged.
- [ ] No unhandled rejections on socket close during speech/STT; providers are canceled.

## Out of scope
- Streaming turn manager and 700 ms endpointing (Task 12).
- Barge-in mic/echo changes and widget edits (Task 13).
- Redis/shared admission across instances.
- Changing app API routes.

## Report path
`.work/voice-upgrade/reports/11-transports-wiring.md`
