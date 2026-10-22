# Task 12 — Streaming turn manager with feature-flagged LLM streaming

## Goal
Replace the buffered per-turn pipeline with a sentence-streaming turn manager: batch STT,
optional streaming LLM text, sentence-aggregated TTS, 700 ms endpointing, and full
cancellation. Keep the non-streaming path as the default and as the fallback.

## Context you need
- Today `respondToCall` (`src/lib/voice/respond.ts:27-60`) asks Ollama for one JSON
  object (`{"action":"reply","arguments":{"text":"..."}}` or a tool call), executes at
  most 3 tool rounds, and returns the full reply. `ollamaChat`
  (`src/lib/voice/ollama.ts:8-28`) uses `stream:false`.
- The JSON contract cannot be removed without breaking tools. Streaming therefore
  streams **raw model text**; the app extracts reply text incrementally and the gateway
  only speaks when the action prefix is `"reply"`.
- Decision D5: streaming is behind `VOICE_STREAMING_LLM` (default `0`/off), with clean
  fallback to the buffered route. Decision: endpoint 700 ms, max utterance 15 s.
- Task 09: `TtsProvider.synthesize()` returns `{stream, sampleRate}`; cancel by
  aborting/breaking the generator. Task 10: `VoiceSession.speak(text, stream, rate,
  {turnId})`, `isStale(turnId)`.
- Task 11 wires `onUtterance` to the buffered pipeline in `index.ts`; this task replaces
  that callback body with `TurnManager.handle`.
- Semaphores from Task 10: STT 4, LLM 8, TTS 4 (global).

## Files to create/modify
- `voice-gateway/src/turns/turn-manager.ts` (new)
- `voice-gateway/src/clients/app-api.ts` (add `respondStream`)
- `voice-gateway/src/config.ts` (add `streamLlm: boolean`)
- `voice-gateway/src/sessions/session.ts` (add optional VAD options to `SessionDeps`)
- `voice-gateway/src/index.ts` (wire `TurnManager` + semaphores; remove buffered pipeline)
- `src/lib/voice/ollama.ts` (add `ollamaChatStream`)
- `src/lib/voice/respond.ts` (add `respondToCallStream` + extractor)
- `src/app/api/voice/respond/route.ts` (opt-in NDJSON streaming)
- `voice-gateway/test/turn-manager.test.ts` (new)
- `voice-gateway/test/app-api-stream.test.ts` (new)
- `voice-gateway/test/integration/streaming.test.ts` (new)
- `src/test/ollama-stream.test.ts` (new)
- `src/test/respond-stream.test.ts` (new)
- `src/test/respond-route-stream.test.ts` (new)

## Interface / contract

`src/lib/voice/ollama.ts`:
```ts
export async function* ollamaChatStream(
  messages: OllamaMessage[], json = false, signal?: AbortSignal,
): AsyncGenerator<string>
```
POST with `stream: true`, same model/temperature/response_format, 60 s timeout combined
with `signal` (`AbortSignal.any` when available, else a linked controller). Parse SSE
lines (`data: {...}`, `[DONE]`); skip empty/comment lines; yield
`choices[0].delta.content` when non-empty; throw on non-2xx or an `error` field.
Ignore `[DONE]` missing at EOF if at least one delta arrived.

`src/lib/voice/respond.ts`:
```ts
export interface ReplyExtractor { push(delta: string): string; flush(): string; reset(): void }
export function createReplyExtractor(): ReplyExtractor
export async function* respondToCallStream(
  callId: string, userText: string, history: TurnMessage[], signal?: AbortSignal,
): AsyncGenerator<string>
```
`ReplyExtractor` rules:
- Buffers `{"action":"reply"` detection; extracts only the JSON string value that
  follows `"text":`.
- Handles `\"`, `\\`, `\n`, `\t`, `\uXXXX` escapes incrementally.
- Emits only newly decoded characters; never emits characters before the action prefix
  is confirmed.
- `flush()` emits any pending decoded text; `reset()` clears all state.
- Tool actions emit nothing.

