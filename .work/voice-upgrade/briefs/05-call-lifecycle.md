# Task 05 — Canonical call status and idempotent finalization

## Goal
Normalize every Twilio status into one canonical vocabulary, stop non-terminal statuses
from reverting finished calls, and route transcript/duration finalization through the
`finalize_call` RPC with retries and a single-winner guarantee.

## Context you need
- Today `src/app/api/webhooks/twilio/status/route.ts:12-17` writes Twilio's raw string
  (mixed `in-progress`/`no-answer`) and can revert a `completed` call to `ringing`.
- `src/lib/voice/session.ts:37-53` does two non-atomic updates (transcript+summary, then
  status) with last-write-wins and no retry.
- Task 04 provides `public.finalize_call(p_org, p_call, p_transcript, p_duration_seconds,
  p_end_reason) returns table(finalized boolean)`: 0 rows = not found, `false` = already
  finalized, `true` = just finalized.
- `finalizeCall` is imported by the live route `src/app/api/voice/finalize/route.ts` and
  the dead route `src/app/api/widget/finalize/route.ts:12` (which discards the return
  value). Keep the first three positional parameters unchanged so dead code compiles.
- Supabase client accessor is `supabaseAdmin` from `@/lib/supabase/admin`. Do not
  introduce a new client module.

## Files to create/modify
- `src/lib/calls/status.ts` (new; pure)
- `src/lib/voice/session.ts` (`finalizeCall` only; keep `loadCallContext` and
  `buildInstructions` byte-identical)
- `src/app/api/webhooks/twilio/status/route.ts`
- `src/app/api/voice/finalize/route.ts`
- `src/test/call-status.test.ts` (new)
- `src/test/finalize.test.ts` (new)
- `src/test/finalize-route.test.ts` (new)

## Interface / contract

`src/lib/calls/status.ts`:

```ts
export type CanonicalCallStatus =
  | 'queued' | 'initiated' | 'ringing' | 'in_progress'
  | 'completed' | 'busy' | 'failed' | 'no_answer' | 'canceled'

export const CANONICAL_STATUSES: readonly CanonicalCallStatus[] = [...]
export const TERMINAL_STATUSES: readonly CanonicalCallStatus[] =
  ['completed', 'busy', 'failed', 'no_answer', 'canceled']
export function mapTwilioStatus(raw: string | null | undefined): CanonicalCallStatus
export function isTerminalStatus(s: string): boolean
```

`mapTwilioStatus` table (exact, case-insensitive, trims input):
| input | output |
|---|---|
| `queued`, `initiated`, `in-progress`, `in_progress` | `in_progress` |
| `ringing` | `ringing` |
| `completed` | `completed` |
| `busy` | `busy` |
| `failed` | `failed` |
| `no-answer`, `no_answer` | `no_answer` |
| `canceled`, `cancelled` | `canceled` |
| anything else, including `null`/`''` | `in_progress` + `console.warn('[status] unknown twilio status', raw)` |

`src/lib/voice/session.ts` finalize:

```ts
export interface FinalizeOptions { orgId?: string; endReason?: string }
export type FinalizeStatus = 'finalized' | 'already_finalized' | 'not_found' | 'error'
export interface FinalizeOutcome { status: FinalizeStatus; summary: string | null }

export async function finalizeCall(
  callId: string,
  transcript: { role: string; text: string }[],
  durationSeconds: number,
  opts: FinalizeOptions = {},
): Promise<FinalizeOutcome>
```

Rules:
- Clip transcript exactly as today: `slice(-400)`, `role.slice(0,12)`, `text.slice(0,2000)`.
- Summary: unchanged prompt/model via `ollamaChat`; failures swallowed to `null`.
- If `opts.orgId` is absent, resolve it with
  `db.from('calls').select('org_id').eq('id', callId).maybeSingle()`; no row → `not_found`.
- Call `db.rpc('finalize_call', { p_org: orgId, p_call: callId,
  p_transcript: clipped, p_duration_seconds: Math.max(0, Math.round(durationSeconds)),
  p_end_reason: opts.endReason ?? 'hangup' })`.
- 3 attempts total, delays `0`, `500`, `2000` ms; **each attempt** races a 5 000 ms
  timeout and on timeout/error continues to the next; after the third failure return
  `{ status: 'error', summary }`.
- Interpret the result: no rows → `not_found`; first row `finalized === false` →
  `already_finalized`; `true` → `finalized`.
