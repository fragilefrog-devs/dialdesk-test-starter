# Task 10 — Session contract, state machine, manager, admission limits

## Goal
Define the shared session contract (state machine, events, turn IDs, error codes,
transport boundary) and implement a tested `VoiceSession` plus admission controls that
Tasks 11–13 wire without redefining behavior.

## Context you need
- Today all call state is local variables inside `handleConnection`
  (`voice-gateway/src/index.ts:37-172`): no explicit states, no turn identity, no
  cancellation.
- Decisions: barge-in is legal **only** from `speaking` (D6); stale events carry a
  `turnId` and are dropped; one turn at a time per session; finalize once.
- Task 07 provides `VoiceSessionConfig`, `Channel`, `PROTOCOL_VERSION`, `Logger`,
  `Metrics`. Task 08 provides `Vad` and `Pacer`.
- Task 11 will implement `Transport` for Twilio and browser and pass a buffered
  `onUtterance`; Task 12 replaces that callback with the streaming turn manager; Task 13
  uses `interrupt()`.
- The state machine is normative for the whole Phase 2/3 work.

## Files to create/modify
- `voice-gateway/src/protocol.ts` (append session types; keep Task 07 exports unchanged)
- `voice-gateway/src/auth/limits.ts` (new)
- `voice-gateway/src/sessions/session.ts` (new)
- `voice-gateway/src/sessions/manager.ts` (new)
- `voice-gateway/test/session-state.test.ts` (new)
- `voice-gateway/test/session-turn.test.ts` (new)
- `voice-gateway/test/session-playback.test.ts` (new)
- `voice-gateway/test/session-close.test.ts` (new)
- `voice-gateway/test/limits.test.ts` (new)
- `voice-gateway/test/manager.test.ts` (new)

Do not wire into `index.ts` in this task.

## Interface / contract

`src/protocol.ts` — append exactly:
```ts
export type SessionState =
  | 'idle' | 'connecting' | 'greeting' | 'listening' | 'processing'
  | 'speaking' | 'interrupted' | 'closing' | 'failed' | 'completed'

export type EndReason = 'hangup' | 'max_duration' | 'token_refresh_failed'
  | 'server_shutdown' | 'error'

export type ErrorCode =
  | 'unsupported_protocol_version' | 'handshake_timeout' | 'message_too_large'
  | 'invalid_message' | 'invalid_audio_format' | 'unauthorized' | 'session_limit'
  | 'ip_limit' | 'config_unavailable' | 'stt_failed' | 'llm_failed' | 'tts_failed'
  | 'turn_cancelled' | 'max_duration' | 'server_shutdown' | 'internal_error'

export interface TranscriptEvent { role: 'caller' | 'agent'; text: string; turnId: string }
export interface SpeakEvent { speaking: boolean; turnId: string }

export interface Transport {
  readonly channel: Channel
  isOpen(): boolean
  sendAudio(frame: Buffer, meta: { turnId: string; sampleRate: number }): void
  sendTranscript(event: TranscriptEvent): void
  setSpeaking(event: SpeakEvent): void
  interrupt(): void
  sendError(code: ErrorCode): void
  close(code?: number, reason?: string): void
}
```

`src/auth/limits.ts`:
```ts
export const LIMITS = {
  MAX_CONCURRENT_SESSIONS: 64,
  MAX_CONNECTIONS_PER_IP: 4,
  MAX_UPGRADES_PER_IP: 10,
  UPGRADE_WINDOW_MS: 60_000,
  HANDSHAKE_DEADLINE_MS: 10_000,
  IDLE_TIMEOUT_MS: 30_000,
  MAX_WS_MESSAGE_BYTES: 65_536,
  MAX_UTTERANCE_SECONDS: 15,
  OUTBOUND_QUEUE_MAX_FRAMES: 250,
  ENDPOINT_SILENCE_MS: 700,
  MIN_SPEECH_MS: 250,
  PRE_ROLL_MS: 200,
  SPEECH_RMS: 500,
  BARGE_IN_RMS: 900,
  BARGE_IN_CONFIRM_MS: 120,
  STT_GLOBAL_CONCURRENCY: 4,
  LLM_GLOBAL_CONCURRENCY: 8,
  TTS_GLOBAL_CONCURRENCY: 4,
} as const

export interface AdmissionResult { ok: boolean; reason?: 'session_limit' | 'ip_limit' }

export class AdmissionController {
  constructor(limits?: Partial<typeof LIMITS>, now?: () => number)
  admit(ip: string): AdmissionResult
  release(ip: string): void
  allowUpgrade(ip: string): boolean       // sliding 60 s window, max 10
  get sessions(): number
  get ips(): ReadonlyMap<string, number>
}

export class Semaphore {
  constructor(max: number)
  acquire(signal?: AbortSignal): Promise<() => void>
  get active(): number
  get waiting(): number
}
```
`admit`: throws nothing; increments global and per-IP counts only when both are under
limits. Per-IP count of `0`/unknown IP is allowed. `release` floors at 0 and deletes the
IP entry at 0. `allowUpgrade` prunes timestamps older than 60 000 ms, records `now()`,
and returns false at 10. `Semaphore.acquire` rejects with `AbortError` if the signal is
already aborted; the returned release is idempotent.

