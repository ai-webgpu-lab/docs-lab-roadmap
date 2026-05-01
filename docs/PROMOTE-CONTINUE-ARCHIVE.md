# Promote / Continue / Archive

## Purpose
This decision log records which experiments are ready to promote, continue, or
archive. Current entries are conservative because the repository has complete
deterministic harness coverage but does not yet have enough real browser
measurements to promote a runtime, model path, or renderer.

## Decision Summary
| Area | Decision | Confidence | Reason |
| --- | --- | --- | --- |
| Runtime recommendation | Continue | medium | `RUNTIME-RECOMMENDATIONS.md` defines the protocol, but real cold/warm rows are pending. |
| Browser AI workloads | Continue | medium | embeddings and STT workloads are the first practical measurement candidates. |
| Renderer comparison | Continue | medium | renderer adapters and sketches are ready; cross-browser frame data is pending. |
| Archive candidates | None | low | no experiment has enough real failure evidence to archive yet. |

## Promote
No workload is promoted yet.

A workload can move to Promote only when:
- Real WebGPU and fallback measurements are linked from `reports/raw/*.json`.
- Browser/device environment is documented in `docs/MULTI-BROWSER-RESULTS.md`.
- `docs/BENCHMARK-SUMMARY.md` includes p50 or primary metric plus p95/tail data.
- Failure notes are explicit for unsupported WebGPU, model download, timeout, memory, CORS, or worker issues.

## Continue
| Repo | Continue reason | Required next action |
| --- | --- | --- |
| `bench-runtime-shootout` | lowest-risk runtime measurement entrypoint | capture real cold/warm WebGPU and fallback rows |
| `exp-embeddings-browser-throughput` | small-model browser AI workload with clear throughput metrics | capture docs/sec and query latency for WebGPU/fallback |
| `exp-stt-whisper-webgpu` | audio workload has clear latency and quality fields | capture audio sec/sec and WER/CER comparison |
| `bench-renderer-shootout` | renderer track needs comparable p50/p95 frame data | capture Chrome/Edge renderer rows first |

## Archive
No archive decision is active.

Archive requires repeated evidence of one or more conditions:
- The real path cannot load in supported browsers after documented remediation.
- WebGPU offers no measurable benefit over fallback and adds maintenance risk.
- Cold start, memory, or cache behavior blocks practical usage.
- Required quality metrics regress enough to invalidate the workload.

## Review Evidence
| Evidence source | Current status | Notes |
| --- | --- | --- |
| `docs/RUNTIME-RECOMMENDATIONS.md` | available | runtime protocol and candidate order are defined |
| `docs/BENCHMARK-SUMMARY.md` | available | summary structure is ready; real rows remain pending |
| `docs/MULTI-BROWSER-RESULTS.md` | available | browser/device matrix is ready; real rows remain pending |
| `docs/GOAL-STATUS.md` | generated | tracks whether Phase 3 report artifacts are structurally complete |
| Repository `RESULTS.md` files | pending updates | required before any Promote decision |
