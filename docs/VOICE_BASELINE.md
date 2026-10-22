# Voice baseline (pre-upgrade)

Measured 2026-10-22 on Windows (win32 x64), Node v24.15.0. All numbers below were
captured with `node scripts/voice-baseline.mjs` against the local Piper, pwcpp and
Ollama installations. Nothing here is estimated.

## Structural baseline

| Behaviour | Current implementation | Source |
| --- | --- | --- |
| Endpoint silence before a turn is emitted | 800 ms | `voice-gateway/src/index.ts:135` |
| Minimum speech required | 250 ms | `voice-gateway/src/index.ts:135` |
| Maximum utterance length | 20 s | `voice-gateway/src/index.ts:139` |
| TTS delivery | Buffered: full WAV synthesized before the first audio frame is sent | `voice-gateway/src/local-speech.ts:113-123`, `voice-gateway/src/index.ts:71` |
| Finalization guard | In-memory `finalized` boolean, no retry or durable record | `voice-gateway/src/index.ts:36` |
| Hard call cap | `MAX_CALL_SECONDS` default 1800 s | `voice-gateway/src/index.ts:9` |
| Automated tests in repo | 0 (no runner before this change) | repo-wide |

## Measured on this machine

| Measurement | Value (ms) | How it was taken |
| --- | --- | --- |
| `piperFullMs` | 5859.7 | Spawn Piper to a temp WAV, time to process close, validate RIFF > 44 bytes |
| `piperFirstRawByteMs` | 5286.5 | Spawn `piper --output-raw`, time to first stdout chunk, kill child |
| `whisper3sMs` | 2883 | Transcribe a synthesized 3 s / 16 kHz clip (440 Hz tone, 0.2 amplitude, 500 ms silence tail) |
| `ollamaFirstTokenMs` | 97.3 | Time to first streamed `choices[0].delta.content` chunk (`gemma3:1b`, temperature 0.2) |
| `ollamaFullMs` | 175.9 | Time to end of a separate streamed completion (`gemma3:1b`, temperature 0.2); its own run pair |

Raw probe output:

```json
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

If a binary/model pair is absent, its measurements are `null` and the absent paths appear
in `missing`; a failed run also adds a `warnings` entry. If all four binary/model paths are
missing, the probe prints `{"skipped":true,...}` and exits 0 without measuring. (On this
run `missing` was empty.)

## How to reproduce

```bash
node scripts/voice-baseline.mjs
```

The probe reads `PIPER_PATH`, `PIPER_MODEL_PATH`, `WHISPER_CPP_PATH`,
`WHISPER_MODEL_PATH`, `OLLAMA_BASE_URL` (default `http://127.0.0.1:11434/v1`) and
`OLLAMA_MODEL` (default `gemma3:1b`). Each measurement runs twice and keeps the minimum.
If all four binary/model paths are absent it prints `{"skipped":true,...}` and exits 0.

## What these numbers mean for Phase 2

- Piper is the dominant cost: full synthesis is 5859.7 ms and the first raw byte arrives at
  5286.5 ms, so `--output-raw` alone saves only ~573 ms. Per-utterance process/model startup
  dominates and must be removed with a persistent or prewarmed worker.
- Whisper is the largest STT component and stays on the critical path: 2883 ms for a 3 s clip
  under batch-per-utterance processing.
- Ollama is not the bottleneck: first token 97.3 ms vs 175.9 ms full, so latency work
  should target speech I/O rather than LLM streaming.