`src/sessions/session.ts`:
```ts
export interface SessionDeps {
  config: VoiceSessionConfig
  transport: Transport
  onGreeting: (session: VoiceSession) => Promise<void>
  onUtterance: (session: VoiceSession, input: {
    pcm: Buffer; sampleRate: number; turnId: string }) => Promise<void>
  onClose?: (session: VoiceSession, reason: EndReason) => Promise<void>
  onMaxDuration?: (session: VoiceSession) => Promise<void>
  logger: Logger
  metrics: Metrics
  now?: () => number
  maxCallSeconds?: number   // 1800
  idleTimeoutMs?: number    // 30000
}
export class InvalidTransitionError extends Error {}

export class VoiceSession {
  constructor(deps: SessionDeps)
  readonly id: string
  readonly config: VoiceSessionConfig
  get state(): SessionState
  get currentTurnId(): string
  get startedAt(): number
  start(): Promise<void>
  receiveAudio(pcm: Buffer, sampleRate: number): void
  speak(text: string, audio: AsyncIterable<Buffer>, sampleRate: number,
    opts?: { turnId?: string }): Promise<void>
  interrupt(opts?: { confirmed?: boolean }): boolean
  isStale(turnId: string): boolean
  close(reason: EndReason): Promise<void>
  fail(code: ErrorCode): void
}
```

Normative transitions:
```
idle -> connecting -> greeting -> listening
listening -> processing -> speaking -> listening
speaking -> interrupted -> listening
any (except completed/failed) -> closing -> completed
any -> failed
```
- `start()`: `connecting` immediately; then `greeting`, await `onGreeting`; then
  `listening`. If the transport closed or the call closed meanwhile, stop. Starts the
  max-call timer (`maxCallSeconds`) which awaits `onMaxDuration` (2 000 ms budget) and
  then calls `close('max_duration')`.
- `receiveAudio`: accepted in `listening`; fed to a `Vad` built with defaults from
  `LIMITS` (500/250/800/20000). On `speech_end`/`utterance_max`: if already
  `processing`/`speaking`, ignore; else set `processing`, allocate a new turn id, emit
  `{speaking:false}`? No — `setSpeaking` only around playback. Call `onUtterance` with
  the utterance and the turn id. Errors from `onUtterance` are logged and `fail('internal_error')`
  (Task 12 catches provider errors itself).
- `speak()`: only from `greeting`, `processing`, or `listening`; sets `speaking` and
  emits `setSpeaking({speaking:true,turnId})`; sends the agent transcript once; then
  paces audio frames through a `Pacer` (20 ms, 250 frames) calling
  `transport.sendAudio(frame,{turnId,sampleRate})`. On completion: `setSpeaking(false)`
  and return to `listening`. If `interrupt()` happened, terminate without transitioning
  again.
- `interrupt({confirmed})`: returns false unless `state === 'speaking'` **and**
  `confirmed !== false`. Sets `interrupted`, calls `transport.interrupt()`, aborts the
  active audio stream (via an internal `AbortController`), drains the pacer, increments
  the turn id (invalidating prior events), emits `setSpeaking(false)` for the old turn,
  then goes to `listening`. Synchronous; returns true.
- `isStale(turnId)`: `turnId !== this.currentTurnId || state === 'closing' ||
  state === 'completed' || state === 'failed'`.
- `close(reason)`: idempotent (second call awaits the same promise). Clears timers,
  aborts playback, transitions `closing`, awaits `onClose` with a 2 000 ms budget, then
  `completed`, `transport.close(code)` where code = `4000` for `max_duration`, `4001` for
  `token_refresh_failed`, else `1000`.
