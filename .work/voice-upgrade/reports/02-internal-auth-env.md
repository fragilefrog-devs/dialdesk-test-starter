# Report — Task 02: scope env access for internal auth and Twilio webhooks

**Status:** done — all acceptance criteria met.

**Commits:** none (per execution rules; tree left dirty).

## What changed

Split internal auth and the Twilio webhook path off the full `env()` validator onto the
existing scoped-accessor pattern, so `/api/voice/*` needs only `INTERNAL_API_SECRET` and the
Twilio webhooks need only Twilio + `NEXT_PUBLIC_APP_URL` (plus Supabase, which they use
directly).

Modified:
- `src/lib/env.ts` — added `appSchema = schema.pick({ NEXT_PUBLIC_APP_URL: true })` next to the
  other scoped schemas and `export const appEnv = scoped(appSchema)` next to the other
  accessors. No change to `schema`, `env()`, or existing accessors.
- `src/lib/internal-auth.ts` — `env()` → `internalEnv()`. Exported signature and error behaviour
  unchanged (same `Buffer`/`timingSafeEqual` logic).
- `src/lib/twilio.ts` — `twilioEnv()` for `TWILIO_AUTH_TOKEN` / `TWILIO_ACCOUNT_SID`
  (signature check, `base()`, `auth()`); `appEnv()` for `NEXT_PUBLIC_APP_URL` in `buyNumber`.
  All exported names and signatures unchanged.
- `src/app/api/webhooks/twilio/voice/route.ts` — `appEnv()` for the signature URL,
  `voiceEnv()` for `VOICE_GATEWAY_URL`. `signCall(call.id)` untouched (Task 03 owns it).
- `src/app/api/webhooks/twilio/status/route.ts` — `appEnv()` for the signature URL.

Created:
- `src/test/internal-auth.test.ts` — 6 cases from the brief.
- `src/test/voice-config-route.test.ts` — 4 cases from the brief.
- `src/test/twilio-env-scope.test.ts` — the optional-but-required env-scope test.

No files under `voice-gateway/**`, `supabase/**`, `src/lib/token.ts`, `src/app/api/voice/**`
or `src/lib/voice/**` were touched. No dependencies added.

## Gate output

### `npm test`

```text
> ai-voice-receptionist@1.0.0 test
> vitest run

The CJS build of Vite's Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.

 RUN  v2.1.9 H:/ai-voice-receptionist-saas/starter

 ✓ src/test/smoke.test.ts (1 test) 6ms
 ✓ src/test/sql-voice-upgrade.test.ts (11 tests) 502ms
 ✓ src/test/twilio-env-scope.test.ts (1 test) 1702ms
   ✓ twilio env scope > imports and validates signatures without billing credentials 1698ms
 ✓ src/test/internal-auth.test.ts (6 tests) 1565ms
   ✓ isInternalRequest > missing header rejected 1512ms
 ✓ src/test/voice-config-route.test.ts (4 tests) 225ms

 Test Files  5 passed (5)
      Tests  23 passed (23)
   Start at  23:15:29
   Duration  18.41s (transform 20.64s, setup 0ms, collect 15.54s, tests 4.00s, environment 2ms, prepare 62.35s)
```

### `npm run type-check`

```text
> ai-voice-receptionist@1.0.0 type-check
> tsc --noEmit
```

(exit 0, no diagnostics)

### `npx eslint src --ext .ts,.tsx`

```text
```

(exit 0, no output/findings)

Brief subset also run clean:

```text
$ npx eslint src/lib/env.ts src/lib/internal-auth.ts src/lib/twilio.ts src/app/api/webhooks/twilio
```

(exit 0, no output)

### `npm run build`

