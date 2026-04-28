# Bootstrap and Execution Runbook

## 목적
이 문서는 `docs/07-master-experiment-plan.md`를 실제 운영 순서로 옮긴 실행용 런북이다. 목표는 문서, CSV, GitHub 조직 상태가 서로 어긋나지 않도록 먼저 고정하고, 그 다음 P0 baseline과 6주 실행을 밀어붙이는 것이다.

## 사전 조건
- `gh` 로그인 완료
- `jq`, `python3`, `rg`, `git` 설치 완료
- `node`, `npm` 설치 완료
- `docs/repo-inventory.csv`와 `issues/initial-draft-issues-30.csv`가 최신 상태
- GitHub organization `ai-webgpu-lab`에 저장소 생성 권한 보유

## 권장 실행 순서
### 1. 계획 자산 정합성 검증
```bash
bash scripts/validate-lab-planning.sh
```

통과 기준:
- 인벤토리 CSV에 중복/오탈자 없음
- 시드 이슈 CSV의 repo/type/priority가 인벤토리와 맞음
- `docs/07-master-experiment-plan.md`가 모든 P0 저장소를 언급함
- `docs/06-six-week-execution-plan.md`의 대상 저장소가 모두 시드 이슈로 연결됨

### 2. 로컬 부트스트랩 렌더링 확인
```bash
npm install
npx playwright install chromium
bash tests/test-validate-lab-planning.sh
bash tests/test-bootstrap-org-repos.sh
bash tests/test-bootstrap-org-repos-full-inventory.sh
bash tests/test-render-results-summary.sh
bash tests/test-capture-p0-baseline-results.sh
bash tests/test-seed-org-issues.sh
```

통과 기준:
- 계획 검증 테스트 통과
- 샘플 인벤토리 렌더링 통과
- 전체 인벤토리 렌더링 통과
- raw result summary 렌더링 테스트 통과
- P0 및 조기 승격 후보 browser harness capture smoke test 통과
- 시드 이슈 dry-run 출력 통과

### 3. CI와 capture sweep 검증
```bash
bash tests/run-all.sh --mode fast --quiet
bash scripts/check-coverage.sh --preset full --quiet
node scripts/check-org-pages.mjs --fail-on-error
node scripts/check-org-readmes.mjs --fail-on-error
node scripts/check-org-workflows.mjs --fail-on-error
node scripts/check-project-status.mjs
bash tests/run-all.sh --mode full --filter capture-p0-baseline-results --capture-groups smoke --quiet
bash tests/run-all.sh --mode full --filter capture-p0-baseline-results --capture-groups runtime-batch --quiet
```

통과 기준:
- fast suite는 pull request/push 기본 검증으로 사용하며 모든 `tests/test-*.sh`가 통과해야 한다.
- `check-coverage --preset full`은 실제 validator/dashboard 경로를 한 번 실행해야 한다.
- `check-org-pages`는 54개 저장소의 Pages 설정, 최신 deploy workflow, HTTP 200, 저장소 전용 demo surface, real sketch/adapter 원격 반영, 대표 real-mode URL을 확인해야 한다.
- `check-org-readmes`는 54개 저장소의 README/profile README가 상태 dashboard 링크를 유지하는지 확인해야 한다.
- `check-org-workflows`는 54개 저장소의 deploy workflow와 `docs-lab-roadmap` CI가 성공 상태인지 확인해야 한다.
- `check-project-status`는 Master Project 존재 여부와 seed issue/project item 연결 갭을 리포트해야 한다.
- full capture는 GitHub Actions matrix에서 `smoke`, `baseline-a`, `baseline-b`, `baseline-c`, `baseline-d`, `real-adapters`, `renderer-batch`, `benchmark-batch`, `runtime-batch`로 병렬 실행한다.
- 로컬에서 baseline 전체를 한 번에 확인할 때는 호환 그룹 `baseline`을 사용할 수 있다.
- 실패 분석이 필요하면 `AI_WEBGPU_LAB_CAPTURE_TMP_DIR=/tmp/capture-out`을 지정해 raw JSON, screenshots, logs를 보존한다.

예시:
```bash
AI_WEBGPU_LAB_CAPTURE_TMP_DIR=/tmp/capture-out \
  bash tests/run-all.sh --mode full --filter capture-p0-baseline-results --capture-groups baseline-a --quiet
```

### 4. GitHub Projects 적용 dry-run
```bash
node scripts/render-projects-config.mjs --output tmp/projects-config.json --apply tmp/apply-projects.sh
DRY_RUN=1 bash tmp/apply-projects.sh
```

