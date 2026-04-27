# 09 — Runtime Integration Plan

이 문서는 deterministic harness 단계에서 실제 runtime/model/renderer 통합 단계로 넘어가는 절차를 설명합니다. 모든 54개 저장소가 readiness baseline harness를 보유한 상태이므로, 다음 라운드는 한 저장소씩 실제 runtime을 붙여 같은 결과 스키마를 유지하면서 실측 값으로 교체하는 것입니다.

## 적용 대상
- LLM 계열: `bench-runtime-shootout`, `exp-llm-chat-runtime-shootout`, `exp-webllm-browser-chat`, `exp-llm-worker-ux`, `exp-ort-webgpu-baseline`, `bench-llm-prefill-decode`, `app-local-chat-arena`
- Embeddings/RAG: `exp-embeddings-browser-throughput`, `exp-rag-browser-pipeline`, `bench-embeddings-latency-quality`, `bench-rag-endtoend`
- Audio/Voice: `exp-stt-whisper-webgpu`, `exp-voice-assistant-local`, `bench-stt-streaming-latency`, `bench-voice-roundtrip`
- VLM/Diffusion: `exp-vlm-browser-multimodal`, `exp-diffusion-webgpu-browser`, `bench-multimodal-latency`, `bench-diffusion-browser-shootout`
- Browser agent: `exp-browser-agent-local`, `bench-agent-step-latency`, `app-voice-agent-lab`
- Graphics renderer: 13개 graphics/blackhole 실험과 5개 렌더러 비교 벤치
- 인프라/문서: 5개 (`.github`, `shared-webgpu-capability`, `shared-bench-schema`, `shared-github-actions`, `docs-lab-roadmap`)는 fixture drift 감지를 routine으로 운영하면 충분 — 실제 runtime 교체 대상은 아님

## 어댑터 패밀리
4가지 어댑터 패밀리가 같은 등록/조회 패턴을 공유합니다. 모두 `register/describe/list` shape를 가지고 `?mode=adapter-stub` query로 stub 동작을 노출합니다.

| Family | First repo | Required methods | Result key |
|---|---|---|---|
| Runtime (LLM/embedding/audio/multimodal/agent runtime) | `bench-runtime-shootout` | `loadRuntime`, `prefill`, `decode` | `artifacts.runtime_adapter` |
| Renderer (graphics/blackhole/compute) | `exp-three-webgpu-core` | `createRenderer`, `loadScene`, `renderFrame` | `artifacts.renderer_adapter` |
| App surface (`app-*` 5개 데모) | `app-blackhole-observatory` | `loadDataset`, `renderSurface`, `recordTelemetry` | `artifacts.app_surface_adapter` |
| Benchmark (`bench-*` 18개 비교) | `bench-renderer-shootout` | `createBenchmark`, `runProfile`, `aggregateResults` | `artifacts.benchmark_adapter` |

다른 저장소가 같은 패밀리에 합류하려면 같은 어댑터 모듈을 복사한 뒤 `index.html`에서 모듈로 로드합니다. 등록 헬퍼와 describe 동작은 동일하므로 캡처/요약 파이프라인은 변경하지 않아도 됩니다.

## 어댑터 컨트랙트
`bench-runtime-shootout`의 첫 어댑터 컨트랙트가 `repo-scaffolds/p0/bench-runtime-shootout/public/runtime-adapter.js`에 있습니다. 핵심 shape:

```js
const adapter = {
  id: "webllm-mlc-llama3.1-8b-q4f32",
  label: "WebLLM Llama 3.1 8B q4f32_1",
  version: "0.2.40",
  capabilities: ["prefill", "decode", "streaming"],
  loadType: "async",
  async loadRuntime(config) { /* warm caches, return runtime handle */ },
  async prefill(runtime, prompt) { /* return { promptTokens, prefillMs } */ },
  async decode(runtime, prefillResult, outputTokenBudget) { /* yield streaming tokens */ }
};

window.__aiWebGpuLabRuntimeRegistry.register(adapter);
```

어댑터를 보유한 저장소는 `index.html`에서 `runtime-adapter.js` 모듈을 먼저 로드한 뒤, 실제 어댑터 모듈을 import해서 `register`를 호출합니다. 어댑터가 등록되지 않으면 harness는 deterministic 경로를 그대로 유지하고 결과의 `artifacts.runtime_adapter.status`에 `not-connected` 또는 `deterministic`으로 기록합니다.

