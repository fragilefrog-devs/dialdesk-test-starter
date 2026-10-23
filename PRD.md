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
2. **Repair booking:** problem and urgency, address and postcode, service-area check, availability, read-back, `book_job`, SMS confirmation.
3. **Estimate request:** book an estimate visit for installs and replacements; no price quoting.
4. **Existing customer or other:** office transfer in hours, otherwise a message to the owner.
5. **After hours:** emergencies per the owner's policy; routine work booked for the next open day.
6. **Spam:** ended politely, not logged.

## Functional requirements
- Per-tenant configuration: services, postcodes, arrival windows, jobs per window, office hours, on-call and office numbers, alert phone and email, recording on/off.
- Booking by arrival window with per-window capacity, race-free.
- Owner SMS and email alerts for emergencies, new jobs and messages; caller SMS confirmation (needs a registered SMS sender).
- Dashboard: calls (outcome, urgency, summary, transcript, recording), messages, jobs, numbers, billing, team.
- Billing by plan with included minutes and overage; lapsed accounts stop answering.

## Out of scope for v1
Outbound calls, field-service integrations (ServiceTitan, Jobber, Housecall Pro), calendar sync, price quoting, payments by phone, web widget, multi-language beyond the listed options.

## Success gates
- 90% of scripted test calls (see `docs/TEST_CALLS.md`) end in the correct outcome.
- 3 pilot businesses active after 30 days; 2 willing to pay full price; gross margin above 60%.

## Non-goals and safety
Never quotes prices, diagnoses, or promises exact arrival times. Discloses it is an AI. Recording notice when recording is on.
