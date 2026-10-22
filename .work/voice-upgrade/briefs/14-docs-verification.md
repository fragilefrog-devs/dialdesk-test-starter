# Task 14 — Architecture docs, operator docs, final verification

## Goal
Document the new runtime, protocol, limits, deployment steps, and residual risks, and run
the full gate set to prove Phases 0–3 are complete.

## Context you need
- All runtime work is in Tasks 01–13. This task must not change behavior; docs only. If a
  gate fails, record the failure in the report and stop — do not refactor unrelated code.
- Facts to document are pinned in `PLAN.md` (limits table, state machine, wire protocol,
  error codes, token lifecycle) and in briefs 02–13. Use those values, not memory.
- `.env.example` currently lacks gateway tuning knobs and tests are undocumented.
- `README.md` has `## Run locally` (~line 28), `## Docs` (~51), `## Status` (~58).
  `DEPLOYMENT.md` has numbered sections 1–7. `CLAUDE.md` has `## Invariants` and
  `## Voice Runtime`.
- New deploy prerequisite: apply `supabase/migrations/20261022_voice_finalization.sql`
  **before** deploying the new gateway, because finalize now calls `finalize_call`.
- Piper's model JSON (`<model>.onnx.json`) must ship next to the `.onnx`; the gateway
  reads `audio.sample_rate` from it.

## Files to create/modify
- `docs/VOICE_ARCHITECTURE.md` (new)
- `README.md`
- `DEPLOYMENT.md`
- `CLAUDE.md`
- `.env.example`

No source or test changes.

## Content contract

### `docs/VOICE_ARCHITECTURE.md`
1. **Overview** — app owns auth/DB/LLM/tools; gateway owns the realtime audio loop; one
   call = one WS + one session. Diagram in ASCII:
   `Twilio/Browser → transport → session(state machine) → turn manager → STT/LLM/TTS`,
   with app calls (`/api/voice/config|respond|finalize`) off to the side.
2. **Module map** — table of every file added by Tasks 07–13 with a one-line
   responsibility (`config`, `protocol`, `observability/*`, `clients/app-api`,
   `audio/*`, `speech/*`, `sessions/*`, `turns/turn-manager`, `transports/*`,
   `auth/limits`, `auth/token-refresh`).
3. **Call lifecycle** — the state machine exactly:
   `idle → connecting → greeting → listening → processing → speaking → interrupted →
   closing → failed|completed`, with the legal-edge list and the "barge-in only from
   speaking" rule; one table row per state: entered by, exits, owned timers.
4. **Turn and cancellation model** — `turnId = t_N`, stale-drop rule, one turn per
   session, what `interrupt()` does in order (abort → clear → cancel → invalidate → listen).
5. **Wire protocol v1** — browser message table (client and server) with one example
   JSON line each; Twilio message table (`connected/start/media/mark/stop`); close codes
   `1000/1002/1008/1011/1013/4000/4001`.
6. **Audio** — invariants (8 kHz mu-law 160 B ↔ 16 kHz PCM16LE 640 B; browser 16 kHz in,
   provider-rate out), pre-roll, 20 ms pacing, queue cap, 700 ms endpoint, 15 s utterance.
7. **Limits** — the whole limits table from `PLAN.md`, with the same values.
8. **Auth & tokens** — v1 format, payload, 900 s TTL, refresh at 12 min, retry to 13:30,
   close `4001`; app-only verification (gateway trusts config).
9. **Finalization** — `finalize_call` semantics (0 rows / false / true), retry policy
   `0/500/2000`, status mapping table, Twilio-authoritative status.
10. **Observability** — JSON log fields (`ts,level,msg,callId,orgId,channel,state`),
    redaction list, `/health`, `/metrics` and the metric names from Task 07.
11. **Residual risks / not done** — single-instance admission, no disk spool for finalize,
    `calls` UPDATE RLS still org-member-wide, legacy status rows kept, no client VAD.

### `README.md`
- `## Run locally`: add `npm test`, `npm test --prefix voice-gateway`,
  `node scripts/voice-baseline.mjs`; note the Piper `.onnx.json` must sit beside the model.
