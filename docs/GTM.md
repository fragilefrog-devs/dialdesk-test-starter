# Go-to-market

## 1. Positioning
**"Every call answered. Every emergency flagged."** Missed calls are lost revenue for appointment-driven businesses; the product's job is
*bookings captured*, not "AI". Lead with outcome, price below a part-time receptionist, live in 10 minutes.

## 2. ICP
Plumbing and HVAC companies with 1 to 15 techs, where the owner is on the job and calls go to voicemail. Chosen because emergencies are urgent and high value, call types are narrow, and one saved job pays for the plan. Start in one US region so recording-consent rules are known.

## 3. Offer & pricing (hypothesis — validate with 5–10 design partners)
Solo $79 / Crew $179 / Fleet $349 (see `src/lib/plans.ts`), 14-day trial without card, overage per minute.
Price on **value** (one booked job pays for the year), not cost. Test an annual plan (2 months free) and a done-for-you setup fee ($199–$499) for non-technical owners.

## 4. Unit economics — fill in with live invoices before setting prices
`cost/min ≈ Vapi per-minute (platform + STT + LLM + TTS + telephony) + number/mo amortised + SMS + infra`
`gross margin = (plan price − included_minutes × cost/min − fixed per-tenant cost) / plan price`
Do a week of real test calls, divide actual provider spend by minutes, then re-price. Vapi per-minute cost is the main variable cost; the overage rate must exceed cost/min with margin, or heavy users lose you money.

## 5. Channels (in order of expected speed)
1. **Founder-led outbound to one vertical:** list 200 local businesses with poor call answering (call them after hours — your own product is the demo). Offer a free 7-day pilot.
2. **Partners:** local marketing agencies and supply-house contacts serving trades.
3. **Content/SEO:** "missed call cost calculator", "AI receptionist for [vertical]" pages.
4. **Local communities/Facebook groups, Product Hunt** after case studies exist.

## 6. 30-day launch plan
- **Week 1:** deploy, run smoke tests, set up Stripe, record a 90-second demo call, book 10 discovery calls.
- **Week 2:** onboard 3–5 design partners free (white-glove: you load their knowledge base); instrument activation.
- **Week 3:** fix top 5 friction points; collect 2 testimonials with booking numbers; open paid plans.
- **Week 4:** outbound at scale to the chosen vertical; publish 2 case-study pages; start referral offer.

## 7. Metrics
Activation = workspace with knowledge doc + number/widget + ≥1 real call within 7 days (dashboard checklist tracks the first three).
Track: trial→paid %, time-to-first-call, calls/tenant/week, booked-appointments/tenant, minutes vs plan (expansion/overage), gross margin per tenant, churn by vertical.

## 8. Objections to prepare for
"Will callers hate talking to a bot?" (it discloses AI, books fast, transfers on request) · "What if it says something wrong?" (answers only from your knowledge base; says "not sure" and captures a lead) · "My number?" (call forwarding) · "Is it legal to record?" (consent notice setting).
