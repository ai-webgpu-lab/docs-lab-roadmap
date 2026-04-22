# Master Experiment Plan

## 목표
`ai-webgpu-lab` 조직을 단발성 데모 모음이 아니라, 재현 가능한 브라우저 WebGPU/AI 실험 조직으로 운영한다. 이 계획은 저장소 생성, 공통 운영 기준 정착, P0 기준선 구현, 비교 벤치마크 누적, 데모 승격, 분기 리뷰까지의 전체 실행 흐름을 정의한다.

## 이번 라운드에서 실제로 수행하는 범위
- 조직 인벤토리 기준 저장소 존재 여부 정렬
- 각 저장소 기본 스캐폴드, 설명, 라벨, 토픽, GitHub Pages baseline probe 동기화
- 전체 실험군을 위한 우선순위와 단계별 실행 계획 문서화
- 인벤토리, 시드 이슈, 실행 계획 문서 간 정합성 자동 검증
- 부트스트랩 스크립트와 테스트로 반복 가능한 초기화 경로 확보

## 운영 원칙
- 저장소 하나는 하나의 질문 또는 하나의 공통 책임을 가진다.
- 모든 실험, 벤치, 앱 저장소는 `README.md`, `RESULTS.md`, raw 결과 디렉터리를 기본으로 가진다.
- 모든 성능 수치는 브라우저, OS, 디바이스, 백엔드, worker 모드, 캐시 상태와 함께 기록한다.
- Promote / Continue / Archive 판단은 결과와 재현성 기준으로만 한다.
- WebGPU-first로 설계하되 Wasm 또는 CPU fallback 관찰 결과도 반드시 함께 남긴다.

## 성공 기준
### 조직 수준
- `docs/repo-inventory.csv`의 모든 저장소가 조직에 존재한다.
- 각 저장소의 설명, 라벨, 토픽이 인벤토리와 운영 규칙에 맞게 정렬된다.
- `.github`, `shared-*`, `tpl-*`, `docs-*` 저장소가 공통 기준점을 제공한다.

### 실험 수준
- P0 저장소 전부에 최소 1회 runnable baseline이 존재한다.
- P0 저장소 전부에 `RESULTS.md`와 raw JSON 1건 이상이 누적된다.
- 최소 3개 워크로드에서 WebGPU vs fallback 비교가 가능해진다.

### 운영 수준
- 신규 저장소는 스크립트 한 번으로 초기화 가능하다.
- 샘플과 전체 인벤토리 렌더링 테스트가 모두 통과한다.
- 분기 리뷰 시 Promote / Continue / Archive 판단 자료를 바로 볼 수 있다.

## 전체 범위
### 조직 공통
- `.github`
- `docs-lab-roadmap`
- `shared-webgpu-capability`
- `shared-bench-schema`
- `shared-github-actions`
- `tpl-webgpu-vanilla`
- `tpl-webgpu-react`

### 그래픽스 / 블랙홀 / 과학 시각화
- `exp-three-webgpu-core`
- `exp-babylon-webgpu-core`
- `exp-playcanvas-webgpu-core`
- `exp-pixi-webgpu-2d`
- `exp-luma-webgpu-viz`
- `exp-deckgl-webgpu-readiness`
- `exp-blackhole-three-singularity`
- `exp-blackhole-kerr-engine`
- `exp-blackhole-webgpu-fromscratch`
- `exp-nbody-webgpu-core`
- `exp-fluid-webgpu-core`
- `exp-three-webgpu-particles-stress`
- `bench-blackhole-render-shootout`
- `bench-compute-stress-suite`
- `bench-atomics-and-memory`
- `bench-texture-upload-and-streaming`
- `bench-renderer-shootout`
- `app-blackhole-observatory`

### ML / LLM / Audio / Multimodal / Agent
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
- `app-private-rag-lab`
- `app-local-chat-arena`
- `app-voice-agent-lab`
- `app-browser-image-lab`

