# Task 13 — Barge-in on phone and browser

## Goal
Let a caller interrupt the agent mid-sentence: confirm speech with a strict detector,
cancel LLM/TTS, flush outbound audio (`clear` on Twilio, local buffer flush in the
widget), and immediately listen for the new utterance.

## Context you need
- `VoiceSession.interrupt()` (Task 10) is legal only from `speaking`, aborts the active
  audio iterator (Task 09 kills Piper), drains the pacer, invalidates the `turnId`, emits
  `setSpeaking(false)`, and returns to `listening`.
- `TurnManager.cancel()` (Task 12) aborts STT/LLM/TTS for the active turn.
- Twilio clears queued playback with `{"event":"clear","streamSid":"..."}`
  (`TwilioTransport.interrupt()`, Task 11). Browser receives `{type:"interrupt"}`.
- The widget (`src/app/api/widget-script/route.ts:8-60`) currently:
  - gates mic sending on `agentSpeaking` (`if (... || agentSpeaking || context.currentTime
    < playbackAt) return`) and on `playbackAt`, so the caller can never barge in;
  - starts `AudioBufferSourceNode`s and never keeps references (`play()`), so it cannot
    stop them;
  - uses `echoCancellation: true, noiseSuppression: true` but no explicit channel config.
- Server-side detector: `BargeInDetector` (Task 08), 900 RMS for 120 ms.
- Decision D6: phone barge-in = Twilio `clear` + kill TTS child + invalidate `turnId`;
  browser = `interrupt` message + stop scheduled sources + remove mic gating.

## Files to create/modify
- `voice-gateway/src/sessions/session.ts` (accept audio while speaking; barge path;
  `onInterrupt` hook)
- `voice-gateway/src/sessions/manager.ts` (no change expected; touch only if the close
  hook needs it)
- `voice-gateway/src/protocol.ts` (`Transport.interrupt(turnId?: string)`)
- `voice-gateway/src/transports/browser.ts` (`interrupt(turnId?)` includes `turnId`)
- `voice-gateway/src/transports/twilio.ts` (verify `clear` uses current `streamSid`;
  no other behavior)
- `voice-gateway/src/turns/turn-manager.ts` (`cancel()` must be safe to call twice and
  from the interrupt hook)
- `voice-gateway/src/index.ts` (pass `onInterrupt` → `turnManager.cancel()`)
- `src/app/api/widget-script/route.ts` (widget changes below)
- `voice-gateway/test/session-bargein.test.ts` (new)
- `voice-gateway/test/integration/barge-in.test.ts` (new)
- `src/test/widget-script.test.ts` (new)

## Interface / contract

`SessionDeps` gains:
```ts
onInterrupt?: (session: VoiceSession, input: { turnId: string; pcm: Buffer;
  sampleRate: number }) => void
```

`VoiceSession`:
- `receiveAudio(pcm, sampleRate)` when `state === 'speaking'`:
  - feed `BargeInDetector`; maintain a ring of the last 200 ms of frames.
  - on the first `true`, call `interrupt({ confirmed: true, seed: Buffer.concat(ring) })`.
  - no VAD events and no transcript are produced from audio while merely `speaking`.
- `interrupt(opts?: { confirmed?: boolean; seed?: Buffer })`:
  - unchanged legality (only `speaking`; `confirmed !== false`).
  - order: `transition('interrupted')` → abort playback controller → `transport.interrupt(turnId)`
    → drain pacer → `onInterrupt(this, { turnId: oldTurnId, pcm: seed ?? EMPTY, sampleRate })`
    → invalidate turn → `setSpeaking(false, oldTurnId)` → `listening`.
  - if `seed` is non-empty, feed it to the VAD immediately after entering `listening`
    (so the first phoneme is not lost).
  - reset the detector on every transition into `speaking` and on `interrupt`.
- `transport.interrupt` signature becomes `interrupt(turnId?: string)`. Twilio ignores
  the argument and sends `clear` with the current `streamSid`. Browser sends
  `{type:'interrupt', turnId}` when provided, else `{type:'interrupt'}`.

Widget changes (inside the `SCRIPT` template; all of them required):
1. Track scheduled nodes: `let sources = [], activeTurnId = null;`
   In `play(m)`: if `m.turnId` and `m.turnId !== activeTurnId` return (drop stale audio);
   push the node to `sources`, and on `node.onended` remove it.
