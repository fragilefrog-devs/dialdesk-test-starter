# Task 06 — In-process synthetic-audio harness for today's gateway

## Goal
Create a black-box test harness that starts **today's** gateway in-process over a real
WebSocket, feeds real encoded audio, points it at a fake app server, and stubs only the
speech binaries. Capture current-call-path assertions that every later gateway refactor
must keep green.

## Context you need
- `voice-gateway/src/index.ts` reads `APP_URL`, `INTERNAL_API_SECRET`, `PORT` and
  `MAX_CALL_SECONDS` at module top and calls `server.listen(PORT)` on import (last line).
- Speech is imported directly from `./local-speech.js` (`index.ts:3`): `transcribe`,
  `synthesize`, `pcmToTwilioAudio`, `twilioAudioToPcm`. There is no injection point, so
  the harness stubs that module with `vi.mock` and keeps the **real codecs reimplemented**
  in the harness (independent of the module under test).
- Twilio flow: `start` → `begin()` → `GET /api/voice/config` → greeting frames
  (`event:"media"`, 160-byte base64 payloads, 20 ms apart). Inbound `media` is mu-law at
  8 kHz; `feedAudio` converts to 16 kHz PCM. Endpointing: 800 ms silence after ≥250 ms
  speech, max utterance 20 s (`index.ts:125-141`).
- Outbound browser flow: `{type:"start"}` → config → `{type:"speaking"}`,
  `{type:"transcript"}`, `{type:"audio", pcm, sampleRate}`.
- `finalize()` (`index.ts:34-47`) posts `/api/voice/finalize` with
  `{callId, token, transcript, durationSeconds}` then closes the socket.
- CI has no `pwcpp`/`piper`; the harness must never spawn them.
- Task 11 will rerun this same test file against the split gateway. Keep every assertion
  about externally visible behavior, not internal module names.

## Files to create/modify
- `voice-gateway/src/index.ts` — **only** two changes: export the pieces and guard the
  listen call. Do not touch connection logic.
- `voice-gateway/test/harness/audio.ts` (new)
- `voice-gateway/test/harness/fake-app.ts` (new)
- `voice-gateway/test/harness/gateway.ts` (new)
- `voice-gateway/test/integration/current-flow.test.ts` (new)

## Interface / contract

`src/index.ts` edits (exact):
```ts
export { server, wss, handleConnection }
export function start(port: number = PORT) {
  server.listen(port, () => console.log(`voice-gateway listening on :${port}`))
}
if (process.env.GATEWAY_NO_LISTEN !== '1') start()
```
Keep `VoiceSocket`, `Line`, `HistoryLine` private. No other diff.

`test/harness/audio.ts` exports:
```ts
export function encodeMulaw(pcm16: Buffer): Buffer        // 16k PCM16 -> 8k mu-law
export function decodeMulaw(mulaw: Buffer): Buffer        // 8k mu-law -> 16k PCM16
export function resamplePcm16(pcm: Buffer, from: number, to: number): Buffer
export function tone({ hz, ms, sampleRate, amplitude }): Buffer  // PCM16LE mono sine
export function silence(ms: number, sampleRate: number): Buffer
export function twilioMediaFrame(mulaw: Buffer): string    // base64 of exactly 160 bytes
```
mu-law: standard G.711 (`BIAS 0x84`, `CLIP 32635`, segment lookup). `encodeMulaw` first
resamples 16k→8k by taking every other sample. `decodeMulaw` expands to 16-bit then
duplicates each sample (8k→16k).

`test/harness/fake-app.ts`:
```ts
export interface RecordedRequest { path: string; secret: string | null; body: any }
export interface FakeApp {
  url: string
  requests: RecordedRequest[]
  finalizeBodies: any[]
  close(): Promise<void>
  reset(): void
}
export async function startFakeApp(opts?: {
  greeting?: string
  reply?: string
  configStatus?: number
}): Promise<FakeApp>
```
Routes (all JSON, all require `x-internal-secret: 'test-secret'` else 403):
- `GET /api/voice/config` → `{ greeting, callSid: 'CA_test' }` (or `configStatus`).
- `POST /api/voice/respond` → `{ text: reply ?? 'Sure, I can help with that.' }`.
- `POST /api/voice/finalize` → `{ ok: true }`, records body into `finalizeBodies`.
- anything else → 404.
Listens on `127.0.0.1:0`.

