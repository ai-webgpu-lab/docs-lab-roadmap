# Repository Scaffold Notes

모든 실험 저장소는 아래 구조를 권장합니다.

```text
repo/
  src/
  public/
  reports/
    raw/
    screenshots/
    logs/
  schemas/
    ai-webgpu-lab-result.schema.json
  scripts/
    validate-results.mjs
  RESULTS.md
  README.md
```

## 최소 규칙
1. `README.md`는 질문/목표/범위/Done 기준을 포함
2. `RESULTS.md`는 실행 환경과 핵심 KPI를 포함
3. `reports/raw/*.json`는 공통 스키마를 통과
4. PR에는 결과 스냅샷 또는 로그 첨부
