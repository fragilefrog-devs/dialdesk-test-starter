# Claude Code Guide

## Project
This is a multi-tenant AI receptionist SaaS. The Next.js app owns authentication, tenant workflows, billing, API routes, and persistence. `voice-gateway/` is a long-lived Node WebSocket process for Twilio and browser audio. Supabase Postgres is the system of record.

Read [PRD.md](PRD.md) for product goals and scope. Use [README.md](README.md) for local setup and [DEPLOYMENT.md](DEPLOYMENT.md) for production topology. `package.json`, `.env.example`, and the source code are authoritative for commands, configuration, and implementation details.

## Ownership Boundaries
- `src/app/`: routes, pages, and server actions. API route handlers validate requests and delegate domain work.
- `src/lib/`: Supabase clients, auth, billing, runtime configuration, and shared voice services.
- `src/ai/tools.ts`: the only implementation of receptionist business actions such as knowledge search, availability, booking, lead capture, and call transfer.
- `voice-gateway/src/`: audio transport and local Whisper.cpp/Piper integration. Conversation decisions and tenant operations stay in the app.
- `supabase/schema.sql`: database schema, policies, grants, and tenant isolation rules.

## Invariants
- Scope every tenant-data operation to the resolved `org_id`; use the authenticated Supabase client for user-scoped work and the admin client only for trusted server operations.
- Keep authorization and side effects in server code. Treat model output as untrusted input; only dispatch allow-listed actions through `executeTool`, which validates arguments and enforces business rules.
- Preserve confirmation before booking. Never invent business facts, availability, or policy. For emergencies, direct callers to local emergency services.
- Keep `SUPABASE_SERVICE_ROLE_KEY`, Twilio credentials, and `INTERNAL_API_SECRET` server-side. Only Supabase publishable/anon keys belong in `NEXT_PUBLIC_*` variables.
- Ollama's OpenAI-compatible endpoint is for text chat. `gemma3:1b` does not support model-native function tools; the app uses constrained JSON actions and validates them before execution.
- `127.0.0.1` refers to the app process's own network namespace. Configure a private reachable `OLLAMA_BASE_URL` when the app is remote or containerized.

## Voice Runtime
The current turn-based voice path is Whisper.cpp transcription (`pwcpp`) -> Ollama response/action -> Piper synthesis. The gateway must have the Whisper and Piper executables and model files configured. The app must reach Ollama. The gateway exposes `/twilio` for Twilio Media Streams and `/web` for the embedded widget. This implementation is half-duplex; caller interruption during agent playback is not supported.

## Change Workflow
1. Read the owning implementation and one nearby test or caller before editing. Keep changes within the owning layer.
2. For database changes, update `supabase/schema.sql` and review the RLS/grant implications.
3. Validate the smallest relevant slice first, then run broader checks when the change crosses app/gateway boundaries.
4. Check current environment constraints before reporting verification. The installed `next lint` script may not work with Next.js 16; run ESLint directly on changed files when needed. An app production build also requires Tailwind and PostCSS major versions to match the configured plugin.

Useful checks:

```powershell
npm run type-check
npm run type-check --prefix voice-gateway
npm run build --prefix voice-gateway
npx eslint <changed-files>
```

Run an end-to-end voice test only when Ollama, Whisper.cpp, Piper, Supabase, and the gateway are all reachable and configured.
