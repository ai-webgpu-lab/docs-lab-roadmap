# AI WebGPU Lab Bootstrap Bundle

`docs-lab-roadmap`는 `ai-webgpu-lab` 조직의 부트스트랩 문서와 운영 템플릿을 관리하는 기준 저장소입니다. 이 저장소를 기준으로 조직 공통 `.github` 저장소, 개별 실험 저장소, 벤치마크 저장소, 앱 저장소를 초기화하고 운영합니다.

## 현재 역할
- 조직 운영 개요와 저장소 전략의 source of truth
- 공통 `README.md` / `RESULTS.md` 템플릿 배포 기준
- 공통 JSON 결과 스키마와 보고 규칙 보관
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
- 이슈 템플릿 / PR 템플릿
- 기본 저장소 구조 예시

## 추천 반영 순서
1. `ai-webgpu-lab/.github`에 공통 템플릿과 조직 프로필 반영
2. `shared-*` 저장소와 템플릿 저장소 상태 점검
3. 우선순위 P0 저장소 메타데이터와 기본 문서 정렬
4. GitHub Projects `AI WebGPU Lab — Master` 생성
5. `issues/initial-draft-issues-30.md`의 항목을 issue로 등록
6. `docs/06-six-week-execution-plan.md` 기준으로 6주 스프린트 시작

## 운영 보조 파일
- `CONTRIBUTING.md` — 문서/조직 변경 작업 규칙
- `.github/CODEOWNERS` — 기본 리뷰 책임자
- `.github/ISSUE_TEMPLATE/` — 조직 공통 이슈 폼 초안
- `scripts/bootstrap-org-repos.sh` — 인벤토리 기준 전체 저장소 부트스트랩 스크립트
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
- `issues/initial-draft-issues-30.md` — 초기 draft issue 30개

## 사용 방법
```bash
bash scripts/bootstrap-org-repos.sh
bash scripts/sync-org-labels.sh
bash scripts/sync-org-repo-topics.sh
bash tests/test-bootstrap-org-repos.sh
bash tests/test-bootstrap-org-repos-full-inventory.sh
```

위 스크립트들은 `docs/repo-inventory.csv`를 기준으로 조직 저장소를 부트스트랩하고, 기본 라벨과 GitHub topics를 정렬합니다.