`respondToCallStream`: same context/system/messages as `respondToCall`; for up to 3
attempts, consume `ollamaChatStream(messages, true, signal)`, feed a fresh extractor, and
`yield` text. At message end parse the accumulated JSON with the existing `parseAction`;
`reply` → return; tool → execute via `executeTool` and continue with the same
`Result from ...` user message; parse failure → yield the existing fallback sentence and
return. On abort, stop without yielding further.

`/api/voice/respond`: when `body.stream === true`, return
`new Response(ndjson, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8',
'cache-control': 'no-store' } })`. Lines: `{"delta":"..."}\n` per chunk,
`{"done":true}\n` at end, `{"error":"llm_failed"}\n` on failure (status stays 200 once
streaming starts). Non-stream behavior is byte-identical to today.

`src/clients/app-api.ts`:
```ts
respondStream(input: { callId: string; token: string; userText: string;
  history: { role: 'user' | 'assistant'; content: string }[] }, signal?: AbortSignal,
): AsyncIterable<string>
```
POSTs `{...,stream:true}`; non-2xx → `AppApiError('llm_failed', status)`; parses NDJSON
line-by-line with a carry buffer, yields `delta`, stops at `done`, throws on `error`.

`src/config.ts`: add `streamLlm: boolean` (`VOICE_STREAMING_LLM === '1'`), default false.

`src/sessions/session.ts`: `SessionDeps` gains
`vad?: { endpointSilenceMs?: number; maxUtteranceMs?: number; speechRms?: number;
minSpeechMs?: number; preRollMs?: number }`; defaults stay 800/20000/500/250/200. Pass
them into `new Vad(...)`.

`src/turns/turn-manager.ts`:
```ts
export interface TurnSpeaker {
  isStale(turnId: string): boolean
  speak(text: string, audio: AsyncIterable<Buffer>, sampleRate: number,
    opts?: { turnId?: string }): Promise<void>
}
export interface TurnManagerDeps {
  speaker: TurnSpeaker
  app: Pick<AppApiClient, 'respond' | 'respondStream'>
  stt: SttProvider
  tts: TtsProvider
  logger: Logger
  metrics: Metrics
  streamLlm: boolean
  semaphores?: { stt: Semaphore; llm: Semaphore; tts: Semaphore }
}
export function splitSentences(text: string): string[]
export class SentenceAggregator {
  constructor(opts?: { minChars?: number; maxChars?: number }) // 12 / 200
  push(delta: string): string[]   // completed sentences, in order
  flush(): string[]               // remaining buffer as one sentence when non-empty
}
export class TurnManager {
  constructor(deps: TurnManagerDeps)
  handle(input: { pcm: Buffer; sampleRate: number; turnId: string }): Promise<void>
  cancel(turnId?: string): void
  close(): Promise<void>
}
```
`splitSentences`: split on `[.!?]` followed by whitespace or end, keep the punctuation,
trim, drop empties, and force-split any remainder over `maxChars` at the last space.
`SentenceAggregator` concatenates deltas, emits a sentence when the accumulated buffer
matches the sentence terminator, and force-emits at `maxChars` (on the last space, else
hard cut). `flush()` emits the trailing fragment.

`handle` flow (sequential, no per-session parallelism):
1. If `speaker.isStale(turnId)` return. Acquire `stt` semaphore with the turn signal;
   `stt.transcribe`; release in `finally`. Empty text → return.
2. If `streamLlm`: `app.respondStream(...)`; for each delta feed the aggregator; for each
   completed sentence check staleness, then `tts.synthesize(sentence, { signal })` under
   the `tts` semaphore and `await speaker.speak(sentence, audio.stream, audio.sampleRate,
   { turnId })`. Flush at stream end. If streaming throws **before any sentence**, log and
   fall back to the buffered path once.
3. Else: `app.respond` under the `llm` semaphore, then `splitSentences` and the same
   TTS/speak loop.