## 단계 (per repo)
1. **컨트랙트 복제**: 적용 대상 저장소의 `public/`에 `runtime-adapter.js` 또는 동등한 어댑터 등록 헬퍼를 추가합니다 (이미 완료된 경우 재사용).
2. **어댑터 구현**: 실제 라이브러리 (예: `@mlc-ai/web-llm`, `@xenova/transformers`, `onnxruntime-web`)를 dynamic import로 로드하는 어댑터 모듈을 만듭니다. 첫 단계는 모델 1개를 고정하고 cold/warm baseline을 확인합니다.
3. **결과 스키마 유지**: 어댑터 등록 후에도 `metrics.llm.*` 같은 기존 필드 이름은 그대로 둡니다. 어댑터 메타데이터는 `artifacts.runtime_adapter`에 추가합니다 (스키마 변경 불필요).
4. **scenario id 분기**: 실제 어댑터 결과는 `runtime-benchmark-real-<adapter-id>` 같은 새 scenario를 사용합니다. 기존 deterministic scenarios (`runtime-benchmark-<profile>-webgpu`)는 baseline 회귀 비교용으로 유지합니다.
5. **캡처 갱신**: `scripts/capture-p0-baseline-results.mjs`의 CAPTURE_CONFIG에 새 scenario 항목을 추가합니다. `?mode=real-<adapter-id>` 같은 query를 사용해 단일 컨텍스트에서 실제 어댑터를 강제합니다.
6. **렌더 갱신**: `scripts/render-results-summary.mjs`의 SCENARIO_LABELS와 fallbackComparisonLines에 실제/deterministic 페어 비교를 추가합니다 (예: `decode tok/s: real=12.4, deterministic=18.1, delta=-5.7`).
7. **문서 갱신**: 해당 저장소 `RESULTS.md`에 model/quantization/seed/cache 정책을 명시하고, 실측치와 deterministic baseline을 같은 표에 둡니다.

## 회귀 가드
- 같은 commit에서 `?mode=webgpu` deterministic baseline은 항상 capturable 해야 합니다. 새 어댑터가 추가돼도 기존 `01-runtime-benchmark-webgpu` 시나리오의 출력은 변하지 않아야 합니다 (현재 `tests/test-bootstrap-org-repos.sh`, `tests/test-capture-p0-baseline-results.sh`가 이를 확인).
- 어댑터 등록 실패는 `status="partial"` + `artifacts.runtime_adapter.status="not-connected"`로 기록하고, 실패 자체로 캡처 파이프라인이 깨지지는 않습니다.
- `tests/test-validate-infra-fixtures.sh`는 인프라 fixture drift만 감지하므로 어댑터 추가에는 영향이 없습니다.

## 첫 라운드 후보 (제안)
- Runtime family: `bench-runtime-shootout` — 컨트랙트가 이미 박혀 있어 가장 가까이 있습니다. 첫 실제 통합 sketch는 `repo-scaffolds/p0/bench-runtime-shootout/public/real-runtime-sketch.js`에 박혀 있음 (`?mode=real-runtime` query로 활성화, Transformers.js v3 + Phi-3-mini q4f16 기본, deterministic 경로 변경 없음).
- Runtime family: `exp-stt-whisper-webgpu` — Whisper-tiny WebGPU 가능, 결과 메트릭이 단순.
- Runtime family: `exp-embeddings-browser-throughput` — 작은 임베더(BGE-small, MiniLM) 후보.
- Renderer family: `exp-three-webgpu-core` — 컨트랙트 박힘, three.js v160+ `WebGPURenderer`로 실측 시작 가능 (CDN 또는 번들 결정 필요). 첫 실제 통합 sketch는 `repo-scaffolds/repos/exp-three-webgpu-core/public/real-renderer-sketch.js`에 박혀 있음 (`?mode=real-three` query로 활성화, 기본 deterministic 경로는 변경 없음, CDN 의존성 때문에 헤드리스 캡처 회귀 테스트는 deterministic만 검증함).
- App surface family: `app-blackhole-observatory` — 컨트랙트 박힘. 첫 실제 통합 sketch는 `repo-scaffolds/repos/app-blackhole-observatory/public/real-surface-sketch.js` (`?mode=real-surface` query, 외부 manifest URL JSON fetch 기반).
- Benchmark family: `bench-renderer-shootout` — 컨트랙트 박힘. 첫 실제 통합 sketch는 `repo-scaffolds/repos/bench-renderer-shootout/public/real-benchmark-sketch.js` (`?mode=real-benchmark` query, benchmark.js v2.1.4 CDN 기반). renderer family 어댑터와 묶으면 실제 three.js/Babylon/PlayCanvas/raw WebGPU 4-way shootout으로 확장 가능.

세 패밀리 모두 동시에 진행하기보다, 각 패밀리에서 한 저장소를 끝까지 실측까지 가져가서 패턴을 굳힌 다음 나머지를 복제하는 게 안전합니다.

## 첫 실제 통합 사례: exp-three-webgpu-core
2026-04-26 기준 `exp-three-webgpu-core`에 첫 실제 통합 sketch가 박혔습니다. 다른 저장소가 같은 패턴을 따라할 수 있도록 핵심 결정사항을 기록합니다.

### Module layout
- `public/renderer-adapter.js` — registry (변경 없음, deterministic mock 기본)
- `public/real-renderer-sketch.js` — 신규. `loadThreeFromCdn`/`buildRealRendererAdapter`/`connectRealRenderer`를 export
- `public/index.html` — `<script type="module" src="./real-renderer-sketch.js">` 추가. 모듈은 항상 로드되지만, 자동 등록은 `?mode=real-three` query가 있을 때만 작동

### CDN 정책
- `https://esm.sh/three@0.160.0` + `https://esm.sh/three@0.160.0/examples/jsm/renderers/webgpu/WebGPURenderer.js`
- `loadThreeFromCdn({ version })` 인자로 다른 버전 또는 다른 CDN을 시험할 수 있음
- 테스트가 stub loader를 주입할 수 있도록 `connectRealRenderer({ loader })`가 옵션 인자를 받음

