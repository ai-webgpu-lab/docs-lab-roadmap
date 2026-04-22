# Templates and Result Rules

## 공통 규칙
1. 모든 실험 저장소는 `README.md`, `RESULTS.md`, `reports/raw/*.json`를 갖는다.
2. `reports/raw/*.json`는 공통 스키마 검증을 통과해야 한다.
3. cold/warm 결과는 분리 기록한다.
4. fallback이 발생하면 반드시 이유를 기록한다.
5. PR merge 전 `RESULTS.md` 업데이트가 있어야 한다.

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
