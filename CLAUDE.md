# Claude Code Guide

## Project
DialDesk: a multi-tenant AI phone receptionist for plumbing and HVAC companies. The Next.js app owns auth, tenant data, billing and the Vapi webhook. **Vapi** runs the live call (telephony, speech-to-text, LLM, text-to-speech). Supabase Postgres is the system of record. See [PRD.md](PRD.md) and [DEPLOYMENT.md](DEPLOYMENT.md).

## Ownership boundaries
- `src/ai/tools.ts`: the ONLY implementation of receptionist actions (availability, booking, emergencies, leads). Tool schemas live here too and are pushed to Vapi.
- `src/lib/trades.ts`: pure trades logic (service area, arrival windows, outcomes). Keep it free of I/O so it stays unit-testable.
- `src/lib/trades-prompt.ts`: the system prompt and transfer destinations. The emergency script and safety rules live here.
- `src/lib/vapi.ts`, `vapi-parse.ts`, `vapi-sync.ts`, `vapi-events.ts`: Vapi API client, payload parsing, assistant sync, webhook handlers. `src/app/api/vapi/webhook/route.ts` only authenticates and delegates.
- `src/app/(dashboard)/dashboard/widget-setup`, `src/app/embed/[token]`, `src/components/EmbedVoice.tsx`, `public/widget.js`, `src/lib/widget.ts`: the website voice widget. The embed page must keep checking enabled, active, billing and referer before sending the assistant id to the browser.
- `src/app/api/billing/checkout`, `portal`, `confirm`, `src/app/api/webhooks/stripe/route.ts`, and `src/lib/billing-sync.ts`: Stripe checkout/portal, verified plan confirmation, subscription persistence, and webhook reconciliation. `src/components/BillingConfirmation.tsx` refreshes the billing UI after backend confirmation.
- `src/components/DashboardChrome.tsx`: shared dashboard shell and mobile navigation drawer. `src/components/marketing.tsx` owns the reusable `BrandMark` and `Wordmark`; `public/dialdesk-mark.svg` is the shared app icon.
- `supabase/schema.sql` is the full schema; `supabase/migrations/` holds additive changes for existing databases. Update both.
- `legacy/voice-gateway/`: the retired self-hosted voice path. Nothing in `src/` may import it.

## Invariants
- Scope every tenant query to `org_id`. The tenant is resolved from the Vapi assistant id on the call, never from tool arguments.
- Treat model output and tool arguments as untrusted; validate in `executeTool`.
- Confirm details with the caller before `book_job`. Never quote prices, diagnose, or promise exact arrival times.
- Gas, carbon monoxide and electrical hazards: safety script first, never repair instructions.
- Bookings go through `book_trade_job()` (advisory lock plus per-window capacity). Do not insert appointments directly.
- The webhook must authenticate with the shared secret, and a `tool-calls` message must always get a JSON reply or the live call stalls.
- Stripe is authoritative for plan state. Never mark a plan active from a query parameter or browser claim: `/api/billing/confirm` verifies the signed-in workspace, Checkout Session, customer, settled payment, subscription and configured price before persisting the plan. The signed Stripe webhook remains the retryable reconciliation path.
- Persist the organization plan and subscription fields before reporting a successful confirmation to the UI. Do not activate a pending or incomplete subscription. Surface receptionist/Vapi provisioning failures even if the subscription row has already been saved.
- Keep billing tenant-scoped: checkout and confirmation require an owner/admin and match the Stripe customer and workspace; cancellation events must not clear a different current subscription.
- Secrets (`SUPABASE_SERVICE_ROLE_KEY`, `VAPI_*`, Stripe, Twilio) stay server-side.
- The dashboard drawer must stay keyboard-operable: Escape/backdrop/close control dismiss it, focus remains contained while open and returns to its trigger, and the page cannot scroll behind it. The desktop sidebar stays visible.
- Reuse the shared `BrandMark`/`Wordmark` and favicon assets instead of recreating brand marks in individual routes.

## Workflow
1. Read the owning module and a nearby test before editing.
2. Run `npm run type-check`, `npm run lint`, `npm test`, and `npm run build` (set the three `NEXT_PUBLIC_*` vars). Billing confirmation behavior is covered in `src/test/billing-confirm.test.ts`.
3. Vapi payload shapes can change. When touching `vapi-parse.ts`, confirm against current Vapi docs and a real test call.

## UI conventions
- **Tokens only.** Colors are semantic Tailwind tokens (`bg-canvas`, `bg-surface`, `text-ink`, `text-muted`, `text-faint`, `border-line`, `border-control`, `bg-primary`, `bg-signal`, `text-danger`, `text-good`, `text-warn`) backed by `light-dark()` variables in `src/styles/globals.css`. Do not hard-code hex or reintroduce palette scales; the app follows the system light/dark setting by default, and `ThemeToggle` can override it through `data-theme` on `<html>`.
- **Surfaces.** Canvas, then surface (panels, lists, sidebar), then surface-2 (hover, wells). Hairline border first, faint shadow second. Prefer `Panel` (one framed, divided list) over a stack of cards.
- **Type.** Manrope headings over DM Sans body, self-hosted through `next/font`. Use the mockup's 400-700 body and 500-800 heading weights. Sizes 12 (meta only), 14, 16 and the display scale.
- **Radius.** 10px controls, 15px panels. Controls are at least 44px tall.
- **Status** is a dot plus a word (`Badge`), never color alone and never a decorative pill.
- **Motion.** Durations 100, 150, 200, 300ms only. Animate `transform` and `opacity`, ease-out in, ease-in out. Approved looping motion is limited to the `Waveform` and live-call indicator; all motion respects `prefers-reduced-motion`. Scroll reveals (`.reveal`) are progressive enhancement and must stay visible without support.
- **States.** Every page needs loading (skeleton mirroring the layout), empty (what belongs here, why, one action), error and long-content cases. Forms use `SubmitButton` for the pending state.