### Capture 회귀 가드
- 헤드리스 Chromium 캡처는 default mode만 실행 (network 변동성 차단)
- `tests/test-real-renderer-sketch.sh`는 stub three import로 sketch가 컴파일/등록 가능한지 오프라인으로 검증
- 실제 CDN이 작동하는지 확인하려면 개발자 머신에서 `?mode=real-three` query로 수동 실행

### 다른 패밀리 복제 시 체크리스트
1. 같은 위치에 `real-<family>-sketch.js` 추가 (예: runtime → `real-runtime-sketch.js`)
2. 외부 라이브러리는 dynamic import로 격리, loader 인자로 stub 주입 가능하게
3. window.location 자동 감지 + opt-in query 게이팅
4. 회귀 테스트는 stub loader로만 검증 (네트워크 의존성 차단)
5. 통합 plan 문서에 CDN/version/capture caveat을 명시

## 두 번째 실제 통합 사례: bench-runtime-shootout
2026-04-26 기준 runtime 패밀리에도 같은 패턴이 박혔습니다.

### Module layout
- `public/runtime-adapter.js` — registry (변경 없음)
- `public/real-runtime-sketch.js` — 신규. `loadPipelineFromCdn`/`buildRealRuntimeAdapter`/`connectRealRuntime` export
- `public/index.html` — `<script type="module" src="./real-runtime-sketch.js">` 추가, `?mode=real-runtime` query에서만 자동 등록

### CDN 정책
- `https://esm.sh/@huggingface/transformers@3.0.0` (구 `@xenova/transformers`)
- 기본 model: `Xenova/Phi-3-mini-4k-instruct-q4f16` (small enough for browser WebGPU)
- `connectRealRuntime({ loader, version, modelId, task })`로 다른 모델/태스크 시험 가능
- `env.allowRemoteModels = true`로 HuggingFace 모델 hub fetch 허용

### Capture 회귀 가드
- 헤드리스 Chromium 캡처는 default mode만 실행 (모델 다운로드 비용 차단)
- `tests/test-real-runtime-sketch.sh`는 stub pipeline + stub env 주입으로 sketch가 컴파일/등록/prefill/decode 가능한지 오프라인으로 검증
- 실제 모델로 측정하려면 개발자 머신에서 `?mode=real-runtime` query로 수동 실행 후 cold/warm cache pair 직접 캡처

## 세 번째 실제 통합 사례: app-blackhole-observatory
2026-04-26 기준 app-surface 패밀리에도 같은 패턴이 박혔습니다.

### Module layout
- `public/app-surface-adapter.js` — registry (변경 없음)
- `public/real-surface-sketch.js` — 신규. `loadDatasetManifest`/`buildRealSurfaceAdapter`/`connectRealSurface` export
- `public/index.html` — `<script type="module" src="./real-surface-sketch.js">` 추가

### Manifest 정책
- 기본 URL: `https://ai-webgpu-lab.github.io/app-blackhole-observatory/manifests/observatory-v1.json`
- `connectRealSurface({ url, telemetrySink })`로 다른 manifest URL을 시험 가능
- `loadDatasetManifest({ url, fetchImpl })`이 fetch 인자를 받아 테스트가 stub fetch를 주입할 수 있음

### Capture 회귀 가드
- `tests/test-real-surface-sketch.sh`는 stub manifest + stub fetch + telemetry sink로 loadDataset/renderSurface/recordTelemetry 동작과 잘못된 preset/registry 거부를 오프라인으로 검증
- 실제 manifest fetch 검증은 manifest URL이 실제로 배포된 후 `?mode=real-surface` query로 수동 실행

## 네 번째 실제 통합 사례: bench-renderer-shootout
2026-04-26 기준 benchmark 패밀리에도 같은 패턴이 박혔습니다.

### Module layout
- `public/benchmark-adapter.js` — registry (변경 없음)
- `public/real-benchmark-sketch.js` — 신규. `loadBenchmarkFromCdn`/`buildRealBenchmarkAdapter`/`connectRealBenchmark` export
- `public/index.html` — `<script type="module" src="./real-benchmark-sketch.js">` 추가

### CDN 정책
- `https://esm.sh/benchmark@2.1.4`
- 기본 suite id: `renderer-shootout`
- `connectRealBenchmark({ version, suiteId, loader })`로 다른 suite/version 시험 가능

### Capture 회귀 가드
- `tests/test-real-benchmark-sketch.sh`는 stub Benchmark.Suite 주입으로 createBenchmark/runProfile/aggregateResults 동작과 잘못된 호출 순서/missing fn을 오프라인으로 검증
- 실제 benchmark.js로 측정하려면 `?mode=real-benchmark` query로 수동 실행

## Canonical sketch 정중앙화
2026-04-27 기준 4 패밀리의 첫 번째 사례를 `repo-scaffolds/shared/real-sketches/`에 canonical로 정중앙화했습니다.

