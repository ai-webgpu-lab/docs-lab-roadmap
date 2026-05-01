# Benchmark Summary

## Purpose
This report is the Phase 3 benchmark summary entrypoint for `ai-webgpu-lab`.
It separates committed deterministic evidence from pending real browser
measurements so the portfolio can publish useful status without overstating
runtime or renderer conclusions.

## Measurement Scope
| Track | Primary repos | Current state | Next required evidence |
| --- | --- | --- | --- |
| Runtime | `bench-runtime-shootout`, `bench-model-load-and-cache`, `bench-worker-isolation-and-ui-jank` | deterministic harness ready; real runtime measurement pending | cold/warm WebGPU and fallback rows with raw JSON |
| Browser AI | `exp-embeddings-browser-throughput`, `exp-stt-whisper-webgpu`, `exp-llm-chat-runtime-shootout` | deterministic harness ready; model-backed measurement pending | model id, cache state, quality/latency pair |
| Renderer | `exp-three-webgpu-core`, `bench-renderer-shootout`, `bench-blackhole-render-shootout` | renderer adapter/sketch coverage ready; cross-device run pending | frame time, load time, fallback status |
| App surface | `app-private-rag-lab`, `app-local-chat-arena`, `app-blackhole-observatory` | app surface adapters ready; end-to-end run pending | task latency and user-visible failure notes |

## Environment Matrix
| Environment | Browser | Device class | GPU path | Status |
| --- | --- | --- | --- | --- |
| Local deterministic CI | Node shell tests | CI/desktop host | fixed harness backend | available |
| Chromium WebGPU | Chromium stable or Chrome stable | desktop | WebGPU adapter | pending real run |
| Chromium fallback | Chromium stable or Chrome stable | desktop | fallback or WASM path | pending real run |
| Firefox/Safari compatibility | Firefox Nightly/Safari Technology Preview where available | desktop or laptop | WebGPU availability varies | pending compatibility run |

## Result Summary
| Repo | Scenario | Primary metric | Current result | Decision impact |
| --- | --- | ---: | --- | --- |
| `bench-runtime-shootout` | deterministic-webgpu | synthetic runtime score | reference only | keep as regression anchor |
| `bench-runtime-shootout` | deterministic-fallback | synthetic fallback score | reference only | keep as fallback regression anchor |
| `bench-runtime-shootout` | real-cold | first usable result latency | pending | required before runtime promotion |
| `bench-runtime-shootout` | real-warm | warmed interaction latency | pending | required before runtime promotion |
| `exp-embeddings-browser-throughput` | real WebGPU vs fallback | docs/sec and query latency | pending | required before browser AI recommendation |
| `exp-stt-whisper-webgpu` | real WebGPU vs fallback | audio sec/sec and WER/CER | pending | required before audio workload recommendation |
| `bench-renderer-shootout` | real renderer comparison | p50/p95 frame time | pending | required before renderer recommendation |

## Raw Result Index
| Source | Path | Role |
| --- | --- | --- |
| Fixture baseline | `tests/fixtures/results/bench-model-load-and-cache/01-cold-load.json` | committed sample for cold-load summary rendering |
| Fixture baseline | `tests/fixtures/results/bench-model-load-and-cache/02-warm-load.json` | committed sample for warm-load summary rendering |
| Fixture baseline | `tests/fixtures/results/exp-embeddings-browser-throughput/01-cold-index-webgpu.json` | committed sample for WebGPU embedding capture |
| Fixture baseline | `tests/fixtures/results/exp-embeddings-browser-throughput/03-cold-index-fallback.json` | committed sample for fallback embedding capture |
| Future real runs | `reports/raw/*.json` in each measured repo | required source for promoted benchmark rows |

## Known Limitations
- Current committed evidence proves harness shape, dashboard rendering, and raw-result contract behavior; it does not yet prove a production runtime winner.
- Real browser measurements must record browser version, OS/device, adapter name, cache state, worker mode, and failure mode before they can affect recommendations.
- Pending rows must remain visible until raw JSON and a reproducible command are linked.
- Deterministic rows are regression anchors, not substitutes for real WebGPU or fallback measurements.
