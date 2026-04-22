# Organization and Repository Map

## 네이밍 규칙
- `tpl-*` : 템플릿 저장소
- `shared-*` : 공통 유틸/스키마/인프라
- `exp-*` : 개별 실험 저장소
- `bench-*` : 비교/측정 전용 저장소
- `app-*` : 통합 데모/쇼케이스
- `docs-*` : 조직 문서/보고서

## 1. 조직 공통 레이어
### `.github`
- 조직 공통 `CONTRIBUTING.md`
- 이슈 템플릿
- PR 템플릿
- 결과 보고 템플릿 (`templates/RESULTS-template.md`를 기준으로 배포)

### `tpl-webgpu-vanilla`
- Vite + TypeScript + WGSL
- raw WebGPU 또는 최소 재현 예제용

### `tpl-webgpu-react`
- React + TypeScript
- UI가 필요한 실험용

### `shared-webgpu-capability`
- 브라우저/OS/GPU capability 수집
- feature/limits 정규화

### `shared-bench-schema`
- 공통 JSON 결과 스키마
- validation 스크립트

### `shared-github-actions`
- reusable CI workflow

### `docs-lab-roadmap`
- 분기별 로드맵
- ADR
- 비교 보고서

## 2. 그래픽스 / 엔진 실험
- `exp-three-webgpu-core`
- `exp-babylon-webgpu-core`
- `exp-playcanvas-webgpu-core`
- `exp-pixi-webgpu-2d`
- `exp-luma-webgpu-viz`
- `exp-deckgl-webgpu-readiness`

## 3. 블랙홀 / 과학 시각화 / compute
- `exp-blackhole-three-singularity`
- `exp-blackhole-kerr-engine`
- `exp-blackhole-webgpu-fromscratch`
- `exp-nbody-webgpu-core`
- `exp-fluid-webgpu-core`
- `exp-three-webgpu-particles-stress`

## 4. 브라우저 ML / LLM / 음성 / 멀티모달
- `exp-embeddings-browser-throughput`
- `exp-reranker-browser`
- `exp-rag-browser-pipeline`
- `exp-ort-webgpu-baseline`
- `exp-webllm-browser-chat`
- `exp-llm-chat-runtime-shootout`
- `exp-llm-worker-ux`
- `exp-stt-whisper-webgpu`
- `exp-voice-assistant-local`
- `exp-vlm-browser-multimodal`
- `exp-diffusion-webgpu-browser`
- `exp-browser-agent-local`

## 5. 벤치마크 저장소
- `bench-runtime-shootout`
- `bench-embeddings-latency-quality`
- `bench-reranker-latency`
- `bench-rag-endtoend`
- `bench-llm-prefill-decode`
- `bench-model-load-and-cache`
- `bench-stt-streaming-latency`
- `bench-voice-roundtrip`
- `bench-worker-isolation-and-ui-jank`
- `bench-multimodal-latency`
- `bench-diffusion-browser-shootout`
- `bench-agent-step-latency`
- `bench-webgpu-vs-wasm-parity`
- `bench-blackhole-render-shootout`
- `bench-compute-stress-suite`
- `bench-atomics-and-memory`
- `bench-texture-upload-and-streaming`
- `bench-renderer-shootout`

## 6. 앱 / 쇼케이스
- `app-private-rag-lab`
- `app-local-chat-arena`
- `app-voice-agent-lab`
- `app-browser-image-lab`
- `app-blackhole-observatory`

## 초기 13개 추천 시작 세트
- `.github`
- `tpl-webgpu-vanilla`
- `tpl-webgpu-react`
- `shared-webgpu-capability`
- `shared-bench-schema`
- `docs-lab-roadmap`
- `exp-embeddings-browser-throughput`
- `exp-llm-chat-runtime-shootout`
- `exp-stt-whisper-webgpu`
- `exp-rag-browser-pipeline`
- `bench-runtime-shootout`
- `bench-model-load-and-cache`
- `bench-worker-isolation-and-ui-jank`

## 우선순위 7개 실행 세트
- `exp-embeddings-browser-throughput`
- `exp-llm-chat-runtime-shootout`
- `exp-stt-whisper-webgpu`
- `exp-rag-browser-pipeline`
- `bench-runtime-shootout`
- `bench-model-load-and-cache`
- `bench-worker-isolation-and-ui-jank`
