# Report — Task 08: Gateway audio primitives

**Status:** done — all audio primitives and their suites are implemented. All three gates
pass (110 tests). No commits were made (per instruction).

**Scope:** created only `voice-gateway/src/audio/**` and `voice-gateway/test/audio-*`.
`voice-gateway/src/local-speech.ts` and `voice-gateway/src/index.ts` were not touched by this
task. (Concurrent tasks have modified `index.ts`; that diff is theirs, not this task's.)
No new dependencies were added; the resampler is hand-written.

## Files

Created:
- `voice-gateway/src/audio/mulaw.ts`
- `voice-gateway/src/audio/resample.ts`
- `voice-gateway/src/audio/frames.ts`
- `voice-gateway/src/audio/pacer.ts`
- `voice-gateway/src/audio/vad.ts`
- `voice-gateway/test/audio-mulaw.test.ts` (7 tests)
- `voice-gateway/test/audio-resample.test.ts` (8 tests)
- `voice-gateway/test/audio-frames.test.ts` (8 tests)
- `voice-gateway/test/audio-pacer.test.ts` (5 tests)
- `voice-gateway/test/audio-vad.test.ts` (7 tests)

## Exported signatures

`src/audio/mulaw.ts`
```ts
export function encodeMulawSample(sample: number): number
export function decodeMulawSample(byte: number): number
export function pcm16ToMulaw(pcm: Buffer, sampleRate: number): Buffer
export function mulawToPcm16(mulaw: Buffer, sampleRate: number): Buffer
```

`src/audio/resample.ts`
```ts
export function resamplePcm16(pcm: Buffer, fromRate: number, toRate: number): Buffer
```

`src/audio/frames.ts`
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

`src/audio/pacer.ts`
```ts
export interface PacerOptions {
  send: (frame: Buffer) => void | Promise<void>
  frameMs?: number
  maxQueueFrames?: number
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

`src/audio/vad.ts`
```ts
export interface VadOptions {
  speechRms: number
  minSpeechMs: number
  endpointSilenceMs: number
  maxUtteranceMs: number
  preRollMs: number
  frameMs: number
}
export type VadEvent =
  | { type: 'speech_start' }
  | { type: 'speech_end'; pcm: Buffer; durationMs: number }
  | { type: 'utterance_max'; pcm: Buffer; durationMs: number }
export class Vad {
  constructor(opts?: Partial<VadOptions>)
  push(pcm: Buffer, sampleRate: number): VadEvent[]
  reset(): void
  get speaking(): boolean
}
export class BargeInDetector {
  constructor(opts?: { rms?: number; confirmMs?: number; frameMs?: number })
  push(pcm: Buffer): boolean
  reset(): void
}
```

## Implementation notes / contracts honored

- **µ-law:** standard G.711 with `BIAS 0x84`, `CLIP 32635`, module-load `EXP_LUT`.
  `encodeMulawSample(0) === 0xff`, `encodeMulawSample(-1) === 0x7f`, both decode to `0`
  (decode explicitly avoids `-0`). `pcm16ToMulaw` resamples non-8 kHz input first;
  `mulawToPcm16` decodes at 8 kHz then resamples. Odd trailing PCM bytes are ignored.
- **Resampling:** linear interpolation copied from the current `local-speech` algorithm,
  output length `Math.max(1, Math.round(samples * toRate / fromRate))`, `Buffer.alloc(0)`
  for empty input, input object returned unchanged for equal rates, `RangeError` for
  non-positive rates. 8 kHz→16 kHz and 22050 Hz→16000 Hz paths are exercised.
- **Framing:** Twilio frame 160 bytes, internal frame 640 bytes (20 ms @ 16 kHz),
  2 bytes/sample. `chunkBuffer` throws `RangeError` for `size <= 0`; `rmsPcm16` averages
  squares over every complete sample.
- **Pacer:** one frame per `frameMs` (first send happens on the first timer tick), max 250
  queued frames with newest dropped, >160-byte frames rejected as `'too_large'`, async
  sends awaited before the next tick, `cancel()` clears timer/queue and resolves `drain()`,
  default timers call `unref()` when available. Errors thrown by `send` are swallowed so
  pacing continues.
- **VAD:** defaults 500 RMS / 250 ms min / 800 ms endpoint / 20 s max / 200 ms pre-roll /
  20 ms frames. Pre-roll is a whole-frame ring trimmed to the last 200 ms. Endpoint check
  wins over max if both become true on the same frame (matches the current gateway's
  `if endpoint ... else if max`). `speech_start` is emitted once before any reset.
- **Barge-in:** 900 RMS sustained for 120 ms (six 20 ms frames at ≥900), returns `true`
  once per onset, then stays quiet until `reset()`.

## Measured behavior

µ-law round-trip (`decode(encode(x))`) over a deterministic stride of 7:

| Range | Max abs error |
| --- | --- |
| `[-32000, 32000]` | **512** (at `-29564`) |
| `[-2000, 2000]` | **64** |

Resampler:
- 8 kHz→16 kHz `[100, 200, 300]` → `[100, 150, 200, 250, 300, 300]` (6 samples; each source
  sample is reproduced at output index `2i`).
- 16 kHz→8 kHz `[100, 200, 300, 400]` → `[100, 300]`.
- 22050 Hz→16000 Hz: 2205 samples → 1600 samples (`round(2205 * 16000 / 22050)`).
- 440 Hz sine at 22050 Hz (100 ms, amplitude 10000) resampled to 16 kHz: input peak
  10000, output peak 9996 (ratio 0.9996, well inside the 10% target).
- 640-byte 16 kHz silence → 160 µ-law bytes; 160 µ-law silence bytes (`0xff`) → 640 bytes.

## Gate output

`npm test --prefix voice-gateway` — exit 0:
```text
> voice-gateway@1.0.0 test
> vitest run

 ✓ test/metrics.test.ts (12 tests)
 ✓ test/config.test.ts (19 tests)
 ✓ test/protocol.test.ts (16 tests)
 ✓ test/audio-resample.test.ts (8 tests)
 ✓ test/app-api.test.ts (15 tests)
 ✓ test/audio-vad.test.ts (7 tests)
 ✓ test/logger.test.ts (12 tests)
 ✓ test/audio-frames.test.ts (8 tests)
 ✓ test/audio-pacer.test.ts (5 tests)
 ✓ test/smoke.test.ts (1 test)
 ✓ test/audio-mulaw.test.ts (7 tests)

 Test Files  11 passed (11)
      Tests  110 passed (110)
```

The other suites in that run (`metrics`, `config`, `protocol`, `app-api`, `logger`) belong
to concurrently landing tasks. An earlier run of the same command caught two transient
`metrics.test.ts` failures from that work-in-progress; they pass in the final run above.

`npm run type-check --prefix voice-gateway` — exit 0, no output:
```text
> voice-gateway@1.0.0 type-check
> tsc --noEmit -p .
```

`npm run build --prefix voice-gateway` — exit 0, no output:
```text
> voice-gateway@1.0.0 build
> tsc -p .
```

A standalone strict check of just this task's five modules also passes:
`npx tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --types node src/audio/*.ts`.

## Invariants / ambiguities I had to infer

1. **µ-law tolerance conflict (needs a controller decision if literal).** The brief asks for
   max round-trip error ≤ 64 over `[-32000, 32000]`. With 8-bit G.711 the top segment step is
   1024, so the best possible worst-case error is 512; 64 is only achievable for
   `|sample| <= ~2000`. I kept the mandated standard codec and test both bounds (≤512
   full-range, ≤64 low-range) rather than weaken the codec. **This is the one deviation from
   the literal test plan.**
2. **"8k→16k duplicates samples" vs "linear interpolation".** These conflict. I followed the
   explicit interface text and copied the existing `local-speech` interpolation: source
   samples appear unchanged at even output indices, odd indices are interpolated. (The
   Task 06 test harness uses sample-and-hold duplication instead; if integration later
   requires byte-identical harness output, Task 11 should confirm which behavior it wants.)
3. **Pacer first tick.** Frames are sent after the first `frameMs` tick, not immediately on
   the first enqueue. This keeps the tests deterministic under fake timers ("one frame per
   20 ms tick"); the first audible frame is delayed by 20 ms.
4. **`cancel()` while a send is in flight.** Per the brief, `cancel()` resolves `drain()`
   immediately even though one send is still pending; `active` stays `true` until that send
   settles, and new frames enqueued after cancellation are paced once it does.
5. **VAD duration includes pre-roll and trailing silence.** `durationMs` is the total
   buffered utterance duration (300 ms speech + 800 ms silence → 1100; with 200 ms pre-roll →
   1300), as specified.
6. **RMS sampling.** `rmsPcm16` uses every complete sample, unlike the current `index.ts`
   which samples every 8th; the Task 08 contract explicitly requires all samples.
7. **`MAX_UTTERANCE_SECONDS`.** The Task 11 brief says Task 08 provides it, but the Task 08
   interface does not list it and Task 10's `LIMITS` defines it as 15 (while the VAD default
   here is 20 000 ms). I did not invent an export; Task 11 should take it from `LIMITS`.

## For Sentinel / Probe

- Sentinel: Pacer swallows `send` rejections by design (pacing continues, no logging); confirm
  that transport-level failures are surfaced elsewhere (Task 10/11) rather than silently lost.
- Probe: verify real Twilio frame sizes stay at exactly 160 bytes through `pcm16ToMulaw`
  (20 ms @ 16 kHz), and that VAD endpointing with the Task 12 `endpointSilenceMs: 700` option
  produces the same utterance boundaries expected by the turn loop.
- Pacer `unref()` means a standalone process will not be held open by a queued/scheduled
  frame; a real session must keep its own socket/server handle alive.
