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

## Repo-Specific Overrides
- `repo-scaffolds/p0/<repo>/` 아래 파일은 P0 저장소용 전용 Pages harness다.
- `repo-scaffolds/repos/<repo>/` 아래 파일은 P1/App 등 P0 이후 승격 후보용 전용 Pages harness다.
- P0 전용 baseline이 있는 저장소는 `tpl-webgpu-vanilla`, `tpl-webgpu-react`, `exp-embeddings-browser-throughput`, `exp-llm-chat-runtime-shootout`, `exp-stt-whisper-webgpu`, `exp-rag-browser-pipeline`, `bench-runtime-shootout`, `bench-model-load-and-cache`, `bench-worker-isolation-and-ui-jank`다.
- P0 이후 전용 baseline이 있는 저장소는 `exp-three-webgpu-core`, `exp-babylon-webgpu-core`, `exp-playcanvas-webgpu-core`, `exp-pixi-webgpu-2d`, `exp-luma-webgpu-viz`, `exp-deckgl-webgpu-readiness`, `exp-blackhole-three-singularity`, `exp-blackhole-kerr-engine`, `exp-blackhole-webgpu-fromscratch`, `exp-nbody-webgpu-core`, `exp-fluid-webgpu-core`, `exp-three-webgpu-particles-stress`, `bench-compute-stress-suite`, `bench-atomics-and-memory`, `bench-texture-upload-and-streaming`, `exp-reranker-browser`, `bench-embeddings-latency-quality`, `bench-reranker-latency`, `bench-rag-endtoend`, `bench-llm-prefill-decode`, `bench-stt-streaming-latency`, `bench-voice-roundtrip`, `bench-multimodal-latency`, `bench-diffusion-browser-shootout`, `bench-agent-step-latency`, `bench-webgpu-vs-wasm-parity`, `bench-blackhole-render-shootout`, `bench-renderer-shootout`, `exp-ort-webgpu-baseline`, `exp-webllm-browser-chat`, `exp-llm-worker-ux`, `exp-voice-assistant-local`, `exp-vlm-browser-multimodal`, `exp-diffusion-webgpu-browser`, `exp-browser-agent-local`, `app-private-rag-lab`, `app-local-chat-arena`, `app-voice-agent-lab`, `app-browser-image-lab`, `app-blackhole-observatory`다.
- 그 외 저장소는 공통 browser/device/WebGPU probe를 유지하고, 실제 workload harness가 생기면 전용 override로 승격한다.