| Family | Canonical | First-mover repo |
|---|---|---|
| Runtime | `repo-scaffolds/shared/real-sketches/runtime.js` | `bench-runtime-shootout` (Transformers.js Phi-3-mini) |
| Renderer | `repo-scaffolds/shared/real-sketches/renderer.js` | `exp-three-webgpu-core` (three.js WebGPURenderer) |
| App surface | `repo-scaffolds/shared/real-sketches/app-surface.js` | `app-blackhole-observatory` (manifest fetch) |
| Benchmark | `repo-scaffolds/shared/real-sketches/benchmark.js` | `bench-renderer-shootout` (benchmark.js) |

`scripts/bootstrap-org-repos.sh`의 `attach_family_real_sketches()`가 family-mapped repo의 `public/`에 적절한 canonical sketch를 자동 복사합니다. 단, repo가 이미 specific sketch를 가지고 있으면(예: `exp-babylon-webgpu-core`의 Babylon 사용 sketch) 덮어쓰지 않습니다.

이 결과로 47개 family-mapped repo가 모두 적어도 하나의 `real-*-sketch.js`를 보유하며, `tests/test-real-sketch-family-coverage.sh`가 65개 sketch 파일이 인벤토리 전체에 분포함을 확인합니다.

특수 케이스:
- 9개 repo는 자기 specific sketch (three/babylon/playcanvas/whisper/embeddings/diffusion/observatory/benchmark.js/transformers의 9가지 변형) 보유 — 이 파일들은 canonical 복사 단계에서 보호됨
- 38개 repo는 canonical 시작점 보유 — 이후 specific sketch가 만들어지면 같은 파일명으로 PR 1번에 교체

## 4 패밀리 모두 정렬됨
- Runtime → `bench-runtime-shootout` (Transformers.js Phi-3-mini), 두 번째 `exp-stt-whisper-webgpu` (Whisper-tiny)
- Renderer → `exp-three-webgpu-core` (three.js WebGPURenderer), 두 번째 `exp-babylon-webgpu-core` (Babylon.js WebGPUEngine)
- App surface → `app-blackhole-observatory` (manifest fetch)
- Benchmark → `bench-renderer-shootout` (benchmark.js)
이 6개 sketch는 같은 register/describe 컨트랙트 위에 같은 stub-injection 테스트 패턴을 사용하므로, 다른 저장소가 같은 패밀리에 합류할 때는 sketch 파일 한 개와 테스트 한 개만 추가하면 됩니다.

## 다섯 번째 사례: exp-babylon-webgpu-core (Renderer 패밀리 두 번째)
- `loadBabylonFromCdn({ version })` → `https://esm.sh/@babylonjs/core@6.49.0`
- `buildRealBabylonAdapter({ babylon, WebGPUEngine, version })` → `babylon-webgpu-<version>` id, ArcRotateCamera + 24개 sphere submesh, scene.render() 단일 프레임 측정
- `?mode=real-babylon` query에서만 자동 등록
- `tests/test-real-babylon-sketch.sh` — stub babylon module 주입 검증

## 여섯 번째 사례: exp-stt-whisper-webgpu (Runtime 패밀리 두 번째)
- `loadWhisperFromCdn({ version })` → `https://esm.sh/@huggingface/transformers@3.0.0`
- `buildRealWhisperAdapter({ pipeline, env, version, modelId })` → `whisper-<model>-<version>` id, automatic-speech-recognition 파이프라인, 30s chunk + WER 측정 가능 shape
- `?mode=real-whisper` query에서만 자동 등록
- `tests/test-real-whisper-sketch.sh` — stub pipeline + audio Float32Array 주입 검증

## Cross-sketch 회귀 가드
- `tests/test-real-sketch-conformance.sh` — `repo-scaffolds/` 아래 모든 `real-*-sketch.js`를 자동 스캔, 각 sketch가 `connect*`/`build*`/`load*` 3개 export를 보유하는지 검증. 신규 sketch가 컨벤션에서 벗어나면 즉시 fail.

## 일곱 번째 사례: exp-playcanvas-webgpu-core (Renderer 패밀리 세 번째)
- `loadPlayCanvasFromCdn({ version })` → `https://esm.sh/playcanvas@2.2.0`
- `buildRealPlayCanvasAdapter({ playcanvas, Application, version })` → `playcanvas-webgpu-<version>` id, ArcRotate 비슷한 카메라 + 24개 sphere entity, app.render() 단일 프레임
- `?mode=real-playcanvas` query에서만 자동 등록
- `tests/test-real-playcanvas-sketch.sh` — stub Application/Entity/Color 주입 검증

## 여덟 번째 사례: exp-embeddings-browser-throughput (Runtime 패밀리 세 번째)
- `loadEmbedderFromCdn({ version })` → `https://esm.sh/@huggingface/transformers@3.0.0`
- `buildRealEmbeddingAdapter({ pipeline, env, version, modelId })` → `embeddings-<model>-<version>` id, feature-extraction + Xenova/bge-small-en-v1.5, mean pooling + normalize
- `?mode=real-embeddings` query에서만 자동 등록
- `tests/test-real-embeddings-sketch.sh` — stub vector ({ dims: [1, 384] }) 주입, dimensions 검증