4. Cancellation: `cancel(turnId)` aborts the turn's `AbortController`, releases semaphores,
   and makes all later `speak` calls skipped. Provider errors → log, metrics
   `voice_errors_total{code}`, and speak exactly
   `'Sorry, I had trouble with that. Could you please try again?'` once.
5. Metrics: `voice_turns_total{result}` (`ok|empty|cancelled|error`),
   `voice_turn_duration_ms` observe on completion.

`index.ts`: create three `Semaphore`s, one `TurnManager` per session, set
`onUtterance: (_s, input) => manager.handle(input)`, and on session interrupt/close call
`manager.cancel()`/`close()`. Set session `vad.endpointSilenceMs = LIMITS.ENDPOINT_SILENCE_MS`
and `maxUtteranceMs = LIMITS.MAX_UTTERANCE_SECONDS * 1000`.

## Exact values
- Endpoint 700 ms, max utterance 15 000 ms, other VAD defaults unchanged.
- Sentence min 12 chars, max 200 chars.
- Semaphores STT 4 / LLM 8 / TTS 4.
- Flag: `VOICE_STREAMING_LLM=1` enables streaming; anything else is off.
- Fallback lines: `'Sorry, I had trouble understanding that. Could you say it another
  way?'` (parse failure) and
  `'Sorry, I had trouble with that. Could you please try again?'` (provider failure).
- NDJSON content type `application/x-ndjson; charset=utf-8`.

## Test plan
`src/test/ollama-stream.test.ts` (mock `fetch` with a `ReadableStream` of SSE chunks split
mid-line): deltas yielded in order; `[DONE]` ends; non-2xx throws; abort stops; `json`
flag adds `response_format`.

`src/test/respond-stream.test.ts`: extractor unit cases — split across chunks inside the
key, inside the value, inside an escape, and inside `\uXXXX`; tool action yields nothing;
`flush` emits trailing text. Stream function: two tool rounds then a reply yields only the
final reply text; parse failure yields the fallback; abort yields nothing further.

`src/test/respond-route-stream.test.ts`: `stream:true` → NDJSON body with delta lines and
`{done:true}`; upstream error → `{error:"llm_failed"}`; `stream` absent → unchanged JSON
response.

`voice-gateway/test/app-api-stream.test.ts`: NDJSON split across chunks; `done` stops;
`error` throws `llm_failed`; abort propagates.

`voice-gateway/test/turn-manager.test.ts` (fake speaker/stt/tts/app): `splitSentences`
table incl. decimals (`3.5`) **stay together unless followed by whitespace**, abbreviations
are not special-cased; aggregator emits at terminators and at 200 chars; streaming path
speaks 3 sentences in order with `turnId`; flag off uses `respond` and still splits;
stale turn before STT → no provider calls; stale mid-stream → no further speak; cancel
aborts and yields `cancelled` metric; streaming failure before first sentence falls back to
buffered once; TTS failure speaks the fallback line.

`voice-gateway/test/integration/streaming.test.ts` (Task 06 harness + fake app with
NDJSON): with `VOICE_STREAMING_LLM=1`, a phone turn produces ≥2 agent transcript lines
matching the streamed sentences; with the flag off, one line.

Run exactly:
```bash
npm test
npm test --prefix voice-gateway
npm run type-check
npm run type-check --prefix voice-gateway
npm run build --prefix voice-gateway
```

## Acceptance criteria
- [ ] Streaming is off by default and the buffered path is unchanged when off.
- [ ] No text is spoken until the action prefix is proven to be `"reply"`.
- [ ] Sentences start playing before the LLM stream completes.
- [ ] `cancel()` stops STT/LLM/TTS and no stale sentence is spoken.
- [ ] Endpointing is 700 ms; max utterance is 15 s.
- [ ] Tool calls still execute and produce a spoken reply; parse failure falls back once.
- [ ] All gates pass; Task 06 assertions remain unchanged.

## Out of scope
- Barge-in detection and widget changes (Task 13).
- Streaming STT.
- New LLM providers or prompt changes (only the transport changes).
- Per-session parallel sentence TTS.

## Report path
`.work/voice-upgrade/reports/12-streaming-turns.md`
