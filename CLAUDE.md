# Claude Code Guide

## Project
DialDesk: a multi-tenant AI phone receptionist for plumbing and HVAC companies. The Next.js app owns auth, tenant data, billing and the Vapi webhook. **Vapi** runs the live call (telephony, speech-to-text, LLM, text-to-speech). Supabase Postgres is the system of record. See [PRD.md](PRD.md) and [DEPLOYMENT.md](DEPLOYMENT.md).

## Ownership boundaries
- `src/ai/tools.ts`: the ONLY implementation of receptionist actions (availability, booking, emergencies, leads). Tool schemas live here too and are pushed to Vapi.
- `src/lib/trades.ts`: pure trades logic (service area, arrival windows, outcomes). Keep it free of I/O so it stays unit-testable.
- `src/lib/trades-prompt.ts`: the system prompt and transfer destinations. The emergency script and safety rules live here.
- `src/lib/vapi.ts`, `vapi-parse.ts`, `vapi-sync.ts`, `vapi-events.ts`: Vapi API client, payload parsing, assistant sync, webhook handlers. `src/app/api/vapi/webhook/route.ts` only authenticates and delegates.
- `supabase/schema.sql` is the full schema; `supabase/migrations/` holds additive changes for existing databases. Update both.
- `legacy/voice-gateway/`: the retired self-hosted voice path. Nothing in `src/` may import it.

## Invariants
- Scope every tenant query to `org_id`. The tenant is resolved from the Vapi assistant id on the call, never from tool arguments.
- Treat model output and tool arguments as untrusted; validate in `executeTool`.
- Confirm details with the caller before `book_job`. Never quote prices, diagnose, or promise exact arrival times.
- Gas, carbon monoxide and electrical hazards: safety script first, never repair instructions.
- Bookings go through `book_trade_job()` (advisory lock plus per-window capacity). Do not insert appointments directly.
- The webhook must authenticate with the shared secret, and a `tool-calls` message must always get a JSON reply or the live call stalls.
- Secrets (`SUPABASE_SERVICE_ROLE_KEY`, `VAPI_*`, Stripe, Twilio) stay server-side.

## Workflow
1. Read the owning module and a nearby test before editing.
2. Run `npm run type-check`, `npm run lint`, `npm test`, and `npm run build` (set the three `NEXT_PUBLIC_*` vars).
3. Vapi payload shapes can change. When touching `vapi-parse.ts`, confirm against current Vapi docs and a real test call.
