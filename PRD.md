# Product Requirements Document

## Product
AI Voice Receptionist is a multi-tenant service that answers inbound business calls and website voice requests, answers questions from business-approved knowledge, captures leads, and books appointments.

## Problem
Appointment-driven businesses miss revenue when staff cannot answer calls. Generic voicemail loses caller intent, while human coverage is expensive and difficult to scale. The product should capture intent, give grounded answers, and route actionable requests into the business workflow.

## Users
- **Business owner or administrator:** creates a workspace, configures the receptionist, manages numbers, knowledge, team access, appointments, leads, calls, and billing.
- **Receptionist team member:** reviews call history, leads, and appointments within their organization.
- **Caller or website visitor:** speaks naturally, asks business questions, requests an appointment or callback, or asks to reach a person.

## Goals
1. Answer inbound phone and website voice requests with a consistent, configurable receptionist.
2. Ground business-specific answers in the tenant's knowledge and opening hours.
3. Support appointment availability checks, confirmed booking, lead capture, and phone transfer where configured.
4. Keep customer data isolated by organization and restrict privileged actions to trusted server code.
5. Give operators call transcripts, summaries, outcomes, and duration for follow-up.

## Non-Goals
- Outbound calling.
- SMS or email confirmations to callers.
- Google or Outlook calendar synchronization.
- A managed hosted speech or language-model service. The current voice implementation uses local Ollama, Whisper.cpp, and Piper runtimes.
- True full-duplex conversation or barge-in during synthesized speech.

## Core User Journeys

### Set Up a Workspace
1. A business owner signs up and confirms their email if required.
2. The owner creates an organization with a name, public slug, industry, and timezone.
3. The owner configures the receptionist's name, language, greeting, business instructions, hours, appointment duration, and optional transfer number.
4. The owner adds knowledge documents and, if needed, a Twilio phone number.

### Handle a Website Voice Request
1. A visitor starts the embedded widget on a customer site and grants microphone access.
2. The widget creates a signed web call and connects to the gateway's `/web` WebSocket.
3. The gateway detects speech, sends the utterance to local Whisper.cpp, and submits recognized text to the app.
4. The app asks Ollama for a JSON reply or allow-listed action. Server code executes actions through shared business tools and returns the result to Ollama for a caller-facing response.
5. Piper synthesizes the response; the gateway returns audio and transcript events to the widget.
6. The gateway finalizes the call and stores transcript, summary, and duration.

### Handle an Inbound Phone Call
1. Twilio posts a signed voice webhook to the app; the app rejects inactive or ineligible numbers and plans.
2. Twilio streams G.711 audio to the gateway's `/twilio` WebSocket.
3. Whisper.cpp, Ollama, and Piper handle each turn using the same server-owned business tools as the website flow.
4. The gateway relays synthesized audio to Twilio and finalizes the call; Twilio's status callback is authoritative for phone duration/status.

### Manage the Business
Owners and administrators manage team invitations, phone numbers, knowledge, receptionist settings, billing, leads, appointments, and call history. Members have restricted access. Organization-scoped authorization and database RLS prevent cross-tenant reads and writes.

## Functional Requirements

### Authentication and Tenancy
- Users can sign up, sign in, sign out, confirm email, and accept organization invitations.
- Each organization has isolated agents, phone numbers, knowledge, calls, contacts, leads, appointments, and memberships.
- Protected dashboard routes require a verified user; privileged billing state is writable only by trusted server-side code.

### Receptionist Configuration
- Administrators can configure greeting, language, instructions, hours, appointment duration, activation state, and optional human transfer number.
- Voice output is selected by the Piper model configured on the gateway, not by an OpenAI voice name stored in the agent UI.

### Conversation and Actions
- The receptionist uses short spoken responses, identifies as AI, follows tenant instructions, and does not fabricate information.
- Business fact questions use `search_knowledge`; appointment offers use `check_availability`.
- Booking requires caller details and confirmation of the selected slot. The database prevents overlapping bookings for an organization.
- The receptionist can capture a lead and offer a callback. Phone transfer is available only when a transfer number is configured.
- Emergency guidance directs callers to local emergency services.
- Ollama output is parsed as JSON, checked against the supported action allow-list, and executed only on the server.

### Voice and Call Records
- Website audio uses browser microphone capture and the gateway's `/web` WebSocket.
- Phone audio uses Twilio Media Streams and the gateway's `/twilio` WebSocket.
- Whisper.cpp transcribes utterances; Ollama generates responses/actions; Piper synthesizes audio.
- Calls store channel, status, duration, transcript, summary, tenant, and associated agent. Phone status callbacks determine final phone status and duration.
- The current interaction model is turn-based and half-duplex; interruption/barge-in is not supported.

### Billing and Operations
- Subscription plans and trial eligibility gate call handling.
- Stripe Checkout, Customer Portal, and signed webhooks manage subscription lifecycle.
- Twilio signatures and internal gateway credentials protect provider callbacks and app/gateway requests.
- Rate limits protect public call-start and widget interaction endpoints.

## System Constraints
- Next.js App Router application plus a separately deployed, long-lived Node WebSocket gateway.
- Supabase Auth and Postgres are used for identity, tenant data, RLS, and privileged server-side operations.
- `OLLAMA_BASE_URL` must be reachable from the Next.js process. `127.0.0.1` only works when Ollama and the app share a network namespace.
- The voice gateway requires compatible Whisper.cpp and Piper executables plus local model files. The production gateway image must make those binaries/models available.
- Public website embeds require a secure page context, microphone permission, and a reachable gateway WebSocket URL. Twilio requires a publicly reachable TLS WebSocket endpoint.
- Local inference avoids per-token hosted model charges, but still consumes compute, hosting, and telephony resources.

## Acceptance Criteria
- A user can sign up, create a workspace, and access only their own organization's data.
- A configured website widget can connect to the gateway, capture speech, return synthesized speech, and persist a completed call transcript and summary.
- An eligible Twilio number can stream audio through the gateway and complete a call with matching Twilio status/duration.
- Knowledge questions use tenant-scoped search and do not claim unsupported facts.
- Appointment availability and booking respect timezone, business hours, existing bookings, and no-overlap constraints.
- Lead capture persists the caller's supplied details and intent; transfer attempts use only the configured number.
- Invalid model actions, invalid call tokens, and requests from unauthenticated gateway clients cannot invoke business tools.
- Expired or ineligible accounts receive an unavailable response before local model inference begins.

## Current Status and Known Gaps
- Implemented in the codebase: multi-tenant auth/data model, dashboard workflows, shared business tools, Ollama JSON routing, website/Twilio gateway paths, Stripe integration, and call finalization.
- Runtime prerequisites: Ollama with the configured model, Whisper.cpp with a compatible model, Piper with a compatible voice model, Supabase credentials, and (for phone calls) Twilio credentials.
- Not yet verified end-to-end: live browser audio, live Twilio calls, Stripe checkout/webhooks, and production deployment with mounted speech models.
- Known limitation: the first local voice implementation is half-duplex and does not support barge-in.
- Not implemented: outbound calls, caller notifications, calendar synchronization, and automated overage invoicing.
- Current development environment has dependency-version drift: the app production build may fail until the Tailwind/PostCSS plugin configuration matches the installed Tailwind major version; the legacy `next lint` script may need an ESLint CLI replacement under Next.js 16.