## 단계별 실행 계획
### Phase 0 — Organization Bootstrap
목표: 모든 인벤토리 저장소를 생성하고 공통 운영 규칙을 주입한다.

산출물:
- 모든 저장소 생성 또는 존재 여부 확인
- 저장소 설명, 토픽, 라벨 정렬
- 공통 스캐폴드 반영
- GitHub Pages baseline probe와 배포 workflow 반영
- 조직 프로필과 이슈/PR 기본값 반영

완료 기준:
- `docs/repo-inventory.csv`의 모든 저장소가 조직에 존재
- 각 저장소에 최소 1개 커밋 존재
- 공통 스키마와 템플릿이 필요한 저장소에 기본 파일 반영

### Phase 1 — P0 Baseline
목표: 우선순위 P0 저장소를 실행 가능한 기준선 상태로 만든다.

대상 저장소:
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

산출물:
- 첫 runnable baseline
- 첫 `RESULTS.md`
- raw 결과 JSON 1건 이상
- 실패 조건과 fallback 경로 기록

완료 기준:
- 최소 7개 P0 저장소에서 baseline 구현 또는 측정 harness 구동
- 공통 스키마를 통과하는 샘플 결과 누적

### Phase 2 — P1 Expansion
목표: 라이브러리 비교, worker UX, parity 검증, 운영 자동화를 확장한다.

핵심 저장소:
- `shared-github-actions`
- `exp-three-webgpu-core`
- `exp-babylon-webgpu-core`
- `exp-playcanvas-webgpu-core`
- `exp-blackhole-three-singularity`
- `exp-reranker-browser`
- `exp-ort-webgpu-baseline`
- `exp-webllm-browser-chat`
- `exp-llm-worker-ux`
- `bench-blackhole-render-shootout`
- `bench-embeddings-latency-quality`
- `bench-reranker-latency`
- `bench-rag-endtoend`
- `bench-llm-prefill-decode`
- `bench-stt-streaming-latency`
- `bench-webgpu-vs-wasm-parity`
- `app-private-rag-lab`
- `app-local-chat-arena`

산출물:
- 비교 기준선 2개 이상
- worker, cache, fallback 관찰 결과
- CI 재사용 워크플로우
- 내부 데모 1개 이상

### Phase 3 — P2 Research Portfolio
목표: 고난도 실험과 쇼케이스를 채워 조직 포트폴리오를 확장한다.

핵심 저장소:
- `exp-pixi-webgpu-2d`
- `exp-luma-webgpu-viz`
- `exp-deckgl-webgpu-readiness`
- `exp-blackhole-kerr-engine`
- `exp-blackhole-webgpu-fromscratch`
- `exp-nbody-webgpu-core`
- `exp-fluid-webgpu-core`
- `exp-three-webgpu-particles-stress`
- `exp-voice-assistant-local`
- `exp-vlm-browser-multimodal`
- `exp-diffusion-webgpu-browser`
- `exp-browser-agent-local`
- `bench-voice-roundtrip`
- `bench-multimodal-latency`
- `bench-diffusion-browser-shootout`
- `bench-agent-step-latency`
- `bench-compute-stress-suite`
- `bench-atomics-and-memory`
- `bench-texture-upload-and-streaming`
- `bench-renderer-shootout`
- `app-voice-agent-lab`
- `app-browser-image-lab`
- `app-blackhole-observatory`

산출물:
- 멀티모달, 에이전트, 과학 시각화 기준선
- 내부 쇼케이스 데모
- 성숙도 판단 문서

