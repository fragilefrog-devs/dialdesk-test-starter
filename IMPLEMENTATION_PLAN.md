# DialDesk Starter --- Implementation Plan

**Document:** `IMPLEMENTATION_PLAN.md`\
**Scope:** Improve `dialdesk-test-starter` into a reliable, low-latency,
multi-tenant voice SaaS for Twilio phone calls and browser voice chat.

## 1. Objective

Keep the existing Next.js application and Node.js voice gateway as the
product foundation. Improve the gateway's voice-processing architecture
so phone and browser conversations can support natural turn-taking,
streaming audio, interruption handling, reliable call lifecycle
management, and production-grade security and observability.

The implementation should be incremental. Preserve working application
and telephony functionality, establish end-to-end tests first, and
introduce a dedicated voice runtime only behind a stable interface.

## 2. Current State and Main Gaps

The reviewed implementation includes:

-   A Next.js application for tenant-aware business logic, agent
    configuration, call history, and related SaaS features.
-   A Node.js gateway at `voice-gateway/src/index.ts` that handles
    Twilio Media Streams and browser WebSocket sessions.
-   Local speech processing in `voice-gateway/src/local-speech.ts`,
    using Whisper.cpp for transcription and Piper for speech synthesis,
    with Ollama used for response generation through the application.
-   Twilio audio conversion between μ-law and PCM, and output pacing in
    160-byte μ-law frames at 20 ms intervals.
-   Custom RMS/silence-based speech boundary detection.

The main gaps to address are:

1.  The gateway waits for a complete utterance before transcription.
2.  The application generates a response and the TTS service generates a
    complete WAV before playback starts.
3.  Incoming audio is largely ignored while the assistant is processing
    or speaking, so full barge-in behavior is not implemented.
4.  Audio transport, turn detection, orchestration, speech-provider
    calls, and session management are tightly coupled.
5.  WebSocket connection authorization, resource limits, cancellation,
    cleanup, and durable finalization need stronger verification.
6.  The repository documentation identifies end-to-end flows that still
    need to be tested, including real Twilio calls and local audio/model
    integration.

These are architectural observations from the reviewed code, not
measured performance results. Establish a baseline before claiming
latency or reliability improvements.

## 3. Target Architecture

``` text
Twilio Media Streams ─┐
                      ├─> Transport adapters and session authorization
Browser voice ────────┘                 |
                                        v
                              Shared voice runtime
                    Audio frames · VAD · endpointing
                    STT · LLM · tools · TTS
                    Barge-in · cancellation · timeouts
                                        |
                                        v
                              Application API
               Tenant-scoped tools · agents · knowledge
               Call lifecycle · transcripts · usage events
                                        |
                                        v
                              Durable data storage
```

### Responsibility boundaries

**Next.js application** - Owns authentication, organizations, agent
configuration, business rules, authorization, persistence, billing, and
usage records. - Exposes authenticated internal APIs for voice sessions
and tool execution. - Remains the authority for call state and tenant
ownership.

**Node.js voice gateway** - Owns Twilio and browser transport
connections, media framing, session routing, connection lifecycle, and
transport-specific audio conversion. - Applies connection limits and
early authentication. - Does not become the source of truth for tenant
permissions, billing, or business records.

**Voice runtime** - Owns the conversational pipeline: speech detection,
turn management, STT/LLM/TTS coordination, interruption, cancellation,
and provider timeouts. - Can initially remain in Node.js if that
minimizes risk. If adopting a dedicated Python runtime such as Pipecat,
connect it through a defined internal protocol and migrate one transport
at a time. - Exposes a transport-independent session contract so phone
and browser calls share the same conversation behavior.

**Application tools** - Execute tenant-scoped actions such as booking,
availability checks, lead capture, knowledge retrieval, and call
transfer. - Validate tool arguments, enforce permissions, apply
timeouts, and return structured success or error results.

## 4. Implementation Phases

### Phase 0 --- Establish a reliable baseline

**Tasks** - \[ \] Review the root README and gateway README; document
required environment variables and local dependencies. - \[ \] Fix
existing build, type-check, lint, and test failures before adding new
architecture. - \[ \] Document the current phone and browser call
flows. - \[ \] Create a reproducible local test using the configured
STT, LLM, and TTS providers. - \[ \] Verify a real inbound Twilio call
from webhook through media connection, response playback, and call
finalization. - \[ \] Record baseline latency and failure metrics. - \[
\] Add automated tests for audio conversion, frame sizing, silence
detection, session cleanup, and application API errors.

