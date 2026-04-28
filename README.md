# AI WebGPU Lab Bootstrap Bundle

`docs-lab-roadmap`는 `ai-webgpu-lab` 조직의 부트스트랩 문서와 운영 템플릿을 관리하는 기준 저장소입니다. 이 저장소를 기준으로 조직 공통 `.github` 저장소, 개별 실험 저장소, 벤치마크 저장소, 앱 저장소를 초기화하고 운영합니다.

## 현재 역할
- 조직 운영 개요와 저장소 전략의 source of truth
- 공통 `README.md` / `RESULTS.md` 템플릿 배포 기준
- 공통 JSON 결과 스키마와 보고 규칙 보관
- 각 실험/벤치/앱 저장소의 GitHub Pages 데모 배포 기준 보관
- 초기 issue 초안, GitHub Projects 설계, 6주 실행 계획 관리
- 조직 메타데이터/토픽 동기화용 스크립트 제공

## 포함 내용
- 조직 운영 개요
- 전체 저장소 맵과 우선순위
- 그래픽스 / 블랙홀 / ML / LLM 실험 계획
- GitHub Projects 보드 설계
- 6주 실행 계획
- 초기 draft issue 30개
- 공통 `README.md` / `RESULTS.md` 템플릿
- 공통 JSON 결과 스키마
- GitHub Pages 데모 스캐폴드와 배포 워크플로우
- 이슈 템플릿 / PR 템플릿
- 기본 저장소 구조 예시

## 추천 반영 순서
1. `bash scripts/validate-lab-planning.sh`로 인벤토리/이슈/마스터 플랜 정합성 확인
2. `ai-webgpu-lab/.github`에 공통 템플릿과 조직 프로필 반영
3. `shared-*` 저장소와 템플릿 저장소 상태 점검
4. 우선순위 P0 저장소 메타데이터와 기본 문서 정렬
5. GitHub Projects `AI WebGPU Lab — Master` 생성
6. `bash scripts/seed-org-issues.sh`로 초기 30개 issue 등록
7. `docs/06-six-week-execution-plan.md` 기준으로 6주 스프린트 시작

## 운영 보조 파일
- `CONTRIBUTING.md` — 문서/조직 변경 작업 규칙
- `.github/CODEOWNERS` — 기본 리뷰 책임자
- `.github/ISSUE_TEMPLATE/` — 조직 공통 이슈 폼 초안
- `scripts/bootstrap-org-repos.sh` — 인벤토리 기준 전체 저장소 부트스트랩 스크립트
- `scripts/capture-p0-baseline-results.mjs` — P0 및 일부 승격 후보 Pages harness를 headless Chromium으로 실행해 raw JSON, 스크린샷, 로그, `RESULTS.md`를 갱신하는 스크립트
- `scripts/seed-org-issues.sh` — 초기 draft issue CSV를 실제 GitHub issue로 시드하는 스크립트
- `scripts/seed-p0-baseline-results.sh` — 9개 browser-visible P0 baseline 저장소를 clone/update한 뒤 baseline 결과를 실제 저장소에 커밋/푸시하는 오케스트레이션 스크립트
- `scripts/validate-lab-planning.sh` — 인벤토리/이슈/실행 계획 문서 정합성 검증 스크립트
- `scripts/render-results-summary.mjs` — `reports/raw/*.json`를 기반으로 저장소별 `RESULTS.md`를 다시 쓰는 스크립트
- `scripts/sync-org-labels.sh` — 조직 기본 라벨 동기화 스크립트
- `scripts/sync-org-repo-topics.sh` — 저장소 인벤토리 기준 토픽 동기화 스크립트
- `scripts/check-coverage.sh` — 단일 entrypoint로 lab-planning + adapter coverage + sketch family/conformance + dashboard 6단계 검증 (`--preset {smoke,full,strict}`)
- `scripts/render-integration-status.mjs` — 54-repo 어댑터/스케치/scaffold 상태 dashboard 생성 (`docs/INTEGRATION-STATUS.md`)
- `scripts/render-sketch-metrics.mjs` — 47개 specific sketch의 CDN/backend/capabilities 비교 dashboard 생성 (`docs/SKETCH-METRICS.md`)
- `scripts/render-projects-config.mjs` — Projects v2 board + 시드 issue 30개 dry-render (`--apply <script.sh>`로 preflight/dry-run/reuse-project 지원 gh CLI 스크립트 emit)
- `scripts/capture-all-baselines.sh` — 인벤토리 일괄 capture wrapper (priority/category/repo 필터, TSV + markdown summary)
- `scripts/validate-infra-fixtures.mjs` — 5개 인프라 harness fixture vs 실제 surface drift 자동 검증 (67 checks, validate-lab-planning에서 hook)
- `tests/run-all.sh` — `tests/test-*.sh` 실행 wrapper (`--mode fast|full|nightly`, `--capture-groups <list>`, `--filter <pattern>`, `--bail`, `--quiet` 지원, pass/fail 요약과 elapsed 출력)