## P0 저장소별 첫 마일스톤
| 저장소 | 첫 질문 | 최소 구현 | 첫 검증 결과 |
| --- | --- | --- | --- |
| `tpl-webgpu-vanilla` | 가장 작은 WebGPU 실험 스타터는 무엇인가 | 캔버스 초기화, adapter/device 확인, 단일 샘플 | Chrome Canary 기준 실행 여부 |
| `tpl-webgpu-react` | React 기반 실험 시작 비용은 어느 정도인가 | Vite/React 기본 템플릿, WebGPU capability 표시 | 로컬 실행 및 hydration 문제 없음 |
| `shared-webgpu-capability` | 어떤 capability를 공통 수집해야 하는가 | adapter, limits, features 수집 유틸 | JSON 출력 예제 1건 |
| `shared-bench-schema` | 모든 결과를 어떤 형식으로 기록할 것인가 | 공통 JSON schema, example result, rules | 샘플 결과 검증 통과 |
| `docs-lab-roadmap` | 조직 운영 기준은 충분히 명시되었는가 | 마스터 문서, 인벤토리, 템플릿, 스크립트 | 부트스트랩 테스트 통과 |
| `exp-embeddings-browser-throughput` | 브라우저 임베딩 처리량은 어느 수준인가 | 1개 모델 로드, 단일 배치 처리 측정 | cold/warm run 각각 1건 |
| `exp-llm-chat-runtime-shootout` | 어떤 런타임이 로컬 채팅 baseline에 적합한가 | 최소 2개 런타임 비교 harness | prefill/decode 시간 기록 |
| `exp-stt-whisper-webgpu` | 브라우저 Whisper STT가 실용적인가 | file transcription baseline | 처리 시간과 WER 초안 |
| `exp-rag-browser-pipeline` | 브라우저 RAG E2E가 가능한가 | ingest, chunk, embed, retrieve 최소 플로우 | 문서 1건, 질문 3건 결과 |
| `bench-runtime-shootout` | 런타임 비교 기준은 무엇인가 | 동일 입력 시나리오, 공통 메트릭 | 2개 런타임 비교표 |
| `bench-model-load-and-cache` | 모델 로드와 캐시 이득은 얼마나 큰가 | cold/warm load harness | cold vs warm delta |
| `bench-worker-isolation-and-ui-jank` | worker 분리가 체감에 얼마나 유효한가 | main/worker 비교 측정 페이지 | input delay, dropped frame |

## 현재 P0 Baseline 구현 상태
- 2026-04-22 기준 repo-specific Pages baseline이 있는 저장소: `tpl-webgpu-vanilla`, `tpl-webgpu-react`, `exp-embeddings-browser-throughput`, `exp-llm-chat-runtime-shootout`, `exp-stt-whisper-webgpu`, `exp-rag-browser-pipeline`, `bench-runtime-shootout`, `bench-model-load-and-cache`, `bench-worker-isolation-and-ui-jank`
- 2026-04-22 기준 위 9개 browser-visible P0 baseline 저장소는 headless Chromium baseline capture를 통해 첫 `reports/raw/*.json`, `reports/screenshots/*.png`, `reports/logs/*.log`, `RESULTS.md`를 보유한다
- 현재 raw result는 deterministic browser harness baseline이므로, 다음 단계는 실제 runtime/model integration과 multi-browser/device 반복 측정이다
- `shared-webgpu-capability`, `shared-bench-schema`, `docs-lab-roadmap`는 코드/문서 기준 저장소로 usable baseline 상태

## 트랙별 핵심 질문
### Graphics
- 어느 라이브러리가 WebGPU 준비도가 높은가
- scene 복잡도 증가 시 병목이 어디에 생기는가
- renderer 추상화와 raw WebGPU의 차이는 어느 정도인가

### Blackhole / Scientific Visualization
- raymarching, particle, compute stress를 브라우저에서 안정적으로 재현할 수 있는가
- 시각 품질과 프레임 안정성을 동시에 만족하는 파라미터 범위는 어디인가

### ML / LLM / Audio / Multimodal / Agent
- 브라우저에서 가장 현실적인 runtime 조합은 무엇인가
- WebGPU와 Wasm fallback의 성능 차이와 품질 차이는 어느 정도인가
- worker 분리와 캐시 재사용이 사용자 체감 지연에 얼마나 영향을 주는가