**Acceptance criteria** - The documented build and test commands run
consistently in a clean environment. - A test call can complete
successfully and persist its final status. - Known failures are recorded
as explicit issues rather than hidden by a passing gateway build.

### Phase 1 --- Harden sessions and the gateway

**Tasks** - \[ \] Authenticate and authorize WebSocket sessions as early
as the transport allows, before allocating expensive work. - \[ \]
Continue validating Twilio webhook signatures. - \[ \] Validate signed
call tokens and internal service credentials on protected application
endpoints. - \[ \] Never trust client-supplied organization IDs, agent
IDs, or call IDs without server-side authorization. - \[ \] Add maximum
message sizes, connection limits, idle timeouts, call-duration limits,
and bounded processing queues. - \[ \] Apply concurrency limits to
transcription, LLM, and synthesis work. - \[ \] Add graceful shutdown so
active sessions are closed or handed off deliberately. - \[ \] Ensure
secrets and sensitive transcripts are not written to logs. - \[ \] Make
finalization idempotent in the application database, not only through an
in-memory gateway flag. - \[ \] Retry transient finalization failures or
record them in a durable retry mechanism.

**Acceptance criteria** - Unauthorized sessions cannot access another
tenant's agent, call, transcript, or tools. - Malformed, oversized,
idle, and over-limit connections are rejected safely. - Repeated
stop/close events do not create duplicate final records or usage
charges. - A gateway restart does not silently lose the authoritative
call status.

### Phase 2 --- Refactor the voice loop for streaming

**Tasks** - \[ \] Separate audio transport from conversation
orchestration. - \[ \] Introduce explicit session states, such as
`listening`, `processing`, `speaking`, `interrupted`, `closing`, and
`failed`. - \[ \] Replace unbounded or whole-utterance-only buffering
with bounded audio-frame queues. - \[ \] Introduce configurable VAD and
endpointing. Do not rely only on a fixed RMS threshold and fixed silence
timer. - \[ \] Support partial transcription when the selected STT
provider offers it; if using Whisper.cpp in batch mode, document the
latency trade-off and evaluate a streaming-compatible alternative. - \[
\] Stream LLM output when supported. - \[ \] Start TTS on safe text
segments rather than waiting for the complete answer. - \[ \] Stream
playable audio frames as they become available, respecting the output
transport's required encoding and pacing. - \[ \] Add cancellation and
timeouts for STT, LLM, TTS, and tool execution. - \[ \] Prevent stale
audio or stale LLM responses from being sent after a turn has been
interrupted. - \[ \] Preserve conversation ordering and associate
asynchronous work with a session and turn identifier.

**Acceptance criteria** - Audio can be processed continuously without
blocking WebSocket message handling. - The first playable response audio
can be sent before the entire response has been synthesized, where the
provider supports incremental output. - Slow providers fail with a
controlled fallback instead of leaving the call stuck. - Memory and
queue sizes remain bounded during long calls.

### Phase 3 --- Implement barge-in and natural turn-taking

**Tasks** - \[ \] Continue listening for caller speech while the
assistant is speaking. - \[ \] Distinguish caller speech from output
echo and background noise as far as the available audio path permits. -
\[ \] When interruption is confirmed, stop or clear queued playback
using the correct transport-specific mechanism. - \[ \] Cancel active
TTS and obsolete LLM generation where supported. - \[ \] Invalidate
late-arriving output from the interrupted turn. - \[ \] Reset turn state
cleanly and process the caller's new utterance. - \[ \] Make endpointing
and interruption sensitivity configurable per agent. - \[ \] Test
interruptions at the beginning, middle, and end of assistant speech.

**Acceptance criteria** - Caller speech can interrupt assistant playback
without old audio continuing afterward. - The next assistant response
corresponds to the newest valid caller turn. - False interruptions and
missed interruptions are measured and tunable.

### Phase 4 --- Define a shared voice-session contract

Use one internal contract for both phone and browser sessions. Example
TypeScript shape:

