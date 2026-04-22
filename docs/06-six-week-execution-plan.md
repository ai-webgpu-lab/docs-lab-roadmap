# Six Week Execution Plan

## 목표
6주 안에 브라우저 AI/WebGPU 실험군의 기준선과 비교 가능성을 확보한다.

## 대상 저장소
주간 실행 추적 대상은 아래 7개 워크로드 저장소다.

- `exp-embeddings-browser-throughput`
- `exp-llm-chat-runtime-shootout`
- `exp-stt-whisper-webgpu`
- `exp-rag-browser-pipeline`
- `bench-runtime-shootout`
- `bench-model-load-and-cache`
- `bench-worker-isolation-and-ui-jank`

## 선행 P0 기반 저장소
아래 5개 저장소는 주간 워크로드 목록에는 넣지 않지만, 6주 실행의 선행 조건으로 먼저 정렬한다.

- `tpl-webgpu-vanilla`
- `tpl-webgpu-react`
- `shared-webgpu-capability`
- `shared-bench-schema`
- `docs-lab-roadmap`

## Week 1 — 인프라와 기준선
- 7개 저장소 생성
- README / RESULTS / schema 반영
- 최소 실행 상태 확보
- 첫 raw JSON 생성

## Week 2 — Embeddings + LLM
- 임베딩 2모델 비교
- WebLLM + Transformers.js 최소 채팅
- cold/warm cache 기준선

## Week 3 — STT + Worker UX
- file transcription
- mic streaming 초안
- main thread vs worker 비교
- input delay / frame drop 측정

## Week 4 — RAG end-to-end
- PDF ingest
- chunking / embeddings / retrieve / answer
- citations UI 최소 버전
- 캐시 재방문 측정

## Week 5 — Runtime Shootout
- embeddings / local chat / STT / optional RAG 비교
- 런타임별 추천안 초안
- 실패 케이스 기록

## Week 6 — 보고와 데모 승격
- app-local-chat-arena 초안
- app-private-rag-lab 초안
- benchmark summary v1
- Promote / Continue / Kill 판단

## 6주 종료 조건
- 최소 3개 워크로드가 WebGPU에서 안정 재현
- 최소 2개 워크로드가 Wasm fallback과 비교 가능
- 공통 스키마 기반 raw 결과 축적
- 런타임 추천안 1문서
- 내부 데모 2개
