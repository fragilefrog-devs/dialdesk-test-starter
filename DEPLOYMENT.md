# Deployment

One deployable: the Next.js app (Vercel works). Managed services: Supabase, Vapi, Stripe, Resend, and optionally Twilio for SMS.

## 1. Supabase
1. Create a project near your callers.
2. SQL editor: run `supabase/schema.sql` (new project) or the files in `supabase/migrations/` in order (existing project).
3. Auth: Site URL = your app URL; add `<app>/auth/callback`; keep email confirmation on; set custom SMTP (Resend).
4. Enable backups before onboarding paying customers.

## 2. Vapi
1. Create an API key and put it in `VAPI_API_KEY`.
2. Generate a secret (`openssl rand -hex 32`) for `VAPI_WEBHOOK_SECRET`. Optionally create a Custom Credential in Vapi (Bearer token = that secret) and set `VAPI_SERVER_CREDENTIAL_ID`.
3. Nothing else to configure by hand: the app creates one assistant per business, points it at `<app>/api/vapi/webhook`, and provisions numbers from `/dashboard/numbers`.
4. Check the model, voice and transcriber defaults in `.env.example` by listening to test calls.

## 3. Stripe
Create three monthly Prices matching `src/lib/plans.ts` and set `STRIPE_PRICE_*`. Webhook `<app>/api/webhooks/stripe` for `customer.subscription.created|updated|deleted`. Subscription changes also attach or detach each business's numbers in Vapi. Enable the Customer Portal.

## 4. SMS (optional)
Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM`. US business SMS needs registration (A2P 10DLC or toll-free verification) before it is reliable. Without these, alerts go by email only.

## 5. App
Vercel: import the repo and set every variable from `.env.example`. Docker: `docker build --build-arg NEXT_PUBLIC_APP_URL=... --build-arg NEXT_PUBLIC_SUPABASE_URL=... --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=... -t dialdesk .` (public vars are baked in at build time).

## 6. Verify
`GET /api/health` returns `{ok:true}`. Sign up, finish onboarding (this creates the Vapi assistant), save the receptionist settings, get a number, call it, and confirm the call appears in `/dashboard/calls` with a summary. Then work through `docs/TEST_CALLS.md`.
