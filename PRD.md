# DialDesk PRD: AI receptionist for plumbing and HVAC

## Problem
Owner-operators and small crews (1 to 15 techs) miss calls while on jobs. A caller who hits voicemail usually dials the next company, and emergencies are the most valuable and most time-sensitive calls.

## Product
Answer every call 24/7, triage emergencies, book repairs into arrival windows, and text the owner what happened.

## Users
- **Owner or dispatcher:** configures services, service area, windows and alert numbers; reviews calls and jobs.
- **Caller:** a homeowner or landlord with a problem now.

## Call flows (MVP)
1. **Emergency:** burst pipe, flooding, sewage, no heat or cooling, gas smell, CO alarm, sparks. Safety script first for gas/CO/electrical, `flag_emergency` texts the owner, then transfer to the on-call tech.
2. **Repair booking:** problem and urgency, address and postcode, service-area check, availability, read-back, explicit caller confirmation, then `book_job`. Send SMS confirmation; offer email confirmation as an optional, explicit opt-in.
3. **Estimate request:** book an estimate visit for installs and replacements; no price quoting.
4. **Existing customer or other:** office transfer in hours, otherwise a message to the owner.
5. **After hours:** emergencies per the owner's policy; routine work booked for the next open day.
6. **Spam:** ended politely, not logged.

## Website widget
A "Talk to us" button for the customer's site: `widget.js` opens an iframe (`/embed/<token>`) that starts a Vapi web call with the same assistant. The page only receives the assistant id when the widget is enabled, the business is active, billing permits calls, and the embedding site's referrer is allowed. The app's own hostname is included automatically; other sites must be listed by the business. Calls are labelled "Website visitor" and use plan minutes. Transfers are not possible on web calls, so the assistant takes a message instead.

Each workspace also has a public business page at `/business/<workspace slug>`, showing its configured services and service hours beside an embedded call window. The call window uses the same widget, billing, activity, and referrer checks as external embeds; when calls are unavailable, the page displays the active business phone number when one is configured.

## Functional requirements
- Per-tenant configuration: services, postcodes, arrival windows, jobs per window, office hours, on-call and office numbers, alert phone and email, recording on/off.
- Booking by arrival window with per-window capacity, race-free.
- Owner SMS and email alerts for emergencies, new jobs and messages; caller SMS confirmation (needs a registered SMS sender); optional caller booking email only after explicit consent.
- Store the caller's email only when they opt in to a booking confirmation, and record that consent on the appointment. A send failure must not undo a booked visit or be reported as a sent email.
- Dashboard: calls (outcome, urgency, summary, transcript, recording), messages, jobs, numbers, billing, team.
- Billing by plan with included minutes and overage; lapsed accounts stop answering.
- Plan changes: Stripe Checkout and the billing portal manage subscriptions. After a successful Checkout return, the server verifies the session, payment, customer, workspace and subscription price, then persists the plan and subscription status before the UI presents the new plan as current. The dashboard refreshes from the persisted organization record. Portal returns reconcile the current subscription from Stripe.
- Stripe subscription webhooks reconcile later updates and cancellations and must be signature-verified and retry-safe. Incomplete or unpaid Checkout sessions do not activate a plan. A stale cancellation event must not clear a newer subscription. If receptionist routing sync fails after the billing row is saved, surface that state and allow webhook retries rather than hiding the failure.
- Responsive dashboard navigation: the mobile sidebar opens as a dismissible drawer with Escape/backdrop/close controls, contained focus, focus return and background scroll lock; desktop keeps the sidebar visible.
- Consistent DialDesk branding: use one shared brand mark and wordmark across marketing, authentication, dashboard, admin and voice embed surfaces, with the app icon sourced from the same mark.

## Out of scope for v1
Outbound calls, field-service integrations (ServiceTitan, Jobber, Housecall Pro), calendar sync, price quoting, payments by phone, multi-language beyond the listed options.

## Success gates
- 90% of scripted test calls (see `docs/TEST_CALLS.md`) end in the correct outcome.
- 3 pilot businesses active after 30 days; 2 willing to pay full price; gross margin above 60%.

## Non-goals and safety
Never quotes prices, diagnoses, or promises exact arrival times. Discloses it is an AI. Recording notice when recording is on.
