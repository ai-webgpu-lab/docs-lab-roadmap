# <repo-name>

`<purpose>`를 검증하거나 운영하는 저장소입니다. 이 README는 `ai-webgpu-lab` 저장소군에서 공통으로 사용하는 상세 문서 구조의 기준 템플릿입니다.

## 저장소 역할
- 이 저장소가 조직 전체에서 맡는 책임 1
- 실험/벤치/앱/공통 자산 중 어디에 속하는지
- 다른 저장소와 어떤 연결 관계를 갖는지

## 핵심 질문
- 이 저장소가 답하려는 핵심 질문 1
- 핵심 질문 2
- 결과가 어떤 의사결정에 쓰이는지

## 포함 범위
- 현재 저장소에서 직접 다룰 구현/실험/문서 범위
- 결과를 기록하고 검증하는 방식
- 필수 산출물과 증거 종류

## 비범위
- 이번 저장소에서 다루지 않을 것
- 다른 저장소로 분리해야 하는 책임
- 재현 불가능한 ad hoc 작업

## 기본 구조
- `src/` - 구현 코드 또는 baseline
- `public/` - GitHub Pages placeholder 또는 실제 정적 산출물
- `reports/raw/` - 원시 결과 파일
- `reports/screenshots/` - 스크린샷
- `reports/logs/` - 실행 로그
- `schemas/` - 결과 스키마
- `RESULTS.md` - 결과 요약

## 메타데이터
- Track: `<Graphics|Blackhole|ML|LLM|Audio|Multimodal|Agent|Benchmark|Integration|Infra|Docs>`
- Kind: `<experiment|benchmark|integration|infra|docs>`
- Priority: `<P0|P1|P2>`

## 현재 상태
- 초기 스캐폴드/첫 baseline/운영 상태를 한 줄씩 기록
- GitHub Pages 및 CI 상태
- 아직 비어 있는 부분과 다음 채움 순서

## GitHub Pages 운영 메모
- Pages URL: `<https://org.github.io/repo/>`
- 기본 workflow가 placeholder인지 실제 build-and-deploy인지 기록
- artifact 경로나 build 단계 특이사항

## 측정 및 검증 포인트
- metric 1
- metric 2
- metric 3

## 산출물
- demo
- benchmark summary
- report
- screenshots or logs

## 작업 및 갱신 절차
- baseline 구현
- install/dev/build/test 명령 명시
- raw 결과와 `RESULTS.md` 동기화
- README/Pages/CI 갱신

## 완료 기준
- 완료로 간주하는 구체 조건 1
- 구체 조건 2
- 관련 저장소로 넘길 수 있는 판단 근거

## 관련 저장소
- `shared-*`, `tpl-*`, `docs-*`, 관련 `exp-*`/`bench-*`/`app-*`

## 라이선스
MIT
