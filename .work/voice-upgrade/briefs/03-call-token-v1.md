# Task 03 — Versioned, expiring call token (`v1`)

## Goal
Replace the deterministic, non-expiring `signCall(callId)` HMAC with a signed,
expiring capability token `v1.<base64url payload>.<hmac-sha256 hex>`, verified by one
shared function in every live app route, and return a refreshed token from
`/api/voice/config` so calls longer than the TTL keep working.

## Context you need
- `src/lib/token.ts:5-12` signs `'call:' + callId` and never expires. Any leak of that
  token authorizes that call forever.
- Sign sites: `src/app/api/webhooks/twilio/voice/route.ts:33` and
  `src/app/api/realtime/session/route.ts:35`.
- Verify sites: `src/app/api/voice/config/route.ts:12`, `respond/route.ts:11`,
  `finalize/route.ts:10`, plus dead code `src/app/api/voice/tools/route.ts:12`,
  `src/app/api/widget/finalize/route.ts:11`, `src/app/api/widget/tool/route.ts:12`.
  Keep `verifyCall(callId, token)` as a wrapper so dead code still compiles/behaves.
- `/api/realtime/session` is public CORS (`route.ts:9-15`) and returns a token for any
  known tenant slug. Expiry + rate limit are the only controls; do not add auth here.
- `MAX_CALL_SECONDS` defaults to 1800 (`voice-gateway/src/index.ts:9`) but the TTL is
  900 s. `/api/voice/config` is fetched once at call start, so without a refresh a call
  longer than 15 min would start getting 403s on respond/finalize. The config response
  therefore returns a freshly signed token; the gateway refreshes at 12 min (Task 11).
- Task 05 will pass the payload `orgId` into `finalizeCall`. Do **not** change the
  `finalizeCall` signature in this task.

## Files to create/modify
- `src/lib/token.ts` (rewrite)
- `src/app/api/webhooks/twilio/voice/route.ts` (one line: sign call with org/channel)
- `src/app/api/realtime/session/route.ts` (one line: sign call with org/channel)
- `src/app/api/voice/config/route.ts` (verify payload, org/channel check, return token)
- `src/app/api/voice/respond/route.ts` (verify payload, org/channel check)
- `src/app/api/voice/finalize/route.ts` (verify payload + callId check; keep existing
  `finalizeCall(callId, transcript, durationSeconds)` call for Task 05)
- `src/test/token.test.ts` (new)
- `src/test/token-routes.test.ts` (new)

Do not touch `src/app/api/voice/tools/route.ts` or `src/app/api/widget/**` (dead code);
they must compile through the legacy wrapper.

## Interface / contract
`src/lib/token.ts` exactly (body may be formatted, semantics are fixed):

```ts
import { createHmac, timingSafeEqual } from 'node:crypto'
import { internalEnv } from './env'

export type CallTokenChannel = 'phone' | 'web'

export interface CallTokenPayload {
  callId: string
  orgId: string
  channel: CallTokenChannel
  iat: number // seconds
  exp: number // seconds
}

export interface CallTokenInput {
  callId: string
  orgId: string
  channel: CallTokenChannel
}

export const CALL_TOKEN_TTL_SECONDS = 900
const PREFIX = 'v1'

const mac = (body: string) =>
  createHmac('sha256', internalEnv().INTERNAL_API_SECRET).update(`${PREFIX}.${body}`).digest('hex')

/** Issues a v1 call capability token. `nowMs` exists for deterministic tests. */
export function signCall(input: CallTokenInput, nowMs: number = Date.now()): string {
  const iat = Math.floor(nowMs / 1000)
  const payload: CallTokenPayload = {
    callId: input.callId, orgId: input.orgId, channel: input.channel, iat,
    exp: iat + CALL_TOKEN_TTL_SECONDS,
  }
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  return `${PREFIX}.${body}.${mac(body)}`
}

/** Verifies signature, shape, expiry and (optionally) callId binding. */
export function verifyCallToken(
  token: string | null | undefined,
  opts: { nowMs?: number; callId?: string } = {},
): CallTokenPayload | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== PREFIX || !parts[1] || !parts[2]) return null
  const expected = Buffer.from(mac(parts[1]), 'utf8')
  const given = Buffer.from(parts[2], 'utf8')
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  let parsed: unknown
  try { parsed = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) } catch { return null }
  if (!parsed || typeof parsed !== 'object') return null
  const p = parsed as Partial<CallTokenPayload>
  if (typeof p.callId !== 'string' || !p.callId) return null
  if (typeof p.orgId !== 'string' || !p.orgId) return null
  if (p.channel !== 'phone' && p.channel !== 'web') return null
  if (typeof p.iat !== 'number' || typeof p.exp !== 'number') return null
  const nowSec = Math.floor((opts.nowMs ?? Date.now()) / 1000)
  if (p.exp <= nowSec) return null
  if (p.iat > nowSec + 60) return null
  if (opts.callId && p.callId !== opts.callId) return null
  return { callId: p.callId, orgId: p.orgId, channel: p.channel, iat: p.iat, exp: p.exp }
}

/** Legacy boolean wrapper for routes not yet migrated off the old API. */
export function verifyCall(callId: string, token: string | null | undefined): boolean {
  return verifyCallToken(token, { callId }) !== null
}
```

