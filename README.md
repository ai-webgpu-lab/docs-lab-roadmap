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
- `scripts/seed-org-issues.sh` — 초기 draft issue CSV를 실제 GitHub issue로 시드하는 스크립트
- `scripts/validate-lab-planning.sh` — 인벤토리/이슈/실행 계획 문서 정합성 검증 스크립트
- `scripts/sync-org-labels.sh` — 조직 기본 라벨 동기화 스크립트
- `scripts/sync-org-repo-topics.sh` — 저장소 인벤토리 기준 토픽 동기화 스크립트

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
- `issues/initial-draft-issues-30.md` — 초기 draft issue 30개

## 사용 방법
```bash
bash scripts/validate-lab-planning.sh
bash scripts/bootstrap-org-repos.sh
bash scripts/bootstrap-org-repos.sh --refresh-readme --no-sync
bash scripts/bootstrap-org-repos.sh --refresh-generated --refresh-readme --no-sync
bash scripts/seed-org-issues.sh
bash scripts/sync-org-labels.sh
bash scripts/sync-org-repo-topics.sh
bash tests/test-validate-lab-planning.sh
bash tests/test-bootstrap-org-repos.sh
bash tests/test-bootstrap-org-repos-full-inventory.sh
bash tests/test-seed-org-issues.sh
```

위 스크립트와 테스트는 `docs/repo-inventory.csv`를 기준으로 조직 저장소를 부트스트랩하고, 계획 문서/시드 이슈 정합성을 검증하며, 기본 라벨과 GitHub topics를 정렬합니다.
실험/벤치/앱/템플릿 저장소에는 기본 `public/index.html`, `public/app.js`, `.github/workflows/deploy-pages.yml`이 함께 생성되어 GitHub Pages baseline probe를 바로 올릴 수 있습니다.
`repo-scaffolds/p0/<repo>/`에 전용 Pages baseline이 있는 저장소는 공통 probe 대신 저장소별 harness가 배치됩니다. 현재 대상은 `tpl-webgpu-vanilla`, `tpl-webgpu-react`, `bench-model-load-and-cache`, `bench-worker-isolation-and-ui-jank`입니다.
실제 앱 빌드가 필요한 저장소는 이후 각 저장소에서 build 단계와 artifact 경로를 교체해야 합니다.
기존 저장소의 README를 새 상세 포맷으로 다시 쓰려면 `--refresh-readme` 옵션을 사용합니다.
기존 저장소의 baseline probe와 생성 자산까지 다시 쓰려면 `--refresh-generated` 옵션을 함께 사용합니다.
