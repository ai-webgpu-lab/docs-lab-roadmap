# Templates and Result Rules

## 공통 규칙
1. 모든 실험 저장소는 `README.md`, `RESULTS.md`, `reports/raw/*.json`를 갖는다.
2. `reports/raw/*.json`는 공통 스키마 검증을 통과해야 한다.
3. cold/warm 결과는 분리 기록한다.
4. fallback이 발생하면 반드시 이유를 기록한다.
5. PR merge 전 `RESULTS.md` 업데이트가 있어야 한다.
6. demo가 필요한 저장소는 `public/`와 `.github/workflows/deploy-pages.yml`을 통해 GitHub Pages에 배포 가능해야 한다.

## 공통 메트릭 카테고리
### Common
- time_to_interactive_ms
- init_ms
- success_rate
- peak_memory_note
- error_type

### Graphics / Blackhole
- avg_fps
- p95_frametime_ms
- scene_load_ms
- resolution_scale
- ray_steps
- taa_enabled
- visual_artifact_note

### Embeddings
- docs_per_sec
- queries_per_sec
- p50_ms
- p95_ms
- recall_at_10
- index_build_ms

### RAG
- ingest_ms_per_page
- chunk_count
- embed_total_ms
- retrieve_ms
- rerank_ms
- answer_ttft_ms
- answer_total_ms
- citation_hit_rate

### LLM
- ttft_ms
- prefill_tok_per_sec
- decode_tok_per_sec
- turn_latency_ms

### STT
- audio_sec_per_sec
- first_partial_ms
- final_latency_ms
- wer
- cer

### Voice
- roundtrip_ms
- interrupt_recovery_ms
- handsfree_success_rate

### VLM
- image_preprocess_ms
- image_to_first_token_ms
- answer_total_ms
- accuracy_task_score

### Diffusion
- sec_per_image
- steps_per_sec
- resolution_success_rate
- oom_or_fail_rate

### Agent
- task_success_rate
- avg_step_latency_ms
- tool_call_success_rate
- user_intervention_count

## 필드 매핑 메모
- `track`는 raw JSON에서 lowercase slug를 사용한다. 예: `agent`, `integration`, `infra`
- `backend`, `worker_mode`, `cache_state`는 workload가 아니라 environment 필드다.
- `context_tokens`, `output_tokens`는 metric이 아니라 workload 필드다.

