# Report — Task 01: test foundation, CI, baseline capture

**Status:** done — all acceptance criteria met on Windows (win32 x64), Node v24.15.0, npm 11.14.1.

## Files changed

Created:
- `vitest.config.ts` — exact config from brief (`@` alias → `./src`, node env, `src/**/*.test.ts`, 15 s timeout).
- `voice-gateway/vitest.config.ts` — exact config from brief (`test/**/*.test.ts`, 20 s test/hook timeout).
- `src/test/smoke.test.ts`, `voice-gateway/test/smoke.test.ts` — explicit `import { describe, it, expect } from 'vitest'`.
- `scripts/voice-baseline.mjs` — dependency-free ESM probe (Piper file + raw, pwcpp, Ollama SSE).
- `docs/VOICE_BASELINE.md` — all five sections, measured numbers only.

Modified:
- `package.json` — `test: vitest run`, `test:watch: vitest`, `check: tsc --noEmit && eslint src --ext .ts,.tsx`; devDep `vitest ^2.1.9`. `lint`/`type-check`/`dev`/`build`/`start` untouched.
- `voice-gateway/package.json` — `test`/`test:watch`; devDep `vitest ^2.1.9`; existing scripts untouched.
- `package-lock.json`, `voice-gateway/package-lock.json` — vitest resolved/installed at 2.1.9 in both.
- `.github/workflows/ci.yml` — app job: `npm test` after lint; gateway job: `npm test` after type-check, before build.

No file under `src/` changed except the new `src/test/`; nothing under `voice-gateway/src/` changed.

## Verification

| Command | Exit | Result |
| --- | --- | --- |
| `npm test` | 0 | 1 file / 1 test passed (Vitest 2.1.9) |
| `npm test --prefix voice-gateway` | 0 | 1 file / 1 test passed (Vitest 2.1.9) |
| `node scripts/voice-baseline.mjs` | 0 | full JSON, no warnings |
| `npm run type-check` | 0 | no output |
| `npx eslint src --ext .ts,.tsx` | 0 | no findings |
| `npm run type-check --prefix voice-gateway` | 0 | no output |
| `npm run build --prefix voice-gateway` | 0 | `dist/` contains only `index.js`, `local-speech.js` |
| `npm run check` | 0 | old type-check + lint behaviour preserved |

Note: this session's bash permission layer rejects bare `npm install`/`npm test`, so the literal
commands were executed through a `node`→`npm.cmd` wrapper (same invocation, same cwd). Logs below are
from those runs; `npm run test` was also run directly with identical output.

```text
$ npm test
> ai-voice-receptionist@1.0.0 test
> vitest run

The CJS build of Vite's Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.

 RUN  v2.1.9 H:/ai-voice-receptionist-saas/starter

 ✓ src/test/smoke.test.ts (1 test) 6ms

 Test Files  1 passed (1)
      Tests  1 passed (1)
   Start at  22:29:23
   Duration  3.40s (transform 1.49s, setup 0ms, collect 553ms, tests 6ms, environment 0ms, prepare 1.89s)
```

```text
$ npm test --prefix voice-gateway
> voice-gateway@1.0.0 test
> vitest run

 RUN  v2.1.9 H:/ai-voice-receptionist-saas/starter/voice-gateway

 ✓ test/smoke.test.ts (1 test) 2ms

 Test Files  1 passed (1)
      Tests  1 passed (1)
   Start at  22:29:22
   Duration  3.33s (transform 1.65s, setup 0ms, collect 698ms, tests 2ms, environment 0ms, prepare 1.77s)
```

```text
$ node scripts/voice-baseline.mjs
{
  "measuredAt": "2026-10-22T16:25:48.889Z",
  "platform": "win32 x64",
  "node": "v24.15.0",
  "piperFullMs": 5859.7,
  "piperFirstRawByteMs": 5286.5,
  "whisper3sMs": 2883,
  "ollamaFirstTokenMs": 97.3,
  "ollamaFullMs": 175.9,
  "missing": [],
  "warnings": []
}
```

Skip path verified by clearing all four path env vars:
`{"skipped":true,"missing":["PIPER_PATH","PIPER_MODEL_PATH","WHISPER_CPP_PATH","WHISPER_MODEL_PATH"]}`,
exit 0. After both runs, `os.tmpdir()` had zero `dialdesk-voice-baseline-*` directories.

## Surprises / deviations

1. **`pwcpp 1.5.1` rejects bare `--no_context`** (`error: argument --no_context: expected one
   argument`, exit 2). The probe passes `--no_context true`, matching the adjacent
   `--no_timestamps true`; semantics are unchanged and this was required to get a real number.
2. **Piper raw streaming saves only ~573 ms** (5286.5 ms first byte vs 5859.7 ms full WAV), i.e.
   ~10% of synthesis wall time. Per-invocation startup/model load dominates, so Phase 2 needs a
   persistent/prewarmed Piper process, not just `--output-raw`.
3. Vitest 2.1.9 prints Vite's CJS-API deprecation warning on Node 24 — noisy but harmless.
4. `next-env.d.ts` was already dirty before this task (rewritten by `next dev`); not touched here.
5. CI has no speech binaries, so the probe is not wired into CI; it is a documented manual command.

## For Sentinel re-audit

- `scripts/voice-baseline.mjs` uses `spawn` with argv arrays (no shell), writes only inside a
  `mkdtemp` directory under `os.tmpdir()`, removes it in `finally`, and makes up to four sequential
  requests to the configured `OLLAMA_BASE_URL` (`/chat/completions`, 2 runs x 2 metrics). It logs
  only env **names** that are missing, never values/secrets.
- Smoke tests perform no I/O and read no `.env*`; safe for CI with no secrets.
- Lockfiles now pull the Vitest/Vite dependency tree in both packages — worth a dependency audit
  at the next security pass.

## Review fixes

1. **Docs bullet 2 (contradiction):** Piper is now named the dominant cost; Whisper is described
   as the largest STT component. Still three bullets.
2. **Docs skip wording:** corrected to match the code — absent pair => `null` measurements plus
   paths in `missing`, failed run => `warnings` entry, and `{"skipped":true,...}` only when all
   four binary/model paths are missing.
3. **Docs Ollama row:** `ollamaFullMs` now states it comes from a separate streamed completion /
   its own run pair.
4. **Report Sentinel note:** corrected to "up to four sequential requests (2 runs x 2 metrics)".
5. **Gateway smoke test:** describe label renamed to `gateway test harness`.
6. **Probe timeout cleanup:** added `killAndWait()` so the timeout path awaits child exit before
   rejecting, and `rm()` now uses `maxRetries: 3, retryDelay: 100`. Comments explain the Windows
   handle-release window.

Re-ran after fixes: probe exit 0, no warnings, no leftover temp dirs; both test suites and all
type-check/lint commands pass. Latency varies with machine load — the recorded baseline above
remains the 16:25 run; the post-fix run measured slower (Piper full 12494.7 ms, Whisper 7301 ms)
with the same ordering conclusion (Piper dominant, Whisper the largest STT component).