``` ts
type VoiceSessionConfig = {
  callId: string;
  organizationId: string;
  agentId: string;
  channel: "phone" | "browser";
  language: string;
  voice: string;
  enabledTools: string[];
};
```

This is an internal interface, not permission to trust client-provided
values. The application must resolve or validate the organization,
agent, permissions, and call from authenticated server-side records.

**Tasks** - \[ \] Validate session configuration at the application
boundary. - \[ \] Version the internal gateway/runtime protocol. - \[ \]
Define typed events for session start, partial/final transcript,
assistant start/stop speaking, tool start/completion, interruption, call
end, and call failure. - \[ \] Include `callId`, `turnId`, timestamps,
and correlation IDs where appropriate. - \[ \] Define consistent error
codes and timeout behavior. - \[ \] Keep transport-specific details out
of business tools.

**Acceptance criteria** - Phone and browser calls use the same
conversation and tool contracts. - A provider can be replaced without
rewriting the Twilio webhook or business tools. - Protocol errors are
detectable and diagnosable.

### Phase 5 --- Decide and implement the runtime strategy

Choose one path based on measured results and engineering constraints.

**Option A: Refactor in Node.js first** - Keep the current deployment
model. - Separate the gateway, turn manager, STT, LLM, TTS, and tool
interfaces into modules. - Implement streaming and cancellation through
provider capabilities. - Prefer this path if reducing deployment
complexity and making the smallest initial change are the main goals.

**Option B: Add a dedicated Python voice runtime** - Keep the Node.js
gateway for Twilio/browser transport and session routing. - Add a Python
service using a pipeline framework such as Pipecat for orchestration,
audio frames, VAD, and provider coordination. - Define a versioned
internal protocol between the gateway and runtime. - Authenticate
service-to-service requests and bind each runtime session to an
authorized call. - Migrate one transport first, validate it, then
migrate the other. - Prefer this path if the product needs richer
pipeline composition and provider flexibility.

**Decision rule:** do not migrate frameworks based on assumption alone.
Build a representative call test, compare first-audio latency,
interruption behavior, failure recovery, deployment cost, and
operational complexity, then choose.

### Phase 6 --- Observability and performance

**Tasks** - \[ \] Emit structured logs with call, session, turn, and
correlation identifiers. - \[ \] Measure time to first transcript,
end-of-turn delay, LLM time to first token, TTS time to first audio,
time to first audible response, and total turn latency. - \[ \] Track
disconnects, audio gaps, dropped frames, provider failures, tool
failures, interruptions, and abandoned sessions. - \[ \] Record call
completion rate and failure reason. - \[ \] Avoid logging secrets or
unrestricted raw audio/transcripts. - \[ \] Add dashboards and alerts
for latency regressions, failure spikes, and resource saturation. - \[
\] Load-test concurrent sessions and establish capacity limits from
measurements.

**Acceptance criteria** - A slow or failed call can be diagnosed from
correlated logs and metrics. - Performance changes are compared against
the baseline rather than judged by anecdotal impressions. - The gateway
has documented concurrency and resource limits.

### Phase 7 --- SaaS data, usage, and product readiness

**Tasks** - \[ \] Ensure organizations, members, agents, phone numbers,
calls, transcripts, and usage records have clear ownership and access
policies. - \[ \] Persist lifecycle transitions and usage events
durably. - \[ \] Make webhook processing and usage accounting
idempotent. - \[ \] Apply tenant authorization consistently to every API
and data query. - \[ \] Verify agent configuration is loaded server-side
and validated before a call begins. - \[ \] Add transcript retention,
deletion, consent, and access policies. - \[ \] Verify Stripe checkout
and webhook flows separately from voice-gateway tests. - \[ \] Add
knowledge-base ingestion and retrieval after the core call flow is
dependable. - \[ \] Add call summaries and analytics only after
transcript and call-state persistence is reliable.

**Acceptance criteria** - Tenant isolation is covered by automated
tests. - Usage is not double-counted on retries. - Retention and
deletion behavior is documented and tested. - Product features do not
depend on ephemeral gateway memory as their only data source.

## 5. Audio and Telephony Requirements

-   Preserve the audio format expected by each transport and provider.
-   Twilio Media Streams audio commonly uses 8 kHz μ-law; decode and
    resample correctly for processing, then encode output back to the
    format Twilio expects.
