# Task 02 — Scope env access for internal auth and webhook routes

## Goal
Make every `/api/voice/*` route runnable with only `INTERNAL_API_SECRET`, and make the
Twilio webhooks runnable without Stripe/Resend credentials, by using the existing scoped
env accessors instead of the full `env()` validator.

## Context you need
- `src/lib/internal-auth.ts:7` calls `env().INTERNAL_API_SECRET`. `env()`
  (`src/lib/env.ts:29-38`) validates the **whole** app schema, including `STRIPE_*`,
  `RESEND_*`, `EMAIL_FROM`, and Twilio keys. Without them every voice route throws before
  it can return 403.
- `src/lib/env.ts:96-122` already provides scoped accessors derived from the main schema:
  `voiceEnv`, `supabaseEnv`, `stripeEnv`, `twilioEnv`, `emailEnv`, `internalEnv`. There is
  no scoped accessor for `NEXT_PUBLIC_APP_URL`, which the Twilio webhooks and
  `src/lib/twilio.ts:30` need.
- `src/lib/twilio.ts:8` uses full `env()` for the signature secret and `:13-14` for the
  account credentials; `:30` uses `env().NEXT_PUBLIC_APP_URL`.
- `src/app/api/webhooks/twilio/voice/route.ts:13,32` and
  `src/app/api/webhooks/twilio/status/route.ts:9` use full `env()`.
- `src/lib/token.ts` already uses `internalEnv()`; do not change it here (Task 03 rewrites
  the token format).

## Files to create/modify
- `src/lib/env.ts` — add one scoped accessor (`appEnv`) derived with `pick`; no schema changes.
- `src/lib/internal-auth.ts` — `env()` → `internalEnv()`.
- `src/lib/twilio.ts` — `env()` → `twilioEnv()` for credentials, `appEnv()` for the URL.
- `src/app/api/webhooks/twilio/voice/route.ts` — `env()` → `appEnv()` and `voiceEnv()`.
  **Leave the `signCall(call.id)` call exactly as-is; Task 03 changes it.**
- `src/app/api/webhooks/twilio/status/route.ts` — `env()` → `appEnv()`.
- `src/test/internal-auth.test.ts` (new)
- `src/test/voice-config-route.test.ts` (new)

Do not touch `src/lib/token.ts`, any voice route under `src/app/api/voice/`, or
`src/lib/voice/**`.

## Interface / contract
`src/lib/env.ts` addition (place next to the other scoped accessors):

```ts
const appSchema = schema.pick({ NEXT_PUBLIC_APP_URL: true })
/** Public app URL only (webhooks, Twilio callback URLs). */
export const appEnv = scoped(appSchema)
```

`src/lib/internal-auth.ts`:

```ts
import { timingSafeEqual } from 'node:crypto'
import { internalEnv } from './env'

/** Constant-time check of the shared secret used by the voice gateway. */
export function isInternalRequest(req: Request): boolean {
  const given = Buffer.from(req.headers.get('x-internal-secret') ?? '')
  const want = Buffer.from(internalEnv().INTERNAL_API_SECRET)
  return given.length === want.length && timingSafeEqual(given, want)
}
```

No signature changes anywhere. `twilio.ts` helpers keep their exported names and
signatures; only the accessor calls change.

## Exact values
- `INTERNAL_API_SECRET` minimum length stays 32 (schema already enforces it).
- No new env var names; `NEXT_PUBLIC_APP_URL` is already in the schema.
- Test secret: `'s'.repeat(32)`.

## Test plan
`src/test/internal-auth.test.ts` — explicit imports; each case starts with
`vi.resetModules()` and sets a minimal env, because `scoped()` caches per module instance:

```ts
const MINIMAL = { INTERNAL_API_SECRET: 's'.repeat(32) }
const STRIP = ['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','STRIPE_PRICE_STARTER',
  'STRIPE_PRICE_GROWTH','STRIPE_PRICE_SCALE','RESEND_API_KEY','EMAIL_FROM',
  'TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN']
```

Cases:
1. `missing header rejected` — `isInternalRequest(new Request('http://x'))` false.
2. `wrong secret same length rejected`.
3. `wrong secret different length rejected` (must not throw).
4. `correct secret accepted`.
5. `works without billing credentials` — set only `MINIMAL`, delete `STRIP`, import
   `isInternalRequest` dynamically, assert true; asserts no `env()` throw.
6. `appEnv only needs NEXT_PUBLIC_APP_URL` — set only that key, dynamic import, call
   `appEnv()`, assert URL; then delete the key, `vi.resetModules()`, import again, assert
   it throws naming `NEXT_PUBLIC_APP_URL`.

`src/test/voice-config-route.test.ts`:
- `vi.mock('@/lib/voice/session', () => ({ loadCallContext: vi.fn(), buildInstructions: () => 'sys' }))`
- `vi.mock('@/lib/token', () => ({ verifyCall: () => true, verifyCallToken: () => ({ callId: 'c1', orgId: 'o1', channel: 'phone', iat: 0, exp: 9e9 }) }))`
  (mocking `verifyCallToken` here is harmless even before Task 03 creates it; keep only
  `verifyCall` if Task 03 has not landed. The test must not depend on token internals.)
- Set only `INTERNAL_API_SECRET` plus `NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co'`
  and `SUPABASE_SERVICE_ROLE_KEY='ci'` (module import safety; no network).
- Cases:
  a. no `x-internal-secret` → 403 `Forbidden`.
  b. wrong secret → 403.
  c. correct secret, `loadCallContext` returns `null` → 404.
  d. correct secret, context returns `{call:{provider_sid:'CA1',channel:'phone'},
     org:{id:'o1',name:'Acme',timezone:'UTC',industry:'x'},
     agent:{id:'a1',name:'R',greeting:'Hi',voice:'v',language:'en',instructions:'',
     business_hours:{},appointment_minutes:30,transfer_number:null,is_active:true}}` → 200
     and `json().greeting === 'Hi'`.

`src/test/twilio-env-scope.test.ts` (optional but required by acceptance): dynamic-import
`src/lib/twilio.ts` with only `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
`NEXT_PUBLIC_APP_URL` set and all Stripe/Resend vars deleted; assert the module imports
without throwing and `validateTwilioSignature('http://x', {}, null) === false`.

Run exactly:
```bash
npx vitest run src/test/internal-auth.test.ts src/test/voice-config-route.test.ts src/test/twilio-env-scope.test.ts
npm run type-check
npx eslint src/lib/env.ts src/lib/internal-auth.ts src/lib/twilio.ts src/app/api/webhooks/twilio
```

## Acceptance criteria
- [ ] `internal-auth.ts` no longer references `env()`.
- [ ] No route or lib under `src/app/api/webhooks/twilio` or `src/lib/twilio.ts` calls full
      `env()`.
- [ ] Voice config route returns 403/404/200 with only `INTERNAL_API_SECRET` set; never 500
      from env validation.
- [ ] `appEnv` is derived with `pick` (no duplicated env-name literals).
- [ ] Existing token signing call in the voice webhook is unchanged; Task 03 will edit it.
- [ ] All existing gates still pass.

## Out of scope
- Token format/expiry (Task 03).
- Rate limiting or CORS changes on `/api/realtime/session`.
- Removing the full `env()` accessor or changing the main schema.
- Any test that needs a live Supabase project.

## Report path
`.work/voice-upgrade/reports/02-internal-auth-env.md`
