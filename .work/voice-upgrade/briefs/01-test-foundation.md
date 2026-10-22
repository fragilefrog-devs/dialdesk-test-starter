# Task 01 — Test foundation, CI, baseline capture

## Goal
Install Vitest in the app and the gateway, wire `npm test` in both packages and in CI,
and record the pre-change voice baseline in `docs/VOICE_BASELINE.md`.

## Context you need
- The repo has **zero tests** and no test runner. `package.json:12` currently aliases
  `test` to `tsc --noEmit && eslint src`; `.github/workflows/ci.yml` runs type-check,
  lint and build only.
- Gateway is a separate package (`voice-gateway/package.json`) with `type: module`,
  NodeNext TS, `src/` only.
- Local speech binaries/models exist on this machine (see `.work/voice-upgrade/LEDGER.md`),
  but CI has none. The baseline probe must **skip cleanly** when they are absent.
- App tsconfig includes `**/*.ts`, so app tests under `src/` are type-checked; use
  explicit `import { describe, it, expect, vi } from 'vitest'` (no globals).
- Gateway tsconfig has `include: ["src"]`, so gateway tests must live in
  `voice-gateway/test/` to stay out of `tsc -p .` and `dist/`.

## Files to create/modify
- `package.json` (scripts + devDependency `vitest`)
- `voice-gateway/package.json` (scripts + devDependency `vitest`)
- `vitest.config.ts` (new, repo root)
- `voice-gateway/vitest.config.ts` (new)
- `src/test/smoke.test.ts` (new)
- `voice-gateway/test/smoke.test.ts` (new)
- `scripts/voice-baseline.mjs` (new)
- `docs/VOICE_BASELINE.md` (new)
- `.github/workflows/ci.yml` (add test steps)

Do not touch application source under `src/` or `voice-gateway/src/`, but see note on
`voice-gateway/src/index.ts`: **not in this task**. Task 06 adds the export.

## Interface / contract
Root `vitest.config.ts` exactly:

```ts
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    restoreMocks: true,
    clearMocks: true,
    testTimeout: 15_000,
  },
})
```

`voice-gateway/vitest.config.ts` exactly:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    restoreMocks: true,
    clearMocks: true,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
})
```

Root scripts (keep `lint`, `type-check`, `dev`, `build`, `start` unchanged):
```json
"test": "vitest run",
"test:watch": "vitest",
"check": "tsc --noEmit && eslint src --ext .ts,.tsx"
```
Gateway scripts (keep existing):
```json
"test": "vitest run",
"test:watch": "vitest"
```
Add `"vitest": "^2.1.9"` to both `devDependencies`. Do not add `jsdom`, `@vitest/coverage`,
or any global-types config.

Baseline probe `scripts/voice-baseline.mjs` (plain ESM, no deps):
- Reads `PIPER_PATH`, `PIPER_MODEL_PATH`, `WHISPER_CPP_PATH`, `WHISPER_MODEL_PATH`,
  `OLLAMA_BASE_URL` (default `http://127.0.0.1:11434/v1`), `OLLAMA_MODEL`
  (default `gemma3:1b`) from `process.env`.
- If a binary/model is missing, push its name into `missing[]` and continue; if all are
  missing print `{"skipped":true,"missing":[...]}` and exit 0.
- Measurements (all in ms, `performance.now()`, run each 2× and keep the min):
  1. `piper_full_ms`: spawn `piper --model <model> --output_file <tmp.wav>` with stdin
     `"Thanks for calling. How can I help you today?"`; time to process close; verify the
     file starts with `RIFF` and is > 44 bytes.
  2. `piper_first_raw_byte_ms`: spawn `piper --model <model> --output-raw`; time to the
     first stdout `data` chunk; kill the child after the first chunk.
  3. `whisper_3s_ms`: write a 3 s 16 kHz mono PCM16 WAV containing a 440 Hz sine
     (amplitude 0.2) plus 500 ms silence into `os.tmpdir()`, run
     `pwcpp <wav> -m <model> -otxt --no_timestamps true --no_context`, time to close.
  4. `ollama_first_token_ms` and `ollama_full_ms`: POST
     `${OLLAMA_BASE_URL}/chat/completions` with `{model,messages:[{role:"user",
     content:"Say hello in five words."}],temperature:0.2,stream:true}`; record first
     `data:` delta and stream end. If the request fails, record `null` and a `warnings[]`
     entry.