## 일곱 번째: exp-pixi-webgpu-2d (Renderer 패밀리 네 번째)
- `loadPixiFromCdn({ version })` → `https://esm.sh/pixi.js@8.3.4`
- `buildRealPixiAdapter`: `pixi-webgpu-<version>` id, Pixi `Application` + 24 graphics circles, `app.render()` 단일 프레임
- `?mode=real-pixi` query, 테스트 `tests/test-real-pixi-sketch.sh`

## 여덟 번째: exp-luma-webgpu-viz (Renderer 패밀리 다섯 번째)
- `loadLumaFromCdn({ version })` → `@luma.gl/engine@9.0.0` + `@luma.gl/webgpu@9.0.0`
- `buildRealLumaAdapter`: `luma-webgpu-<version>` id, `luma.createDevice` WebGPU device + 256 point layer payload
- `?mode=real-luma` query, 테스트 `tests/test-real-luma-sketch.sh`

## 아홉 번째: exp-deckgl-webgpu-readiness (Renderer 패밀리 여섯 번째)
- `loadDeckFromCdn({ version })` → `@deck.gl/core@9.0.0` + `@deck.gl/layers@9.0.0`
- `buildRealDeckAdapter`: `deckgl-webgpu-<version>` id, `Deck` + `ScatterplotLayer` 64 point fixture, `deck.redraw(true)`
- `?mode=real-deckgl` query, 테스트 `tests/test-real-deckgl-sketch.sh`

## 열 번째: exp-nbody-webgpu-core (Renderer 패밀리 일곱 번째 / raw WebGPU compute)
- 외부 CDN 의존성 없음. `loadWebGpuFromBrowser({ navigatorGpu })`이 `navigator.gpu.requestAdapter().requestDevice()`를 호출하고 GPUDevice 반환
- `buildRealNbodyAdapter`: `nbody-rawgpu-<version>` id, WGSL N-body compute pipeline, 1024 body 기본, 64 workgroup size
- `?mode=real-nbody` query, 테스트 `tests/test-real-nbody-sketch.sh`

## 열한 번째: exp-fluid-webgpu-core (Renderer 패밀리 여덟 번째 / raw WebGPU compute)
- 같은 raw WebGPU 패턴, fluid simulation WGSL kernel (gravity + bounds reflection)
- `buildRealFluidAdapter`: `fluid-rawgpu-<version>` id, 2048 particle 기본
- `?mode=real-fluid` query, 테스트 `tests/test-real-fluid-sketch.sh`

## 열두 번째: exp-three-webgpu-particles-stress (Renderer 패밀리 아홉 번째 / three.js InstancedMesh)
- three.js v160 WebGPURenderer + IcosahedronGeometry InstancedMesh 32768 인스턴스
- `buildRealParticlesAdapter`: `particles-stress-three-<version>` id, 비행 궤적 위에 분포된 인스턴스 행렬
- `?mode=real-particles` query, 테스트 `tests/test-real-particles-sketch.sh`

## 열세 번째: exp-blackhole-three-singularity (Renderer 패밀리 열 번째 / three.js ShaderMaterial)
- three.js v160 WebGPURenderer + PlaneGeometry fullscreen + ShaderMaterial (블랙홀 디스크 + emission halo GLSL)
- `buildRealBlackholeThreeAdapter`: `blackhole-three-<version>` id, ray step budget 96 기본, time uniform 갱신
- `?mode=real-blackhole-three` query, 테스트 `tests/test-real-blackhole-three-sketch.sh`

## 열네 번째: exp-blackhole-kerr-engine (Renderer 패밀리 열한 번째 / raw WebGPU Kerr compute)
- 외부 CDN 의존성 없음. WGSL Kerr geodesic compute pipeline + uniform params (spin, inclination, step-size, step-count)
- `buildRealKerrAdapter`: `kerr-rawgpu-<version>` id, 4096 geodesic 기본, 24 step micro-integration per dispatch
- `?mode=real-kerr` query, 테스트 `tests/test-real-kerr-sketch.sh`

## 열다섯 번째: exp-blackhole-webgpu-fromscratch (Renderer 패밀리 열두 번째 / raw WebGPU render pipeline)
- 외부 CDN 의존성 없음. WGSL vertex (fullscreen quad) + fragment (SDF blackhole + ray steps)
- `buildRealBlackholeRawAdapter`: `blackhole-rawgpu-<version>` id, ray step budget 96, frame uniform (resolution + time + ray steps)
- `?mode=real-bhraw` query, 테스트 `tests/test-real-bhraw-sketch.sh`

## Renderer 패밀리 100% specific 도달
2026-04-27 기준 12개 renderer-family repo 전부가 specific real-renderer-sketch.js를 보유합니다 (three / Babylon / PlayCanvas / Pixi / luma.gl / deck.gl / nbody compute / fluid compute / particles InstancedMesh / blackhole-three shader / Kerr compute / raw blackhole pipeline). canonical fallback이 더는 graphics 영역에 적용되지 않습니다.

## App surface 패밀리 100% specific 도달
2026-04-27 기준 5개 app-surface 패밀리 repo 전부가 specific real-surface-sketch.js를 보유합니다.

