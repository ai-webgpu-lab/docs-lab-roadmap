# Repository Scaffold Notes

모든 실험 저장소는 아래 구조를 권장합니다.

```text
repo/
  src/
  public/
    index.html
    .nojekyll
  reports/
    raw/
    screenshots/
    logs/
  .github/
    workflows/
      deploy-pages.yml
  schemas/
    ai-webgpu-lab-result.schema.json
  RESULTS.md
  README.md
```

## 최소 규칙
1. `README.md`는 질문/목표/범위/Done 기준을 포함
2. `RESULTS.md`는 실행 환경과 핵심 KPI를 포함
3. `reports/raw/*.json`는 공통 스키마를 통과
4. PR에는 결과 스냅샷 또는 로그 첨부
5. demo 대상 저장소는 `public/`와 GitHub Pages workflow를 유지
6. `public/index.html` + `public/app.js` baseline probe를 첫 실행 기준선으로 사용
7. framework/build 기반 데모는 공통 probe/workflow를 저장소 전용 build workflow로 교체
