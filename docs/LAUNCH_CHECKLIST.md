# Launch checklist

## A. Smoke tests (do first — provider paths are unverified)
- [ ] Sign up, confirm email, create workspace; second user in another workspace cannot see the first's rows (try direct Supabase queries with user JWT).
- [ ] Confirm an organization admin cannot change `plan` or subscription fields with a user JWT; only trusted billing code can write them.
- [ ] Work through `docs/TEST_CALLS.md`: at least 27 of 30 scripted calls pass (emergencies, booking, out-of-area, price questions, transfers).
- [ ] Phone call: Vapi number answers; transcript, summary, recording link and outcome saved; `calls.duration_seconds` matches Vapi.
- [ ] `transfer_to_human` rings the configured number.
- [ ] Stripe test-mode checkout upgrades the org; cancel in portal downgrades it; replaying a webhook is a no-op.
- [ ] Unpaid/expired trial → callers hear the unavailable message before local inference starts.
- [ ] Two phones book the same window at once: capacity is respected and the second caller is offered another window.

## B. Security
- [ ] Keep secrets only in host env (never commit `.env*`); verify the repository and Docker build context exclude local env files.
- [ ] `VAPI_WEBHOOK_SECRET` is 32+ random bytes; a request without it to `/api/vapi/webhook` returns 401.
- [ ] Replace in-memory rate limiter (`src/lib/rate-limit.ts`) with Upstash/Redis before running >1 app instance; add Cloudflare/WAF in front of `/api/realtime/session` (it spends money per call).
- [ ] Set Vapi usage limits and alerts. Calls cap at 15 minutes per assistant. Confirm cost per call against plan prices.
- [ ] Add Sentry and an uptime check on `/api/health`. Alert on webhook 5xx and failed owner SMS.
- [ ] Supabase: enable PITR backups; restrict service-role key to server envs only.

## C. Legal / compliance (get counsel to review — templates in `/terms`, `/privacy` are placeholders)
- [ ] **Call recording & AI disclosure:** several jurisdictions need all-party consent. The agent states it's an AI early in the call; add a recording notice to the greeting where required (agent setting `record_consent_notice` exists in the schema — wire it to the greeting for your markets).
- [ ] **Healthcare (HIPAA):** do not market to US healthcare as HIPAA-compliant without BAAs with every processor (Supabase, Twilio, hosting) and a compliant configuration.
- [ ] Data processing agreement + subprocessor list; retention policy (transcripts) and a delete/export path per tenant.
- [ ] Outbound calling is **not** built; if added, TCPA/DNC and local equivalents apply.
- [ ] Local telecom rules for number purchase/forwarding in each launch country.

## D. Product readiness
- [ ] Unit economics verified with real invoices (see `docs/GTM.md` §4).
- [ ] Support inbox, status page, ToS/Privacy published, cancellation flow tested.
- [ ] Email confirmations/reminders to callers (not built) — top requested feature for booking businesses.

- [ ] Owner SMS: sender registered (A2P 10DLC or toll-free); an emergency test text arrives within seconds.
- [ ] Counsel reviewed the AI and recording disclosure, the gas/CO safety script, and terms for the pilot state.
- [ ] Payments: US entity or merchant-of-record route settled before charging US customers.
