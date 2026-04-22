# ML / LLM / Audio / Multimodal Track

## 목표
브라우저 AI 트랙은 “모델이 돌아간다”를 넘어서 아래를 측정한다.

1. WebGPU vs Wasm fallback 차이
2. cold/warm cache 차이
3. worker 격리에 따른 UI 체감 품질
4. task별 최적 런타임 선택 기준
5. 정확도 parity와 속도를 동시에 만족하는가

## 우선순위 워크로드
### 1. Embeddings
저장소:
- `exp-embeddings-browser-throughput`
- `bench-embeddings-latency-quality`

핵심 지표:
- docs_per_sec
- queries_per_sec
- p50_ms / p95_ms
- recall_at_10

### 2. Reranker
저장소:
- `exp-reranker-browser`
- `bench-reranker-latency`

핵심 지표:
- pairs_per_sec
- topk_latency_ms
- rerank_gain_at_k

### 3. Browser RAG
저장소:
- `exp-rag-browser-pipeline`
- `app-private-rag-lab`
- `bench-rag-endtoend`

핵심 지표:
- ingest_ms_per_page
- embed_total_ms
- retrieve_ms
- rerank_ms
- answer_ttft_ms
- citation_hit_rate

### 4. Local LLM Chat
저장소:
- `exp-llm-chat-runtime-shootout`
- `app-local-chat-arena`
- `bench-llm-prefill-decode`

핵심 지표:
- ttft_ms
- prefill_tok_per_sec
- decode_tok_per_sec
- turn_latency_ms

### 5. Worker UX
저장소:
- `exp-llm-worker-ux`
- `bench-worker-isolation-and-ui-jank`

핵심 지표:
- main_thread_block_ms
- input_delay_ms
- frame_drop_rate
- cancel_response_ms

### 6. STT / Voice
저장소:
- `exp-stt-whisper-webgpu`
- `exp-voice-assistant-local`
- `app-voice-agent-lab`
- `bench-stt-streaming-latency`
- `bench-voice-roundtrip`

핵심 지표:
- audio_sec_per_sec
- first_partial_ms
- final_latency_ms
- wer / cer
- roundtrip_ms

### 7. VLM / Multimodal
저장소:
- `exp-vlm-browser-multimodal`
- `bench-multimodal-latency`

핵심 지표:
- image_preprocess_ms
- image_to_first_token_ms
- answer_total_ms

### 8. Diffusion
저장소:
- `exp-diffusion-webgpu-browser`
- `app-browser-image-lab`
- `bench-diffusion-browser-shootout`

핵심 지표:
- sec_per_image
- steps_per_sec
- resolution_success_rate
- oom_or_fail_rate

### 9. Browser Agent
저장소:
- `exp-browser-agent-local`
- `bench-agent-step-latency`

핵심 지표:
- task_success_rate
- avg_step_latency_ms
- tool_call_success_rate
- user_intervention_count

## 공통 벤치
- `bench-runtime-shootout`
- `bench-model-load-and-cache`
- `bench-worker-isolation-and-ui-jank`
- `bench-webgpu-vs-wasm-parity`

## 공통 원칙
- 항상 cold/warm 결과를 분리 기록
- WebGPU / Wasm 둘 다 가능한 경우 비교
- worker와 main thread를 분리 가능한 경우 둘 다 측정
- 결과 parity가 깨지면 성능보다 먼저 기록