## 최상위 문서 안내
- `docs/00-master-summary.md` — 전체 요약
- `docs/01-org-repo-map.md` — 조직/저장소 맵
- `docs/02-graphics-and-blackhole-track.md` — 그래픽스/블랙홀 트랙
- `docs/03-ml-llm-track.md` — ML/LLM 트랙
- `docs/04-github-projects-design.md` — GitHub Projects 운영 설계
- `docs/05-templates-and-results.md` — 템플릿/스키마 설명
- `docs/06-six-week-execution-plan.md` — 6주 실행 계획
- `docs/07-master-experiment-plan.md` — 전체 실험/부트스트랩 마스터 계획
- `docs/08-bootstrap-and-execution-runbook.md` — 실제 운영 순서와 phase gate 체크리스트
- `docs/09-runtime-integration-plan.md` — 4 family 어댑터 컨트랙트와 47개 specific real-*-sketch.js의 통합 계획
- `docs/INTEGRATION-STATUS.md` — 자동 생성 dashboard (54 repo × 어댑터/스케치/scaffold 상태)
- `docs/SKETCH-METRICS.md` — 자동 생성 dashboard (47 specific sketch × CDN/backend/capabilities)
- `issues/initial-draft-issues-30.md` — 초기 draft issue 30개

## 실제 통합 sketch 상태
2026-04-27 기준 인벤토리의 4 family-mapped repo (총 47개) 모두가 specific real-*-sketch.js를 보유합니다.

| Family | Specific count | Library/패턴 예시 |
|---|---|---|
| Renderer | 12/12 | three.js / Babylon.js / PlayCanvas / PixiJS / luma.gl / deck.gl / raw WebGPU compute / shader material |
| Runtime | 12/12 | Transformers.js (8 변형) / ONNX Runtime Web / WebLLM / dual STT+reply / worker-vs-main |
| App-surface | 5/5 | manifest fetch (observatory / RAG / chat-arena / voice-agent / image-lab) |
| Benchmark | 18/18 | benchmark.js × runtime/raw-WebGPU/Cache Storage/requestAnimationFrame/parity |

각 sketch는 stub-injection 단위 테스트와 family conformance 테스트로 회귀 가드되며, `?mode=real-*` query로만 활성화되어 default deterministic harness는 변하지 않습니다. 자세한 사례는 `docs/09-runtime-integration-plan.md`, dashboard는 `docs/INTEGRATION-STATUS.md`/`docs/SKETCH-METRICS.md` 참조.

