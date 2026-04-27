# Graphics and Blackhole Track

## 목표
그래픽스/블랙홀 트랙은 단순 렌더링 데모가 아니라 아래 3가지를 검증한다.

1. WebGPU 기반 웹 그래픽스 라이브러리의 실무 적합성
2. 블랙홀/상대론 시각화를 통한 고난도 렌더링 품질/성능 검증
3. compute-heavy workload를 통한 병렬성, memory, atomics 스트레스 테스트

## 주요 라이브러리/엔진 축
- three.js
- Babylon.js
- PlayCanvas
- PixiJS
- luma.gl
- deck.gl

## 대표 저장소
### `exp-three-webgpu-core`
질문:
- three.js는 WebGPU에서 어디까지 안정적으로 동작하는가?
- fallback 경로 포함 실무형 웹앱 기준선으로 충분한가?

핵심 항목:
- scene
- camera
- glTF
- lighting
- instancing
- perf overlay

### `exp-babylon-webgpu-core`
질문:
- Babylon.js는 기능 폭과 WebGPU 전용 기능 측면에서 어떤 강점을 가지는가?

핵심 항목:
- PBR
- animation
- compute shader
- postprocess
- inspector

### `exp-playcanvas-webgpu-core`
질문:
- editor 중심 워크플로우가 실험 조직에서 어떤 장단점을 가지는가?

핵심 항목:
- asset pipeline
- material setup
- editor/code workflow 비교

### `exp-pixi-webgpu-2d`
질문:
- 2D sprite batching workload에서 WebGPU/fallback 준비도를 어떻게 비교할 수 있는가?

핵심 항목:
- sprite count
- atlas/batch metadata
- 2D frame pacing
- fallback metadata

### `exp-luma-webgpu-viz`
질문:
- visualization layer와 attribute buffer 중심 workload에서 WebGPU 준비도를 어떻게 고정할 수 있는가?

핵심 항목:
- point/layer count
- attribute buffer metadata
- aggregation bins
- visualization frame pacing

### `exp-deckgl-webgpu-readiness`
질문:
- geospatial map layer workload에서 deck.gl WebGPU readiness를 어떻게 고정할 수 있는가?

핵심 항목:
- viewport update
- layer/tile metadata
- picking samples
- map layer frame pacing

## 블랙홀 실험군
### `exp-blackhole-three-singularity`
- three.js / TSL / WebGPU-WebGL fallback 중심
- lensing / accretion disk / postprocess / adaptive quality

### `exp-blackhole-kerr-engine`
- Rust/WASM 물리 커널 + JS/UI + WebGPU/WebGL 분리
- 과학 정확도 우선
- deterministic readiness baseline에서는 spin/inclination, ray step budget, geodesic integration timing을 먼저 고정

### `exp-blackhole-webgpu-fromscratch`
- raw WebGPU로 구현하는 최소 기준선
- 엔진 abstraction 비용/이점 분리
- deterministic readiness baseline에서는 shader/pipeline metadata, dispatch timing, ray step budget을 먼저 고정

## compute stress 실험군
### `exp-nbody-webgpu-core`
- pairwise gravity compute baseline
- deterministic readiness baseline에서는 body count, workgroup size, substep budget, energy drift/thermal metadata를 먼저 고정

### `exp-fluid-webgpu-core`
- fluid / particle / grid update / atomics-heavy workload
- deterministic readiness baseline에서는 particle count, grid resolution, pressure iterations, divergence/thermal metadata를 먼저 고정

### `exp-three-webgpu-particles-stress`
- three.js WebGPU 경로에서 particle/VFX stress
- deterministic readiness baseline에서는 particle count, emitter count, post-FX passes, overdraw ratio, thermal note를 먼저 고정
- 실제 three.js WebGPU particle material과 후처리 패스가 들어가기 전 graphics capture/result 경로를 먼저 고정

## 전용 벤치
### `bench-blackhole-render-shootout`
- 같은 블랙홀 장면을 서로 다른 경로로 비교

### `bench-renderer-shootout`
- 같은 장면 fixture를 three.js / Babylon.js / PlayCanvas / raw WebGPU-style 경로로 비교

### `app-blackhole-observatory`
- 블랙홀 preset, renderer scoreboard, observatory telemetry를 하나의 내부 쇼케이스로 묶음
- deterministic demo 단계에서는 photon ring, lensing arc, checksum, renderer selection 결과를 먼저 고정

### `bench-compute-stress-suite`
- deterministic N-body / fluid / particle compute suite 비교
- aggregate winner selection, peak load, workgroup, dispatch timing을 같은 benchmark 결과로 고정

### `bench-atomics-and-memory`
- deterministic histogram / scatter / reduction atomics benchmark 비교
- peak items, shared memory, atomic passes, conflict rate, bandwidth를 같은 benchmark 결과로 고정

### `bench-texture-upload-and-streaming`
- deterministic atlas / tile / video texture upload benchmark 비교
- sustained stream throughput, upload/background update timing, frame-drop, atlas memory를 같은 benchmark 결과로 고정

## 대표 KPI
### Graphics / Blackhole
- avg_fps
- p95_frametime_ms
- scene_load_ms
- resolution_scale
- ray_steps
- taa_enabled
- visual_artifact_note

### Compute Stress
- bodies_or_particles
- workgroup_size
- steps_per_sec
- atomics_contention_note
- thermal_note
