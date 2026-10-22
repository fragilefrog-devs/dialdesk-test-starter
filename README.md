# AI Voice Receptionist — multi-tenant SaaS

Every business that signs up gets an isolated workspace with its own AI receptionist, phone number(s),
knowledge base, contacts, leads, appointments and call history. Callers reach it by **phone** (Twilio) or a
**website voice widget** (local Whisper.cpp speech recognition and Piper speech synthesis, powered by Ollama).

```
Caller ──PSTN──> Twilio ──webhook──> Next.js app ──TwiML <Stream>──> Twilio
                                                                        │ wss (µ-law audio)
                                          voice-gateway  <──────────────┘
                                             │ ▲  audio                    app = Next.js server
                             Whisper.cpp -> Ollama -> Piper
                                             │ tools/finalize (HMAC + shared secret)
                                             ▼
                                       Next.js app ──> Supabase (Postgres + RLS + Auth)
Website visitor ──audio──> voice-gateway ──> Next.js app + Ollama
```

| Piece | Where | Notes |
|---|---|---|
| Marketing, pricing, auth, onboarding, dashboard, admin | `src/app` | Next.js App Router, server actions |
| Tenancy + security | `supabase/schema.sql` | RLS on every table, `create_organization()` RPC, no-double-booking exclusion constraint |
| Voice tools (knowledge, availability, booking, leads, transfer) | `src/ai/tools.ts` | Shared by phone + web; every query scoped by `org_id` |
| Phone audio bridge | `voice-gateway/` | Long-lived WebSocket service — **cannot run on serverless** |
| Billing | `src/lib/plans.ts`, `api/billing/*`, `api/webhooks/stripe` | Stripe Checkout + Portal, idempotent webhook |
| Website widget | `/widget.js` → `api/widget-script` | One `<script>` tag per customer site |

## Run locally
```bash
cp .env.example .env.local          # fill in values
# 1. Supabase: create a project, run supabase/schema.sql in the SQL editor
# 2. Auth > URL config: add http://localhost:3000/auth/callback to redirect URLs
ollama pull gemma3:1b               # local text model
# Install pywhispercpp + Piper and download compatible model/voice files.
# Set WHISPER_CPP_PATH to pwcpp.exe, WHISPER_MODEL_PATH to ggml-base.bin,
# PIPER_PATH to piper.exe, and PIPER_MODEL_PATH to the Piper .onnx voice model.

npm install
npm run dev                         # app on :3000; Ollama must be reachable at OLLAMA_BASE_URL

cd voice-gateway
npm install
# Set APP_URL, INTERNAL_API_SECRET, Whisper/Piper paths and model paths in the gateway environment.
npm run dev                         # gateway on :8080
# Expose both with a tunnel (ngrok / cloudflared); set VOICE_GATEWAY_URL=wss://<tunnel>/twilio
```
`127.0.0.1` for Ollama works only when the app shares its host/network namespace. Phone testing needs a Twilio
account. The **website widget works without Twilio**, but still needs the gateway, Whisper.cpp, Piper, and Ollama
(create a workspace, add a knowledge doc, set `DEMO_TENANT_SLUG`, open `/widget-demo`).

## Docs
- [`DEPLOYMENT.md`](DEPLOYMENT.md) — production deploy (app + gateway + Stripe/Twilio wiring)
- [`PRD.md`](PRD.md) — product goals, user flows, constraints, and known gaps
- [`CLAUDE.md`](CLAUDE.md) — Claude Code repository guidance and implementation invariants
- [`docs/LAUNCH_CHECKLIST.md`](docs/LAUNCH_CHECKLIST.md) — security, legal/compliance, ops gates before taking money
- [`docs/GTM.md`](docs/GTM.md) — positioning, ICP, pricing logic, 30-day launch plan, metrics

## Status — read before launching
App and gateway type-checks and the gateway production build pass. Direct ESLint on changed app files passes.
The full app build is currently blocked by the installed Tailwind/PostCSS version mismatch, and `npm run lint`
uses the removed `next lint` command under Next.js 16. **Not yet exercised end-to-end**: local Whisper/Piper audio,
Ollama action routing, Twilio calls, Stripe checkout/webhook. Install the local speech binaries/models and run the
smoke tests in `docs/LAUNCH_CHECKLIST.md` first.
Not built: outbound calling, SMS/email confirmations to callers, calendar sync (Google/Outlook), usage-based
overage billing (overage is tracked in `org_usage_monthly`; invoice it via Stripe metered billing when ready).
