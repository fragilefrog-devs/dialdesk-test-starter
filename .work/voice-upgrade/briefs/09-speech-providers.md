# Task 09 — Speech providers: batch STT, streaming Piper TTS, cancellation

## Goal
Move Whisper.cpp and Piper behind typed provider interfaces with injected process
runners, add true streaming TTS (`--output-raw`) with cancellation, and keep the current
`transcribe`/`synthesize`/codec exports working until Task 11 deletes them.

## Context you need
- `voice-gateway/src/local-speech.ts` currently: `run()` buffers stdout/stderr and rejects
  on non-zero exit; `transcribe` writes a temp WAV and reads `<wav>.txt`; `synthesize`
  writes a temp WAV then `parseWav`s it (full file before returning — the latency problem);
  codecs `twilioAudioToPcm`/`pcmToTwilioAudio` are inline.
- Piper is invoked as `piper --model <model> --output_file <tmp.wav>` reading text on
  stdin (`local-speech.ts:113-123`). `pwcpp` args: `<wav> -m <model> -otxt
  --no_timestamps true --print_progress false` (`:101-103`). Add `--no_context` for the
  new provider (prevents prompt bleed between calls). Piper 1.5.1 supports
  `--output-raw`, which emits PCM16LE mono at the model rate on stdout.
- Model sample rate is **not** hardcodable: read `<model>.onnx.json` →
  `audio.sample_rate` (22050 for `en_US-lessac-medium.onnx` on this machine, but never
  assume). If the JSON or field is missing, fail at construction with a config error.
- `index.ts` imports exactly `{ pcmToTwilioAudio, synthesize, transcribe,
  twilioAudioToPcm }`, so the wrapper must preserve those names and return shapes.
- Task 08 provides `audio/mulaw.ts` and `audio/resample.ts`; use them for codecs.

## Files to create/modify
- `voice-gateway/src/speech/process.ts` (new; internal helper)
- `voice-gateway/src/speech/stt.ts` (new)
- `voice-gateway/src/speech/tts.ts` (new)
- `voice-gateway/src/local-speech.ts` (rewrite as a thin compatibility wrapper)
- `voice-gateway/test/speech-process.test.ts` (new)
- `voice-gateway/test/speech-stt.test.ts` (new)
- `voice-gateway/test/speech-tts.test.ts` (new)

Do not touch `index.ts`.

## Interface / contract

`src/speech/process.ts`:
```ts
import type { ChildProcess, SpawnOptions } from 'node:child_process'
export type SpawnFn = (cmd: string, args: string[], opts: SpawnOptions) => ChildProcess
export interface SpawnStream { child: ChildProcess; stdout: AsyncIterable<Buffer>; done: Promise<void> }
export interface RunResult { stdout: string; stderr: string }
export function spawnStream(spawnImpl: SpawnFn, cmd: string, args: string[],
  opts?: { cwd?: string }): SpawnStream
export function runBuffered(spawnImpl: SpawnFn, cmd: string, args: string[],
  input?: string, opts?: { timeoutMs?: number }): Promise<RunResult>
```
`spawnStream` always passes `{ stdio: ['pipe','pipe','pipe'], windowsHide: true }`.
`done` resolves on exit code 0 and rejects with
`new SpeechProcessError(code, stderrTail)` otherwise, where `code` is the exit code and
`stderrTail` is the last 1 000 chars. `runBuffered` defaults `timeoutMs` to 60 000, kills
the child on timeout and rejects with `SpeechProcessError('timeout')`.

`src/speech/stt.ts`:
```ts
export type SpeechErrorCode = 'stt_failed' | 'tts_failed' | 'config_unavailable'
export class SpeechError extends Error {
  constructor(public readonly code: SpeechErrorCode, message?: string, public readonly cause?: unknown)
}
export class SpeechProcessError extends Error {
  constructor(public readonly exit: number | 'timeout' | 'aborted', public readonly stderrTail: string)
}
export interface SttOptions {
  binary: string
  modelPath: string
  spawnImpl?: SpawnFn
  timeoutMs?: number        // 60_000
  tmpRoot?: string          // os.tmpdir()
}
export interface SttProvider {
  transcribe(pcm: Buffer, sampleRate: number,
    opts?: { signal?: AbortSignal; language?: string }): Promise<{ text: string }>
}
export function createSttProvider(opts: SttOptions): SttProvider
```
Implementation: write a mono 16-bit WAV at 16 kHz (resample if needed) to
`mkdtemp(path.join(tmpRoot, 'vg-stt-'))`, run
`[wav, '-m', modelPath, '-otxt', '--no_timestamps', 'true', '--no_context',
'--print_progress', 'false']`, read `<wav>.txt`, collapse whitespace, trim. Abort kills
the child (`SIGTERM`, then `SIGKILL` after 1 000 ms) and rejects `SpeechError('stt_failed')`.
Always `rm` the temp dir in `finally`. Empty/whitespace transcript → `{ text: '' }`.
Non-zero exit → `SpeechError('stt_failed', ..., cause)`.