통과 기준:
- `gh project create`, `gh project field-create`, `gh label create`, `gh issue create`, `gh project item-add` 명령이 의도한 org/repo/title로 출력됨
- 실제 적용 전 `gh auth status`와 org/repo 접근 권한이 충족됨
- 기존 프로젝트를 재사용할 때는 `PROJECT_NUMBER=<number>` 또는 `REUSE_PROJECT=1`을 지정함
- 기존 issue title이 발견되면 새 issue를 만들지 않고 기존 URL을 Projects item으로 연결함

예시:
```bash
PROJECT_NUMBER=12 bash tmp/apply-projects.sh
REUSE_PROJECT=1 bash tmp/apply-projects.sh
```

### 5. GitHub Pages 상태 리포트
```bash
node scripts/check-org-pages.mjs --fail-on-error
node scripts/check-org-readmes.mjs --fail-on-error
node scripts/check-org-workflows.mjs --fail-on-error
node scripts/check-project-status.mjs
```

통과 기준:
- `docs/PAGES-STATUS.md`에 54개 저장소가 모두 집계됨
- `docs/README-STATUS.md`에 README/profile drift 상태가 모두 집계됨
- `docs/WORKFLOW-STATUS.md`에 deploy workflow와 필수 CI 상태가 모두 집계됨
- `docs/PROJECT-STATUS.md`에 Project, seed issue, Project item 연결 상태가 집계됨
- 모든 저장소가 GitHub Pages `workflow` source, 최신 `deploy-pages.yml` success, HTTP 200 상태임
- 모든 저장소가 generic baseline이 아닌 repo-specific demo title을 노출함
- 실험/벤치/앱 저장소의 원격 `public/`에 기대한 `real-*-sketch.js`와 `*-adapter.js`가 존재함
- 대표 real-mode URL `bench-runtime-shootout?mode=real-runtime`, `exp-three-webgpu-core?mode=real-three`, `bench-renderer-shootout?mode=real-benchmark`, `app-blackhole-observatory?mode=real-surface`가 HTTP 200을 반환함
- Project seed issue/item은 아직 미적용일 수 있으므로, 강제 gate가 필요할 때만 `--fail-on-error --require-seeded-issues --require-project-items`를 함께 사용함

### 6. GitHub 조직 반영
```bash
bash scripts/bootstrap-org-repos.sh
bash scripts/bootstrap-org-repos.sh --refresh-readme --no-sync
bash scripts/bootstrap-org-repos.sh --refresh-generated --refresh-readme --no-sync
bash scripts/sync-org-labels.sh
bash scripts/sync-org-repo-topics.sh
bash scripts/seed-org-issues.sh
bash scripts/seed-p0-baseline-results.sh --push
```

통과 기준:
- 모든 인벤토리 저장소 존재 또는 정상 생성
- 공통 라벨과 토픽 적용 완료
- 초기 이슈가 중복 없이 생성됨
- Master Project에 이슈 연결 완료
- demo 대상 저장소가 GitHub Pages `workflow` source로 설정됨
- 기존 저장소 README가 최신 상세 포맷으로 갱신됨
- 기존 저장소 baseline probe 자산이 최신 공통 포맷으로 갱신됨
- `tpl-webgpu-vanilla`, `tpl-webgpu-react`를 포함한 9개 browser-visible P0 baseline 저장소에 첫 raw JSON, screenshot, log, `RESULTS.md`가 반영됨

## Phase Gate
### Phase 0 — Organization Bootstrap
- `.github`, `tpl-*`, `shared-*`, `docs-*` 저장소가 모두 생성됨
- 각 저장소 설명, 토픽, 라벨이 인벤토리와 일치함
- 공통 스캐폴드와 결과 스키마 배포 경로가 확인됨

### Phase 1 — P0 Baseline
- `tpl-webgpu-vanilla`, `tpl-webgpu-react`, `shared-webgpu-capability`, `shared-bench-schema`, `docs-lab-roadmap`가 usable baseline 상태
- `exp-embeddings-browser-throughput`, `exp-llm-chat-runtime-shootout`, `exp-stt-whisper-webgpu`, `exp-rag-browser-pipeline`, `bench-runtime-shootout`, `bench-model-load-and-cache`, `bench-worker-isolation-and-ui-jank`가 repo-specific browser harness 확보
- 위 harness는 deterministic browser baseline이며, `exp-embeddings-browser-throughput`, `exp-llm-chat-runtime-shootout`, `bench-runtime-shootout`는 `webgpu`/`fallback` compare pair까지 수집 가능하다
- demo 대상 저장소가 GitHub Pages에서 공통 baseline probe 또는 저장소 전용 화면을 노출함

