# Master Summary

## 목표
`ai-webgpu-lab`를 단순 샘플 모음이 아니라 아래 4개 축을 동시에 운영하는 실험 조직으로 구성한다.

1. WebGPU 그래픽스 라이브러리 비교
2. 블랙홀 / 과학 시각화 / compute stress 실험
3. 브라우저 ML / LLM / 음성 / 멀티모달 성능 실험
4. 공통 벤치마크, 통합 데모, 반복 가능한 보고 체계

## 운영 원칙
- 저장소 하나 = 질문 하나
- 실험 저장소와 벤치 저장소를 분리
- 공통 결과 포맷과 공통 KPI를 강제
- WebGPU-first, fallback-included 전략 유지
- 모든 실험은 `RESULTS.md`와 raw JSON 결과를 남김
- 분기마다 Promote / Continue / Archive 판단

## 핵심 산출물
- `.github` 조직 템플릿
- `shared-*` 공통 패키지
- `exp-*` 개별 실험 저장소
- `bench-*` 비교/측정 저장소
- `app-*` 통합 데모 저장소
- `docs-*` 조직 문서 저장소

## 가장 먼저 만들 저장소
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

## 확장 축
### Graphics / Blackhole
- `exp-three-webgpu-core`
- `exp-babylon-webgpu-core`
- `exp-playcanvas-webgpu-core`
- `exp-blackhole-three-singularity`
- `exp-blackhole-kerr-engine`
- `exp-blackhole-webgpu-fromscratch`
- `exp-nbody-webgpu-core`
- `exp-fluid-webgpu-core`
- `bench-blackhole-render-shootout`
- `bench-compute-stress-suite`
- `bench-atomics-and-memory`
- `bench-texture-upload-and-streaming`
- `app-blackhole-observatory`

### ML / LLM / Audio / Multimodal / Agent
- `exp-reranker-browser`
- `exp-llm-worker-ux`
- `exp-vlm-browser-multimodal`
- `exp-diffusion-webgpu-browser`
- `exp-browser-agent-local`
- `exp-voice-assistant-local`
- `bench-webgpu-vs-wasm-parity`
- `app-private-rag-lab`
- `app-local-chat-arena`
- `app-voice-agent-lab`
- `app-browser-image-lab`

## 한 줄 결론
이 조직은 “WebGPU 데모 조직”이 아니라 “WebGPU 그래픽스 + 과학 시각화 + 브라우저 AI + 반복 가능한 벤치마크”를 함께 운영하는 연구/실험 조직으로 설계한다.