2. `flushPlayback()`: `sources.forEach(n => { try { n.stop() } catch (e) {} }); sources = [];
   playbackAt = 0;`
3. On `m.type === 'interrupt'`: `flushPlayback();` (do **not** set `agentSpeaking`;
   do not stop the socket).
4. On `m.type === 'speaking'`: if `m.value` set `activeTurnId = m.turnId`; on false, if
   `m.turnId === activeTurnId`, leave `activeTurnId` as-is until the next `true`.
5. Remove `agentSpeaking` from the mic gate entirely:
   `if (!ws || ws.readyState !== WebSocket.OPEN || !context || context.currentTime < 0) return;`
   simplifies to `if (!ws || ws.readyState !== WebSocket.OPEN) return;` — the server does
   VAD and barge-in detection; the client sends continuously while connected.
   Remove the `agentSpeaking` variable and its assignment.
6. `getUserMedia` constraints:
   `{ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false,
   channelCount: 1 } }`.
7. Keep `AudioContext({ sampleRate: 16000 })` and the existing 4096-frame processor.
8. Do **not** add client-side VAD or a mute button.

## Exact values
- Barge-in: RMS `900`, confirmation `120 ms` of 20 ms frames (6 frames).
- Pre-roll ring: `200 ms` (10 frames at 20 ms).
- Detector resets on entering `speaking` and on interrupt; one trigger per speaking turn.
- Twilio `clear` payload exactly `{event:'clear',streamSid:<current>}`.
- Widget mic gate: only `ws.readyState === OPEN` (plus existing null guards).
- Widget audio constraint keys exactly: `echoCancellation`, `noiseSuppression`,
  `autoGainControl:false`, `channelCount:1`.

## Test plan
`session-bargein.test.ts` (fake transport + fake speaker):
1. Quiet frames during `speaking` (RMS 300) do not call `transport.interrupt`.
2. Six consecutive frames at RMS 1200 during `speaking` → exactly one
   `transport.interrupt(oldTurnId)`; state `listening`; `onInterrupt` called once with the
   old turn id and a non-empty `seed`.
3. Frames arriving after interrupt are processed by the VAD (seed + next speech leads to
   one new utterance).
4. Speaking-turn audio generator is returned (`finally` executes) on interrupt.
5. `onInterrupt` throwing does not prevent `listening` or leak playback.
6. Interrupt during `listening` returns false and sends nothing.

`integration/barge-in.test.ts` (Task 06 harness, longer greeting audio e.g. 2 000 ms):
connect `/twilio`, wait for greeting `speaking:true`, send 8 × 20 ms loud mu-law frames;
expect a `{event:'clear',streamSid:'MZ1'}` message, then `speaking:false`, then continue
with 400 ms speech + 900 ms silence and assert a caller transcript appears.
Browser variant: connect `/web`, wait for `speaking:true`, send 8 loud PCM frames, expect
`{type:'interrupt'}`.

`src/test/widget-script.test.ts`: import `GET` from the route, read the JS text, assert:
- contains `autoGainControl: false` and `channelCount: 1`;
- does not contain `agentSpeaking`;
- contains `sources` array with `n.stop()`;
- handles `m.type === 'interrupt'` by calling the flush function;
- filters `audio` messages by `turnId`;
- still sends `{ type: 'audio', pcm }` continuously while the socket is open;
- `AudioContext({ sampleRate: 16000 })` retained.

Run exactly:
```bash
npm test --prefix voice-gateway
npm test
npm run type-check
npm run type-check --prefix voice-gateway
npm run build --prefix voice-gateway
```

## Acceptance criteria
- [ ] Phone barge-in clears Twilio playback, stops Piper, drops stale frames, and listens
      immediately.
- [ ] Browser barge-in stops all scheduled sources and no longer gates the mic on agent
      speech.
- [ ] One barge-in per speaking turn; no false trigger from 120 ms-or-shorter noise below
      900 RMS.
- [ ] Old-turn audio is dropped by the widget and by the session.
- [ ] No double cancellation errors when interrupt and close race.
- [ ] All previous integration assertions still pass.

## Out of scope
- Client-side VAD, mute buttons, or headphones detection.
- Adjusting the 900/120 values from configuration.
- Acoustic echo cancellation beyond the audio constraints.
- Twilio `mark`-based playback confirmation.

## Report path
`.work/voice-upgrade/reports/13-barge-in.md`