## 저장소별 기본 산출물
### `exp-*`
- 질문이 명시된 `README.md`
- 실행 결과가 정리된 `RESULTS.md`
- `reports/raw/*.json`
- 스크린샷 또는 로그

### `bench-*`
- 비교 시나리오 정의
- 워크로드 프로필
- 반복 측정 결과
- 비교 결론 초안

### `app-*`
- 내부 데모 URL 또는 실행 방법
- 연결된 실험/벤치 저장소 링크
- 데모 readiness 상태

### `shared-*`
- 소비 저장소 목록
- 사용 예시
- 버전 또는 변경 이력 기준

### `docs-*`
- 운영 규칙
- ADR / 비교 보고서
- 분기/스프린트 계획

## 실행 순서
1. `bash scripts/validate-lab-planning.sh`로 인벤토리, 시드 이슈, 마스터 플랜, 6주 실행 계획의 정합성을 먼저 검증한다.
2. 조직 인벤토리와 스캐폴드가 깨지지 않도록 부트스트랩 스크립트와 테스트를 먼저 고정한다.
3. P0 저장소에 공통 capability, 결과 스키마, 최소 실행 템플릿을 먼저 공급한다.
4. P0 실험 저장소에서 cold/warm, worker/fallback 기준선을 먼저 만든다.
5. 공통 benchmark 저장소로 비교 시나리오를 묶고 데모 저장소는 그 결과를 소비하게 만든다.
6. P1, P2 확장 저장소는 baseline이 쌓인 뒤 우선순위별로 승격한다.

## 검증 전략
| 수준 | 검증 대상 | 방법 | 통과 기준 |
| --- | --- | --- | --- |
| Planning consistency | 인벤토리, 시드 이슈, 마스터 플랜, 6주 계획 | `bash scripts/validate-lab-planning.sh` | CSV/문서 참조 저장소와 P0 실행 세트가 서로 일치 |
| Bootstrap unit | 샘플 인벤토리 | `bash tests/test-bootstrap-org-repos.sh` | 샘플 저장소 구조와 핵심 파일 생성 |
| Bootstrap smoke | 전체 인벤토리 | `bash tests/test-bootstrap-org-repos-full-inventory.sh` | 전체 저장소 수와 대표 파일 정합성 확인 |
| Script syntax | Bash 스크립트 | `bash -n scripts/bootstrap-org-repos.sh` | 문법 오류 없음 |
| Org sync | GitHub 조직 반영 | `bash scripts/bootstrap-org-repos.sh` | 모든 저장소 `no changes` 또는 정상 push |
| Result schema | 결과 JSON | shared schema 검증 | 예제와 실험 결과 JSON 통과 |
| Manual browser verification | P0 baseline 앱 | Chrome/Edge/Safari Tech Preview 수동 점검 | 실행, fallback, 로그 기록 완료 |

운영자가 실제 순서대로 따를 수 있는 체크리스트는 `docs/08-bootstrap-and-execution-runbook.md`에 둔다.

## 리스크와 대응
- 브라우저별 WebGPU 지원 편차: capability 저장소에서 먼저 환경 차이를 수집하고 fallback 경로를 문서화한다.
- 모델 다운로드와 캐시 비용: cold/warm benchmark를 분리해 기록하고 첫 로딩 비용을 별도 KPI로 본다.
- 저장소 수 증가에 따른 운영 비용: 공통 라벨, 토픽, 스캐폴드, CI를 공유 저장소로 흡수한다.
- 데모 우선주의로 실험 품질이 흔들릴 위험: 모든 데모는 연결된 실험 또는 벤치 결과를 근거로 승격한다.

## 종료 조건
- 모든 인벤토리 저장소 생성 완료
- P0 저장소 전부가 최소 baseline 상태에 도달
- 공통 benchmark schema와 보고 템플릿이 조직 기본값으로 정착
- 전체 인벤토리 부트스트랩 테스트와 조직 동기화 검증 완료
- 분기 리뷰 기준으로 Promote / Continue / Archive 판단 가능