- On `finalized`, best-effort `update({ summary }).eq('id', callId).eq('org_id', orgId)`
  (do not fail the outcome if it errors).
- Never write `status`, `ended_at`, `duration_seconds`, or `transcript` directly.

Status webhook (`POST`): keep signature validation exactly as Task 02 left it.
- `const status = mapTwilioStatus(params.CallStatus)`.
- Terminal: `update({ status, ended_at: new Date().toISOString(),
  duration_seconds: Math.max(0, Number(params.CallDuration ?? 0) || 0) })
  .eq('provider_sid', params.CallSid)`.
- Non-terminal: same update without `ended_at`/`duration_seconds`, chained with
  `.in('status', ['queued','initiated','in_progress','in-progress','ringing'])` so a late
  `ringing` cannot revert a finished call.
- Always return `new Response('ok')`.

Finalize route: import `verifyCallToken`; `const payload = verifyCallToken(token,
{ callId })`; 403 if null. Call
`finalizeCall(callId, transcript, Number(durationSeconds) || 0, { orgId: payload.orgId,
endReason: typeof endReason === 'string' ? endReason : 'hangup' })`. Respond:
`finalized` → 200 `{ ok: true, finalized: true, summary }`;
`already_finalized` → 200 `{ ok: true, finalized: false, summary }`;
`not_found` → 404; `error` → 503 `{ ok: false, error: 'finalize_failed' }`.

## Exact values
- Retry delays `[0, 500, 2000]` ms; per-attempt timeout `5000` ms.
- Default `endReason` = `'hangup'`.
- Terminal set = `completed, busy, failed, no_answer, canceled`.
- Non-terminal precondition set = `queued, initiated, in_progress, in-progress, ringing`.
- Transcript clips: 400 entries, role 12 chars, text 2000 chars.
- Never downgrade `duration_seconds` (enforced in SQL).

## Test plan
`src/test/call-status.test.ts`: table-driven over all 12 inputs above; assert case
insensitivity (`'IN-PROGRESS'`, `' No-Answer '`); assert unknown logs a warning (spy) and
returns `in_progress`; assert `TERMINAL_STATUSES` contains exactly the five values.

`src/test/finalize.test.ts`: `vi.mock('@/lib/supabase/admin')` and `vi.mock('@/lib/voice/ollama')`.
Fake `supabaseAdmin` returns a chainable builder capturing `.rpc(name, args)` and
`.update(obj)`. Cases:
1. happy path returns `finalized` and passes clipped transcript + org + reason.
2. RPC returns `[{ finalized: false }]` → `already_finalized`, no summary update.
3. RPC returns `[]` → `not_found`.
4. RPC throws twice then succeeds → `finalized`, exactly 3 calls.
5. RPC throws 3× → `error`, exactly 3 calls.
6. omitted `orgId` triggers the org lookup (assert the select chain) and succeeds.
7. transcript clips at 400 and truncates text to 2000.
8. summary failure leaves `summary: null` but finalization still succeeds.
(Use `vi.useFakeTimers()` and advance by 500/2000 to keep the suite fast.)

`src/test/finalize-route.test.ts`: mock session + token; assert 403 on bad token, 200 for
`finalized` and `already_finalized`, 404 for `not_found`, 503 for `error`, and that the
token's `orgId` is forwarded.

Run exactly:
```bash
npx vitest run src/test/call-status.test.ts src/test/finalize.test.ts src/test/finalize-route.test.ts
npm run type-check
npx eslint src/lib/calls src/lib/voice/session.ts src/app/api/webhooks/twilio/status src/app/api/voice/finalize
```

## Acceptance criteria
- [ ] One status vocabulary; unknown inputs never crash and are logged once.
- [ ] A late non-terminal Twilio status cannot revert a terminal call.
- [ ] Finalization is single-winner and survives two transient RPC failures.
- [ ] `finalizeCall` never performs direct transcript/status updates.
- [ ] Finalize route returns 200/403/404/503 per contract and preserves `summary`.
- [ ] Dead widget route still compiles (3-arg call).
- [ ] Existing gates pass.

## Out of scope
- Applying the migration (deploy step).
- AI summary quality/prompt changes.
- Backfilling or rewriting legacy status strings.
- Gateway-side finalization retries (Task 11 calls this route).

## Report path
`.work/voice-upgrade/reports/05-call-lifecycle.md`