-   Verify sample rate, channel count, frame duration, byte order, and
    payload format at each boundary.
-   Pace telephony output correctly; do not assume that sending smaller
    chunks alone makes synthesis streaming.
-   Handle missing, malformed, duplicated, delayed, or out-of-order
    messages safely.
-   Test silence, background noise, clipped speech, long utterances,
    caller interruption, and network jitter.
-   Verify browser audio separately; do not assume a transport
    implementation that works for Twilio will automatically work for
    browser sessions.

## 6. Suggested Code Organization

This is a proposed target structure; retain existing files where
practical and migrate incrementally.

``` text
dialdesk-test-starter/
├── app/                         # Existing Next.js application
├── src/
│   └── lib/
│       ├── auth/
│       ├── organizations/
│       ├── agents/
│       ├── calls/
│       ├── voice/
│       └── usage/
├── voice-gateway/
│   └── src/
│       ├── index.ts
│       ├── transports/
│       │   ├── twilio.ts
│       │   └── browser.ts
│       ├── sessions/
│       ├── auth/
│       ├── audio/
│       └── observability/
├── voice-runtime/               # Optional if using a separate runtime
│   ├── app.py
│   ├── session.py
│   ├── pipeline.py
│   ├── providers/
│   ├── tools/
│   └── tests/
└── tests/
    ├── unit/
    ├── integration/
    └── load/
```

## 7. End-to-End Test Matrix

  -----------------------------------------------------------------------
  Scenario                            Expected result
  ----------------------------------- -----------------------------------
  Successful inbound Twilio call      Call connects, assistant responds,
                                      final state and duration persist

  Successful browser call             Browser audio round-trip completes
                                      and session closes cleanly

  Caller interrupts assistant         Playback stops, obsolete output is
                                      discarded, new turn is processed

  STT unavailable                     Controlled error or fallback;
                                      session does not hang

  LLM timeout                         Timely fallback; timeout and
                                      failure are observable

  TTS failure                         Controlled response or recovery
                                      path; no stuck speaking state

  Business tool fails                 Structured tool error; assistant
                                      handles it safely

  Duplicate Twilio stop/close events  One authoritative finalization and
                                      one usage record

  Unauthorized WebSocket              Rejected before expensive
                                      processing or data access

  Cross-tenant call access            Denied and covered by automated
                                      tests

  Long or noisy utterance             Bounded memory; predictable turn
                                      handling

  Gateway shutdown                    Active sessions are cleaned up or
                                      marked for recovery

  Concurrent calls                    No session cross-talk; queues and
                                      resource usage stay within limits

  Provider returns late output        Output from an obsolete or
                                      cancelled turn is discarded
  -----------------------------------------------------------------------

## 8. Recommended Delivery Order

1.  Establish the baseline and verify the full existing call flow.
2.  Harden gateway authorization, limits, cleanup, and durable
    finalization.
3.  Separate transport handling from the voice turn manager.
4.  Implement streaming-compatible STT/LLM/TTS paths where supported.
5.  Implement barge-in and cancellation.
6.  Standardize the session contract and lifecycle events.
7.  Choose whether to keep orchestration in Node.js or introduce a
    dedicated Python runtime based on benchmark results.
8.  Add observability, load testing, and operational alerts.
9.  Verify tenant isolation, usage accounting, retention, and billing
    flows.
10. Expand knowledge-base and analytics features after the calling path
    is reliable.

## 9. Release Gate

Do not call the system production-ready until:

-   [ ] Build, type-check, lint, and automated tests pass.
-   [ ] Real Twilio and browser calls have been tested end to end.
-   [ ] Interruption and cancellation work as expected.
-   [ ] STT, LLM, TTS, and tool failures have bounded recovery behavior.
-   [ ] Authorization and tenant isolation tests pass.
-   [ ] Call finalization and usage accounting are idempotent and
    durable.
-   [ ] Latency and concurrency have been measured against explicit
    targets.
-   [ ] Logging, alerts, secrets management, retention, and incident
    procedures are documented.

## 10. Guiding Principle

Keep transport, conversation orchestration, and business logic separate.
Improve the existing product incrementally, measure every meaningful
voice change, and prioritize natural turn-taking and reliable call
lifecycle behavior before expanding the feature set.
