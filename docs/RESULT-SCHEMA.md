# Result Schema

## Purpose
This schema defines the minimum raw JSON contract for Phase 3 measurements.
Every promoted benchmark row must be traceable to a `reports/raw/*.json` file
that follows this structure.

## Required Top-Level Fields
| Field | Type | Requirement |
| --- | --- | --- |
| `meta` | object | source repository, commit, scenario, timestamp, and capture context |
| `environment` | object | browser, OS, device, GPU/backend, cache, worker, and fallback state |
| `workload` | object | workload kind, name, input profile, and model/runtime id |
| `metrics` | object | `common` metrics plus workload-specific metric group |
| `status` | string | one of `success`, `partial`, `pending`, or `failure` |
| `artifacts` | object | screenshot/log paths, deploy URL, and optional issue/PR links |

## Required `meta` Fields
| Field | Requirement |
| --- | --- |
| `repo` | repository name, for example `bench-runtime-shootout` |
| `commit` | exact measured commit or deterministic fixture commit |
| `timestamp` | ISO-8601 timestamp |
| `owner` | expected owner, usually `ai-webgpu-lab` |
| `track` | inventory track such as `benchmark`, `ml`, `runtime`, or `graphics` |
| `scenario` | stable scenario id used by `RESULTS.md` renderers |
| `notes` | short semicolon-delimited capture notes |
| `capture_context.tool` | capture tool, for example `playwright-chromium` |
| `capture_context.browser_name` | browser name |
| `capture_context.browser_version` | browser version |
| `capture_context.captured_at` | capture timestamp |
| `capture_context.captured_by` | actor or automation id |

## Required `environment` Fields
| Field | Requirement |
| --- | --- |
| `browser.name`, `browser.version` | measured browser identity |
| `os.name`, `os.version` | OS identity |
| `device.name`, `device.class`, `device.cpu`, `device.memory_gb`, `device.power_mode` | device and power context |
| `gpu.adapter`, `gpu.required_features`, `gpu.limits` | adapter and feature context |
| `backend` | execution backend such as `webgpu`, `wasm`, `webgl`, or `mixed` |
| `fallback_triggered` | boolean fallback state |
| `worker_mode` | `main`, `worker`, `shared-worker`, `mixed`, `hybrid`, or `unknown` |
| `cache_state` | `cold`, `warm`, `fixed`, `none`, or another explicit cache label |

## Required `metrics.common` Fields
| Field | Requirement |
| --- | --- |
| `time_to_interactive_ms` | page or workload readiness latency |
| `init_ms` | initialization or setup latency |
| `success_rate` | normalized success rate from `0` to `1` |
| `peak_memory_note` | memory observation or explicit `unknown` |
| `error_type` | empty string for success or a stable failure category |

## Workload Metric Groups
| Workload | Required group | Required fields |
| --- | --- | --- |
| Runtime/LLM benchmark | `metrics.llm` | `ttft_ms`, `prefill_tok_per_sec`, `decode_tok_per_sec`, `turn_latency_ms` |
| Embeddings/reranker | `metrics.embeddings` | `docs_per_sec`, `queries_per_sec`, `p50_ms`, `p95_ms`, `recall_at_10`, `index_build_ms` |
| STT/audio | `metrics.stt` | `audio_sec_per_sec`, `first_partial_ms`, `final_latency_ms`, `wer`, `cer` |
| Renderer/graphics | `metrics.graphics` | `avg_fps`, `p95_frametime_ms`, `scene_load_ms` |

## Promotion Rule
A result can influence `docs/PROMOTE-CONTINUE-ARCHIVE.md` only when the raw JSON
passes `node scripts/validate-result-schema.mjs`, the corresponding
`RESULTS.md` row links the raw file, and browser/device compatibility is
recorded in `docs/MULTI-BROWSER-RESULTS.md`.
