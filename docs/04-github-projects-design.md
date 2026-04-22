# GitHub Projects Design

## 메인 프로젝트
- 이름: `AI WebGPU Lab — Master`

## 템플릿 프로젝트
- 이름: `AI WebGPU Lab — Quarterly Template`

## 추천 뷰
### 1. Portfolio (Table)
전체 실험/벤치/앱/문서를 한눈에 보는 기본 뷰

### 2. Execution (Board)
컬럼:
- Backlog
- Ready
- In Progress
- Validating
- Blocked
- Done

### 3. Roadmap (Roadmap)
- Start Date
- Target Date

### 4. Bench Dashboard (Table)
- `Type = benchmark`

### 5. Demo Readiness (Table)
- `Demo Ready != No`

### 6. Blockers & ADRs (Table)
- `Status = Blocked` 또는 `ADR Needed = Yes`

## 핵심 custom fields
### 필수
- Status
- Track
- Type
- Repo
- Library
- Priority
- Quarter
- Owner
- Start Date
- Target Date

### 이 조직에 특화된 필드
- Workload Kind
- Backend Target
- Browser Target
- Device Class
- Cache State Relevance
- Worker Sensitivity
- Benchmark Scenario
- Demo Ready
- Report Ready
- Risk
- ADR Needed
- Promote Candidate

## 추천 enum 값
### Track
- Graphics
- Blackhole
- ML
- LLM
- Audio
- Multimodal
- Agent
- Benchmark
- Integration
- Infra
- Docs

프로젝트 필드는 사람이 읽기 쉬운 Title Case를 쓰고, raw JSON / schema에서는 대응하는 lowercase slug를 사용한다.
예: `Graphics -> graphics`, `Agent -> agent`, `Infra -> infra`

### Type
- experiment
- benchmark
- integration
- infra
- docs
- decision
- bug
- feature
- research-note

### Backend Target
- WebGPU
- Wasm
- WebGL
- WebNN
- Mixed

### Demo Ready
- No
- Internal
- Public Candidate
- Public Live

### Report Ready
- No
- Draft
- Review
- Published

## 자동화 규칙
- 새 이슈 자동 등록
- PR 열림 → In Progress
- PR merge → Validating
- `blocked` 라벨 → Blocked
- `results-published` 라벨 → Report Ready = Published
- `demo-live` 라벨 → Demo Ready = Public Live

## 운영 리듬
### 주간
- 월: Execution 보드 정리
- 수: Blockers & ADRs 검토
- 금: Bench Dashboard 결과 반영

### 월간
- Demo Readiness 리뷰
- Promote / Continue / Archive 판단

### 분기말
- Done 항목 archive
- 분기 템플릿 복제
- auto-add workflow 재설정
