# Production deployment

Two deployables: the **app** (Next.js) and the **voice gateway** (Node WebSocket). Supabase, Stripe, Twilio,
and Resend are managed services. Ollama, Whisper.cpp, and Piper run on infrastructure you control.

## 1. Supabase
1. Create a project (pick the region closest to your callers — latency matters for voice tool calls).
2. SQL editor → run `supabase/schema.sql`.
3. Auth → URL configuration: Site URL = `https://app.yourdomain.com`; add `https://app.yourdomain.com/auth/callback`.
4. Auth → Providers → Email: keep email confirmation **on**. Configure custom SMTP (Resend) so confirmations aren't rate-limited.
5. Enable daily backups (Pro plan) and Point-in-Time Recovery before onboarding paying customers.

## 2. Stripe
Create three monthly Prices matching `src/lib/plans.ts`, put their IDs in `STRIPE_PRICE_*`.
Webhook endpoint `https://app.yourdomain.com/api/webhooks/stripe` → events `customer.subscription.created|updated|deleted`;
copy the signing secret to `STRIPE_WEBHOOK_SECRET`. Enable the Customer Portal (cancel + plan switch + invoices).

## 3. Local AI and speech runtimes
Run Ollama with `gemma3:1b` and install Whisper.cpp plus Piper on the app/gateway hosts. Download a Whisper
GGML model and a Piper `.onnx` voice model. Set `OLLAMA_BASE_URL` and `OLLAMA_MODEL` for the Next.js app;
set `WHISPER_CPP_PATH`, `WHISPER_MODEL_PATH`, `PIPER_PATH`, and `PIPER_MODEL_PATH` for the gateway.
The gateway expects the `pywhispercpp` `pwcpp` CLI and Piper's `--model` / `--output_file` CLI; use full
executable paths when the Python virtual environment's `Scripts` directory is not on `PATH`.

The app server must be able to reach Ollama. `127.0.0.1` works only when Ollama and the app run on the same
host/network namespace. For containers or Vercel, set `OLLAMA_BASE_URL` to a reachable private endpoint; do
not expose Ollama publicly without authentication and network controls.

## 4. Voice gateway (needs a persistent host)
Fly.io / Railway / a VPS with Docker. Must be reachable at a public **wss://** URL with TLS. The gateway
host/container must also have the Whisper.cpp and Piper binaries and model files available.
```bash
cd voice-gateway
fly launch --no-deploy   # or: docker build -t voice-gateway . && docker run -p 8080:8080 --env-file .env voice-gateway
fly secrets set APP_URL=https://app.yourdomain.com INTERNAL_API_SECRET=... WHISPER_CPP_PATH=whisper-cli WHISPER_MODEL_PATH=/models/ggml-base.en.bin PIPER_PATH=piper PIPER_MODEL_PATH=/models/en_US-lessac-medium.onnx
fly deploy               # then VOICE_GATEWAY_URL=wss://voice-gateway.fly.dev/twilio in the app env
```
Run ≥2 instances only behind sticky routing (a call's socket lives on one instance). Health check: `GET /health`.

## 5. App
**Vercel (simplest):** import the repo, set every variable from `.env.example`, deploy.
**VPS/Docker:** `docker build --build-arg NEXT_PUBLIC_APP_URL=... --build-arg NEXT_PUBLIC_SUPABASE_URL=... --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=... -t receptionist .`
(`NEXT_PUBLIC_*` values are baked at build time — rebuild after changing them), behind Caddy/Nginx with TLS.
The Docker image excludes local environment files, runs as an unprivileged user, and checks `/api/health`.
The gateway image does the same and checks `/health`.

## 6. Twilio
Numbers are bought from the dashboard (`/dashboard/numbers`), which configures the voice + status webhooks
automatically. Set `TWILIO_ACCOUNT_SID/AUTH_TOKEN`. Twilio signs webhooks; the app rejects unsigned ones, so
`NEXT_PUBLIC_APP_URL` must exactly match the public URL Twilio calls. Some countries require regulatory bundles before numbers can be bought.

## 7. Verify
`GET /api/health` → `{ok:true}` · sign up → onboarding → add knowledge → test widget audio → call a number → check `/dashboard/calls`.
Apply `supabase/schema.sql` after deploying schema changes; its organization column grants keep subscription
state writable only by trusted server-side billing code.