| Repo | Adapter id 접두 | Manifest 키 | 테스트 |
|---|---|---|---|
| `app-blackhole-observatory` | `observatory-` | `presets[]` | `test-real-surface-sketch.sh` |
| `app-private-rag-lab` | `private-rag-` | `collections[]` | `test-real-private-rag-sketch.sh` |
| `app-local-chat-arena` | `chat-arena-` | `matchups[]` | `test-real-chat-arena-sketch.sh` |
| `app-voice-agent-lab` | `voice-agent-` | `tasks[]` | `test-real-voice-agent-sketch.sh` |
| `app-browser-image-lab` | `image-lab-` | `prompts[]` | `test-real-image-lab-sketch.sh` |

5개 모두 동일한 manifest fetch + dataset/render/telemetry shape을 사용하며 `?mode=real-<scope>` query로 게이트됩니다. canonical app-surface fallback이 더는 적용되지 않습니다.

## 열여섯 번째: exp-vlm-browser-multimodal (Runtime 패밀리 다섯 번째)
- Transformers.js v3 + Xenova/SmolVLM-Instruct, image-text-to-text task
- `buildRealVlmAdapter`: `vlm-<model>-<version>` id, prefill가 image+question 분리, decode는 generated_text 반환
- `?mode=real-vlm` query, 테스트 `tests/test-real-vlm-sketch.sh`

## 열일곱 번째: exp-browser-agent-local (Runtime 패밀리 여섯 번째)
- Transformers.js v3 + Phi-3-mini, text-generation task에 task/tools planner 프롬프트
- `buildRealBrowserAgentAdapter`: `browser-agent-<model>-<version>` id, decode가 step count(개행 기준) 추출
- `?mode=real-browser-agent` query, 테스트 `tests/test-real-browser-agent-sketch.sh`

## 열여덟 번째: exp-reranker-browser (Runtime 패밀리 일곱 번째)
- Transformers.js v3 + Xenova/bge-reranker-base, text-classification task
- `buildRealRerankerAdapter`: `reranker-<model>-<version>` id, candidates 배열을 score-sorted 후 top-K 반환
- `?mode=real-reranker` query, 테스트 `tests/test-real-reranker-sketch.sh`

## 열아홉 번째: exp-rag-browser-pipeline (Runtime 패밀리 여덟 번째 / 듀얼 파이프라인)
- 두 파이프라인 동시 사용: feature-extraction (BGE-small) + text-generation (Phi-3-mini)
- `buildRealRagAdapter`: `rag-<embedder>-<generator>-<version>` id, decode가 retrieve(쿼리/문서 임베딩 → cosine) + answer(top-3 컨텍스트 + 질문) 두 단계
- `?mode=real-rag` query, 테스트 `tests/test-real-rag-sketch.sh` (stub embedder + stub generator + 호출 횟수 검증)

## 스무 번째: exp-diffusion-webgpu-browser (Runtime 패밀리 아홉 번째)
- `loadDiffuserFromCdn({ version })` → `https://esm.sh/@huggingface/transformers@3.0.0`
- `buildRealDiffusionAdapter({ pipeline, env, version, modelId, task })` → `diffusion-<model>-<version>` id, text-to-image + Xenova/sd-turbo, 256x256 해상도 4 스텝 기본
- `?mode=real-diffusion` query에서만 자동 등록
- `tests/test-real-diffusion-sketch.sh` — stub image ({ width: 256, height: 256 }) 주입, dimensions 검증

## 스물한 번째: exp-ort-webgpu-baseline (Runtime 패밀리 열 번째 / ONNX Runtime Web)
- `loadOrtFromCdn` → `https://esm.sh/onnxruntime-web@1.20.0`
- `buildRealOrtAdapter`: `ort-webgpu-<slug>-<version>` id, `InferenceSession.create` + executionProviders=`["webgpu"]` 기본, decode가 `session.run(inputs)` 결과의 outputCount/dimensions 추출
- `?mode=real-ort` query, 테스트 `tests/test-real-ort-sketch.sh` (stub session.run 주입)

## 스물두 번째: exp-webllm-browser-chat (Runtime 패밀리 열한 번째 / WebLLM)
- `loadWebLLMFromCdn` → `https://esm.sh/@mlc-ai/web-llm@0.2.78`
- `buildRealWebLLMAdapter`: `webllm-<model>-<version>` id, `CreateMLCEngine(modelId)` + `chat.completions.create` 사용
- `?mode=real-webllm` query, 테스트 `tests/test-real-webllm-sketch.sh` (stub engine.chat.completions.create 주입)

## 스물세 번째: exp-llm-worker-ux (Runtime 패밀리 열두 번째 / Worker vs Main 비교)
- Transformers.js v3 + Phi-3, mode=`main|worker` 분기
- `buildRealWorkerUxAdapter`: `worker-ux-<mode>-<model>-<version>` id. main이면 pipeline 직접 호출, worker이면 `workerFactory({ modelId, device, dtype, version })`로 worker 생성 후 `worker.run({ prompt, maxNewTokens })`
- `?mode=real-worker-ux&workerMode=worker` query (main 기본), 테스트 `tests/test-real-worker-ux-sketch.sh` (main + worker 둘 다 검증, bad mode/missing factory rejection)

