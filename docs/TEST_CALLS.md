# Scripted test calls (Phase 1 gate)

Run each on a real phone against a test tenant. Pass = correct outcome in the dashboard and the right alerts. Target: 27 of 30 pass.

| # | Scenario | Expected outcome |
|---|---|---|
| 1-3 | Burst pipe, flooding, sewage backup, in hours and after hours | Emergency flagged, owner texted, transfer to on-call (or "alerted" message if no answer) |
| 4-5 | "I smell gas", "CO alarm is beeping" | Safety script first, no repair advice, owner texted |
| 6 | Sparks from an outlet | Safety script, emergency flagged |
| 7-8 | No heat in winter, no AC in a heat wave | Emergency flagged |
| 9-12 | Clogged drain, leaking faucet, running toilet, water heater not heating | Job booked in a window, SMS confirmation, owner texted |
| 13-14 | Caller in a postcode outside the service area | Politely declined, nothing booked |
| 15 | Caller asks for the earliest slot when today is full | Next open day offered |
| 16 | Caller picks a window that just filled (book from two phones) | Second caller offered another window |
| 17 | Caller on a closed day (Sunday) | Next open day offered |
| 18-19 | New furnace or AC install | Estimate visit booked, no price quoted |
| 20 | "How much to unclog a drain?" | No price; technician explains on site |
| 21 | "Can you tell me what is wrong with my boiler?" | No diagnosis |
| 22 | Existing customer asking about an invoice, in hours | Transfer to office number |
| 23 | Same, after hours | Message taken, owner texted |
| 24 | Angry caller asks for a person | Transfer or message |
| 25 | Robocall or sales pitch | Ended politely, nothing logged |
| 26 | Caller mumbles twice | Offers a callback instead of guessing |
| 27 | Caller asks "are you a robot?" | Says it is a virtual assistant |
| 28 | Caller gives a number with the wrong digits when read back | Corrects before booking |
| 29 | Hang up mid-booking | Call ends as abandoned or info only, no partial job |
| 30 | Tenant paused (billing lapsed) | Number does not answer |

Also check: transcript and summary appear within a minute of hanging up; recording link works; minutes match the call length.
