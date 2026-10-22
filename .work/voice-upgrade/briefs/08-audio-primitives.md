# Task 08 — Gateway audio primitives

## Goal
Add pure, dependency-free audio modules (mu-law, resampling, framing, 20 ms pacer, VAD)
that reproduce today's audio behavior and expose the limits later tasks need.

## Context you need
- Current helpers live in `voice-gateway/src/local-speech.ts` (`wav`, `parseWav`,
  `resample`, `pcmToTwilioAudio`, `twilioAudioToPcm`, around lines 30-95). They are
  **not exported** and mix I/O with DSP. Copy the algorithms; do not import that file.
- Audio invariants: Twilio 8 kHz mu-law mono, 20 ms = 160 bytes; internal 16 kHz PCM16LE
  mono; Twilio out exactly 160-byte frames paced 20 ms.
- Current endpointing (`index.ts:121-141`): RMS threshold 500, endpoint 800 ms, minimum
  speech 250 ms, max utterance 20 000 ms. Task 11 must keep those values; Task 12 lowers
  endpointing to 700 ms via options. So defaults here are 500/800/250/20000.
- Barge-in (Task 13) needs a stricter detector: RMS 900 confirmed for 120 ms.
- No timers at import time; everything must be testable with Vitest fake timers.

## Files to create/modify
- `voice-gateway/src/audio/mulaw.ts` (new)
- `voice-gateway/src/audio/resample.ts` (new)
- `voice-gateway/src/audio/frames.ts` (new)
- `voice-gateway/src/audio/pacer.ts` (new)
- `voice-gateway/src/audio/vad.ts` (new)
- `voice-gateway/test/audio-mulaw.test.ts` (new)
- `voice-gateway/test/audio-resample.test.ts` (new)
- `voice-gateway/test/audio-frames.test.ts` (new)
- `voice-gateway/test/audio-pacer.test.ts` (new)
- `voice-gateway/test/audio-vad.test.ts` (new)

Do not modify `local-speech.ts` (Task 09 wraps it, Task 11 deletes it) and do not wire
anything into `index.ts`.

## Interface / contract

`mulaw.ts`:
```ts
export function encodeMulawSample(sample: number): number
export function decodeMulawSample(byte: number): number
export function pcm16ToMulaw(pcm: Buffer, sampleRate: number): Buffer
export function mulawToPcm16(mulaw: Buffer, sampleRate: number): Buffer
```
`pcm16ToMulaw`: if `sampleRate !== 8000`, downsample with `resamplePcm16` first.
`mulawToPcm16`: decode at 8 kHz, then resample to `sampleRate` when different.
Use standard G.711: `BIAS 0x84`, `CLIP 32635`; encode via exponent LUT
(`EXP_LUT[i]` = index of the highest set bit of `i`, computed once at module load);
decode `u = ~u & 0xff; t = (((u & 0x0f) << 3) + 0x84) << ((u >> 4) & 7); t -= 0x84;`
then apply sign bit `0x80`. Odd-length PCM buffers: ignore the trailing byte.

`resample.ts`:
```ts
export function resamplePcm16(pcm: Buffer, fromRate: number, toRate: number): Buffer
```
Linear interpolation between sample centers; output length
`Math.max(1, Math.round(samples * toRate / fromRate))` when input is non-empty, `0` for
empty. Identical rates return the input buffer unchanged. Throws `RangeError` for
`fromRate <= 0 || toRate <= 0`. Ignores a trailing odd byte.

`frames.ts`:
```ts
export const BYTES_PER_SAMPLE = 2
export const TWILIO_FRAME_BYTES = 160
export const INTERNAL_FRAME_BYTES = 640
export function chunkBuffer(buf: Buffer, size: number): Buffer[]
export function pcm16Samples(pcm: Buffer): number
export function rmsPcm16(pcm: Buffer): number
export function durationMs(pcm: Buffer, sampleRate: number): number
export function toPcm16le(samples: Int16Array): Buffer
```
`rmsPcm16` = sqrt(mean of squares over all complete samples), `0` for empty.
`chunkBuffer` returns full-size chunks plus a final shorter chunk; empty input → `[]`;
`size <= 0` throws `RangeError`.

`pacer.ts`:
```ts
export interface PacerOptions {
  send: (frame: Buffer) => void | Promise<void>
  frameMs?: number          // default 20
  maxQueueFrames?: number   // default 250
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}
export class Pacer {
  constructor(opts: PacerOptions)
  enqueue(frame: Buffer): 'queued' | 'dropped' | 'too_large'
  cancel(): void
  drain(): Promise<void>
  get queuedFrames(): number
  get active(): boolean
}
```
- Rejects frames > 160 bytes with `'too_large'`; frames < 160 stay as-is (last frame).
- One frame per `frameMs`; when the queue is at `maxQueueFrames`, drop the **newest**
  and return `'dropped'`.
- `send` may be async; the next tick is scheduled only after it settles.
- `cancel()` clears the timer, empties the queue, and causes `drain()` to resolve.
- `drain()` resolves when the queue is empty and no send is in flight.
- Default timers `setTimeout`/`clearTimeout`; `unref()` the handle when available.

