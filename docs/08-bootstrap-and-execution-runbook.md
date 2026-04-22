# Bootstrap and Execution Runbook

## 목적
이 문서는 `docs/07-master-experiment-plan.md`를 실제 운영 순서로 옮긴 실행용 런북이다. 목표는 문서, CSV, GitHub 조직 상태가 서로 어긋나지 않도록 먼저 고정하고, 그 다음 P0 baseline과 6주 실행을 밀어붙이는 것이다.

## 사전 조건
- `gh` 로그인 완료
- `jq`, `python3`, `rg`, `git` 설치 완료
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
bash tests/test-validate-lab-planning.sh
bash tests/test-bootstrap-org-repos.sh
bash tests/test-bootstrap-org-repos-full-inventory.sh
bash tests/test-seed-org-issues.sh
```

통과 기준:
- 계획 검증 테스트 통과
- 샘플 인벤토리 렌더링 통과
- 전체 인벤토리 렌더링 통과
- 시드 이슈 dry-run 출력 통과

### 3. GitHub 조직 반영
```bash
bash scripts/bootstrap-org-repos.sh
bash scripts/bootstrap-org-repos.sh --refresh-readme --no-sync
bash scripts/bootstrap-org-repos.sh --refresh-generated --refresh-readme --no-sync
bash scripts/sync-org-labels.sh
bash scripts/sync-org-repo-topics.sh
bash scripts/seed-org-issues.sh
```

통과 기준:
- 모든 인벤토리 저장소 존재 또는 정상 생성
- 공통 라벨과 토픽 적용 완료
- 초기 이슈가 중복 없이 생성됨
- Master Project에 이슈 연결 완료
- demo 대상 저장소가 GitHub Pages `workflow` source로 설정됨
- 기존 저장소 README가 최신 상세 포맷으로 갱신됨
- 기존 저장소 baseline probe 자산이 최신 공통 포맷으로 갱신됨

## Phase Gate
### Phase 0 — Organization Bootstrap
- `.github`, `tpl-*`, `shared-*`, `docs-*` 저장소가 모두 생성됨
- 각 저장소 설명, 토픽, 라벨이 인벤토리와 일치함
- 공통 스캐폴드와 결과 스키마 배포 경로가 확인됨

### Phase 1 — P0 Baseline
- `tpl-webgpu-vanilla`, `tpl-webgpu-react`, `shared-webgpu-capability`, `shared-bench-schema`, `docs-lab-roadmap`가 usable baseline 상태
- `exp-embeddings-browser-throughput`, `exp-llm-chat-runtime-shootout`, `exp-stt-whisper-webgpu`, `exp-rag-browser-pipeline`가 첫 runnable baseline 확보
- `bench-runtime-shootout`, `bench-model-load-and-cache`, `bench-worker-isolation-and-ui-jank`가 공통 측정 harness 확보
- demo 대상 저장소가 GitHub Pages에서 baseline probe 또는 저장소 전용 화면을 노출함

### Phase 2 — P1 Expansion
- 엔진/런타임 비교 실험이 최소 2축 이상 누적됨
- shared CI/workflow가 `shared-github-actions`로 재사용 가능해짐
- `app-private-rag-lab`, `app-local-chat-arena`가 내부 데모로 연결됨

### Phase 3 — P2 Research Portfolio
- 블랙홀, 멀티모달, 에이전트, diffusion, compute stress 트랙이 baseline 이상 상태
- 고난도 실험은 성능뿐 아니라 실패 조건과 fallback 한계까지 기록됨
- 분기 리뷰 시 Promote / Continue / Archive를 repo 단위로 판단 가능

## 주간 운영 기준
### Week 1
- 저장소 생성, 템플릿 배포, 첫 raw JSON 경로 확보

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
