# DialDesk: AI phone receptionist for plumbing and HVAC

Every business that signs up gets an isolated workspace with its own AI receptionist and phone number. It answers 24/7, triages emergencies, books repairs into arrival windows, and texts the owner what happened.

```
Caller ──> Vapi number ──> Vapi assistant (speech, LLM, voice)
                               │  tool calls + end-of-call report (shared secret)
                               ▼
                     Next.js app /api/vapi/webhook ──> Supabase (Postgres, RLS, Auth)
                               │
                               └──> SMS / email alerts to the owner
```

| Piece | Where |
|---|---|
| Marketing, auth, onboarding, dashboard | `src/app` |
| Receptionist actions (availability, booking, emergencies, messages) | `src/ai/tools.ts` |
| Trades logic: service area, arrival windows, outcomes | `src/lib/trades.ts` |
| System prompt and emergency script | `src/lib/trades-prompt.ts` |
| Vapi client, assistant sync, webhook handlers | `src/lib/vapi*.ts`, `src/app/api/vapi/webhook` |
| Schema, RLS, capacity booking | `supabase/schema.sql`, `supabase/migrations/` |
| Retired self-hosted voice path | `legacy/voice-gateway/` |

## Local setup
```bash
npm ci
cp .env.example .env.local     # fill in Supabase, Vapi, Stripe, Resend
npm run dev
```
Run `supabase/schema.sql` in your Supabase project. To exercise real calls locally, expose the app with a tunnel and set `NEXT_PUBLIC_APP_URL` to the public URL before creating the assistant (it embeds the webhook URL).

## Checks
```bash
npm run type-check && npm run lint && npm test
NEXT_PUBLIC_APP_URL=http://localhost:3000 NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=ci npm run build
```

## How a call works
1. A caller dials the business's Vapi number. Vapi answers with the assistant built from that business's settings.
2. The assistant calls tools on our webhook. We find the business from the assistant id, run the action, and reply with JSON.
3. Emergencies text the owner immediately and can transfer to the on-call tech. Bookings go through `book_trade_job()`, which enforces per-window capacity.
4. When the call ends, Vapi sends a report. We store the transcript, summary, recording link and outcome idempotently.

See [PRD.md](PRD.md), [DEPLOYMENT.md](DEPLOYMENT.md), [docs/TEST_CALLS.md](docs/TEST_CALLS.md), [docs/GTM.md](docs/GTM.md) and [docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md).