## 사용 방법
```bash
npm install
npx playwright install chromium
bash scripts/validate-lab-planning.sh
bash scripts/bootstrap-org-repos.sh
bash scripts/bootstrap-org-repos.sh --refresh-readme --no-sync
bash scripts/bootstrap-org-repos.sh --refresh-generated --refresh-readme --no-sync
bash scripts/seed-org-issues.sh
bash scripts/seed-p0-baseline-results.sh --push
bash scripts/sync-org-labels.sh
bash scripts/sync-org-repo-topics.sh
bash tests/test-render-results-summary.sh
bash tests/test-capture-p0-baseline-results.sh
AI_WEBGPU_LAB_CAPTURE_SUITE=full bash tests/test-capture-p0-baseline-results.sh
AI_WEBGPU_LAB_CAPTURE_SUITE=full AI_WEBGPU_LAB_CAPTURE_GROUPS=renderer-batch bash tests/test-capture-p0-baseline-results.sh
bash tests/test-validate-lab-planning.sh
bash tests/test-bootstrap-org-repos.sh
bash tests/test-bootstrap-org-repos-full-inventory.sh
bash tests/test-seed-org-issues.sh
bash tests/run-all.sh --mode fast
bash tests/run-all.sh --mode full --filter capture-p0-baseline-results --capture-groups renderer-batch
bash tests/run-all.sh --filter render-sketch-metrics --quiet
```