### Phase 2 — P1 Expansion
- 엔진/런타임 비교 실험이 최소 2축 이상 누적됨
- shared CI/workflow가 `shared-github-actions`로 재사용 가능해짐
- `exp-three-webgpu-core`, `exp-babylon-webgpu-core`, `exp-playcanvas-webgpu-core`, `exp-pixi-webgpu-2d`, `exp-luma-webgpu-viz`, `exp-deckgl-webgpu-readiness`, `exp-blackhole-three-singularity`, `exp-blackhole-kerr-engine`, `exp-blackhole-webgpu-fromscratch`, `exp-nbody-webgpu-core`, `exp-fluid-webgpu-core`, `exp-three-webgpu-particles-stress`, `bench-compute-stress-suite`, `bench-atomics-and-memory`, `bench-texture-upload-and-streaming`, `exp-reranker-browser`, `bench-embeddings-latency-quality`, `bench-reranker-latency`, `bench-rag-endtoend`, `bench-llm-prefill-decode`, `bench-stt-streaming-latency`, `bench-voice-roundtrip`, `bench-multimodal-latency`, `bench-diffusion-browser-shootout`, `bench-agent-step-latency`, `bench-webgpu-vs-wasm-parity`, `bench-blackhole-render-shootout`, `bench-renderer-shootout`, `exp-ort-webgpu-baseline`, `exp-webllm-browser-chat`, `exp-llm-worker-ux`, `exp-voice-assistant-local`, `exp-vlm-browser-multimodal`, `exp-diffusion-webgpu-browser`, `exp-browser-agent-local`, `app-private-rag-lab`, `app-local-chat-arena`, `app-voice-agent-lab`, `app-browser-image-lab`, `app-blackhole-observatory`, `.github`, `shared-webgpu-capability`, `shared-bench-schema`, `shared-github-actions`, `docs-lab-roadmap`가 공통 probe를 벗어난 repo-specific harness를 보유함
- `app-private-rag-lab`, `app-local-chat-arena`, `app-voice-agent-lab`, `app-browser-image-lab`, `app-blackhole-observatory`가 내부 데모로 연결됨

### Phase 3 — P2 Research Portfolio
- 블랙홀, 멀티모달, 에이전트, diffusion, compute stress 트랙이 baseline 이상 상태
- 고난도 실험은 성능뿐 아니라 실패 조건과 fallback 한계까지 기록됨
- 분기 리뷰 시 Promote / Continue / Archive를 repo 단위로 판단 가능

## 주간 운영 기준
### Week 1
- 저장소 생성, 템플릿 배포, 첫 raw JSON 경로 확보
- `scripts/seed-p0-baseline-results.sh` 기준 첫 baseline raw result seed

### Week 2
- embeddings/LLM baseline과 cold/warm 측정 확보

### Week 3
- STT baseline과 worker UI 지표 확보

### Week 4
- 브라우저 RAG end-to-end 최소 플로우 확보

### Week 5
- runtime/model/cache 비교 리포트 초안 작성

### Week 6
- 앱 승격 후보와 benchmark summary v1 정리

## 산출물 체크리스트
### 모든 `exp-*`
- `README.md`
- `RESULTS.md`
- `reports/raw/*.json`
- fallback/실패 조건 메모

### 모든 `bench-*`
- 비교 시나리오 정의
- 공통 입력과 KPI 정의
- 반복 측정 결과

### 모든 `app-*`
- 실행 방법
- 연결된 실험/벤치 링크
- readiness 상태
- GitHub Pages로 접근 가능한 데모 URL

## 수동 검증 항목
- Chrome Stable / Canary에서 WebGPU adapter 획득 여부
- Edge 또는 Safari Tech Preview fallback 동작 여부
- cold/warm cache 차이 재현 여부
- worker/main thread 체감 차이와 raw 지표 일치 여부

## 실패 시 우선 확인할 것
- 인벤토리 CSV 오탈자
- 시드 이슈 repo/type 불일치
- `gh auth status` 실패
- `docs/06` 대상 저장소와 시드 이슈 coverage 어긋남
- 결과 스키마 복사 누락 또는 `RESULTS.md` 누락
