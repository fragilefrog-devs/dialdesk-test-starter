# DialDesk voice upgrade — controller ledger

Scope approved: **Phases 0–3** (baseline, hardening, streaming turn loop, barge-in).
Browser validation: **headless/synthetic audio** (no real mic needed in tests).

## Ground truth (verified by controller, 2026-10-22)

| Gate | Result |
|---|---|
| `npm run type-check` | pass |
| `npx eslint src --ext .ts,.tsx` | pass |
| `npm run type-check --prefix voice-gateway` | pass |
| `npm run build --prefix voice-gateway` | pass |
| `npm run build` (Next) | pass — README claim about Tailwind is stale |
| Whisper/Piper binaries + models | all 4 configured paths exist |
| Ollama :11434 | responding |
| Test framework | none |
| Twilio/Stripe creds | empty |
| App :3100 / gateway :8080 | not running |

## Harness facts

- **Piper** supports `--output-raw` (raw PCM to stdout) → real streaming TTS.
- **pwcpp 1.5.1** has `--vad`, `--offset_ms`, `--duration_ms`, `--print_realtime`, no mic-stream mode → STT stays batch per utterance.

## Scout corrections to the plan (do not re-litigate)

1. `/api/voice/tools` and `/api/widget/tool` are dead code; tools run inside `respondToCall`.
2. Browser client lives in `src/app/api/widget-script/route.ts` (TS template string), not `public/`.
3. `internal-auth.ts` calls full `env()` → voice endpoints throw without Stripe/Resend/Twilio vars.
4. No streaming anywhere today; Whisper/Piper are awaited temp-file CLI calls.
5. Gateway accepts any WS upgrade; call token is a non-expiring deterministic HMAC from a public slug endpoint.
6. `calls.status` mixes `in_progress` (app) and `in-progress` (Twilio). Finalize only writes when status is `in_progress`.
7. Finalization is an in-memory boolean; no retry, no durable record.
8. History/transcript live only in gateway memory during the call.

## Controller decisions (binding on the plan)

- **D1** Stay in Node.js. No Python runtime this run (Phase 5 deferred to measurement).
- **D2** Test runner: **Vitest** in app and gateway; one runner, devDependency only.
- **D3** STT: batch per utterance; abstract behind `SttProvider` so a streaming provider can drop in.
- **D4** TTS: use `piper --output-raw` streaming; kill child on cancel.
- **D5** LLM streaming: optional/flagged; must never break the JSON action protocol; fall back to non-streamed.
- **D6** Barge-in phone: Twilio `{event:'clear'}` + kill TTS + invalidate `turnId`.
- **D7** Barge-in browser: server `interrupt` message + widget flushes scheduled sources; keep sending mic frames (remove `agentSpeaking` gate); rely on echoCancellation + higher threshold while speaking.
- **D8** Token: versioned, expiring (`v1.<b64url payload>.<hmac>`), TTL ~15 min, verified by one shared function.
- **D9** Finalize: idempotent via `finalized_at`, gateway retries 3x with backoff, Twilio status webhook stays authoritative for status/duration.
- **D10** Status: canonical mapping function in app; no destructive migration.
- **D11** Observability limited to structured JSON logs + in-process metrics (`/metrics`), enough to measure barge-in and latency. Full dashboards are Phase 6, out of scope.

## Planner rulings (answered 2026-10-22)

1. **Token refresh — APPROVED.** `/api/voice/config?refresh=1` returns a fresh `{token, tokenExpiresAt}` and **no greeting**. Gateway refreshes at 720 000 ms and must never replay the greeting on refresh.
2. **Harness — APPROVED, with one addition.** In-process gateway + mocked providers is correct. Additionally T09 must include one **env-gated real-binary test** (`RUN_SPEECH_BINARIES=1`) asserting Piper `--output-raw` emits even-length PCM and pwcpp returns text for a synthesized WAV. Skipped when binaries/models are absent.
3. **Finalize durability — APPROVED as DB-only + 3 retries.** Mandatory compensating control: on permanent failure emit one structured `ERROR` log event `{event:"finalize_lost", callId, orgId, attempts}` so it is alertable. Residual risk documented by T14.
4. **RLS / legacy statuses — APPROVED out of scope.** Canonical mapping on new writes only; no backfill. `calls` UPDATE policy for org members and legacy `no-answer` rows documented as residual risk in T14.
5. **Migration — APPROVED.** Idempotent (`if not exists`) additive SQL; must be applied before the new gateway image; the previous gateway image must still function against the new schema.

## Execution rules for this run

- Implementers must **not** run `git commit`, `git push`, or create branches. Controller leaves the tree dirty.
- Each dispatch gets: brief path, report path, one line of context, cross-task interfaces only.
- After every task: task-reviewer gate on brief + report + diff. Critical/Important → back to implementer, then re-check only those.
- Do not parallelize tasks that share a file. P1 = {2,4,6,7,8} is file-disjoint and may run concurrently.

## Task board

Status: pending / in-progress / review / changes / done

| # | Task | Owner | Status | Review |
|---|------|-------|--------|--------|
| — | Planner task plan + briefs | planner | ✅ done | controller spot-checked 01, 08, 09, 13 |
| 01 | Test foundation + baseline | infra | ⏳ in-progress | — |
| 02 | Env scoping | wired | pending | — |
| 03 | Token v1 | wired | pending | — |
| 04 | SQL + finalize_call RPC | datasmith | pending | — |
| 05 | Lifecycle + idempotent finalize | wired | pending | — |
| 06 | Synthetic-audio harness | infra | pending | — |
| 07 | Gateway leaf modules | api-developer | pending | — |
| 08 | Audio primitives | wired | pending | — |
| 09 | Speech providers | api-developer | pending | — |
| 10 | Session contract + limits | wired | pending | — |
| 11 | Transports + wiring | wired | pending | — |
| 12 | Streaming turn manager | api-developer | pending | — |
| 13 | Barge-in | forge | pending | — |
| 14 | Docs + verification | infra | pending | — |

## Open risks

- App cannot run end-to-end without Twilio/Stripe creds; mocked route tests + fake app server are the verification path.
- `next build` output / `.next` may be stale; rebuild after structural changes.
