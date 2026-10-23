<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# DialDesk project guidance

See [CLAUDE.md](CLAUDE.md) for module ownership, tenant/safety invariants, and UI conventions. See [README.md](README.md) for local setup and checks, and [PRD.md](PRD.md) for product behavior.

## Billing changes
- Stripe is the source of truth for plan status. Never activate a plan from a client-supplied status or return URL alone.
- Checkout return confirmation must verify the signed-in owner/admin, workspace, Stripe customer, settled Checkout Session, subscription and configured price before updating the organization.
- Keep Stripe webhook signature verification and retry-safe reconciliation. A canceled old subscription must not clear a newer subscription.
- Persist plan/status before refreshing the billing UI; show pending or errors rather than presenting an unconfirmed upgrade as complete.
- Run `npm run type-check`, `npm run lint`, and the focused billing test (`src/test/billing-confirm.test.ts`), then `npm test`.

## Shared interface elements
- Keep the dashboard drawer keyboard accessible and responsive, including Escape/backdrop dismissal, focus handling, and background scroll locking.
- Use the shared `BrandMark`/`Wordmark` and the assets in `public/dialdesk-mark.svg` and `public/dialdesk-logo.svg`; do not introduce route-specific logo variants.