- Prints one JSON object on stdout with keys
  `{measuredAt, platform, node, piperFullMs, piperFirstRawByteMs, whisper3sMs,
  ollamaFirstTokenMs, ollamaFullMs, missing, warnings}`.
- Uses `node:child_process`, `node:fs/promises`, `node:os`, `node:path` only; cleans
  temp files in `finally`.

`docs/VOICE_BASELINE.md` sections (fill with the probe output; never invent numbers):
1. `# Voice baseline (pre-upgrade)` + date/OS/Node line.
2. `## Structural baseline` table: endpoint silence 800 ms (`voice-gateway/src/index.ts:135`),
   min speech 250 ms, max utterance 20 s (`:139`), TTS buffered — full WAV before first
   frame (`local-speech.ts:113-123`, `index.ts:71`), finalize in-memory boolean
   (`index.ts:36`), `MAX_CALL_SECONDS` 1800 (`:9`), zero tests in repo.
3. `## Measured on this machine` table with the probe's five numbers (or `not measured`
   per row when skipped).
4. `## How to reproduce` with the exact command `node scripts/voice-baseline.mjs`.
5. `## What these numbers mean for Phase 2` — 3 bullets max (first-byte vs full synth gap;
   Whisper dominates turn latency; Ollama first-token vs full gap).

CI (`.github/workflows/ci.yml`):
- App job: after `npm run lint`, add `- run: npm test` (no env needed; tests must not
  read `.env*`).
- Gateway job: after `npm run type-check`, add `- run: npm test`, before `npm run build`.

## Exact values
- Vitest major: `^2.1.9` in both packages.
- Timeouts: app `testTimeout: 15000`; gateway `testTimeout: 20000`, `hookTimeout: 20000`.
- Probe: sine amplitude `0.2`, frequency `440`, WAV duration `3.0 s`, silence tail `500 ms`,
  Ollama temperature `0.2`, two runs per measurement (min wins).
- Gateway test root: `voice-gateway/test/`; app test root: `src/test/`.

## Test plan
Create:
- `src/test/smoke.test.ts`: `describe('app test harness', () => { it('runs', () => {
  expect(1 + 1).toBe(2) }) })`.
- `voice-gateway/test/smoke.test.ts`: same shape.

Run exactly:
```bash
npm test
npm test --prefix voice-gateway
node scripts/voice-baseline.mjs
npm run type-check
npm run type-check --prefix voice-gateway
```
On CI-like machines without binaries the probe prints `skipped` and exits 0.

## Acceptance criteria
- [ ] `npm test` runs Vitest and passes; `check` still performs the old type-check+lint.
- [ ] `npm test --prefix voice-gateway` runs Vitest from `voice-gateway/` and passes.
- [ ] `voice-gateway/dist/` is not polluted by test files after `npm run build --prefix voice-gateway`.
- [ ] `docs/VOICE_BASELINE.md` exists with all five sections and either real numbers or
      explicit `not measured` rows.
- [ ] CI has a test step in both jobs; `ci.yml` remains valid YAML.
- [ ] No app source or gateway source changed.

## Out of scope
- Any production code change, including the `index.ts` export used by Task 06.
- Coverage thresholds, browser/jsdom tests, Playwright.
- Real Twilio/Stripe/Supabase fixtures.

## Report path
`.work/voice-upgrade/reports/01-test-foundation.md`
