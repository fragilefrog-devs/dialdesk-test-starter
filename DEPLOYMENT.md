# Deployment

One deployable: the Next.js app (Vercel works). Managed services: Supabase, Vapi, Stripe, Resend, and optionally Twilio for SMS.

## 1. Supabase
1. Create a project near your callers.
2. SQL editor: run `supabase/schema.sql` (new project) or the files in `supabase/migrations/` in order (existing project). If booking reports that `book_trade_job` cannot be found after updating the database, run `NOTIFY pgrst, 'reload schema';` in the SQL editor so the REST API refreshes its function signature cache.
3. Auth: Site URL = your app URL; add `<app>/auth/callback`; keep email confirmation on; set custom SMTP using your Resend SMTP credentials.
4. Copy the templates in `supabase/templates/auth/` into the matching Supabase Dashboard > Authentication > Email Templates and Security and Protection > Notifications settings. `supabase/config.toml` configures the same templates for local Supabase CLI development; it does not push hosted Auth settings.
5. Enable backups before onboarding paying customers.

## 2. Vapi
1. Create an API key and put it in `VAPI_API_KEY`.
2. Generate a secret (`openssl rand -hex 32`) for `VAPI_WEBHOOK_SECRET`. Optionally create a Custom Credential in Vapi (Bearer token = that secret) and set `VAPI_SERVER_CREDENTIAL_ID`.
3. Nothing else to configure by hand: the app creates one assistant per business, points it at `<app>/api/vapi/webhook`, and provisions numbers from `/dashboard/numbers`.
4. Website widget: create a **public key** in the Vapi dashboard and set it as `VAPI_PUBLIC_KEY`. The widget runs inside an iframe served from your app, so if Vapi lets you restrict the public key to allowed origins, allow only your app's origin. Also set Vapi usage limits, since widget calls are billed like phone calls.
5. The defaults use Gemini 3.1 Flash Lite for low-latency responses, OpenAI `gpt-4o-mini-tts` for speech, and Deepgram Flux for English turn detection/transcription. Non-English agents automatically use Deepgram Nova 3 because Flux General English is English-only. Compare Vapi's current Model Intelligence metrics and test booking, interruption handling, and transcription with real calls before launch. Existing assistants keep their current configuration until their receptionist settings are saved and synced after environment changes.

## 3. Stripe
Create three monthly Prices matching `src/lib/plans.ts` and set `STRIPE_PRICE_*`. Webhook `<app>/api/webhooks/stripe` for `customer.subscription.created|updated|deleted`. Subscription changes also attach or detach each business's numbers in Vapi. Enable the Customer Portal.

## 4. Email
Verify the sending domain and sender in Resend, configure `RESEND_API_KEY` and `EMAIL_FROM`, and keep the API key server-side. DialDesk sends team invitations, owner booking/emergency/message alerts, and optional caller booking confirmations. Caller email is collected only after explicit opt-in and stored only after the booking succeeds. Failed sends are logged and returned as failures; a failed caller email does not undo a successfully booked appointment.

For Supabase Auth emails, configure the Supabase project's custom SMTP separately with Resend's SMTP credentials, then copy each template from `supabase/templates/auth/` into its corresponding hosted template field. Enable the security notification emails you want Supabase to send. The local `supabase/config.toml` paths are for local Supabase CLI development only.

## 5. SMS (optional)
Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM`. US business SMS needs registration (A2P 10DLC or toll-free verification) before it is reliable. Without these, alerts go by email only.

## 6. App
Vercel: import the repo and set every variable from `.env.example`. Docker: `docker build --build-arg NEXT_PUBLIC_APP_URL=... --build-arg NEXT_PUBLIC_SUPABASE_URL=... --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=... -t dialdesk .` (public vars are baked in at build time).

## 7. Verify
`GET /api/health` returns `{ok:true}`. Sign up, finish onboarding (this creates the Vapi assistant), save the receptionist settings, get a number, call it, and confirm the call appears in `/dashboard/calls` with a summary. Then work through `docs/TEST_CALLS.md`.