위 스크립트와 테스트는 `docs/repo-inventory.csv`를 기준으로 조직 저장소를 부트스트랩하고, 계획 문서/시드 이슈 정합성을 검증하며, 기본 라벨과 GitHub topics를 정렬합니다.
실험/벤치/앱/템플릿 저장소에는 기본 `public/index.html`, `public/app.js`, `.github/workflows/deploy-pages.yml`이 함께 생성되어 GitHub Pages baseline probe를 바로 올릴 수 있습니다.
`repo-scaffolds/p0/<repo>/` 또는 `repo-scaffolds/repos/<repo>/`에 전용 Pages baseline이 있는 저장소는 공통 probe 대신 저장소별 harness가 배치됩니다. 현재 P0 대상은 `tpl-webgpu-vanilla`, `tpl-webgpu-react`, `exp-embeddings-browser-throughput`, `exp-llm-chat-runtime-shootout`, `exp-stt-whisper-webgpu`, `exp-rag-browser-pipeline`, `bench-runtime-shootout`, `bench-model-load-and-cache`, `bench-worker-isolation-and-ui-jank`입니다. 조직 인프라 계열인 `.github`, `shared-webgpu-capability`, `shared-bench-schema`, `shared-github-actions`, `docs-lab-roadmap`도 동일 harness 패턴으로 deterministic infra/docs baseline을 가집니다. P0 이후 전용 harness 대상은 `exp-three-webgpu-core`, `exp-babylon-webgpu-core`, `exp-playcanvas-webgpu-core`, `exp-pixi-webgpu-2d`, `exp-luma-webgpu-viz`, `exp-deckgl-webgpu-readiness`, `exp-blackhole-three-singularity`, `exp-blackhole-kerr-engine`, `exp-blackhole-webgpu-fromscratch`, `exp-nbody-webgpu-core`, `exp-fluid-webgpu-core`, `exp-three-webgpu-particles-stress`, `bench-compute-stress-suite`, `bench-atomics-and-memory`, `bench-texture-upload-and-streaming`, `exp-reranker-browser`, `bench-embeddings-latency-quality`, `bench-reranker-latency`, `bench-rag-endtoend`, `bench-llm-prefill-decode`, `bench-stt-streaming-latency`, `bench-voice-roundtrip`, `bench-multimodal-latency`, `bench-diffusion-browser-shootout`, `bench-agent-step-latency`, `bench-webgpu-vs-wasm-parity`, `bench-blackhole-render-shootout`, `bench-renderer-shootout`, `exp-ort-webgpu-baseline`, `exp-webllm-browser-chat`, `exp-llm-worker-ux`, `exp-voice-assistant-local`, `exp-vlm-browser-multimodal`, `exp-diffusion-webgpu-browser`, `exp-browser-agent-local`, `app-private-rag-lab`, `app-local-chat-arena`, `app-voice-agent-lab`, `app-browser-image-lab`, `app-blackhole-observatory`입니다.
실제 앱 빌드가 필요한 저장소는 이후 각 저장소에서 build 단계와 artifact 경로를 교체해야 합니다.
기존 저장소의 README를 새 상세 포맷으로 다시 쓰려면 `--refresh-readme` 옵션을 사용합니다.
기존 저장소의 baseline probe와 생성 자산까지 다시 쓰려면 `--refresh-generated` 옵션을 함께 사용합니다.
`tests/test-capture-p0-baseline-results.sh`는 기본적으로 대표 smoke subset만 실행합니다. 전체 browser capture sweep은 `AI_WEBGPU_LAB_CAPTURE_SUITE=full`로 실행하고, CI에서는 `smoke`, `baseline-a`, `baseline-b`, `baseline-c`, `baseline-d`, `real-adapters`, `renderer-batch`, `benchmark-batch`, `runtime-batch` 그룹을 matrix로 나눠 병렬 실행합니다. 로컬에서는 호환용 그룹 `baseline`으로 baseline-a~d를 한 번에 실행할 수 있습니다. 실패 분석용으로 `AI_WEBGPU_LAB_CAPTURE_TMP_DIR`를 지정하면 raw JSON, screenshots, logs가 삭제되지 않고 GitHub Actions artifact로 업로드됩니다. `scripts/seed-p0-baseline-results.sh`는 `tpl-webgpu-vanilla`, `tpl-webgpu-react`를 포함한 9개 browser-visible P0 baseline 저장소의 headless Chromium 결과를 캡처해 `reports/raw/`, `reports/screenshots/`, `reports/logs/`, `RESULTS.md`까지 한 번에 갱신할 수 있습니다. `scripts/capture-p0-baseline-results.mjs --repo-name <repo>`는 추가로 `exp-three-webgpu-core`, `exp-babylon-webgpu-core`, `exp-playcanvas-webgpu-core`, `exp-pixi-webgpu-2d`, `exp-luma-webgpu-viz`, `exp-deckgl-webgpu-readiness`, `exp-blackhole-three-singularity`, `exp-blackhole-kerr-engine`, `exp-blackhole-webgpu-fromscratch`, `exp-nbody-webgpu-core`, `exp-fluid-webgpu-core`, `exp-three-webgpu-particles-stress`, `bench-compute-stress-suite`, `bench-atomics-and-memory`, `bench-texture-upload-and-streaming`, `exp-reranker-browser`, `bench-embeddings-latency-quality`, `bench-reranker-latency`, `bench-rag-endtoend`, `bench-llm-prefill-decode`, `bench-stt-streaming-latency`, `bench-voice-roundtrip`, `bench-multimodal-latency`, `bench-diffusion-browser-shootout`, `bench-agent-step-latency`, `bench-webgpu-vs-wasm-parity`, `bench-blackhole-render-shootout`, `bench-renderer-shootout`, `exp-ort-webgpu-baseline`, `exp-webllm-browser-chat`, `exp-llm-worker-ux`, `exp-voice-assistant-local`, `exp-vlm-browser-multimodal`, `exp-diffusion-webgpu-browser`, `exp-browser-agent-local`, `app-private-rag-lab`, `app-local-chat-arena`, `app-voice-agent-lab`, `app-browser-image-lab`, `app-blackhole-observatory`, `.github`, `shared-webgpu-capability`, `shared-bench-schema`, `shared-github-actions`, `docs-lab-roadmap`의 전용 harness도 단건 캡처할 수 있습니다.
Projects apply 스크립트는 실제 실행 전 `DRY_RUN=1`로 명령을 확인하고, 기존 프로젝트를 재사용하려면 `PROJECT_NUMBER=<number>` 또는 `REUSE_PROJECT=1`을 지정합니다. 기존 issue title이 발견되면 새 issue를 만들지 않고 해당 URL을 Projects item으로 추가합니다.
현재 `exp-embeddings-browser-throughput`, `exp-llm-chat-runtime-shootout`, `bench-runtime-shootout`는 동일 harness에서 `?mode=webgpu` / `?mode=fallback` pair를 수집해 `WebGPU vs fallback` 비교 섹션까지 자동 생성합니다.