`/api/voice/config` success body gains two fields (additive):
```json
{ "session": { "instructions": "..." }, "callSid": "CA...", "orgId": "uuid",
  "greeting": "Hi", "token": "v1....", "tokenExpiresAt": 1760000000000 }
```
Use `signCall({ callId, orgId: ctx.org.id, channel: 'phone' })` and
`tokenExpiresAt = Date.now() + CALL_TOKEN_TTL_SECONDS * 1000`.

Route verification rules:
- config: `verifyCallToken(tokenParam)`; 403 if null; after `loadCallContext`, 403 unless
  `payload.orgId === ctx.org.id && payload.channel === ctx.call.channel`.
- respond: `verifyCallToken(body.token, { callId: body.callId })`; after `loadCallContext`,
  403 unless org and channel match (channel is `ctx.call.channel`, already normalized in
  `src/lib/voice/respond.ts:26`).
- finalize: `verifyCallToken(body.token, { callId: body.callId })`; 403 if null. Do not add
  an org lookup here.

## Exact values
- `CALL_TOKEN_TTL_SECONDS = 900`, prefix `v1`, HMAC-SHA256, hex signature, payload
  fields `{callId,orgId,channel,exp,iat}` (JSON produces exactly these keys).
- Reject `exp <= nowSec` (expiry is exclusive at the boundary).
- Reject `iat > nowSec + 60` (60 s clock skew tolerance).
- Token is rejected for any `callId` other than the supplied one.
- `tokenExpiresAt` is ms since epoch.

## Test plan
`src/test/token.test.ts` (set `INTERNAL_API_SECRET='s'.repeat(32)` before importing):
1. `roundtrip returns payload` for both channels.
2. `exp is iat + 900`.
3. `valid one second before expiry`.
4. `expired at exact exp boundary` (`nowMs = (iat+900)*1000`).
5. `tampered signature rejected`.
6. `tampered payload rejected` (flip a char in part 2).
7. `wrong secret rejected` (re-sign under another secret with `vi.resetModules()`).
8. `legacy 64-hex token rejected`.
9. `missing v1 prefix rejected`.
10. `callId mismatch rejected` via `{callId:'other'}`.
11. `future iat beyond 60s rejected`.
12. `invalid channel rejected` (sign a raw payload manually with valid MAC).
13. `empty/undefined token rejected`.

`src/test/token-routes.test.ts`:
- Mock `@/lib/voice/session` (`loadCallContext`, `buildInstructions`).
- config: valid phone token + context org `o1` → 200 with `token` and `tokenExpiresAt`;
  token signed for org `o2` → 403; token for channel `web` but call channel `phone` → 403.
- respond: valid token → 200 `{text}` (mock `respondToCall`); org mismatch → 403; body
  `callId` mismatch → 403.
- finalize: valid token → 200 (mock `finalizeCall`); callId mismatch → 403.
- Set only `INTERNAL_API_SECRET` + Supabase placeholder env so Task 02's scoping holds.

Run exactly:
```bash
npx vitest run src/test/token.test.ts src/test/token-routes.test.ts
npm run type-check
```

## Acceptance criteria
- [ ] `signCall` requires `{callId, orgId, channel}` and produces `v1.<b64url>.<hex>`.
- [ ] `verifyCallToken` is the only decode path; all live voice routes use it.
- [ ] Dead-code routes still compile via `verifyCall` and behave as before (boolean).
- [ ] `/api/voice/config` returns a fresh `token` and `tokenExpiresAt`.
- [ ] Cross-tenant token use (org mismatch) is 403 in config and respond.
- [ ] TTL is 900 s; tests cover the exact boundary.
- [ ] `token`, secrets, and payloads never logged.

## Out of scope
- Token rotation policy or revocation lists.
- `/api/realtime/session` rate-limit or CORS changes.
- `finalizeCall` signature changes (Task 05).
- Gateway-side token verification (never happens; D8).

## Report path
`.work/voice-upgrade/reports/03-call-token-v1.md`