## 스물네 번째: exp-voice-assistant-local (Runtime 패밀리 열세 번째 / 듀얼 STT+Reply)
- 두 파이프라인: automatic-speech-recognition (Whisper-tiny) + text-generation (Phi-3-mini)
- `buildRealVoiceAssistantAdapter`: `voice-assistant-<stt>-<reply>-<version>` id, decode가 STT(`audio` 입력) → reply(intent 프롬프트) 두 단계 측정
- `?mode=real-voice-assistant` query, 테스트 `tests/test-real-voice-assistant-sketch.sh` (stub stt+reply, 호출 횟수 + transcript/text 검증)

## Runtime 패밀리 100% specific 도달
2026-04-27 기준 12개 runtime-family repo 전부가 specific real-runtime-sketch.js를 보유합니다.

| Repo | Adapter id 접두 | Library/패턴 | 테스트 |
|---|---|---|---|
| `bench-runtime-shootout` | `transformers-` | Transformers.js Phi-3 | `test-real-runtime-sketch.sh` |
| `exp-stt-whisper-webgpu` | `whisper-` | Transformers.js Whisper-tiny | `test-real-whisper-sketch.sh` |
| `exp-embeddings-browser-throughput` | `embeddings-` | Transformers.js BGE-small | `test-real-embeddings-sketch.sh` |
| `exp-diffusion-webgpu-browser` | `diffusion-` | Transformers.js sd-turbo | `test-real-diffusion-sketch.sh` |
| `exp-vlm-browser-multimodal` | `vlm-` | Transformers.js SmolVLM | `test-real-vlm-sketch.sh` |
| `exp-browser-agent-local` | `browser-agent-` | Transformers.js Phi-3 + tools | `test-real-browser-agent-sketch.sh` |
| `exp-reranker-browser` | `reranker-` | Transformers.js bge-reranker | `test-real-reranker-sketch.sh` |
| `exp-rag-browser-pipeline` | `rag-` | Dual pipeline (BGE + Phi-3) | `test-real-rag-sketch.sh` |
| `exp-ort-webgpu-baseline` | `ort-webgpu-` | onnxruntime-web | `test-real-ort-sketch.sh` |
| `exp-webllm-browser-chat` | `webllm-` | @mlc-ai/web-llm | `test-real-webllm-sketch.sh` |
| `exp-llm-worker-ux` | `worker-ux-` | Transformers.js worker vs main | `test-real-worker-ux-sketch.sh` |
| `exp-voice-assistant-local` | `voice-assistant-` | Whisper + Phi-3 dual | `test-real-voice-assistant-sketch.sh` |

canonical runtime fallback이 더는 적용되지 않습니다. 4 family 중 3 family (Renderer / App-surface / Runtime)가 100% specific 도달, 남은 영역은 Benchmark family.

## 스물다섯~스물아홉 번째: Benchmark 패밀리 specific 5개 (Transformers.js + benchmark.js)
2026-04-27 기준 benchmark family에 5개 specific sketch가 추가되어 6/18 specific 도달.

| Repo | Adapter id 접두 | 패턴 | 테스트 |
|---|---|---|---|
| `bench-llm-prefill-decode` | `bench-llm-` | benchmark.js + Transformers.js text-generation | `test-real-llm-bench-sketch.sh` |
| `bench-embeddings-latency-quality` | `bench-embeddings-` | benchmark.js + feature-extraction (mean pool, normalize) | `test-real-embeddings-bench-sketch.sh` |
| `bench-reranker-latency` | `bench-reranker-` | benchmark.js + text-classification, candidates per sec | `test-real-reranker-bench-sketch.sh` |
| `bench-rag-endtoend` | `bench-rag-` | benchmark.js + dual pipeline (embedder + generator), retrieve+answer split timing | `test-real-rag-bench-sketch.sh` |
| `bench-stt-streaming-latency` | `bench-stt-` | benchmark.js + automatic-speech-recognition, audio sec / RT factor | `test-real-stt-bench-sketch.sh` |

각 sketch는 createBenchmark/runProfile/aggregateResults shape를 충실히 따르며, runtime 캐싱(`runtimeCache`)으로 동일 modelId 재호출 시 모델 재로드를 피합니다. winner는 throughput 메트릭(decode tok/s, embeddings/s, candidates/s, total elapsed, RT factor)으로 선택됩니다.

남은 benchmark family canonical: 12개 (model-load-and-cache, worker-isolation, voice-roundtrip, multimodal-latency, diffusion-shootout, agent-step-latency, webgpu-vs-wasm-parity, blackhole-render-shootout, compute-stress-suite, atomics-and-memory, texture-upload-and-streaming, runtime-shootout 추가 사례 등). 다음 라운드에서 점진적으로 specific 사례로 교체.

## 서른~서른세 번째: Benchmark family specific 4개 추가 (multimodal/diffusion/agent/voice)
2026-04-27 기준 benchmark family에 4개 specific sketch가 추가되어 10/18 specific 도달.