- `## Docs`: link `docs/VOICE_ARCHITECTURE.md` and `docs/VOICE_BASELINE.md`.
- Add a short `## Environment` table (or extend an existing one) with the new keys:
  `MAX_CALL_SECONDS` (1800), `LOG_LEVEL` (info), `VOICE_STREAMING_LLM` (0),
  `TOKEN TTL` note (900 s, automatic refresh). Do not duplicate the whole `.env.example`.

### `DEPLOYMENT.md`
- Section 1 (Supabase): add "apply `supabase/migrations/20261022_voice_finalization.sql`
  before deploying the gateway; it is additive and re-runnable".
- Section 3 (AI/speech): require the `.onnx.json` beside the Piper model; state that the
  gateway reads `audio.sample_rate` from it and refuses to start TTS without it.
- Section 4 (gateway): add `/health` and `/metrics` checks, graceful shutdown grace
  ≥ 10 s (gateway uses 8 s), and the env additions.
- Section 7 (Verify): add a call checklist: greeting, barge-in on phone, barge-in in the
  widget, >15 min call keeps working (token refresh), transcript/duration written once,
  `/metrics` shows `voice_sessions_active`.
- Add `## Rollback`: redeploy the previous gateway image; the migration is additive so no
  DB rollback is required; `finalize_call` may stay.

### `CLAUDE.md`
- `## Voice Runtime`: replace stale descriptions with the module split (one paragraph) and
  the state machine.
- `## Invariants`: add token v1 + 15 min TTL/refresh, one turn per session, barge-in only
  from `speaking`, audio frame sizes, additive SQL only, no secrets/transcripts in logs.
- `## Change Workflow`: add "run `npm test` and `npm test --prefix voice-gateway`".

### `.env.example`
Under the gateway section add:
```
# Runtime tuning
MAX_CALL_SECONDS=1800
LOG_LEVEL=info
# Stream LLM text sentence-by-sentence (1 = on); falls back cleanly when off/failing
VOICE_STREAMING_LLM=0
# Piper model must have <PIPER_MODEL_PATH>.json with audio.sample_rate
```
Keep existing keys/comments; do not add secrets.

## Exact values (must match code)
Limits table values from `PLAN.md`; error codes and close codes from Task 10; token TTL
900 s, refresh 720 s / deadline 810 s; finalize attempts 3 at 0/500/2000 ms; status map
`queued|initiated|in-progress|in_progress→in_progress`, `no-answer|no_answer→no_answer`,
`canceled|cancelled→canceled`, unknown→`in_progress`; `ENDPOINT_SILENCE_MS` 700 ms, max utterance
15 s; barge-in 900/120 ms.

## Test / verification plan
Run and capture output in the report:
```bash
npm test
npm test --prefix voice-gateway
npm run type-check
npx eslint src
npm run type-check --prefix voice-gateway
npm run build --prefix voice-gateway
npm run build
```
Doc lint (manual): no duplicated limits with different values — grep the docs for each
numeric limit and confirm one value; every new env key appears in `.env.example` and the
README; every module in `voice-gateway/src` is listed in the architecture module map
(`git ls-files` cross-check).

## Acceptance criteria
- [ ] `docs/VOICE_ARCHITECTURE.md` covers all 11 sections with the exact values above.
- [ ] README, DEPLOYMENT, CLAUDE, `.env.example` updated as specified.
- [ ] Migration and Piper model-JSON prerequisites are called out in DEPLOYMENT.
- [ ] Rollback steps are documented.
- [ ] All seven commands pass; output recorded in the report.
- [ ] No source, test, or config behavior changes in this task.

## Out of scope
- Fixing failures found by the gates (report them instead).
- Phase 4+ roadmap, pricing, analytics, or marketing docs.
- Rewriting `docs/LAUNCH_CHECKLIST.md` (it may be linked, not edited).

## Report path
`.work/voice-upgrade/reports/14-docs-verification.md`