## GitHub Pages Demo
- 기본 데모 엔트리 포인트는 `public/index.html`이다.
- 공통 probe 로직은 `public/app.js`에 위치하며, 브라우저/디바이스/WebGPU baseline을 캡처하고 schema-aligned JSON 초안을 export한다.
- `repo-scaffolds/p0/<repo>/` 또는 `repo-scaffolds/repos/<repo>/`가 존재하면 공통 probe 위에 저장소 전용 정적 harness를 덮어쓴다.
- 현재 P0 전용 baseline이 있는 저장소는 `tpl-webgpu-vanilla`, `tpl-webgpu-react`, `exp-embeddings-browser-throughput`, `exp-llm-chat-runtime-shootout`, `exp-stt-whisper-webgpu`, `exp-rag-browser-pipeline`, `bench-runtime-shootout`, `bench-model-load-and-cache`, `bench-worker-isolation-and-ui-jank`다.
- P0 이후 전용 baseline이 있는 저장소는 `exp-three-webgpu-core`, `exp-babylon-webgpu-core`, `exp-playcanvas-webgpu-core`, `exp-pixi-webgpu-2d`, `exp-luma-webgpu-viz`, `exp-deckgl-webgpu-readiness`, `exp-blackhole-three-singularity`, `exp-blackhole-kerr-engine`, `exp-blackhole-webgpu-fromscratch`, `exp-nbody-webgpu-core`, `exp-fluid-webgpu-core`, `exp-three-webgpu-particles-stress`, `bench-compute-stress-suite`, `bench-atomics-and-memory`, `bench-texture-upload-and-streaming`, `exp-reranker-browser`, `bench-embeddings-latency-quality`, `bench-reranker-latency`, `bench-rag-endtoend`, `bench-llm-prefill-decode`, `bench-stt-streaming-latency`, `bench-voice-roundtrip`, `bench-multimodal-latency`, `bench-diffusion-browser-shootout`, `bench-agent-step-latency`, `bench-webgpu-vs-wasm-parity`, `bench-blackhole-render-shootout`, `bench-renderer-shootout`, `exp-ort-webgpu-baseline`, `exp-webllm-browser-chat`, `exp-llm-worker-ux`, `exp-voice-assistant-local`, `exp-vlm-browser-multimodal`, `exp-diffusion-webgpu-browser`, `exp-browser-agent-local`, `app-private-rag-lab`, `app-local-chat-arena`, `app-voice-agent-lab`, `app-browser-image-lab`, `app-blackhole-observatory`, `.github`, `shared-webgpu-capability`, `shared-bench-schema`, `shared-github-actions`, `docs-lab-roadmap`다.
- 인프라 계열 (`.github`, `shared-webgpu-capability`, `shared-bench-schema`, `shared-github-actions`, `docs-lab-roadmap`)의 전용 baseline은 `track`이 `infra` 또는 `docs`이고, deterministic 인벤토리 카운트(issue forms, helper exports, schema fields, workflows, doc/script counts)와 baseline readiness score를 같은 결과 스키마로 기록한다.
- 위 7개 P0 workload 저장소의 전용 surface는 deterministic browser harness이며, 실제 runtime/model integration이 준비되면 같은 저장소 전용 Pages surface를 그대로 교체한다.
- 전용 baseline이 없는 나머지 `exp-*`, `bench-*`, `app-*` 저장소는 아직 공통 probe 단계이며, 실제 runtime/model harness가 준비되면 전용 Pages surface로 교체한다.
- GitHub Pages 배포는 custom workflow 방식으로 `actions/configure-pages@v6`, `actions/upload-pages-artifact@v5`, `actions/deploy-pages@v5`를 사용한다.
- 기본 workflow는 `public/`의 baseline probe 정적 artifact를 그대로 배포한다.
- Vite, React, Wasm bundling 등 실제 build가 필요한 저장소는 첫 runnable baseline 시점에 build job과 artifact path를 저장소별로 교체한다.
- 공통 probe 페이지는 첫 runnable baseline이 준비되면 저장소 전용 데모 UI나 workload harness로 교체한다.

## Raw Result Automation
- `scripts/capture-p0-baseline-results.mjs --repo-dir <path>`는 P0 workload 저장소와 일부 P1/App 승격 후보의 Pages harness를 headless Chromium으로 실행하고 `reports/raw/*.json`, `reports/screenshots/*.png`, `reports/logs/*.log`, `RESULTS.md`를 함께 갱신한다.
- `exp-embeddings-browser-throughput`, `exp-llm-chat-runtime-shootout`, `bench-runtime-shootout`는 deterministic `webgpu`/`fallback` query mode pair를 함께 캡처해 `RESULTS.md`에 compare section을 자동 생성한다.
- `scripts/render-results-summary.mjs --repo-dir <path>`는 이미 수집된 raw JSON만 다시 읽어서 `RESULTS.md`를 재생성한다.
- `scripts/seed-p0-baseline-results.sh --push`는 `tpl-webgpu-vanilla`, `tpl-webgpu-react`를 포함한 9개 browser-visible P0 baseline 저장소를 clone/update하고 위 capture 흐름을 실행한 뒤 결과 커밋까지 밀어 넣는 운영용 오케스트레이터다.
- 위 자동화는 첫 baseline raw result를 seed하는 목적이며, 이후 실제 runtime/model/renderer가 붙더라도 파일 구조와 결과 문서 경로는 그대로 유지한다.
