# Runtime Recommendations

## Purpose
This document starts the Phase 3 runtime decision record for `ai-webgpu-lab`.
The current goal is not to declare a production winner yet. The goal is to lock
the measurement protocol that turns deterministic readiness harnesses into
repeatable runtime recommendations.

## Current Recommendation State
| Scope | Recommendation | Confidence | Evidence |
| --- | --- | --- | --- |
| First measured runtime track | Start with `bench-runtime-shootout` | medium | It already owns the runtime adapter contract and real runtime sketch gate. |
| First browser AI workload | Follow with `exp-embeddings-browser-throughput` or `exp-stt-whisper-webgpu` | medium | Both have simple measurable outputs and smaller model candidates. |
| Runtime winner | No winner yet | low | Real cold/warm measurements are not committed in this repository yet. |
| Default policy | Keep deterministic baseline plus real runtime result side by side | high | This preserves regression stability while adding measured data. |

## Candidate Order
1. `bench-runtime-shootout`
2. `exp-embeddings-browser-throughput`
3. `exp-stt-whisper-webgpu`
4. `exp-llm-chat-runtime-shootout`
5. `bench-model-load-and-cache`
6. `bench-worker-isolation-and-ui-jank`

## Measurement Protocol
Each runtime recommendation entry must include:

| Field | Required Value |
| --- | --- |
| Commit | Exact commit hash for the measured repo |
| Browser | Name and version |
| OS/device | OS, CPU class, memory class, power state |
| GPU path | Adapter name, backend, required features, fallback flag |
| Runtime | Library, version, model id, quantization, task |
| Cache state | Cold and warm runs separated |
| Worker mode | Main thread, worker, shared worker, or unknown |
| Raw output | `reports/raw/*.json` path |
| Summary | `RESULTS.md` update with deterministic and real rows |
| Failure note | Download, memory, adapter, timeout, CORS, or unsupported feature |

## Required Comparison Table
Every measured runtime repo should keep this table shape in `RESULTS.md` or a
track-specific summary:

| Scenario | Runtime | Backend | Cache | Primary Metric | P95 / Tail | Status | Notes |
| --- | --- | --- | --- | ---: | ---: | --- | --- |
| deterministic-webgpu | harness baseline | webgpu-style | fixed | TBD | TBD | reference | Regression anchor |
| deterministic-fallback | harness baseline | fallback-style | fixed | TBD | TBD | reference | Fallback anchor |
| real-cold | TBD | TBD | cold | TBD | TBD | pending | First measured cold run |
| real-warm | TBD | TBD | warm | TBD | TBD | pending | First measured warm run |

## Decision Rules
| Rule | Promote | Continue | Archive |
| --- | --- | --- | --- |
| Stability | 3 repeated runs complete without harness errors | Intermittent recoverable failures | Repeated browser/runtime crashes |
| WebGPU benefit | WebGPU beats fallback on primary metric with acceptable quality | Mixed result but clear tuning path | No benefit and high maintenance cost |
| Cold start | Cold start is documented and acceptable for workload | Cold start high but warm path useful | Cold start blocks practical usage |
| Cache reuse | Warm run improves user-facing latency | Cache works but needs UX mitigation | Cache unreliable or unavailable |
| Worker UX | Worker path avoids UI jank for interactive workloads | Main thread acceptable for batch-only work | Worker path impossible and UI jank severe |
| Result quality | Quality metric is comparable to fallback | Quality tradeoff is explicit | Quality regression invalidates result |

## Initial Runtime Track Notes
### `bench-runtime-shootout`
- Role: first runtime benchmark and adapter-contract proof point.
- First real path: `?mode=real-runtime`.
- Expected first measurement: Transformers.js pipeline with cold/warm cache split.
- Required next output: real `reports/raw/*.json`, screenshot/log, and `RESULTS.md` comparison rows.

### `exp-embeddings-browser-throughput`
- Role: small-model browser AI workload with straightforward throughput/latency metrics.
- First real path: `?mode=real-embeddings`.
- Required next output: docs/sec, query latency, embedding dimensions, fallback status.

### `exp-stt-whisper-webgpu`
- Role: audio workload with clear latency and WER/CER fields.
- First real path: `?mode=real-whisper`.
- Required next output: audio sec/sec, first partial latency, final latency, WER/CER.

## Open Measurement Backlog
| Repo | Next Measurement | Blocking Unknown |
| --- | --- | --- |
| `bench-runtime-shootout` | Cold/warm real runtime capture | Model download time and WebGPU availability |
| `exp-embeddings-browser-throughput` | Small embedder WebGPU vs fallback pair | Model choice and browser cache behavior |
| `exp-stt-whisper-webgpu` | Whisper-tiny file transcription | Audio fixture and WER reference text |
| `bench-model-load-and-cache` | Cache reuse delta | Cache Storage/IndexedDB strategy |
| `bench-worker-isolation-and-ui-jank` | Main vs worker jank comparison | Stable input-delay fixture |

## Current Decision
No runtime is promoted yet. The actionable recommendation is to measure
`bench-runtime-shootout` first, because it is the lowest-risk place to prove the
full loop: real runtime load, cold/warm capture, raw JSON, `RESULTS.md`, and a
tracked recommendation update.