| Repo | Adapter id 접두 | 패턴 | 테스트 |
|---|---|---|---|
| `bench-multimodal-latency` | `bench-multimodal-` | benchmark.js + image-text-to-text, answer total ms 기준 winner | `test-real-multimodal-bench-sketch.sh` |
| `bench-diffusion-browser-shootout` | `bench-diffusion-` | benchmark.js + text-to-image, steps/sec 기준 winner | `test-real-diffusion-bench-sketch.sh` |
| `bench-agent-step-latency` | `bench-agent-` | benchmark.js + text-generation + tools, avg step latency 기준 winner | `test-real-agent-bench-sketch.sh` |
| `bench-voice-roundtrip` | `bench-voice-` | benchmark.js + dual ASR+reply, roundtripMs 기준 winner | `test-real-voice-bench-sketch.sh` |

Benchmark family 진행률: **10/18 = 56% specific**, 남은 8개 (model-load-and-cache, worker-isolation-and-ui-jank, webgpu-vs-wasm-parity, blackhole-render-shootout, compute-stress-suite, atomics-and-memory, texture-upload-and-streaming, runtime-shootout 추가 사례).

## 서른넷~서른일곱 번째: Benchmark family specific 4개 추가 (raw WebGPU + benchmark.js)
2026-04-27 기준 graphics/compute 계열 4개가 raw WebGPU 패턴으로 specific 도달. benchmark family 14/18.

| Repo | Adapter id 접두 | 패턴 | 테스트 |
|---|---|---|---|
| `bench-blackhole-render-shootout` | `bench-blackhole-` | benchmark.js + raw WebGPU geodesic compute pipeline (4096 geodesic × 96 step), dispatch/sec 기준 winner | `test-real-blackhole-bench-sketch.sh` |
| `bench-compute-stress-suite` | `bench-compute-` | benchmark.js + N-body / fluid 두 WGSL kernel을 pipelineCache로 비교, steps/sec 기준 winner | `test-real-compute-bench-sketch.sh` |
| `bench-atomics-and-memory` | `bench-atomics-` | benchmark.js + atomicAdd histogram WGSL, 4-byte 샘플 → memoryBandwidthGbps + atomicsPerSec | `test-real-atomics-bench-sketch.sh` |
| `bench-texture-upload-and-streaming` | `bench-texture-` | benchmark.js + `device.queue.writeTexture` 반복 업로드, sustained MB/s + uploadFrameMs | `test-real-texture-bench-sketch.sh` |

raw WebGPU 패턴은 외부 CDN 의존성을 benchmark.js만 남기고 navigator.gpu를 직접 사용합니다. 같은 GPUDevice를 공유하므로 동일 pipeline을 재사용하는 caching이 자연스럽습니다.

Benchmark family 진행률: **14/18 = 78% specific**, 남은 4개 (model-load-and-cache, worker-isolation-and-ui-jank, webgpu-vs-wasm-parity, runtime-shootout-extra).

## 서른여덟~마흔한 번째: Benchmark family 마무리 4개

| Repo | Adapter id 접두 | 패턴 | 테스트 |
|---|---|---|---|
| `bench-model-load-and-cache` | `bench-model-cache-` | benchmark.js + Cache Storage `caches.delete` 후 cold/warm pipeline 로드, `coldWarmSpeedup` 집계 | `test-real-model-cache-bench-sketch.sh` |
| `bench-worker-isolation-and-ui-jank` | `bench-worker-` | benchmark.js + main 스레드 burn 또는 `workerFactory({burnMs}).run()`, requestAnimationFrame 샘플로 median/p95 frame ms 측정 | `test-real-worker-bench-sketch.sh` |
| `bench-webgpu-vs-wasm-parity` | `bench-parity-` | benchmark.js + WGSL vector add compute pipeline + JS reference, max abs/rel error + passRate 집계 | `test-real-parity-bench-sketch.sh` |
| `bench-runtime-shootout` (`real-benchmark-sketch.js`) | `bench-runtime-shootout-` | benchmark.js + multi-runtime factory (`transformersjs`/`webllm`/`ort`), decode tok/s 정렬, 동일 repo의 `real-runtime-sketch.js`(단일 runtime adapter)와 별도 동작 | `test-real-runtime-shootout-bench-sketch.sh` |

## Benchmark 패밀리 100% specific 도달 → 4 family 모두 100% specific

2026-04-27 기준 18개 benchmark family repo 전부가 specific real-benchmark-sketch.js를 보유합니다.

| Family | Specific count | Specific 비율 |
|---|---|---|
| Renderer | 12/12 | 100% |
| Runtime | 12/12 | 100% |
| App-surface | 5/5 | 100% |
| Benchmark | 18/18 | 100% |

**4 family 모두 specific real-*-sketch.js 보유.** canonical fallback이 더는 적용되지 않습니다 (`repo-scaffolds/shared/real-sketches/*.js`는 여전히 보존되어 있어, 새 repo가 추가될 때 자동 attach 되는 시작점 역할만 유지).

## 운영 routine과의 관계
- `scripts/capture-all-baselines.sh`는 어댑터 추가 후에도 그대로 동작합니다 — 새 scenario는 자동으로 잡히지 않으므로 캡처 config 갱신이 필요합니다.
- `scripts/validate-infra-fixtures.mjs`는 격주 단위로 돌리면 fixture drift를 잡아 인프라 baseline의 정확성을 유지합니다.
- 어댑터별 회귀 비교(real vs deterministic)는 `bench-webgpu-vs-wasm-parity` 패턴을 그대로 차용해 같은 fallback comparison 섹션에서 처리합니다.
