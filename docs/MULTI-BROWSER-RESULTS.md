# Multi-Browser Results

## Purpose
This document tracks browser and device coverage for Phase 3 measurements. It is
intended to keep compatibility status explicit while real WebGPU, fallback, and
device-specific measurements are still being collected.

## Browser Matrix
| Browser | WebGPU path | Fallback path | Current status | Required next run |
| --- | --- | --- | --- | --- |
| Chrome stable | expected on supported desktop GPUs | required | pending real measurement | runtime cold/warm pair |
| Edge stable | expected on supported desktop GPUs | required | pending real measurement | runtime cold/warm pair |
| Firefox Nightly | availability depends on platform flags | required | pending compatibility check | adapter capability probe |
| Safari Technology Preview | availability depends on platform/device | required | pending compatibility check | renderer and runtime smoke run |

## Device Matrix
| Device class | Representative target | Power state | Current status | Required evidence |
| --- | --- | --- | --- | --- |
| Desktop dGPU | Windows or Linux desktop | plugged in | pending | adapter name, backend, p50/p95 metrics |
| Laptop iGPU | Windows/macOS laptop | plugged in and battery noted | pending | thermal/power note and fallback comparison |
| Apple Silicon | macOS laptop or desktop | plugged in | pending | Safari/Chrome compatibility rows |
| Low-memory device | 8 GB class machine | plugged in | pending | model-load failure and cache behavior notes |

## Compatibility Notes
- Every measured row must include browser version, OS version, GPU adapter name,
  WebGPU availability, fallback activation status, and whether the run used a
  worker.
- A browser is considered compatible only when the page loads, the intended
  real adapter/sketch path executes, and the raw result JSON includes the
  expected scenario id.
- Unsupported WebGPU is not a failure when the fallback path completes and the
  report records the reason for fallback.
- Browser-specific failures must be copied into the relevant benchmark or
  experiment `RESULTS.md` file before promotion decisions are made.

## Repro Steps
1. Open the target GitHub Pages demo with the required `?mode=real-*` query.
2. Record browser version, OS/device, GPU adapter, and power state.
3. Run cold and warm scenarios separately when model or asset cache behavior is relevant.
4. Save raw JSON under the measured repository's `reports/raw/` directory.
5. Update this document, the repository `RESULTS.md`, and `docs/BENCHMARK-SUMMARY.md`.

## Result Links
| Result set | Link or path | Status |
| --- | --- | --- |
| Runtime cold/warm browser matrix | pending `bench-runtime-shootout/reports/raw/*.json` | pending |
| Embeddings browser matrix | pending `exp-embeddings-browser-throughput/reports/raw/*.json` | pending |
| STT browser matrix | pending `exp-stt-whisper-webgpu/reports/raw/*.json` | pending |
| Renderer browser matrix | pending `bench-renderer-shootout/reports/raw/*.json` | pending |