- `fail(code)`: idempotent; `transport.sendError(code)`, state `failed`,
  `transport.close(1011)` (`1008` for `unauthorized`, `1013` for `session_limit`).
- Idle timer: reset on `receiveAudio` (any frame) and `speak` start; on fire,
  `close('hangup')`. Timers use `deps.now`/`setTimeout`; always `clearTimeout` in finally.
- Metrics: `voice_sessions_total{channel,result}` on terminal state (`completed`/`failed`),
  `voice_sessions_active` gauge on start/close.

`src/sessions/manager.ts`:
```ts
export interface SessionManagerDeps {
  limits?: AdmissionController
  createSession: (ctx: { id: string; ip: string; channel: Channel }) => VoiceSession
  logger: Logger
}
export class SessionManager {
  constructor(deps: SessionManagerDeps)
  open(ctx: { ip: string; channel: Channel }): { ok: true; session: VoiceSession } | {
    ok: false; reason: 'session_limit' | 'ip_limit' }
  close(id: string): void
  get size(): number
  closeAll(reason: EndReason, deadlineMs?: number): Promise<void>
}
```
`open` admits, creates, registers; `close` unregisters and releases the IP. `closeAll`
closes every session in parallel and resolves when all settle or the deadline
(default 8 000 ms) passes.

## Exact values
- States/transitions exactly as listed; turn ids `t_1`, `t_2`, … (module counter).
- Close codes: 1000 normal, 4000 max_duration, 4001 token_refresh_failed, 1008
  unauthorized, 1011 internal, 1013 session limit.
- Idle 30 000 ms; max call 1 800 s; onClose budget 2 000 ms; shutdown 8 000 ms.
- Playback: 20 ms frames; queue cap 250; sample rate from `speak()`.
- Admission: 64 total, 4/IP, upgrades 10/60 000 ms.

## Test plan
Fake transport records calls. Fake logger/metrics are objects with `vi.fn()` methods.

`session-state.test.ts`: start → greeting → listening; illegal transitions throw
(`speak` from `idle`, `interrupt` from `listening` returns false, not throw); `fail`
allowed from any non-terminal; terminal states reject transitions.

`session-turn.test.ts`: VAD end triggers `onUtterance` once with a `t_` id in
`processing`; a second utterance while processing is dropped; `isStale('t_1')` true after
a second turn; max-call timer awaits `onMaxDuration` then closes `max_duration` (also when
the hook rejects); idle timer fires
`close('hangup')`; `onUtterance` rejection → `failed` + `internal_error`.

`session-playback.test.ts`: `speak` emits agent transcript, `speaking:true`, then frames
paced 20 ms, then `speaking:false`, state back to `listening`; `interrupt()` during
playback emits `transport.interrupt`, stops frames, invalidates the turn, and returns to
`listening`; `interrupt()` before `speaking` returns false and sends nothing; interrupted
stream iteration calls `return()` (generator `finally` runs).

`session-close.test.ts`: `close` twice runs `onClose` once and closes once; onClose
timeout (fake timers) still completes within 2 000 ms; `max_duration`/`token_refresh_failed`
map to 4000/4001; `fail('stt_failed')` sends the error and closes 1011; `unauthorized` →
1008; `session_limit` → 1013.

`limits.test.ts`: 64th admit ok, 65th `session_limit`; 5th connection from one IP
`ip_limit`; `release` frees both; upgrade window allows exactly 10 per 60 s and refills
after 60 001 ms; semaphore max 2 serializes and releases idempotently; aborted acquire
rejects.

`manager.test.ts`: `open` creates and tracks; limit rejection returns the reason; `close`
releases; `closeAll` settles within the deadline.

Run exactly:
```bash
npm test --prefix voice-gateway
npm run type-check --prefix voice-gateway
```

## Acceptance criteria
- [ ] `protocol.ts` exports the full state/transport/error contract; Task 07 exports intact.
- [ ] All transitions outside the table throw or return false exactly as specified.
- [ ] Turn IDs invalidate stale events; barge-in is legal only from `speaking`.
- [ ] Playback is paced at 20 ms, capped at 250 frames, and cancelable.
- [ ] `close`/`fail` are idempotent and always emit exactly one terminal close.
- [ ] No module reads env at import time; no wiring changes to `index.ts`.

## Out of scope
- Transport implementations (Task 11).
- Streaming turn logic/endpointing changes (Task 12).
- Barge-in detection thresholds (Task 13 adds the widget/mic behavior).
- Persistent session storage.

## Report path
`.work/voice-upgrade/reports/10-session-contract.md`
