# Launch checklist

## A. Smoke tests (do first — provider paths are unverified)
- [ ] Sign up, confirm email, create workspace; second user in another workspace cannot see the first's rows (try direct Supabase queries with user JWT).
- [ ] Confirm an organization admin cannot change `plan` or subscription fields with a user JWT; only trusted billing code can write them.
- [ ] Widget call: greeting plays, `search_knowledge` answers from your docs, booking creates a row, double-booking the same slot is rejected.
- [ ] Phone call: Twilio → gateway → Whisper.cpp → Ollama → Piper; transcript + summary saved; `calls.duration_seconds` matches Twilio. Confirm callers wait for the agent to finish before speaking (barge-in is not supported).
- [ ] `transfer_to_human` rings the configured number.
- [ ] Stripe test-mode checkout upgrades the org; cancel in portal downgrades it; replaying a webhook is a no-op.
- [ ] Unpaid/expired trial → callers hear the unavailable message before local inference starts.
- [ ] Verify Whisper/Piper model files exist on each gateway instance and Ollama is reachable from the app server.

## B. Security
- [ ] Keep secrets only in host env (never commit `.env*`); verify the repository and Docker build context exclude local env files.
- [ ] `INTERNAL_API_SECRET` ≥ 32 random bytes; gateway ↔ app over HTTPS only.
- [ ] Replace in-memory rate limiter (`src/lib/rate-limit.ts`) with Upstash/Redis before running >1 app instance; add Cloudflare/WAF in front of `/api/realtime/session` (it spends money per call).
- [ ] Set Twilio spend limits and alerts; per-call cap is `MAX_CALL_SECONDS` (default 30 min). Monitor gateway CPU, memory, and model latency.
- [ ] Add Sentry (app + gateway) and uptime checks on `/api/health` and gateway `/health`.
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