`test/harness/gateway.ts`:
```ts
export interface RunningGateway { url: string; close(): Promise<void> }
export async function startGateway(appUrl: string): Promise<RunningGateway>
export function connect(url: string, path: '/twilio' | '/web'): Promise<WebSocket>
export function collect(socket: WebSocket): { messages: any[]; waitFor<T>(p: (m: any) => boolean, ms?: number): Promise<T>; closed: Promise<{ code: number }> }
export async function waitFor<T>(messages: any[], p: (m: any) => boolean, ms?: number): Promise<T>
```
`startGateway` sets `process.env.APP_URL`, `INTERNAL_API_SECRET='test-secret'`,
`PORT='0'`, `MAX_CALL_SECONDS='30'`, `GATEWAY_NO_LISTEN='1'` **before** dynamic-importing
`../../src/index.js`, then calls `start(0)` and reads `server.address().port`. `close()`
closes sockets then the server.

## Exact values
- Test secret `'test-secret'`; fake `callId` `'11111111-1111-4111-8111-111111111111'`;
  token `'v1.test.token'` (gateway never validates it).
- Greeting `'Thanks for calling Acme. How can I help?'`; reply
  `'Sure, I can help with that.'`.
- Stub `synthesize` returns `{ pcm: tone({hz:440, ms:120, sampleRate:22050,
  amplitude:0.2}), sampleRate: 22050 }`.
- Stub `transcribe` returns `'I need an appointment'`; it must be a `vi.fn()` exported so
  tests can assert call count.
- Twilio endpointing: send 400 ms of speech (20 frames of 8k mu-law tone at amplitude
  0.5), then 900 ms silence (45 frames).
- Wait budget per `waitFor`: 8 000 ms.

## Test plan
`voice-gateway/test/integration/current-flow.test.ts`:
```ts
vi.mock('../../src/local-speech.js', async () => {
  const a = await import('../harness/audio.js')
  return {
    transcribe: vi.fn(async () => 'I need an appointment'),
    synthesize: vi.fn(async () => ({ pcm: a.tone({ hz: 440, ms: 120, sampleRate: 22050, amplitude: 0.2 }), sampleRate: 22050 })),
    pcmToTwilioAudio: (pcm: Buffer, rate: number) => a.encodeMulaw(a.resamplePcm16(pcm, rate, 8000)),
    twilioAudioToPcm: (b64: string) => a.decodeMulaw(Buffer.from(b64, 'base64')),
  }
})
```
(If Vitest cannot hoist the async factory on this config, return sync factories that
`require`-style import pre-created codecs via a plain module import at the top and use
`vi.hoisted`.)

Cases:
1. **health** — `GET /health` → 200 `ok`.
2. **phone greeting** — connect `/twilio`, send
   `{event:'start',start:{streamSid:'MZ1',customParameters:{callId,token}}}`; expect a
   `speaking true` message, ≥1 `media` message whose payload decodes to exactly 160 bytes,
   then `speaking false`.
3. **phone turn** — after greeting, send 400 ms speech + 900 ms silence; expect a
   `transcript` caller message, then an agent `transcript`, and ≥1 media message; assert
   the fake app saw `POST /api/voice/respond` with the transcript text.
4. **finalize** — send `{event:'stop'}`; expect `finalizeBodies` length 1 with
   `callId`, `token:'v1.test.token'`, `durationSeconds > 0`, and at least one
   `{role:'agent'}` entry; socket closes with code 1000.
5. **web greeting + audio** — connect `/web`, `{type:'start',callId,token}`; expect
   `{type:'speaking',value:true}`, `{type:'audio',sampleRate:22050}` with non-empty base64,
   `{type:'speaking',value:false}`.
6. **web finalize** — `{type:'stop'}` after start; expect one finalize body.

Cleanup in `afterEach`: close gateway/app, `vi.clearAllMocks()`.

Run exactly:
```bash
npm test --prefix voice-gateway
npm run type-check --prefix voice-gateway
npm run build --prefix voice-gateway
```

## Acceptance criteria
- [ ] Gateway runs in-process under Vitest with no external binaries and no fixed port.
- [ ] Both `/twilio` and `/web` happy paths are exercised end-to-end with real codecs.
- [ ] Finalize payload is asserted (callId, token, transcript, duration).
- [ ] `src/index.ts` diff is limited to the export + listen guard; connection logic is
      untouched.
- [ ] Test suite passes on Windows and in CI without models.
- [ ] Gateway build output still compiles and `dist/index.js` still auto-starts in
      production (guard only trips when `GATEWAY_NO_LISTEN='1'`).

## Out of scope
- Refactoring gateway internals, adding modules, or changing protocol messages.
- Replacing the 800 ms endpoint with 700 ms.
- Testing with real Piper/Whisper.
- Browser widget code.

## Report path
`.work/voice-upgrade/reports/06-gateway-harness.md`