```text
> ai-voice-receptionist@1.0.0 build
> next build

▲ Next.js 16.4.2 (Turbopack)
- Environments: .env.local
⚠ React 18 support is deprecated in Next.js 16 and will be removed in Next.js 17. Please upgrade to React 19. Learn more: https://nextjs.org/docs/messages/react-version
✓ Running next.config.mjs took 1211ms

⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.

  To migrate automatically, run:
  npx @next/codemod@canary middleware-to-proxy .

  Learn more: https://nextjs.org/docs/messages/middleware-to-proxy
  Creating an optimized production build ...
(node:3460) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///H:/ai-voice-receptionist-saas/starter/tailwind.config.ts?id=1792689173616 is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to H:\ai-voice-receptionist-saas\starter\package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
✓ Compiled successfully in 111s
  Running TypeScript ...
  Finished TypeScript in 35.3s ...
  Collecting page data using 7 workers ...
  Generating static pages using 7 workers (0/12) ...
  Generating static pages using 7 workers (3/12) 
  Generating static pages using 7 workers (6/12) 
  Generating static pages using 7 workers (9/12) 
✓ Generating static pages using 7 workers (12/12) in 1755ms
  Finalizing page optimization ...

Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /admin
├ ƒ /api/billing/checkout
├ ƒ /api/billing/portal
├ ƒ /api/health
├ ƒ /api/realtime/session
├ ƒ /api/voice/config
├ ƒ /api/voice/finalize
├ ƒ /api/voice/respond
├ ƒ /api/voice/tools
├ ƒ /api/webhooks/stripe
├ ƒ /api/webhooks/twilio/status
├ ƒ /api/webhooks/twilio/voice
├ ○ /api/widget-script
├ ƒ /api/widget/finalize
├ ƒ /api/widget/tool
├ ƒ /auth/callback
├ ƒ /dashboard
├ ƒ /dashboard/agent
├ ƒ /dashboard/appointments
├ ƒ /dashboard/billing
├ ƒ /dashboard/calls
├ ƒ /dashboard/install
├ ƒ /dashboard/knowledge
├ ƒ /dashboard/leads
├ ƒ /dashboard/numbers
├ ƒ /dashboard/team
├ ƒ /invite/[token]
├ ƒ /login
├ ƒ /onboarding
├ ƒ /pricing
├ ƒ /privacy
├ ƒ /robots.txt
├ ƒ /signup
├ ○ /sitemap.xml
├ ƒ /sites/[slug]
├ ○ /terms
└ ○ /widget-demo


ƒ Proxy (Middleware)

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

Targeted brief command also run first (before the type fix, all passing):
`npx vitest run src/test/internal-auth.test.ts src/test/voice-config-route.test.ts src/test/twilio-env-scope.test.ts`
→ 3 files / 11 tests passed.

## Decisions / deviations

1. **Agent fixture includes `org_id: 'o1'`.** The brief's prose object omits it, but
   `loadCallContext`'s inferred return type is `{ call: any; org: any; agent: AgentRow }` and
   `AgentRow` requires `org_id`; without it `mockResolvedValue` fails `tsc`. One extra field,
   no behavioural difference for the route.
2. **`twilio-env-scope.test.ts` has one additional assertion beyond the brief.** The required
   `validateTwilioSignature('http://x', {}, null) === false` returns before reading any env var,
   so on its own it cannot prove the scoping. The same test also computes a valid HMAC-SHA1
   signature with `TWILIO_AUTH_TOKEN` and asserts `validateTwilioSignature(...) === true` with
   all Stripe/Resend keys deleted — that is the assertion that would have failed before this
   change.
3. **`voice-config-route.test.ts` mocks only `verifyCall`** (not `verifyCallToken`), because
   Task 03 has not landed and `src/lib/token.ts` still exports only `signCall`/`verifyCall`.
   No token internals are exercised.
4. **Env isolation strategy.** Each `internal-auth` case calls `vi.resetModules()` in
   `beforeEach`, then dynamically imports the module, because `scoped()` caches per module
   instance. Tracked keys are snapshotted in `beforeAll` and restored in `afterAll`; a
   `setEnv()` helper deletes every tracked key before assigning, so "minimal env" cases are
   genuinely minimal even if the shell has Stripe/Resend vars.
5. **Line endings.** `src/lib/twilio.ts` was rewritten with LF line endings during the accessor
   swap (Git reports "LF will be replaced by CRLF"); the diff is limited to the four accessor
   lines, no content change.

## Anything surprising

- Task 04's work landed concurrently: `src/test/sql-voice-upgrade.test.ts` (11 tests),
  `supabase/migrations/`, modified `supabase/schema.sql` appear in the tree. They are not mine
  and were not touched; the full suite includes and passes them. `voice-gateway/**` also shows
  concurrent changes from other tasks.
- The first full `npx eslint src --ext .ts,.tsx` invocation exceeded a 300 s shell timeout with
  no output; re-running unchanged with a 900 s timeout exited 0 with no findings. Looks like a
  cold-cache/AV scan on first run, not a lint problem.
- `npm run build` loads `.env.local` and prints pre-existing warnings only (React 18 deprecation,
  `middleware`→`proxy`, typeless `tailwind.config.ts`).

## For Sentinel / Probe

- Audit for any remaining full `env()` caller on the voice/webhook path:
  `grep -rn "env()" src/lib/internal-auth.ts src/lib/twilio.ts src/app/api/webhooks/twilio`
  returns nothing.
- Probe: with only `INTERNAL_API_SECRET` set, unauthenticated `/api/voice/config` must be 403
  (not 500), and a correctly-secreted request with an unknown call must be 404. Both are
  covered by `voice-config-route.test.ts`, but a live check should confirm no other module on
  that import graph reaches full `env()`.