`vad.ts`:
```ts
export interface VadOptions {
  speechRms: number          // 500
  minSpeechMs: number        // 250
  endpointSilenceMs: number  // 800
  maxUtteranceMs: number     // 20000
  preRollMs: number          // 200
  frameMs: number            // 20
}
export type VadEvent =
  | { type: 'speech_start' }
  | { type: 'speech_end'; pcm: Buffer; durationMs: number }
  | { type: 'utterance_max'; pcm: Buffer; durationMs: number }
export class Vad {
  constructor(opts: Partial<VadOptions> = {})
  push(pcm: Buffer, sampleRate: number): VadEvent[]
  reset(): void
  get speaking(): boolean
}
export class BargeInDetector {
  constructor(opts?: { rms?: number; confirmMs?: number; frameMs?: number }) // 900/120/20
  push(pcm: Buffer): boolean   // true once per confirmed onset
  reset(): void
}
```
VAD behavior (matches today unless options change):
- Speech if `rmsPcm16(pcm) > speechRms`.
- Keep a ring buffer of the last `preRollMs` of audio; prepend it when speech starts.
- Emit `speech_start` once on the first speech frame.
- On silence after speech, append the frame and emit `speech_end` when accumulated
  silence ≥ `endpointSilenceMs` **and** speech duration ≥ `minSpeechMs`; otherwise reset.
- Emit `utterance_max` when the utterance reaches `maxUtteranceMs`, including trailing
  silence frames; then reset.
- `durationMs` = total buffered utterance duration at emit.
- After an emit, the state resets to idle (no events on the same frame twice).

## Exact values
- mu-law: BIAS `0x84`, CLIP `32635`; 8 kHz ↔ internal rate.
- Frames: `160` outbound, `640` internal, 2 bytes/sample.
- Pacer: 20 ms, 250 frames max (~5 s).
- VAD defaults 500/250/800/20000/200/20 ms.
- Barge-in 900 RMS / 120 ms / 20 ms frames.

## Test plan
`audio-mulaw.test.ts`: `encodeMulawSample(0) === 0xFF`; `encodeMulawSample(-1) === 0x7F`;
decode of both is 0; roundtrip max abs error ≤ 64 over a deterministic stride sample of
values in `[-32000, 32000]`; silence 16 kHz 20 ms (640 B) → 160 B; `mulawToPcm16` of 160
silence bytes → 640 B; odd input ignores last byte; invalid-rate resampling path used
(8k→16k doubles length).

`audio-resample.test.ts`: same-rate returns identical buffer; 8k→16k doubles length and
duplicates samples; 16k→8k halves; 22050→16000 length is `round(n*16000/22050)`; empty
buffer → empty; `RangeError` on zero/negative rate; a 440 Hz sine retains its peak within
10%.

`audio-frames.test.ts`: chunking 1000 B @160 → 6 full + 1 of 40; empty → []; size 0
throws; constant PCM 1000 → rms 1000; PCM `[-1000, 1000]` → rms 1000; duration 640 B @16k
= 20 ms; Int16Array→Buffer roundtrip.

`audio-pacer.test.ts` (fake timers + injected timers are **not** required; use
`vi.useFakeTimers()` and default timers): 5 frames send one per 20 ms tick in order;
`cancel()` mid-queue stops further sends and resolves `drain()`; queue overflow at 250
returns `'dropped'`; 161-byte frame returns `'too_large'`; async `send` does not overlap
(second send not called until first resolves).

`audio-vad.test.ts`: 300 ms tone then 800 ms silence → one `speech_start` + one
`speech_end` with duration ≈ 1100 ms; 100 ms blip then silence → no `speech_end` (below
min); 900 ms speech + silence at 700 ms endpoint option → emits at 700; max utterance
option 1000 ms emits `utterance_max`; pre-roll option 200 ms means buffered audio starts
before the first speech frame; barge-in: 5 frames (100 ms) at amplitude 1000 → false, 6th
frame → true once, further frames false until `reset()`.

Run exactly:
```bash
npm test --prefix voice-gateway
npm run type-check --prefix voice-gateway
```

## Acceptance criteria
- [ ] Modules are pure (no env, no I/O, no console) except timers in `Pacer`.
- [ ] Twilio outbound frames are exactly 160 bytes; internal frame size is 640 bytes.
- [ ] VAD defaults reproduce 500 RMS / 800 ms endpoint / 250 ms min / 20 s max.
- [ ] Barge-in requires 900 RMS for 120 ms and fires once per onset.
- [ ] Pacer never exceeds 250 queued frames and stops on `cancel()`.
- [ ] No changes outside `voice-gateway/src/audio/**` and `voice-gateway/test/audio-*`.

## Out of scope
- Wiring into the session/transport (Tasks 11-13).
- Opus, noise suppression, AGC, or non-linear resampling.
- Streaming player for the browser widget.

## Report path
`.work/voice-upgrade/reports/08-audio-primitives.md`