`src/speech/tts.ts`:
```ts
export interface TtsOptions {
  binary: string
  modelPath: string
  spawnImpl?: SpawnFn
  voice?: string          // optional `--voice` isn't used unless set
}
export interface TtsSynthesis {
  stream: AsyncIterable<Buffer>  // PCM16LE mono, provider rate, aligned to 2 bytes
  sampleRate: number
}
export interface TtsProvider {
  readonly sampleRate: number
  synthesize(text: string, opts?: { signal?: AbortSignal }): TtsSynthesis
}
export function createTtsProvider(opts: TtsOptions): Promise<TtsProvider>
export async function readModelSampleRate(modelPath: string): Promise<number>
```
`readModelSampleRate` reads `${modelPath}.json`, parses JSON, returns
`obj.audio?.sample_rate` when it is a positive integer; otherwise throws
`SpeechError('config_unavailable')`. `createTtsProvider` awaits it once; `synthesize` is
sync and returns the stream.

`synthesize` spawns `binary` with `['--model', modelPath, '--output-raw']`, writes
`text.replace(/[\r\n]+/g, ' ')` to stdin and ends it. The generator:
- yields stdout chunks with a carry buffer so every yield except the last has an even
  length (PCM16 alignment);
- on abort: `child.kill()`, schedule `SIGKILL` after 1 000 ms, stop iteration;
- on early consumer `return` (barge-in): same kill path in `finally`;
- emits nothing for empty/whitespace text and resolves without spawning;
- rejects with `SpeechError('tts_failed')` if `done` rejects before the stream ends.

`src/local-speech.ts` compatibility wrapper (keep all four exports):
```ts
import { mulawToPcm16, pcm16ToMulaw } from './audio/mulaw.js'
export const twilioAudioToPcm = (payload: string) => mulawToPcm16(Buffer.from(payload, 'base64'), 16000)
export const pcmToTwilioAudio = (pcm: Buffer, sampleRate: number) => pcm16ToMulaw(pcm, sampleRate).toString('base64')
export async function transcribe(pcm: Buffer, sampleRate = 16000): Promise<string>
export async function synthesize(text: string): Promise<{ pcm: Buffer; sampleRate: number }>
```
`transcribe` lazily builds a provider from `WHISPER_CPP_PATH ?? 'pwcpp'` and
`WHISPER_MODEL_PATH` (missing model → `SpeechError('config_unavailable')`).
`synthesize` builds the TTS provider lazily from `PIPER_PATH ?? 'piper'` and
`PIPER_MODEL_PATH`, drains the stream into one Buffer, and returns
`{ pcm, sampleRate }`. Keep the temp-file implementation out of this file.

## Exact values
- STT args: `-m <model> -otxt --no_timestamps true --no_context --print_progress false`.
- TTS args: `--model <model> --output-raw`.
- Timeouts: STT 60 000 ms; kill escalation 1 000 ms; stderr tail 1 000 chars.
- Sample rate source: `<modelPath>.json` → `audio.sample_rate` (positive integer).
- Whisper WAV: 16 000 Hz, mono, 16-bit PCM.
- Text normalization: `/\s+/g` → single space, then `trim()`.

## Test plan
`speech-process.test.ts`: fake `spawnImpl` returning an `EventEmitter` with `stdout`,
`stderr`, `stdin` stubs. Cases: stdout collected; non-zero exit rejects with tail;
timeout kills and rejects `'timeout'`; `spawnStream` yields chunks and `done` resolves;
`SIGKILL` escalation timer is scheduled on abort.

`speech-stt.test.ts` (use a temp dir under `os.tmpdir()`; fake spawn writes the expected
`.txt` after args are inspected): args exactly as above; transcript whitespace collapsed;
empty file → `''`; missing model config → `config_unavailable`; non-zero exit →
`stt_failed`; abort kills and rejects; temp dir removed on success and failure; 8 kHz
input is resampled (assert the WAV header sample rate is 16000).

`speech-tts.test.ts`: `readModelSampleRate` parses a fixture JSON; missing file/field →
`config_unavailable`; spawn args include `--output-raw`; stdin receives sanitized text;
odd-length output chunks are aligned across yields (concatenated length even); empty text
does not spawn; abort kills the child and ends iteration; consumer `break` kills the
child (assert `kill` called); non-zero exit → `tts_failed`.

Run exactly:
```bash
npm test --prefix voice-gateway
npm run type-check --prefix voice-gateway
```

## Acceptance criteria
- [ ] Old imports (`transcribe`, `synthesize`, `pcmToTwilioAudio`, `twilioAudioToPcm`)
      still work with unchanged signatures and `index.ts` is untouched.
- [ ] TTS streams raw PCM and never writes a temp WAV; sample rate comes from the model JSON.
- [ ] Abort and early-return both terminate the Piper child; no orphan processes.
- [ ] Temp dirs are always removed; no transcript or audio text is logged.
- [ ] All failures surface as typed errors (`stt_failed`/`tts_failed`/`config_unavailable`).

## Out of scope
- Wiring providers into the session/transports (Task 11).
- Streaming STT or VAD inside Whisper.
- Changing the app's Ollama integration.
- Deleting `local-speech.ts` (Task 11).

## Report path
`.work/voice-upgrade/reports/09-speech-providers.md`
