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

현재 readiness baseline:
- `exp-stt-whisper-webgpu`는 deterministic file transcription baseline으로 partial/final/WER/CER 보고 경로를 먼저 고정했다.
- `exp-voice-assistant-local`는 deterministic STT->intent->reply->TTS voice turn baseline으로 roundtrip, wake word, intent, fallback metadata를 먼저 고정했다.
- `bench-voice-roundtrip`는 deterministic voice-turn profile 비교와 WebGPU/fallback pair를 기반으로 roundtrip, first partial, WER/CER, TTS handoff metadata 보고 경로를 먼저 고정했다.
- `app-voice-agent-lab`는 deterministic voice turn과 browser-agent task deck을 한 앱 surface로 묶어 transcript, roundtrip, task success, intervention metadata 보고 경로를 먼저 고정했다.

### 7. VLM / Multimodal
저장소:
- `exp-vlm-browser-multimodal`
- `bench-multimodal-latency`

핵심 지표:
- image_preprocess_ms
- image_to_first_token_ms
- answer_total_ms

현재 readiness baseline:
- `exp-vlm-browser-multimodal`는 deterministic image fixture, prompt set, patch/focus metadata를 기반으로 image preprocess, first token, answer total, accuracy score 보고 경로를 먼저 고정했다.
- `bench-multimodal-latency`는 deterministic image-question fixture 비교와 WebGPU/fallback pair를 기반으로 image preprocess, first token, answer total, accuracy score benchmark 보고 경로를 먼저 고정했다.

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

현재 readiness baseline:
- `exp-diffusion-webgpu-browser`는 deterministic prompt fixture, scheduler/seed/resolution metadata, generated canvas output을 기반으로 sec per image, steps per sec, resolution success, fail-rate 보고 경로를 먼저 고정했다.
- `bench-diffusion-browser-shootout`는 deterministic diffusion profile 비교와 WebGPU/fallback pair를 기반으로 sec per image, steps per sec, resolution success, fail-rate benchmark 보고 경로를 먼저 고정했다.
- `app-browser-image-lab`는 deterministic source scene inspection과 prompt-to-image preview를 하나의 앱 surface로 묶어 multimodal answer latency와 diffusion generation metadata를 같은 결과 문서에 남긴다.

### 9. Browser Agent
저장소:
- `exp-browser-agent-local`
- `bench-agent-step-latency`

핵심 지표:
- task_success_rate
- avg_step_latency_ms
- tool_call_success_rate
- user_intervention_count

현재 readiness baseline:
- `exp-browser-agent-local`는 deterministic local task deck, tool catalog, step trace, intervention handling을 기반으로 task success, step latency, tool success, intervention count 보고 경로를 먼저 고정했다.
- `bench-agent-step-latency`는 deterministic browser-agent profile 비교와 WebGPU/fallback pair를 기반으로 task success, step latency, tool success, intervention benchmark 보고 경로를 먼저 고정했다.

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
