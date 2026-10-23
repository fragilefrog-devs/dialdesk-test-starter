# Legacy: self-hosted voice gateway

This is the original self-hosted voice path (Twilio Media Streams → Whisper.cpp → Ollama → Piper).
DialDesk now runs calls on **Vapi** (see `src/lib/vapi.ts`), so nothing in `src/` depends on this folder
and CI no longer builds it.

Kept for reference in case per-minute cost at scale justifies bringing speech in-house. It still
expects the removed app routes (`/api/voice/*`, `/api/webhooks/twilio/*`); recover them from git history
(`git log -- src/app/api/voice`) if you revive it.
