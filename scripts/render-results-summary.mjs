#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const REPO_QUESTIONS = {
  "tpl-webgpu-vanilla": [
    "최소 WebGPU 스타터가 현재 브라우저에서 adapter/device 획득 또는 fallback 보고를 제대로 남기는가",
    "triangle sample frame pacing이 첫 baseline result로 재현 가능한가",
    "이 결과를 downstream raw WebGPU 실험의 출발점으로 사용할 수 있는가"
  ],
  "tpl-webgpu-react": [
    "React shell 위에서도 capability probe와 canvas mount flow를 결과 문서로 고정할 수 있는가",
    "no-build React starter가 fallback 또는 WebGPU 경로를 명확히 기록하는가",
    "후속 React 기반 실험 저장소의 첫 baseline으로 재사용 가능한가"
  ],
  "exp-three-webgpu-core": [
    "three.js 계열 그래픽스 baseline으로 넘기기 전에 scene load와 frame pacing 보고 경로를 먼저 고정할 수 있는가",
    "capability probe와 fallback state가 graphics 결과 문서에 같이 남는가",
    "실제 three.js 빌드 교체 전 deterministic scene harness로 반복 검증이 가능한가"
  ],
  "exp-babylon-webgpu-core": [
    "Babylon.js 계열 그래픽스 baseline으로 넘기기 전에 scene load와 frame pacing 보고 경로를 먼저 고정할 수 있는가",
    "material/submesh metadata와 fallback state가 graphics 결과 문서에 같이 남는가",
    "실제 Babylon.js WebGPU engine 교체 전 deterministic scene harness로 반복 검증이 가능한가"
  ],
  "exp-playcanvas-webgpu-core": [
    "PlayCanvas 계열 그래픽스 baseline으로 넘기기 전에 scene load와 frame pacing 보고 경로를 먼저 고정할 수 있는가",
    "entity/component/script metadata와 fallback state가 graphics 결과 문서에 같이 남는가",
    "실제 PlayCanvas WebGPU app 교체 전 deterministic scene harness로 반복 검증이 가능한가"
  ],
  "exp-blackhole-three-singularity": [
    "three.js/TSL 블랙홀 실험으로 넘기기 전에 lensing scene load와 frame pacing 보고 경로를 먼저 고정할 수 있는가",
    "ray step budget, TAA state, adaptive quality metadata가 graphics 결과 문서에 같이 남는가",
    "실제 WebGPU/WebGL renderer 교체 전 deterministic blackhole harness로 반복 검증이 가능한가"
  ],
  "exp-blackhole-kerr-engine": [
    "과학형 Kerr 블랙홀 엔진으로 넘기기 전에 geodesic integration cost와 frame pacing 보고 경로를 먼저 고정할 수 있는가",
    "spin, inclination, ray step budget, integration timing metadata가 graphics 결과 문서에 같이 남는가",
    "실제 Rust/WASM 및 WebGPU geodesic engine 교체 전 deterministic Kerr harness로 반복 검증이 가능한가"
  ],
  "exp-blackhole-webgpu-fromscratch": [
    "raw WebGPU 블랙홀 실험으로 넘기기 전에 shader/pipeline readiness와 frame pacing 보고 경로를 먼저 고정할 수 있는가",
    "shader line count, bind group, dispatch timing, ray step budget metadata가 graphics 결과 문서에 같이 남는가",
    "실제 WGSL/pipeline 구현 교체 전 deterministic raw WebGPU-style harness로 반복 검증이 가능한가"
  ],
  "exp-nbody-webgpu-core": [
    "N-body compute 실험으로 넘기기 전에 body count, workgroup size, dispatch timing 보고 경로를 먼저 고정할 수 있는가",
    "steps_per_sec, energy drift, atomics contention, thermal note metadata가 compute 결과 문서에 같이 남는가",
    "실제 WGSL compute kernel 교체 전 deterministic N-body harness로 반복 검증이 가능한가"
  ],
  "exp-fluid-webgpu-core": [
    "fluid compute 실험으로 넘기기 전에 particle count, grid resolution, pressure solve timing 보고 경로를 먼저 고정할 수 있는가",
    "steps_per_sec, pressure_solve_ms, divergence error, atomics contention, thermal note metadata가 compute 결과 문서에 같이 남는가",
    "실제 WGSL fluid kernel 교체 전 deterministic fluid harness로 반복 검증이 가능한가"
  ],
  "exp-three-webgpu-particles-stress": [
    "three.js particle/VFX stress 실험으로 넘기기 전에 particle count, emitter count, overdraw 보고 경로를 먼저 고정할 수 있는가",
    "draw calls, post-FX pass count, overdraw ratio, fallback metadata가 graphics 결과 문서에 같이 남는가",
    "실제 three.js WebGPU particle renderer 교체 전 deterministic particle stress harness로 반복 검증이 가능한가"
  ],
  "bench-compute-stress-suite": [
    "고정 N-body, fluid, particle-heavy compute fixture에서 공통 dispatch timing과 aggregate score를 함께 비교할 수 있는가",
    "하나의 benchmark result에서 winner selection, peak load, workgroup size, dispatch timing이 같은 결과 스키마로 기록되는가",
    "실제 WGSL compute kernels로 교체하기 전 deterministic compute stress suite protocol을 고정할 수 있는가"
  ],
  "bench-atomics-and-memory": [
    "고정 histogram, scatter accumulation, reduction fixture에서 contention과 memory bandwidth를 함께 비교할 수 있는가",
    "하나의 benchmark result에서 winner selection, peak items, shared memory, atomic passes, conflict/bandwidth가 같은 결과 스키마로 기록되는가",
    "실제 WGSL atomics 및 memory kernels로 교체하기 전 deterministic atomics benchmark protocol을 고정할 수 있는가"
  ],
  "bench-texture-upload-and-streaming": [
    "고정 atlas, tile, video texture fixture에서 upload burst와 sustained stream throughput을 함께 비교할 수 있는가",
    "하나의 benchmark result에서 winner selection, texture count, atlas memory, upload/background timing, frame-drop가 같은 결과 스키마로 기록되는가",
    "실제 image/tile/video streaming pipeline으로 교체하기 전 deterministic texture upload benchmark protocol을 고정할 수 있는가"
  ],
  "exp-pixi-webgpu-2d": [
    "PixiJS WebGPU 2D baseline으로 넘기기 전에 sprite batch scene load와 frame pacing 보고 경로를 먼저 고정할 수 있는가",
    "sprite count, atlas count, batch metadata와 fallback state가 graphics 결과 문서에 같이 남는가",
    "실제 PixiJS WebGPU renderer 교체 전 deterministic 2D harness로 반복 검증이 가능한가"
  ],
  "exp-luma-webgpu-viz": [
    "luma.gl WebGPU visualization baseline으로 넘기기 전에 layer scene load와 frame pacing 보고 경로를 먼저 고정할 수 있는가",
    "point count, layer count, attribute buffer metadata와 fallback state가 graphics 결과 문서에 같이 남는가",
    "실제 luma.gl WebGPU renderer 교체 전 deterministic visualization harness로 반복 검증이 가능한가"
  ],
  "exp-deckgl-webgpu-readiness": [
    "deck.gl WebGPU readiness baseline으로 넘기기 전에 map layer scene load와 frame pacing 보고 경로를 먼저 고정할 수 있는가",
    "viewport update, layer count, tile count, picking metadata와 fallback state가 graphics 결과 문서에 같이 남는가",
    "실제 deck.gl WebGPU renderer 교체 전 deterministic map visualization harness로 반복 검증이 가능한가"
  ],
  "bench-blackhole-render-shootout": [
    "같은 blackhole lensing fixture에서 renderer profile별 frame pacing과 품질 score를 비교할 수 있는가",
    "WebGPU primary와 fallback primary 실행 모드가 같은 benchmark protocol과 결과 스키마로 기록되는가",
    "실제 three.js/raw WebGPU/WebGL renderer 교체 전 winner selection과 ray step/TAA 기준을 고정할 수 있는가"
  ],
  "bench-renderer-shootout": [
    "같은 scene fixture에서 three.js, Babylon.js, PlayCanvas, raw WebGPU-style profile별 frame pacing과 품질 score를 비교할 수 있는가",
    "WebGPU primary와 fallback primary 실행 모드가 같은 renderer benchmark protocol과 결과 스키마로 기록되는가",
    "실제 renderer package 교체 전 winner selection, draw-call notes, TAA/resolution 기준을 고정할 수 있는가"
  ],
  "exp-embeddings-browser-throughput": [
    "cold index build와 warm query reuse 차이가 브라우저 내 deterministic fixture에서도 명확하게 드러나는가",
    "같은 fixture에서 recall@10과 throughput이 안정적으로 재현되는가",
    "cache state를 분리 기록했을 때 이후 실제 embedder 교체 전 baseline으로 쓸 수 있는가"
  ],
  "exp-llm-chat-runtime-shootout": [
    "같은 프롬프트와 출력 예산에서 runtime profile별 TTFT와 decode throughput 차이가 분명한가",
    "worker/main execution mode 차이가 결과 메타데이터에 남는가",
    "실제 runtime을 붙이기 전 deterministic readiness harness로 비교 프로토콜을 고정할 수 있는가"
  ],
  "exp-stt-whisper-webgpu": [
    "segment 단위 partial emission과 최종 완료 시간이 안정적으로 측정되는가",
    "reference transcript 기준 WER/CER가 보고 포맷에 그대로 반영되는가",
    "실제 Whisper runtime 연결 전 파일 전사 baseline 경로를 검증할 수 있는가"
  ],
  "exp-voice-assistant-local": [
    "로컬 voice assistant 실험으로 넘기기 전에 STT partial, final latency, roundtrip 보고 경로를 먼저 고정할 수 있는가",
    "wake word, intent route, TTS voice, fallback metadata가 audio 결과 문서에 같이 남는가",
    "실제 STT, local planner, TTS runtime 교체 전 deterministic voice-turn harness로 반복 검증이 가능한가"
  ],
  "exp-vlm-browser-multimodal": [
    "브라우저 VLM 실험으로 넘기기 전에 image preprocess, first-token, answer latency 보고 경로를 먼저 고정할 수 있는가",
    "patch count, focus region, accuracy score, fallback metadata가 multimodal 결과 문서에 같이 남는가",
    "실제 browser VLM runtime 교체 전 deterministic image-question harness로 반복 검증이 가능한가"
  ],
  "exp-diffusion-webgpu-browser": [
    "브라우저 diffusion 실험으로 넘기기 전에 sec per image, steps per sec, fail-rate 보고 경로를 먼저 고정할 수 있는가",
    "prompt tag, scheduler, seed, resolution, fallback metadata가 diffusion 결과 문서에 같이 남는가",
    "실제 browser diffusion runtime 교체 전 deterministic prompt-to-image harness로 반복 검증이 가능한가"
  ],
  "exp-browser-agent-local": [
    "브라우저 agent 실험으로 넘기기 전에 task success, step latency, intervention 보고 경로를 먼저 고정할 수 있는가",
    "workflow id, tool catalog, local-only page metadata, fallback metadata가 agent 결과 문서에 같이 남는가",
    "실제 browser control runtime 교체 전 deterministic local task-deck harness로 반복 검증이 가능한가"
  ],
  "bench-agent-step-latency": [
    "고정 browser-agent task deck에서 planner profile별 task success와 step latency를 같이 비교할 수 있는가",
    "WebGPU와 fallback 실행 모드가 같은 agent benchmark protocol과 결과 스키마로 기록되는가",
    "실제 browser controller/planner runtime 교체 전 tool success와 intervention 기준을 고정할 수 있는가"
  ],
  "exp-rag-browser-pipeline": [
    "browser-only ingest, chunk, retrieve, rerank, answer loop가 단일 보고 흐름으로 남는가",
    "citation hit-rate와 answer latency를 함께 기록할 수 있는가",
    "실제 embedder와 generator를 붙이기 전 deterministic fixture로 end-to-end 경로를 고정할 수 있는가"
  ],
  "exp-reranker-browser": [
    "고정 candidate set에서 reranker latency와 top-k quality를 단일 보고 흐름으로 남길 수 있는가",
    "backend/fallback metadata와 scoring p50/p95가 같은 raw result에 남는가",
    "실제 reranker runtime 연결 전 deterministic fixture로 비교 프로토콜을 고정할 수 있는가"
  ],
  "bench-embeddings-latency-quality": [
    "고정 document/query fixture에서 embedding profile별 latency와 retrieval quality를 같이 비교할 수 있는가",
    "WebGPU와 fallback 실행 모드가 같은 benchmark protocol과 결과 스키마로 기록되는가",
    "실제 browser embedder 교체 전 latency/quality tradeoff 판단 기준을 고정할 수 있는가"
  ],
  "bench-reranker-latency": [
    "고정 candidate fixture에서 reranker profile별 latency와 top-k quality를 같이 비교할 수 있는가",
    "WebGPU와 fallback 실행 모드가 같은 reranker benchmark protocol로 기록되는가",
    "실제 reranker runtime 교체 전 batch contract와 결과 파일명을 고정할 수 있는가"
  ],
  "bench-rag-endtoend": [
    "고정 local document/query fixture에서 ingest, embed, retrieve, rerank, answer 단계를 한 번에 비교할 수 있는가",
    "WebGPU와 fallback 실행 모드가 같은 RAG end-to-end benchmark protocol로 기록되는가",
    "실제 embedder/reranker/generator 교체 전 stage별 latency와 citation quality 기준을 고정할 수 있는가"
  ],
  "bench-llm-prefill-decode": [
    "고정 prompt/context/output budget에서 LLM profile별 prefill과 decode 성능을 같이 비교할 수 있는가",
    "WebGPU와 fallback 실행 모드가 같은 LLM prefill/decode benchmark protocol로 기록되는가",
    "실제 browser LLM runtime 교체 전 TTFT, prefill tok/s, decode tok/s, turn latency 기준을 고정할 수 있는가"
  ],
  "bench-stt-streaming-latency": [
    "고정 audio/transcript fixture에서 STT profile별 first partial latency와 final latency를 같이 비교할 수 있는가",
    "WebGPU와 fallback 실행 모드가 같은 streaming STT benchmark protocol로 기록되는가",
    "실제 Whisper runtime 교체 전 WER/CER와 streaming latency 기준을 고정할 수 있는가"
  ],
  "bench-voice-roundtrip": [
    "고정 voice-turn fixture에서 STT, intent, reply, TTS profile별 roundtrip latency와 transcript quality를 같이 비교할 수 있는가",
    "WebGPU와 fallback 실행 모드가 같은 voice benchmark protocol과 결과 스키마로 기록되는가",
    "실제 voice stack 교체 전 roundtrip_ms와 transcript quality 기준을 고정할 수 있는가"
  ],
  "bench-multimodal-latency": [
    "고정 image-question fixture에서 multimodal profile별 preprocess, first-token, answer latency를 같이 비교할 수 있는가",
    "WebGPU와 fallback 실행 모드가 같은 multimodal benchmark protocol과 결과 스키마로 기록되는가",
    "실제 browser VLM runtime 교체 전 answer_total_ms와 accuracy 기준을 고정할 수 있는가"
  ],
  "bench-diffusion-browser-shootout": [
    "고정 prompt-to-image fixture에서 diffusion profile별 sec per image와 steps per sec 차이를 같이 비교할 수 있는가",
    "WebGPU와 fallback 실행 모드가 같은 diffusion benchmark protocol과 결과 스키마로 기록되는가",
    "실제 browser diffusion runtime 교체 전 resolution_success_rate와 oom_or_fail_rate 기준을 고정할 수 있는가"
  ],
  "bench-webgpu-vs-wasm-parity": [
    "고정 numeric kernel fixture에서 WebGPU-style output과 Wasm-style output의 오차를 비교할 수 있는가",
    "WebGPU primary와 fallback primary 실행 모드가 같은 tolerance contract로 기록되는가",
    "실제 WebGPU/Wasm kernel 교체 전 pass rate, max abs error, max relative error 기준을 고정할 수 있는가"
  ],
  "exp-ort-webgpu-baseline": [
    "ORT-Web style provider baseline에서 WebGPU와 Wasm fallback 메타데이터를 같은 포맷으로 기록할 수 있는가",
    "같은 입력 프로필에서 first output latency와 throughput 차이가 재현되는가",
    "실제 ONNX Runtime Web integration 전에 provider/run protocol을 고정할 수 있는가"
  ],
  "app-private-rag-lab": [
    "내부 데모 surface에서 private-note ingest, retrieve, answer 흐름을 한 번에 검증할 수 있는가",
    "local-only 상태와 citation hit-rate가 앱 결과 문서에 함께 남는가",
    "실제 embedder/generator/provider 연결 전 private RAG app protocol을 고정할 수 있는가"
  ],
  "app-voice-agent-lab": [
    "하나의 앱 surface에서 wake word, transcript, task routing, TTS handoff를 한 번에 검증할 수 있는가",
    "voice roundtrip과 browser-agent task metrics가 같은 앱 결과 문서에 함께 남는가",
    "실제 STT/planner/TTS/provider 연결 전 voice-agent app protocol을 고정할 수 있는가"
  ],
  "app-browser-image-lab": [
    "하나의 앱 surface에서 source scene inspection과 prompt-to-image preview를 함께 검증할 수 있는가",
    "multimodal answer latency와 diffusion generation metrics가 같은 앱 결과 문서에 함께 남는가",
    "실제 VLM/diffusion/provider 연결 전 image app protocol을 고정할 수 있는가"
  ],
  "app-blackhole-observatory": [
    "하나의 앱 surface에서 blackhole preset review와 renderer selection을 함께 검증할 수 있는가",
    "graphics 성능 지표와 blackhole observatory telemetry가 같은 앱 결과 문서에 함께 남는가",
    "실제 renderer/physics/provider 연결 전 blackhole app protocol을 고정할 수 있는가"
  ],
  "exp-webllm-browser-chat": [
    "WebLLM-style 브라우저 채팅 baseline이 단일 결과 문서로 고정되는가",
    "같은 prompt budget에서 fallback 메타데이터와 worker mode가 함께 기록되는가",
    "후속 local chat demo로 승격하기 전에 readiness harness로 재사용 가능한가"
  ],
  "exp-llm-worker-ux": [
    "같은 prompt/output budget에서 worker와 main-thread 실행 차이를 한 결과 문서로 비교할 수 있는가",
    "TTFT, decode throughput, turn latency와 responsiveness note가 함께 남는가",
    "실제 runtime worker integration 전에 UX 비교 프로토콜을 고정할 수 있는가"
  ],
  "bench-runtime-shootout": [
    "동일 prompt/output budget에서 runtime profile별 상대 우위를 단일 benchmark draft로 고정할 수 있는가",
    "winner selection과 비교 메모가 raw JSON과 RESULTS.md 양쪽에 일관되게 남는가",
    "실제 runtime 교체 전 fixed-scenario benchmark protocol이 재현 가능한가"
  ],
  "bench-model-load-and-cache": [
    "cold load와 warm load의 total/init delta가 cache state와 함께 재현되는가",
    "prepared artifact hit 여부가 raw JSON과 결과 문서에서 같이 보이는가",
    "실제 model/runtime 교체 전 cache benchmark 프로토콜을 고정할 수 있는가"
  ],
  "bench-worker-isolation-and-ui-jank": [
    "같은 burn profile에서 main thread와 worker execution의 responsiveness 차이가 측정되는가",
    "frame pacing, timer lag, input lag 관련 메모를 결과 문서에 연결할 수 있는가",
    "실제 heavy runtime을 붙이기 전 UI jank benchmark baseline으로 쓸 수 있는가"
  ],
  "app-local-chat-arena": [
    "하나의 앱 surface에서 두 local-chat profile을 같은 prompt budget으로 비교할 수 있는가",
    "winner summary와 세부 메트릭이 앱 결과 문서에 동시에 남는가",
    "benchmark-only surface에서 demo-ready arena로 승격할 최소 기준을 만들 수 있는가"
  ],
  ".github": [
    "조직 공통 issue/PR/profile/CONTRIBUTING/RESULTS-template inventory가 deterministic 결과 문서로 고정되는가",
    "issue 폼 수, profile 섹션 수, codeowners 존재 여부 등 community surface 지표가 같은 결과 스키마로 기록되는가",
    "조직 템플릿이 변할 때 fixture와 readiness baseline이 같이 움직이는 운영 체계를 유지할 수 있는가"
  ],
  "shared-webgpu-capability": [
    "shared 공통 helper로 WebGPU capability와 baseline 결과를 같은 스키마로 만들어 낼 수 있는가",
    "feature/limit count와 capability coverage가 결과 문서에 그대로 남는가",
    "consumer 저장소가 이 helper를 갖다 쓰기 전에 deterministic baseline harness로 계약을 검증할 수 있는가"
  ],
  "shared-bench-schema": [
    "shared 결과 스키마/RESULTS 템플릿/example payload의 field/group/enum 카운트가 deterministic하게 기록되는가",
    "metric group, track enum, status enum size가 readiness baseline 결과 스키마에 그대로 남는가",
    "schema 변경 시 fixture와 baseline이 같이 움직여 consumer drift를 미리 감지할 수 있는가"
  ],
  "shared-github-actions": [
    "shared CI reusable workflow 인벤토리(이름/입력/소비자)가 deterministic 결과 문서로 고정되는가",
    "workflow count, total inputs, consumer scenarios 지표가 같은 결과 스키마에 남는가",
    "reusable workflow 추가/변경 시 fixture와 readiness baseline이 같이 움직이는 운영 체계를 유지할 수 있는가"
  ],
  "docs-lab-roadmap": [
    "docs/scripts/templates/schemas surface와 inventory P0/P1/P2 카운트가 deterministic 결과 문서로 고정되는가",
    "문서 수, 스크립트 수, 템플릿 수, 카테고리 수가 readiness baseline 결과 스키마에 그대로 남는가",
    "로드맵/계획 문서가 변할 때 fixture와 baseline이 같이 움직이는 운영 체계를 유지할 수 있는가"
  ]
};

const SCENARIO_LABELS = {
  "tpl-webgpu-vanilla": {
    "minimal-webgpu-starter": "Minimal WebGPU Starter"
  },
  "tpl-webgpu-react": {
    "react-webgpu-starter": "React WebGPU Starter"
  },
  "exp-three-webgpu-core": {
    "three-webgpu-scene-readiness": "Three Scene Readiness"
  },
  "exp-babylon-webgpu-core": {
    "babylon-webgpu-scene-readiness": "Babylon Scene Readiness"
  },
  "exp-playcanvas-webgpu-core": {
    "playcanvas-webgpu-scene-readiness": "PlayCanvas Scene Readiness"
  },
  "exp-blackhole-three-singularity": {
    "blackhole-three-singularity-readiness": "Blackhole Singularity Readiness"
  },
  "exp-blackhole-kerr-engine": {
    "blackhole-kerr-engine-readiness": "Kerr Engine Readiness"
  },
  "exp-blackhole-webgpu-fromscratch": {
    "blackhole-webgpu-fromscratch-readiness": "Raw WebGPU Blackhole Readiness"
  },
  "exp-nbody-webgpu-core": {
    "nbody-webgpu-core-readiness": "N-Body Compute Readiness"
  },
  "exp-fluid-webgpu-core": {
    "fluid-webgpu-core-readiness": "Fluid Compute Readiness"
  },
  "exp-three-webgpu-particles-stress": {
    "three-webgpu-particles-stress-readiness": "Three Particles Stress Readiness"
  },
  "bench-compute-stress-suite": {
    "compute-stress-suite-benchmark": "Compute Stress Suite Benchmark"
  },
  "bench-atomics-and-memory": {
    "atomics-and-memory-benchmark": "Atomics and Memory Benchmark"
  },
  "bench-texture-upload-and-streaming": {
    "texture-upload-and-streaming-benchmark": "Texture Upload and Streaming Benchmark"
  },
  "exp-pixi-webgpu-2d": {
    "pixi-webgpu-2d-readiness": "Pixi 2D Readiness"
  },
  "exp-luma-webgpu-viz": {
    "luma-webgpu-viz-readiness": "Luma Viz Readiness"
  },
  "exp-deckgl-webgpu-readiness": {
    "deckgl-webgpu-readiness": "Deck.gl Readiness"
  },
  "bench-blackhole-render-shootout": {
    "blackhole-render-shootout-webgpu": "Blackhole Render Shootout / WebGPU",
    "blackhole-render-shootout-fallback": "Blackhole Render Shootout / Fallback"
  },
  "bench-renderer-shootout": {
    "renderer-shootout-webgpu": "Renderer Shootout / WebGPU",
    "renderer-shootout-fallback": "Renderer Shootout / Fallback"
  },
  "exp-embeddings-browser-throughput": {
    "synthetic-embeddings-cold": "Cold Index",
    "synthetic-embeddings-warm": "Warm Query",
    "synthetic-embeddings-cold-webgpu": "Cold Index / WebGPU",
    "synthetic-embeddings-warm-webgpu": "Warm Query / WebGPU",
    "synthetic-embeddings-cold-fallback": "Cold Index / Fallback",
    "synthetic-embeddings-warm-fallback": "Warm Query / Fallback"
  },
  "exp-llm-chat-runtime-shootout": {
    "runtime-profile-webllm-style": "WebLLM-style",
    "runtime-profile-transformersjs-style": "Transformers.js-style",
    "runtime-profile-webllm-style-webgpu": "WebLLM-style / WebGPU",
    "runtime-profile-transformersjs-style-webgpu": "Transformers.js-style / WebGPU",
    "runtime-profile-webllm-style-fallback": "WebLLM-style / Fallback",
    "runtime-profile-transformersjs-style-fallback": "Transformers.js-style / Fallback"
  },
  "exp-stt-whisper-webgpu": {
    "file-transcription-readiness": "File Transcription"
  },
  "exp-voice-assistant-local": {
    "voice-assistant-local-readiness": "Voice Assistant Local Readiness"
  },
  "exp-vlm-browser-multimodal": {
    "vlm-browser-multimodal-readiness": "Browser VLM Multimodal Readiness"
  },
  "exp-diffusion-webgpu-browser": {
    "diffusion-webgpu-browser-readiness": "Diffusion Browser Readiness"
  },
  "exp-browser-agent-local": {
    "browser-agent-local-readiness": "Browser Agent Local Readiness"
  },
  "bench-agent-step-latency": {
    "agent-step-latency-webgpu": "Agent Step Latency / WebGPU",
    "agent-step-latency-fallback": "Agent Step Latency / Fallback"
  },
  "exp-rag-browser-pipeline": {
    "browser-rag-fixture": "Browser RAG Fixture"
  },
  "exp-reranker-browser": {
    "browser-reranker-readiness": "Browser Reranker"
  },
  "bench-embeddings-latency-quality": {
    "embeddings-latency-quality-webgpu": "Embeddings Quality / WebGPU",
    "embeddings-latency-quality-fallback": "Embeddings Quality / Fallback"
  },
  "bench-reranker-latency": {
    "reranker-latency-webgpu": "Reranker Latency / WebGPU",
    "reranker-latency-fallback": "Reranker Latency / Fallback"
  },
  "bench-rag-endtoend": {
    "rag-endtoend-webgpu": "RAG End-to-End / WebGPU",
    "rag-endtoend-fallback": "RAG End-to-End / Fallback"
  },
  "bench-llm-prefill-decode": {
    "llm-prefill-decode-webgpu": "LLM Prefill Decode / WebGPU",
    "llm-prefill-decode-fallback": "LLM Prefill Decode / Fallback"
  },
  "bench-stt-streaming-latency": {
    "stt-streaming-latency-webgpu": "STT Streaming / WebGPU",
    "stt-streaming-latency-fallback": "STT Streaming / Fallback"
  },
  "bench-voice-roundtrip": {
    "voice-roundtrip-webgpu": "Voice Roundtrip / WebGPU",
    "voice-roundtrip-fallback": "Voice Roundtrip / Fallback"
  },
  "bench-multimodal-latency": {
    "multimodal-latency-webgpu": "Multimodal Latency / WebGPU",
    "multimodal-latency-fallback": "Multimodal Latency / Fallback"
  },
  "bench-diffusion-browser-shootout": {
    "diffusion-browser-shootout-webgpu": "Diffusion Shootout / WebGPU",
    "diffusion-browser-shootout-fallback": "Diffusion Shootout / Fallback"
  },
  "bench-webgpu-vs-wasm-parity": {
    "webgpu-wasm-parity-webgpu": "WebGPU Wasm Parity / WebGPU",
    "webgpu-wasm-parity-fallback": "WebGPU Wasm Parity / Fallback"
  },
  "exp-ort-webgpu-baseline": {
    "ort-webgpu-baseline-webgpu": "ORT WebGPU Provider",
    "ort-webgpu-baseline-fallback": "ORT Wasm Fallback"
  },
  "app-private-rag-lab": {
    "private-rag-lab-demo": "Private RAG Lab"
  },
  "app-voice-agent-lab": {
    "voice-agent-lab-demo": "Voice Agent Lab"
  },
  "app-browser-image-lab": {
    "browser-image-lab-demo": "Browser Image Lab"
  },
  "app-blackhole-observatory": {
    "blackhole-observatory-demo": "Blackhole Observatory"
  },
  "exp-webllm-browser-chat": {
    "webllm-browser-chat-readiness-webgpu": "WebLLM Browser Chat",
    "webllm-browser-chat-readiness-fallback": "WebLLM Browser Chat / Fallback"
  },
  "exp-llm-worker-ux": {
    "llm-worker-ux-worker": "LLM Worker Mode",
    "llm-worker-ux-main": "LLM Main Mode"
  },
  "bench-runtime-shootout": {
    "runtime-benchmark-webllm-style": "Runtime Benchmark Winner: WebLLM-style",
    "runtime-benchmark-transformersjs-style": "Runtime Benchmark Winner: Transformers.js-style",
    "runtime-benchmark-ort-webgpu-style": "Runtime Benchmark Winner: ORT WebGPU-style",
    "runtime-benchmark-webllm-style-webgpu": "Runtime Benchmark Winner: WebLLM-style / WebGPU",
    "runtime-benchmark-transformersjs-style-webgpu": "Runtime Benchmark Winner: Transformers.js-style / WebGPU",
    "runtime-benchmark-ort-webgpu-style-webgpu": "Runtime Benchmark Winner: ORT WebGPU-style / WebGPU",
    "runtime-benchmark-webllm-style-fallback": "Runtime Benchmark Winner: WebLLM-style / Fallback",
    "runtime-benchmark-transformersjs-style-fallback": "Runtime Benchmark Winner: Transformers.js-style / Fallback",
    "runtime-benchmark-ort-webgpu-style-fallback": "Runtime Benchmark Winner: ORT WebGPU-style / Fallback"
  },
  "bench-model-load-and-cache": {
    "model-load-cold": "Cold Load",
    "model-load-warm": "Warm Load"
  },
  "bench-worker-isolation-and-ui-jank": {
    "worker-isolation-main": "Main Thread Burn",
    "worker-isolation-worker": "Worker Burn"
  },
  "app-local-chat-arena": {
    "local-chat-arena-demo": "Local Chat Arena"
  },
  ".github": {
    "dotgithub-community-baseline": ".github Community Audit"
  },
  "shared-webgpu-capability": {
    "shared-webgpu-capability-baseline": "shared-webgpu-capability Probe"
  },
  "shared-bench-schema": {
    "shared-bench-schema-baseline": "shared-bench-schema Audit"
  },
  "shared-github-actions": {
    "shared-github-actions-baseline": "shared-github-actions Inventory"
  },
  "docs-lab-roadmap": {
    "docs-lab-roadmap-baseline": "docs-lab-roadmap Inventory"
  }
};

function parseArgs(argv) {
  const options = {
    output: "RESULTS.md"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--repo-dir") {
      options.repoDir = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === "--output") {
      options.output = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === "--stdout") {
      options.stdout = true;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  if (!options.repoDir) {
    throw new Error("Missing required argument: --repo-dir");
  }

  return options;
}

function shortCommit(commit) {
  if (!commit) {
    return "unknown";
  }

  return String(commit).slice(0, 12);
}

function round(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return null;
  }

  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function formatNumber(value, digits = 2) {
  const rounded = round(value, digits);
  return rounded === null ? "-" : String(rounded);
}

function formatNumberWithUnit(value, unit, digits = 2) {
  const rounded = round(value, digits);
  return rounded === null ? "-" : `${rounded} ${unit}`;
}

function formatBoolean(value) {
  if (value === true) {
    return "true";
  }

  if (value === false) {
    return "false";
  }

  return "unknown";
}

function uniqueValues(values) {
  return [...new Set(values.filter((value) => value !== undefined && value !== null && value !== ""))];
}

function summarizeValues(values, fallback = "-") {
  const unique = uniqueValues(values);
  if (!unique.length) {
    return fallback;
  }

  return unique.length === 1 ? String(unique[0]) : unique.join(", ");
}

function summarizeRange(values, unit = "", digits = 2) {
  const numbers = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  if (!numbers.length) {
    return "-";
  }

  const min = round(Math.min(...numbers), digits);
  const max = round(Math.max(...numbers), digits);
  const suffix = unit ? ` ${unit}` : "";
  return min === max ? `${min}${suffix}` : `${min} ~ ${max}${suffix}`;
}

function compareRuns(left, right) {
  return new Date(left.meta.timestamp).getTime() - new Date(right.meta.timestamp).getTime();
}

function scenarioLabel(repoName, result) {
  return SCENARIO_LABELS[repoName]?.[result.meta.scenario] || result.meta.scenario;
}

function executionModeLabel(result) {
  return result.environment?.fallback_triggered ? "Fallback" : "WebGPU";
}

function formatDelta(current, baseline, digits = 2, unit = "") {
  const currentNumber = Number(current);
  const baselineNumber = Number(baseline);
  if (!Number.isFinite(currentNumber) || !Number.isFinite(baselineNumber)) {
    return "-";
  }

  const rounded = round(currentNumber - baselineNumber, digits);
  const prefix = rounded > 0 ? "+" : "";
  const suffix = unit ? ` ${unit}` : "";
  return `${prefix}${rounded}${suffix}`;
}

function experimentType(repoName, result) {
  if (repoName.startsWith("bench-")) {
    return "benchmark";
  }

  if (repoName.startsWith("app-")) {
    return "integration";
  }

  const track = result.meta.track;
  if (track === "audio") {
    return "audio";
  }

  if (track === "llm") {
    return "llm";
  }

  if (track === "benchmark") {
    return "benchmark";
  }

  return track || "integration";
}

function isInfraRepo(repoName) {
  return repoName === ".github" || repoName === "shared-webgpu-capability" || repoName === "shared-bench-schema" || repoName === "shared-github-actions" || repoName === "docs-lab-roadmap";
}

function workloadHeading(repoName, type) {
  if (isInfraRepo(repoName)) {
    if (repoName === "docs-lab-roadmap") {
      return "Docs / Roadmap";
    }
    return "Org / Infra";
  }
  if (repoName === "bench-compute-stress-suite" || repoName === "bench-atomics-and-memory") {
    return "Compute / Stress";
  }

  if (repoName === "bench-texture-upload-and-streaming" || repoName === "bench-worker-isolation-and-ui-jank" || repoName === "bench-blackhole-render-shootout" || repoName === "bench-renderer-shootout" || repoName === "exp-three-webgpu-core" || repoName === "exp-babylon-webgpu-core" || repoName === "exp-playcanvas-webgpu-core" || type === "graphics" || type === "blackhole") {
    return "Graphics / Blackhole";
  }

  if (repoName === "app-voice-agent-lab") {
    return "Voice Agent";
  }

  if (repoName === "app-browser-image-lab") {
    return "Image / Multimodal";
  }

  if (repoName === "app-blackhole-observatory") {
    return "Graphics / Blackhole";
  }

  if (repoName === "exp-stt-whisper-webgpu" || repoName === "bench-stt-streaming-latency" || repoName === "bench-voice-roundtrip" || repoName === "exp-voice-assistant-local" || type === "audio") {
    return "STT / Voice";
  }

  if (repoName === "exp-diffusion-webgpu-browser" || repoName === "bench-diffusion-browser-shootout") {
    return "Diffusion";
  }

  if (repoName === "exp-vlm-browser-multimodal" || repoName === "bench-multimodal-latency" || type === "multimodal") {
    return "VLM / Multimodal";
  }

  if (repoName === "exp-browser-agent-local" || repoName === "bench-agent-step-latency" || type === "agent") {
    return "Browser Agent";
  }

  if (repoName === "exp-rag-browser-pipeline" || repoName === "app-private-rag-lab" || repoName === "bench-rag-endtoend") {
    return "RAG";
  }

  if (repoName === "bench-runtime-shootout" || repoName === "bench-model-load-and-cache" || repoName === "bench-llm-prefill-decode" || repoName === "exp-llm-chat-runtime-shootout" || repoName === "exp-ort-webgpu-baseline" || repoName === "exp-webllm-browser-chat" || repoName === "exp-llm-worker-ux" || repoName === "app-local-chat-arena" || type === "llm") {
    return "LLM / Benchmark";
  }

  if (repoName === "bench-embeddings-latency-quality" || type === "ml") {
    return "Embeddings / ML";
  }

  return "Workload";
}

function runTableMetrics(repoName, result) {
  switch (repoName) {
    case "exp-embeddings-browser-throughput":
    case "exp-reranker-browser":
    case "bench-embeddings-latency-quality":
    case "bench-reranker-latency":
      return {
        mean: formatNumber(result.metrics.embeddings?.docs_per_sec),
        p95: formatNumber(result.metrics.embeddings?.p95_ms),
        notes: `queries/s=${formatNumber(result.metrics.embeddings?.queries_per_sec)}, recall/top-k=${formatNumber(result.metrics.embeddings?.recall_at_10)}, metric=docs/s`
      };
    case "tpl-webgpu-vanilla":
    case "tpl-webgpu-react":
    case "exp-three-webgpu-core":
    case "exp-babylon-webgpu-core":
    case "exp-playcanvas-webgpu-core":
    case "exp-blackhole-three-singularity":
    case "exp-blackhole-kerr-engine":
    case "exp-blackhole-webgpu-fromscratch":
    case "exp-pixi-webgpu-2d":
    case "exp-luma-webgpu-viz":
    case "exp-deckgl-webgpu-readiness":
    case "bench-blackhole-render-shootout":
    case "bench-renderer-shootout":
      return {
        mean: formatNumber(result.metrics.graphics?.avg_fps),
        p95: formatNumber(result.metrics.graphics?.p95_frametime_ms),
        notes: `scene_load=${formatNumber(result.metrics.graphics?.scene_load_ms)} ms, fallback=${formatBoolean(result.environment.fallback_triggered)}`
      };
    case "exp-llm-chat-runtime-shootout":
    case "exp-ort-webgpu-baseline":
    case "exp-webllm-browser-chat":
    case "exp-llm-worker-ux":
    case "bench-llm-prefill-decode":
    case "app-local-chat-arena":
      return {
        mean: formatNumber(result.metrics.llm?.decode_tok_per_sec),
        p95: formatNumber(result.metrics.llm?.ttft_ms),
        notes: `prefill=${formatNumber(result.metrics.llm?.prefill_tok_per_sec)} tok/s, metric=decode tok/s / TTFT ms`
      };
    case "exp-stt-whisper-webgpu":
    case "bench-stt-streaming-latency":
      return {
        mean: formatNumber(result.metrics.stt?.audio_sec_per_sec),
        p95: formatNumber(result.metrics.stt?.final_latency_ms),
        notes: `first_partial=${formatNumber(result.metrics.stt?.first_partial_ms)} ms, WER=${formatNumber(result.metrics.stt?.wer, 4)}`
      };
    case "bench-voice-roundtrip":
    case "exp-voice-assistant-local":
      return {
        mean: formatNumber(result.metrics.stt?.audio_sec_per_sec),
        p95: formatNumber(result.metrics.stt?.roundtrip_ms),
        notes: `first_partial=${formatNumber(result.metrics.stt?.first_partial_ms)} ms, final=${formatNumber(result.metrics.stt?.final_latency_ms)} ms, WER=${formatNumber(result.metrics.stt?.wer, 4)}`
      };
    case "app-voice-agent-lab":
      return {
        mean: formatNumber(result.metrics.stt?.roundtrip_ms),
        p95: formatNumber(result.metrics.agent?.avg_step_latency_ms),
        notes: `task_success=${formatNumber(result.metrics.agent?.task_success_rate)}, tool_success=${formatNumber(result.metrics.agent?.tool_call_success_rate)}`
      };
    case "app-browser-image-lab":
      return {
        mean: formatNumber(result.metrics.vlm?.answer_total_ms),
        p95: formatNumber(result.metrics.diffusion?.sec_per_image),
        notes: `accuracy=${formatNumber(result.metrics.vlm?.accuracy_task_score)}, steps_per_sec=${formatNumber(result.metrics.diffusion?.steps_per_sec)}`
      };
    case "app-blackhole-observatory":
      return {
        mean: formatNumber(result.metrics.graphics?.avg_fps),
        p95: formatNumber(result.metrics.graphics?.p95_frametime_ms),
        notes: `renderer=${result.workload?.model_id || "-"}, science=${formatNumber(result.metrics.blackhole?.science_alignment_score)}, score=${formatNumber(result.metrics.blackhole?.renderer_consensus_score)}`
      };
    case "exp-vlm-browser-multimodal":
    case "bench-multimodal-latency":
      return {
        mean: formatNumber(result.metrics.vlm?.answer_total_ms),
        p95: formatNumber(result.metrics.vlm?.image_to_first_token_ms),
        notes: `preprocess=${formatNumber(result.metrics.vlm?.image_preprocess_ms)} ms, accuracy=${formatNumber(result.metrics.vlm?.accuracy_task_score)}`
      };
    case "bench-diffusion-browser-shootout":
    case "exp-diffusion-webgpu-browser":
      return {
        mean: formatNumber(result.metrics.diffusion?.steps_per_sec),
        p95: formatNumber(result.metrics.diffusion?.sec_per_image),
        notes: `resolution_success=${formatNumber(result.metrics.diffusion?.resolution_success_rate)}, oom_or_fail=${formatNumber(result.metrics.diffusion?.oom_or_fail_rate)}`
      };
    case "exp-browser-agent-local":
    case "bench-agent-step-latency":
      return {
        mean: formatNumber(result.metrics.agent?.task_success_rate),
        p95: formatNumber(result.metrics.agent?.avg_step_latency_ms),
        notes: `tool_success=${formatNumber(result.metrics.agent?.tool_call_success_rate)}, interventions=${formatNumber(result.metrics.agent?.user_intervention_count, 0)}`
      };
    case "exp-rag-browser-pipeline":
    case "app-private-rag-lab":
    case "bench-rag-endtoend":
      return {
        mean: formatNumber(result.metrics.rag?.answer_total_ms),
        p95: formatNumber(result.metrics.rag?.answer_ttft_ms),
        notes: `retrieve=${formatNumber(result.metrics.rag?.retrieve_ms)} ms, citation_hit_rate=${formatNumber(result.metrics.rag?.citation_hit_rate)}`
      };
    case "bench-runtime-shootout":
      return {
        mean: formatNumber(result.metrics.llm?.decode_tok_per_sec),
        p95: formatNumber(result.metrics.llm?.ttft_ms),
        notes: `winner=${scenarioLabel(repoName, result)}, metric=decode tok/s / TTFT ms`
      };
    case "bench-model-load-and-cache":
      return {
        mean: formatNumber(result.metrics.common?.init_ms),
        p95: "-",
        notes: `cache=${result.environment.cache_state}, preparedHit=${String(result.meta.notes || "").includes("preparedHit=true")}`
      };
    case "exp-nbody-webgpu-core":
      return {
        mean: formatNumber(result.metrics.compute?.steps_per_sec),
        p95: formatNumber(result.metrics.compute?.p95_dispatch_ms),
        notes: `bodies=${formatNumber(result.metrics.compute?.bodies_or_particles, 0)}, workgroup=${formatNumber(result.metrics.compute?.workgroup_size, 0)}, fallback=${formatBoolean(result.environment.fallback_triggered)}`
      };
    case "exp-fluid-webgpu-core":
      return {
        mean: formatNumber(result.metrics.compute?.steps_per_sec),
        p95: formatNumber(result.metrics.compute?.p95_dispatch_ms),
        notes: `particles=${formatNumber(result.metrics.compute?.bodies_or_particles, 0)}, workgroup=${formatNumber(result.metrics.compute?.workgroup_size, 0)}, divergence=${formatNumber(result.metrics.compute?.divergence_error_pct, 4)}%`
      };
    case "exp-three-webgpu-particles-stress":
      return {
        mean: formatNumber(result.metrics.graphics?.avg_fps),
        p95: formatNumber(result.metrics.graphics?.p95_frametime_ms),
        notes: `particles=${formatNumber(result.metrics.graphics?.particle_count, 0)}, emitters=${formatNumber(result.metrics.graphics?.emitter_count, 0)}, overdraw=${formatNumber(result.metrics.graphics?.overdraw_ratio_pct)}%`
      };
    case "bench-compute-stress-suite":
      return {
        mean: formatNumber(result.metrics.compute?.steps_per_sec),
        p95: formatNumber(result.metrics.compute?.p95_dispatch_ms),
        notes: `winner=${result.workload?.model_id || "-"}, peak_load=${formatNumber(result.metrics.compute?.bodies_or_particles, 0)}, workgroup=${formatNumber(result.metrics.compute?.workgroup_size, 0)}`
      };
    case "bench-atomics-and-memory":
      return {
        mean: formatNumber(result.metrics.compute?.steps_per_sec),
        p95: formatNumber(result.metrics.compute?.p95_dispatch_ms),
        notes: `winner=${result.workload?.model_id || "-"}, conflict=${formatNumber(result.metrics.compute?.atomics_conflict_pct, 3)}%, bandwidth=${formatNumber(result.metrics.compute?.memory_bandwidth_gbps)} GB/s`
      };
    case "bench-texture-upload-and-streaming":
      return {
        mean: formatNumber(result.metrics.graphics?.sustained_stream_mbps),
        p95: formatNumber(result.metrics.graphics?.upload_frame_ms),
        notes: `winner=${result.workload?.model_id || "-"}, textures=${formatNumber(result.metrics.graphics?.texture_count, 0)}, frame_drop=${formatNumber(result.metrics.graphics?.frame_drop_pct, 3)}%`
      };
    case "bench-webgpu-vs-wasm-parity":
      return {
        mean: formatNumber(result.metrics.common?.success_rate),
        p95: formatNumber(result.metrics.common?.init_ms),
        notes: result.meta.notes || "-"
      };
    case "bench-worker-isolation-and-ui-jank":
      return {
        mean: formatNumber(result.metrics.graphics?.avg_fps),
        p95: formatNumber(result.metrics.graphics?.p95_frametime_ms),
        notes: `scene_load=${formatNumber(result.metrics.graphics?.scene_load_ms)} ms, worker_mode=${result.environment.worker_mode}`
      };
    case ".github":
      return {
        mean: formatNumber(result.metrics.infra?.baseline_readiness_score),
        p95: formatNumber(result.metrics.infra?.coverage_pct),
        notes: `issue_forms=${formatNumber(result.metrics.infra?.issue_form_count, 0)}, community_files=${formatNumber(result.metrics.infra?.community_file_count, 0)}, codeowners=${String(result.metrics.infra?.codeowners_present)}`
      };
    case "shared-webgpu-capability":
      return {
        mean: formatNumber(result.metrics.infra?.baseline_readiness_score),
        p95: formatNumber(result.metrics.infra?.capability_limit_coverage_pct),
        notes: `helpers=${formatNumber(result.metrics.infra?.helper_function_count, 0)}, features=${formatNumber(result.metrics.infra?.capability_features_count, 0)}, limits=${formatNumber(result.metrics.infra?.capability_limit_count, 0)}, fallback=${formatBoolean(result.environment.fallback_triggered)}`
      };
    case "shared-bench-schema":
      return {
        mean: formatNumber(result.metrics.infra?.baseline_readiness_score),
        p95: formatNumber(result.metrics.infra?.metric_group_count, 0),
        notes: `required=${formatNumber(result.metrics.infra?.total_required_field_count, 0)}, track_enum=${formatNumber(result.metrics.infra?.track_enum_size, 0)}, status_enum=${formatNumber(result.metrics.infra?.status_enum_size, 0)}, sections=${formatNumber(result.metrics.infra?.results_template_section_count, 0)}`
      };
    case "shared-github-actions":
      return {
        mean: formatNumber(result.metrics.infra?.baseline_readiness_score),
        p95: formatNumber(result.metrics.infra?.workflow_count, 0),
        notes: `inputs=${formatNumber(result.metrics.infra?.workflow_input_count, 0)}, scenarios=${formatNumber(result.metrics.infra?.consumer_scenario_count, 0)}, consumers=${formatNumber(result.metrics.infra?.unique_consumer_repo_count, 0)}`
      };
    case "docs-lab-roadmap":
      return {
        mean: formatNumber(result.metrics.infra?.baseline_readiness_score),
        p95: formatNumber(result.metrics.infra?.total_asset_count, 0),
        notes: `docs=${formatNumber(result.metrics.infra?.doc_count, 0)}, scripts=${formatNumber(result.metrics.infra?.script_count, 0)}, repos=${formatNumber(result.metrics.infra?.inventory_repo_count, 0)}, P0/P1/P2=${formatNumber(result.metrics.infra?.priority_p0_count, 0)}/${formatNumber(result.metrics.infra?.priority_p1_count, 0)}/${formatNumber(result.metrics.infra?.priority_p2_count, 0)}`
      };
    default:
      return {
        mean: formatNumber(result.metrics.common?.init_ms),
        p95: "-",
        notes: result.meta.notes || "-"
      };
  }
}

function repoMetricSummary(repoName, results) {
  switch (repoName) {
    case "tpl-webgpu-vanilla":
    case "tpl-webgpu-react":
    case "exp-three-webgpu-core":
    case "exp-babylon-webgpu-core":
    case "exp-playcanvas-webgpu-core":
    case "exp-blackhole-three-singularity":
    case "exp-blackhole-kerr-engine":
    case "exp-blackhole-webgpu-fromscratch":
    case "exp-pixi-webgpu-2d":
    case "exp-luma-webgpu-viz":
    case "exp-deckgl-webgpu-readiness":
    case "bench-blackhole-render-shootout":
    case "bench-renderer-shootout":
      return [
        `- avg_fps: ${summarizeRange(results.map((result) => result.metrics.graphics?.avg_fps))}`,
        `- p95_frametime_ms: ${summarizeRange(results.map((result) => result.metrics.graphics?.p95_frametime_ms), "ms")}`,
        `- scene_load_ms: ${summarizeRange(results.map((result) => result.metrics.graphics?.scene_load_ms), "ms")}`,
        `- ray_steps: ${summarizeRange(results.map((result) => result.metrics.graphics?.ray_steps), "", 0)}`,
        `- taa states: ${summarizeValues(results.map((result) => String(result.metrics.graphics?.taa_enabled)))}`,
        `- fallback states: ${summarizeValues(results.map((result) => String(result.environment.fallback_triggered)))}`,
        `- backends: ${summarizeValues(results.map((result) => result.environment.backend))}`
      ];
    case "exp-embeddings-browser-throughput":
    case "exp-reranker-browser":
    case "bench-embeddings-latency-quality":
    case "bench-reranker-latency":
      return [
        `- docs_per_sec: ${summarizeRange(results.map((result) => result.metrics.embeddings?.docs_per_sec))}`,
        `- queries_per_sec: ${summarizeRange(results.map((result) => result.metrics.embeddings?.queries_per_sec))}`,
        `- p95_ms: ${summarizeRange(results.map((result) => result.metrics.embeddings?.p95_ms), "ms")}`,
        `- recall_at_10: ${summarizeRange(results.map((result) => result.metrics.embeddings?.recall_at_10))}`,
        `- index_build_ms: ${summarizeRange(results.map((result) => result.metrics.embeddings?.index_build_ms), "ms")}`,
        `- backends: ${summarizeValues(results.map((result) => result.environment.backend))}`,
        `- fallback states: ${summarizeValues(results.map((result) => String(result.environment.fallback_triggered)))}`
      ];
    case "exp-llm-chat-runtime-shootout":
    case "exp-ort-webgpu-baseline":
    case "exp-webllm-browser-chat":
    case "exp-llm-worker-ux":
    case "app-local-chat-arena":
    case "bench-runtime-shootout":
    case "bench-llm-prefill-decode":
      return [
        `- ttft_ms: ${summarizeRange(results.map((result) => result.metrics.llm?.ttft_ms), "ms")}`,
        `- prefill_tok_per_sec: ${summarizeRange(results.map((result) => result.metrics.llm?.prefill_tok_per_sec), "tok/s")}`,
        `- decode_tok_per_sec: ${summarizeRange(results.map((result) => result.metrics.llm?.decode_tok_per_sec), "tok/s")}`,
        `- turn_latency_ms: ${summarizeRange(results.map((result) => result.metrics.llm?.turn_latency_ms), "ms")}`,
        `- backends: ${summarizeValues(results.map((result) => result.environment.backend))}`,
        `- fallback states: ${summarizeValues(results.map((result) => String(result.environment.fallback_triggered)))}`
      ];
    case "exp-stt-whisper-webgpu":
    case "bench-stt-streaming-latency":
      return [
        `- audio_sec_per_sec: ${summarizeRange(results.map((result) => result.metrics.stt?.audio_sec_per_sec))}`,
        `- first_partial_ms: ${summarizeRange(results.map((result) => result.metrics.stt?.first_partial_ms), "ms")}`,
        `- final_latency_ms: ${summarizeRange(results.map((result) => result.metrics.stt?.final_latency_ms), "ms")}`,
        `- wer: ${summarizeRange(results.map((result) => result.metrics.stt?.wer), "", 4)}`,
        `- cer: ${summarizeRange(results.map((result) => result.metrics.stt?.cer), "", 4)}`
      ];
    case "bench-voice-roundtrip":
    case "exp-voice-assistant-local":
      return [
        `- audio_sec_per_sec: ${summarizeRange(results.map((result) => result.metrics.stt?.audio_sec_per_sec))}`,
        `- first_partial_ms: ${summarizeRange(results.map((result) => result.metrics.stt?.first_partial_ms), "ms")}`,
        `- final_latency_ms: ${summarizeRange(results.map((result) => result.metrics.stt?.final_latency_ms), "ms")}`,
        `- roundtrip_ms: ${summarizeRange(results.map((result) => result.metrics.stt?.roundtrip_ms), "ms")}`,
        `- wer: ${summarizeRange(results.map((result) => result.metrics.stt?.wer), "", 4)}`,
        `- cer: ${summarizeRange(results.map((result) => result.metrics.stt?.cer), "", 4)}`,
        `- worker modes: ${summarizeValues(results.map((result) => result.environment.worker_mode))}`,
        `- backends: ${summarizeValues(results.map((result) => result.environment.backend))}`,
        `- fallback states: ${summarizeValues(results.map((result) => String(result.environment.fallback_triggered)))}`
      ];
    case "app-voice-agent-lab":
      return [
        `- audio_sec_per_sec: ${summarizeRange(results.map((result) => result.metrics.stt?.audio_sec_per_sec))}`,
        `- first_partial_ms: ${summarizeRange(results.map((result) => result.metrics.stt?.first_partial_ms), "ms")}`,
        `- final_latency_ms: ${summarizeRange(results.map((result) => result.metrics.stt?.final_latency_ms), "ms")}`,
        `- roundtrip_ms: ${summarizeRange(results.map((result) => result.metrics.stt?.roundtrip_ms), "ms")}`,
        `- task_success_rate: ${summarizeRange(results.map((result) => result.metrics.agent?.task_success_rate))}`,
        `- avg_step_latency_ms: ${summarizeRange(results.map((result) => result.metrics.agent?.avg_step_latency_ms), "ms")}`,
        `- tool_call_success_rate: ${summarizeRange(results.map((result) => result.metrics.agent?.tool_call_success_rate))}`,
        `- user_intervention_count: ${summarizeRange(results.map((result) => result.metrics.agent?.user_intervention_count), "", 0)}`
      ];
    case "app-browser-image-lab":
      return [
        `- image_preprocess_ms: ${summarizeRange(results.map((result) => result.metrics.vlm?.image_preprocess_ms), "ms")}`,
        `- image_to_first_token_ms: ${summarizeRange(results.map((result) => result.metrics.vlm?.image_to_first_token_ms), "ms")}`,
        `- answer_total_ms: ${summarizeRange(results.map((result) => result.metrics.vlm?.answer_total_ms), "ms")}`,
        `- accuracy_task_score: ${summarizeRange(results.map((result) => result.metrics.vlm?.accuracy_task_score))}`,
        `- sec_per_image: ${summarizeRange(results.map((result) => result.metrics.diffusion?.sec_per_image), "s")}`,
        `- steps_per_sec: ${summarizeRange(results.map((result) => result.metrics.diffusion?.steps_per_sec))}`,
        `- resolution_success_rate: ${summarizeRange(results.map((result) => result.metrics.diffusion?.resolution_success_rate))}`,
        `- oom_or_fail_rate: ${summarizeRange(results.map((result) => result.metrics.diffusion?.oom_or_fail_rate))}`
      ];
    case "app-blackhole-observatory":
      return [
        `- avg_fps: ${summarizeRange(results.map((result) => result.metrics.graphics?.avg_fps))}`,
        `- p95_frametime_ms: ${summarizeRange(results.map((result) => result.metrics.graphics?.p95_frametime_ms), "ms")}`,
        `- scene_load_ms: ${summarizeRange(results.map((result) => result.metrics.graphics?.scene_load_ms), "ms")}`,
        `- ray_steps: ${summarizeRange(results.map((result) => result.metrics.graphics?.ray_steps), "", 0)}`,
        `- photon_ring_radius_px: ${summarizeRange(results.map((result) => result.metrics.blackhole?.photon_ring_radius_px), "px", 0)}`,
        `- lensing_arc_pct: ${summarizeRange(results.map((result) => result.metrics.blackhole?.lensing_arc_pct))}`,
        `- geodesic_checksum: ${summarizeRange(results.map((result) => result.metrics.blackhole?.geodesic_checksum), "", 4)}`,
        `- renderer_consensus_score: ${summarizeRange(results.map((result) => result.metrics.blackhole?.renderer_consensus_score))}`,
        `- science_alignment_score: ${summarizeRange(results.map((result) => result.metrics.blackhole?.science_alignment_score))}`
      ];
    case "exp-vlm-browser-multimodal":
    case "bench-multimodal-latency":
      return [
        `- image_preprocess_ms: ${summarizeRange(results.map((result) => result.metrics.vlm?.image_preprocess_ms), "ms")}`,
        `- image_to_first_token_ms: ${summarizeRange(results.map((result) => result.metrics.vlm?.image_to_first_token_ms), "ms")}`,
        `- answer_total_ms: ${summarizeRange(results.map((result) => result.metrics.vlm?.answer_total_ms), "ms")}`,
        `- accuracy_task_score: ${summarizeRange(results.map((result) => result.metrics.vlm?.accuracy_task_score))}`,
        `- worker modes: ${summarizeValues(results.map((result) => result.environment.worker_mode))}`,
        `- backends: ${summarizeValues(results.map((result) => result.environment.backend))}`,
        `- fallback states: ${summarizeValues(results.map((result) => String(result.environment.fallback_triggered)))}`
      ];
    case "bench-diffusion-browser-shootout":
    case "exp-diffusion-webgpu-browser":
      return [
        `- sec_per_image: ${summarizeRange(results.map((result) => result.metrics.diffusion?.sec_per_image), "s")}`,
        `- steps_per_sec: ${summarizeRange(results.map((result) => result.metrics.diffusion?.steps_per_sec))}`,
        `- resolution_success_rate: ${summarizeRange(results.map((result) => result.metrics.diffusion?.resolution_success_rate))}`,
        `- oom_or_fail_rate: ${summarizeRange(results.map((result) => result.metrics.diffusion?.oom_or_fail_rate))}`,
        `- worker modes: ${summarizeValues(results.map((result) => result.environment.worker_mode))}`,
        `- backends: ${summarizeValues(results.map((result) => result.environment.backend))}`,
        `- fallback states: ${summarizeValues(results.map((result) => String(result.environment.fallback_triggered)))}`
      ];
    case "exp-browser-agent-local":
    case "bench-agent-step-latency":
      return [
        `- task_success_rate: ${summarizeRange(results.map((result) => result.metrics.agent?.task_success_rate))}`,
        `- avg_step_latency_ms: ${summarizeRange(results.map((result) => result.metrics.agent?.avg_step_latency_ms), "ms")}`,
        `- tool_call_success_rate: ${summarizeRange(results.map((result) => result.metrics.agent?.tool_call_success_rate))}`,
        `- user_intervention_count: ${summarizeRange(results.map((result) => result.metrics.agent?.user_intervention_count), "", 0)}`,
        `- worker modes: ${summarizeValues(results.map((result) => result.environment.worker_mode))}`,
        `- backends: ${summarizeValues(results.map((result) => result.environment.backend))}`,
        `- fallback states: ${summarizeValues(results.map((result) => String(result.environment.fallback_triggered)))}`
      ];
    case "exp-rag-browser-pipeline":
    case "app-private-rag-lab":
    case "bench-rag-endtoend":
      return [
        `- ingest_ms_per_page: ${summarizeRange(results.map((result) => result.metrics.rag?.ingest_ms_per_page), "ms")}`,
        `- chunk_count: ${summarizeRange(results.map((result) => result.metrics.rag?.chunk_count), "", 0)}`,
        `- embed_total_ms: ${summarizeRange(results.map((result) => result.metrics.rag?.embed_total_ms), "ms")}`,
        `- retrieve_ms: ${summarizeRange(results.map((result) => result.metrics.rag?.retrieve_ms), "ms")}`,
        `- rerank_ms: ${summarizeRange(results.map((result) => result.metrics.rag?.rerank_ms), "ms")}`,
        `- answer_total_ms: ${summarizeRange(results.map((result) => result.metrics.rag?.answer_total_ms), "ms")}`,
        `- citation_hit_rate: ${summarizeRange(results.map((result) => result.metrics.rag?.citation_hit_rate))}`
      ];
    case "bench-model-load-and-cache":
      return [
        `- init_ms: ${summarizeRange(results.map((result) => result.metrics.common?.init_ms), "ms")}`,
        `- cache states: ${summarizeValues(results.map((result) => result.environment.cache_state))}`,
        `- prepared hit states: ${summarizeValues(results.map((result) => String(result.meta.notes || "").includes("preparedHit=true")))}`
      ];
    case "exp-nbody-webgpu-core":
      return [
        `- bodies_or_particles: ${summarizeRange(results.map((result) => result.metrics.compute?.bodies_or_particles), "", 0)}`,
        `- workgroup_size: ${summarizeRange(results.map((result) => result.metrics.compute?.workgroup_size), "", 0)}`,
        `- steps_per_sec: ${summarizeRange(results.map((result) => result.metrics.compute?.steps_per_sec))}`,
        `- integration_ms: ${summarizeRange(results.map((result) => result.metrics.compute?.integration_ms), "ms")}`,
        `- avg_dispatch_ms: ${summarizeRange(results.map((result) => result.metrics.compute?.avg_dispatch_ms), "ms", 4)}`,
        `- p95_dispatch_ms: ${summarizeRange(results.map((result) => result.metrics.compute?.p95_dispatch_ms), "ms", 4)}`,
        `- energy_drift_pct: ${summarizeRange(results.map((result) => result.metrics.compute?.energy_drift_pct), "%", 4)}`,
        `- backends: ${summarizeValues(results.map((result) => result.environment.backend))}`,
        `- fallback states: ${summarizeValues(results.map((result) => String(result.environment.fallback_triggered)))}`
      ];
    case "exp-fluid-webgpu-core":
      return [
        `- bodies_or_particles: ${summarizeRange(results.map((result) => result.metrics.compute?.bodies_or_particles), "", 0)}`,
        `- workgroup_size: ${summarizeRange(results.map((result) => result.metrics.compute?.workgroup_size), "", 0)}`,
        `- steps_per_sec: ${summarizeRange(results.map((result) => result.metrics.compute?.steps_per_sec))}`,
        `- integration_ms: ${summarizeRange(results.map((result) => result.metrics.compute?.integration_ms), "ms")}`,
        `- avg_dispatch_ms: ${summarizeRange(results.map((result) => result.metrics.compute?.avg_dispatch_ms), "ms", 4)}`,
        `- p95_dispatch_ms: ${summarizeRange(results.map((result) => result.metrics.compute?.p95_dispatch_ms), "ms", 4)}`,
        `- pressure_solve_ms: ${summarizeRange(results.map((result) => result.metrics.compute?.pressure_solve_ms), "ms", 4)}`,
        `- divergence_error_pct: ${summarizeRange(results.map((result) => result.metrics.compute?.divergence_error_pct), "%", 4)}`,
        `- backends: ${summarizeValues(results.map((result) => result.environment.backend))}`,
        `- fallback states: ${summarizeValues(results.map((result) => String(result.environment.fallback_triggered)))}`
      ];
    case "exp-three-webgpu-particles-stress":
      return [
        `- avg_fps: ${summarizeRange(results.map((result) => result.metrics.graphics?.avg_fps))}`,
        `- p95_frametime_ms: ${summarizeRange(results.map((result) => result.metrics.graphics?.p95_frametime_ms), "ms")}`,
        `- scene_load_ms: ${summarizeRange(results.map((result) => result.metrics.graphics?.scene_load_ms), "ms")}`,
        `- particle_count: ${summarizeRange(results.map((result) => result.metrics.graphics?.particle_count), "", 0)}`,
        `- emitter_count: ${summarizeRange(results.map((result) => result.metrics.graphics?.emitter_count), "", 0)}`,
        `- draw_calls: ${summarizeRange(results.map((result) => result.metrics.graphics?.draw_calls), "", 0)}`,
        `- overdraw_ratio_pct: ${summarizeRange(results.map((result) => result.metrics.graphics?.overdraw_ratio_pct), "%")}`,
        `- post_fx_passes: ${summarizeRange(results.map((result) => result.metrics.graphics?.post_fx_passes), "", 0)}`,
        `- backends: ${summarizeValues(results.map((result) => result.environment.backend))}`,
        `- fallback states: ${summarizeValues(results.map((result) => String(result.environment.fallback_triggered)))}`
      ];
    case "bench-compute-stress-suite":
      return [
        `- suite_case_count: ${summarizeRange(results.map((result) => result.metrics.compute?.suite_case_count), "", 0)}`,
        `- winning_case: ${summarizeValues(results.map((result) => result.workload?.model_id))}`,
        `- bodies_or_particles: ${summarizeRange(results.map((result) => result.metrics.compute?.bodies_or_particles), "", 0)}`,
        `- workgroup_size: ${summarizeRange(results.map((result) => result.metrics.compute?.workgroup_size), "", 0)}`,
        `- steps_per_sec: ${summarizeRange(results.map((result) => result.metrics.compute?.steps_per_sec))}`,
        `- integration_ms: ${summarizeRange(results.map((result) => result.metrics.compute?.integration_ms), "ms", 4)}`,
        `- avg_dispatch_ms: ${summarizeRange(results.map((result) => result.metrics.compute?.avg_dispatch_ms), "ms", 4)}`,
        `- p95_dispatch_ms: ${summarizeRange(results.map((result) => result.metrics.compute?.p95_dispatch_ms), "ms", 4)}`,
        `- pressure_solve_ms: ${summarizeRange(results.map((result) => result.metrics.compute?.pressure_solve_ms), "ms", 4)}`,
        `- energy_drift_pct: ${summarizeRange(results.map((result) => result.metrics.compute?.energy_drift_pct), "%", 4)}`,
        `- overdraw_ratio_pct: ${summarizeRange(results.map((result) => result.metrics.compute?.overdraw_ratio_pct), "%")}`,
        `- backends: ${summarizeValues(results.map((result) => result.environment.backend))}`,
        `- fallback states: ${summarizeValues(results.map((result) => String(result.environment.fallback_triggered)))}`
      ];
    case "bench-atomics-and-memory":
      return [
        `- suite_case_count: ${summarizeRange(results.map((result) => result.metrics.compute?.suite_case_count), "", 0)}`,
        `- winning_case: ${summarizeValues(results.map((result) => result.workload?.model_id))}`,
        `- bodies_or_particles: ${summarizeRange(results.map((result) => result.metrics.compute?.bodies_or_particles), "", 0)}`,
        `- workgroup_size: ${summarizeRange(results.map((result) => result.metrics.compute?.workgroup_size), "", 0)}`,
        `- steps_per_sec: ${summarizeRange(results.map((result) => result.metrics.compute?.steps_per_sec))}`,
        `- integration_ms: ${summarizeRange(results.map((result) => result.metrics.compute?.integration_ms), "ms", 4)}`,
        `- avg_dispatch_ms: ${summarizeRange(results.map((result) => result.metrics.compute?.avg_dispatch_ms), "ms", 4)}`,
        `- p95_dispatch_ms: ${summarizeRange(results.map((result) => result.metrics.compute?.p95_dispatch_ms), "ms", 4)}`,
        `- atomics_conflict_pct: ${summarizeRange(results.map((result) => result.metrics.compute?.atomics_conflict_pct), "%", 3)}`,
        `- histogram_spill_pct: ${summarizeRange(results.map((result) => result.metrics.compute?.histogram_spill_pct), "%", 3)}`,
        `- memory_bandwidth_gbps: ${summarizeRange(results.map((result) => result.metrics.compute?.memory_bandwidth_gbps), "GB/s")}`,
        `- cache_hit_rate_pct: ${summarizeRange(results.map((result) => result.metrics.compute?.cache_hit_rate_pct), "%")}`,
        `- shared_memory_kb: ${summarizeRange(results.map((result) => result.metrics.compute?.shared_memory_kb), "KB", 0)}`,
        `- backends: ${summarizeValues(results.map((result) => result.environment.backend))}`,
        `- fallback states: ${summarizeValues(results.map((result) => String(result.environment.fallback_triggered)))}`
      ];
    case "bench-texture-upload-and-streaming":
      return [
        `- avg_fps: ${summarizeRange(results.map((result) => result.metrics.graphics?.avg_fps))}`,
        `- p95_frametime_ms: ${summarizeRange(results.map((result) => result.metrics.graphics?.p95_frametime_ms), "ms")}`,
        `- scene_load_ms: ${summarizeRange(results.map((result) => result.metrics.graphics?.scene_load_ms), "ms")}`,
        `- sustained_stream_mbps: ${summarizeRange(results.map((result) => result.metrics.graphics?.sustained_stream_mbps), "MB/s")}`,
        `- upload_frame_ms: ${summarizeRange(results.map((result) => result.metrics.graphics?.upload_frame_ms), "ms", 4)}`,
        `- background_update_ms: ${summarizeRange(results.map((result) => result.metrics.graphics?.background_update_ms), "ms", 4)}`,
        `- frame_drop_pct: ${summarizeRange(results.map((result) => result.metrics.graphics?.frame_drop_pct), "%", 3)}`,
        `- upload_fail_rate: ${summarizeRange(results.map((result) => result.metrics.graphics?.upload_fail_rate), "", 4)}`,
        `- texture_count: ${summarizeRange(results.map((result) => result.metrics.graphics?.texture_count), "", 0)}`,
        `- atlas_memory_mb: ${summarizeRange(results.map((result) => result.metrics.graphics?.atlas_memory_mb), "MB", 0)}`,
        `- mip_levels: ${summarizeRange(results.map((result) => result.metrics.graphics?.mip_levels), "", 0)}`,
        `- backends: ${summarizeValues(results.map((result) => result.environment.backend))}`,
        `- fallback states: ${summarizeValues(results.map((result) => String(result.environment.fallback_triggered)))}`
      ];
    case "bench-webgpu-vs-wasm-parity":
      return [
        `- success_rate: ${summarizeRange(results.map((result) => result.metrics.common?.success_rate))}`,
        `- init_ms: ${summarizeRange(results.map((result) => result.metrics.common?.init_ms), "ms")}`,
        `- backends: ${summarizeValues(results.map((result) => result.environment.backend))}`,
        `- fallback states: ${summarizeValues(results.map((result) => String(result.environment.fallback_triggered)))}`,
        `- parity notes: ${summarizeValues(results.map((result) => result.meta.notes))}`
      ];
    case "bench-worker-isolation-and-ui-jank":
      return [
        `- avg_fps: ${summarizeRange(results.map((result) => result.metrics.graphics?.avg_fps))}`,
        `- p95_frametime_ms: ${summarizeRange(results.map((result) => result.metrics.graphics?.p95_frametime_ms), "ms")}`,
        `- scene_load_ms: ${summarizeRange(results.map((result) => result.metrics.graphics?.scene_load_ms), "ms")}`,
        `- worker modes: ${summarizeValues(results.map((result) => result.environment.worker_mode))}`
      ];
    case ".github":
      return [
        `- baseline_readiness_score: ${summarizeRange(results.map((result) => result.metrics.infra?.baseline_readiness_score))}`,
        `- issue_form_count: ${summarizeRange(results.map((result) => result.metrics.infra?.issue_form_count), "", 0)}`,
        `- community_file_count: ${summarizeRange(results.map((result) => result.metrics.infra?.community_file_count), "", 0)}`,
        `- profile_section_count: ${summarizeRange(results.map((result) => result.metrics.infra?.profile_section_count), "", 0)}`,
        `- contributing_section_count: ${summarizeRange(results.map((result) => result.metrics.infra?.contributing_section_count), "", 0)}`,
        `- coverage_pct: ${summarizeRange(results.map((result) => result.metrics.infra?.coverage_pct), "%")}`,
        `- codeowners states: ${summarizeValues(results.map((result) => String(result.metrics.infra?.codeowners_present)))}`,
        `- backends: ${summarizeValues(results.map((result) => result.environment.backend))}`
      ];
    case "shared-webgpu-capability":
      return [
        `- baseline_readiness_score: ${summarizeRange(results.map((result) => result.metrics.infra?.baseline_readiness_score))}`,
        `- helper_function_count: ${summarizeRange(results.map((result) => result.metrics.infra?.helper_function_count), "", 0)}`,
        `- capability_features_count: ${summarizeRange(results.map((result) => result.metrics.infra?.capability_features_count), "", 0)}`,
        `- capability_limit_count: ${summarizeRange(results.map((result) => result.metrics.infra?.capability_limit_count), "", 0)}`,
        `- capability_limit_coverage_pct: ${summarizeRange(results.map((result) => result.metrics.infra?.capability_limit_coverage_pct), "%")}`,
        `- validated_field_count: ${summarizeRange(results.map((result) => result.metrics.infra?.validated_field_count), "", 0)}`,
        `- backends: ${summarizeValues(results.map((result) => result.environment.backend))}`,
        `- fallback states: ${summarizeValues(results.map((result) => String(result.environment.fallback_triggered)))}`
      ];
    case "shared-bench-schema":
      return [
        `- baseline_readiness_score: ${summarizeRange(results.map((result) => result.metrics.infra?.baseline_readiness_score))}`,
        `- metric_group_count: ${summarizeRange(results.map((result) => result.metrics.infra?.metric_group_count), "", 0)}`,
        `- schema_root_required_count: ${summarizeRange(results.map((result) => result.metrics.infra?.schema_root_required_count), "", 0)}`,
        `- meta_required_count: ${summarizeRange(results.map((result) => result.metrics.infra?.meta_required_count), "", 0)}`,
        `- environment_required_count: ${summarizeRange(results.map((result) => result.metrics.infra?.environment_required_count), "", 0)}`,
        `- track_enum_size: ${summarizeRange(results.map((result) => result.metrics.infra?.track_enum_size), "", 0)}`,
        `- status_enum_size: ${summarizeRange(results.map((result) => result.metrics.infra?.status_enum_size), "", 0)}`,
        `- results_template_section_count: ${summarizeRange(results.map((result) => result.metrics.infra?.results_template_section_count), "", 0)}`
      ];
    case "shared-github-actions":
      return [
        `- baseline_readiness_score: ${summarizeRange(results.map((result) => result.metrics.infra?.baseline_readiness_score))}`,
        `- workflow_count: ${summarizeRange(results.map((result) => result.metrics.infra?.workflow_count), "", 0)}`,
        `- workflow_input_count: ${summarizeRange(results.map((result) => result.metrics.infra?.workflow_input_count), "", 0)}`,
        `- consumer_scenario_count: ${summarizeRange(results.map((result) => result.metrics.infra?.consumer_scenario_count), "", 0)}`,
        `- unique_consumer_repo_count: ${summarizeRange(results.map((result) => result.metrics.infra?.unique_consumer_repo_count), "", 0)}`,
        `- workflow_call_trigger_count: ${summarizeRange(results.map((result) => result.metrics.infra?.workflow_call_trigger_count), "", 0)}`
      ];
    case "docs-lab-roadmap":
      return [
        `- baseline_readiness_score: ${summarizeRange(results.map((result) => result.metrics.infra?.baseline_readiness_score))}`,
        `- doc_count: ${summarizeRange(results.map((result) => result.metrics.infra?.doc_count), "", 0)}`,
        `- script_count: ${summarizeRange(results.map((result) => result.metrics.infra?.script_count), "", 0)}`,
        `- template_count: ${summarizeRange(results.map((result) => result.metrics.infra?.template_count), "", 0)}`,
        `- schema_count: ${summarizeRange(results.map((result) => result.metrics.infra?.schema_count), "", 0)}`,
        `- total_asset_count: ${summarizeRange(results.map((result) => result.metrics.infra?.total_asset_count), "", 0)}`,
        `- inventory_repo_count: ${summarizeRange(results.map((result) => result.metrics.infra?.inventory_repo_count), "", 0)}`,
        `- priority_p0_count: ${summarizeRange(results.map((result) => result.metrics.infra?.priority_p0_count), "", 0)}`,
        `- priority_p1_count: ${summarizeRange(results.map((result) => result.metrics.infra?.priority_p1_count), "", 0)}`,
        `- priority_p2_count: ${summarizeRange(results.map((result) => result.metrics.infra?.priority_p2_count), "", 0)}`,
        `- category_count: ${summarizeRange(results.map((result) => result.metrics.infra?.category_count), "", 0)}`
      ];
    default:
      return [];
  }
}

const REAL_MODE_BY_REPO = {
  "bench-runtime-shootout": "?mode=real-runtime",
  "exp-three-webgpu-core": "?mode=real-three",
  "app-blackhole-observatory": "?mode=real-surface",
  "bench-renderer-shootout": "?mode=real-benchmark",
  "app-browser-image-lab": "?mode=real-image-lab",
  "app-local-chat-arena": "?mode=real-chat-arena",
  "app-private-rag-lab": "?mode=real-private-rag",
  "app-voice-agent-lab": "?mode=real-voice-agent",
  "exp-babylon-webgpu-core": "?mode=real-babylon",
  "exp-pixi-webgpu-2d": "?mode=real-pixi",
  "exp-playcanvas-webgpu-core": "?mode=real-playcanvas",
  "exp-luma-webgpu-viz": "?mode=real-luma",
  "exp-deckgl-webgpu-readiness": "?mode=real-deckgl",
  "exp-three-webgpu-particles-stress": "?mode=real-particles",
  "exp-blackhole-three-singularity": "?mode=real-blackhole-three",
  "exp-blackhole-kerr-engine": "?mode=real-kerr",
  "exp-blackhole-webgpu-fromscratch": "?mode=real-bhraw",
  "exp-nbody-webgpu-core": "?mode=real-nbody",
  "exp-fluid-webgpu-core": "?mode=real-fluid"
};

const ADAPTER_ARTIFACT_KEY_BY_REPO = {
  "bench-runtime-shootout": "runtime_adapter",
  "exp-three-webgpu-core": "renderer_adapter",
  "app-blackhole-observatory": "app_surface_adapter",
  "bench-renderer-shootout": "benchmark_adapter",
  "app-browser-image-lab": "app_surface_adapter",
  "app-local-chat-arena": "app_surface_adapter",
  "app-private-rag-lab": "app_surface_adapter",
  "app-voice-agent-lab": "app_surface_adapter",
  "exp-babylon-webgpu-core": "renderer_adapter",
  "exp-pixi-webgpu-2d": "renderer_adapter",
  "exp-playcanvas-webgpu-core": "renderer_adapter",
  "exp-luma-webgpu-viz": "renderer_adapter",
  "exp-deckgl-webgpu-readiness": "renderer_adapter",
  "exp-three-webgpu-particles-stress": "renderer_adapter",
  "exp-blackhole-three-singularity": "renderer_adapter",
  "exp-blackhole-kerr-engine": "renderer_adapter",
  "exp-blackhole-webgpu-fromscratch": "renderer_adapter",
  "exp-nbody-webgpu-core": "renderer_adapter",
  "exp-fluid-webgpu-core": "renderer_adapter"
};

const RENDERER_FALLBACK_LABEL_BY_REPO = {
  "exp-babylon-webgpu-core": "deterministic-babylon-style",
  "exp-pixi-webgpu-2d": "deterministic-pixi-style",
  "exp-playcanvas-webgpu-core": "deterministic-playcanvas-style",
  "exp-luma-webgpu-viz": "deterministic-luma-style",
  "exp-deckgl-webgpu-readiness": "deterministic-deckgl-style",
  "exp-three-webgpu-particles-stress": "deterministic-particles-stress",
  "exp-blackhole-three-singularity": "deterministic-blackhole-three",
  "exp-blackhole-kerr-engine": "deterministic-kerr",
  "exp-blackhole-webgpu-fromscratch": "deterministic-blackhole-raw",
  "exp-nbody-webgpu-core": "deterministic-nbody",
  "exp-fluid-webgpu-core": "deterministic-fluid"
};

function selectRealAndDeterministic(repoName, results) {
  const realMode = REAL_MODE_BY_REPO[repoName];
  if (!realMode) return null;
  const realResult = results.find((result) => result.meta?.capture_url_search === realMode);
  if (!realResult) return null;
  const deterministicResult = results.find((result) => {
    const search = result.meta?.capture_url_search;
    if (!search) return false;
    if (search === realMode) return false;
    return search.startsWith("?mode=webgpu") || search === "?mode=" || (!search.startsWith("?mode=real-") && search.startsWith("?mode="));
  }) || results.find((result) => result !== realResult);
  if (!deterministicResult) return null;
  return { realResult, deterministicResult };
}

function adapterDescriptors(repoName, realResult, deterministicResult) {
  const key = ADAPTER_ARTIFACT_KEY_BY_REPO[repoName];
  return {
    realAdapter: realResult?.artifacts?.[key] || {},
    deterministicAdapter: deterministicResult?.artifacts?.[key] || {}
  };
}

function adapterStatusLine(realAdapter, deterministicAdapter, fallbackLabel) {
  const realStatus = realAdapter.status || "unknown";
  const isRealConnected = realAdapter.isReal === true && realStatus === "connected";
  return isRealConnected
    ? `- adapter: real=${realAdapter.id || "(connected)"}, deterministic=${deterministicAdapter.id || fallbackLabel}`
    : `- adapter: real=${realStatus} (no real adapter registered — falling back to deterministic), deterministic=${deterministicAdapter.id || fallbackLabel}`;
}

function realRuntimeComparisonLines(repoName, results) {
  if (!REAL_MODE_BY_REPO[repoName]) return [];
  const pair = selectRealAndDeterministic(repoName, results);
  if (!pair) return [];
  const { realResult, deterministicResult } = pair;
  const { realAdapter, deterministicAdapter } = adapterDescriptors(repoName, realResult, deterministicResult);

  if (repoName === "bench-runtime-shootout") {
    return [
      adapterStatusLine(realAdapter, deterministicAdapter, "deterministic-mock"),
      `- decode tok/s: real=${formatNumber(realResult.metrics.llm?.decode_tok_per_sec)}, deterministic=${formatNumber(deterministicResult.metrics.llm?.decode_tok_per_sec)}, delta=${formatDelta(realResult.metrics.llm?.decode_tok_per_sec, deterministicResult.metrics.llm?.decode_tok_per_sec)}`,
      `- TTFT: real=${formatNumberWithUnit(realResult.metrics.llm?.ttft_ms, "ms")}, deterministic=${formatNumberWithUnit(deterministicResult.metrics.llm?.ttft_ms, "ms")}, delta=${formatDelta(realResult.metrics.llm?.ttft_ms, deterministicResult.metrics.llm?.ttft_ms, 2, "ms")}`,
      `- prefill tok/s: real=${formatNumber(realResult.metrics.llm?.prefill_tok_per_sec)}, deterministic=${formatNumber(deterministicResult.metrics.llm?.prefill_tok_per_sec)}, delta=${formatDelta(realResult.metrics.llm?.prefill_tok_per_sec, deterministicResult.metrics.llm?.prefill_tok_per_sec)}`
    ];
  }
  if (repoName === "exp-three-webgpu-core") {
    return [
      adapterStatusLine(realAdapter, deterministicAdapter, "deterministic-three-style"),
      `- avg_fps: real=${formatNumber(realResult.metrics.graphics?.avg_fps)}, deterministic=${formatNumber(deterministicResult.metrics.graphics?.avg_fps)}, delta=${formatDelta(realResult.metrics.graphics?.avg_fps, deterministicResult.metrics.graphics?.avg_fps)}`,
      `- p95_frametime: real=${formatNumberWithUnit(realResult.metrics.graphics?.p95_frametime_ms, "ms")}, deterministic=${formatNumberWithUnit(deterministicResult.metrics.graphics?.p95_frametime_ms, "ms")}, delta=${formatDelta(realResult.metrics.graphics?.p95_frametime_ms, deterministicResult.metrics.graphics?.p95_frametime_ms, 2, "ms")}`,
      `- scene_load_ms: real=${formatNumberWithUnit(realResult.metrics.graphics?.scene_load_ms, "ms")}, deterministic=${formatNumberWithUnit(deterministicResult.metrics.graphics?.scene_load_ms, "ms")}, delta=${formatDelta(realResult.metrics.graphics?.scene_load_ms, deterministicResult.metrics.graphics?.scene_load_ms, 2, "ms")}`
    ];
  }
  if (repoName === "app-blackhole-observatory") {
    return [
      adapterStatusLine(realAdapter, deterministicAdapter, "deterministic-observatory"),
      `- avg_fps: real=${formatNumber(realResult.metrics.graphics?.avg_fps)}, deterministic=${formatNumber(deterministicResult.metrics.graphics?.avg_fps)}, delta=${formatDelta(realResult.metrics.graphics?.avg_fps, deterministicResult.metrics.graphics?.avg_fps)}`,
      `- frame_ms: real=${formatNumberWithUnit(realResult.metrics.graphics?.p95_frametime_ms, "ms")}, deterministic=${formatNumberWithUnit(deterministicResult.metrics.graphics?.p95_frametime_ms, "ms")}, delta=${formatDelta(realResult.metrics.graphics?.p95_frametime_ms, deterministicResult.metrics.graphics?.p95_frametime_ms, 2, "ms")}`
    ];
  }
  if (repoName === "bench-renderer-shootout") {
    return [
      adapterStatusLine(realAdapter, deterministicAdapter, "deterministic-renderer-shootout"),
      `- avg_fps: real=${formatNumber(realResult.metrics.graphics?.avg_fps)}, deterministic=${formatNumber(deterministicResult.metrics.graphics?.avg_fps)}, delta=${formatDelta(realResult.metrics.graphics?.avg_fps, deterministicResult.metrics.graphics?.avg_fps)}`,
      `- p95_frametime: real=${formatNumberWithUnit(realResult.metrics.graphics?.p95_frametime_ms, "ms")}, deterministic=${formatNumberWithUnit(deterministicResult.metrics.graphics?.p95_frametime_ms, "ms")}, delta=${formatDelta(realResult.metrics.graphics?.p95_frametime_ms, deterministicResult.metrics.graphics?.p95_frametime_ms, 2, "ms")}`
    ];
  }
  if (repoName === "app-browser-image-lab") {
    return [
      adapterStatusLine(realAdapter, deterministicAdapter, "deterministic-image-lab"),
      `- answer_total_ms: real=${formatNumberWithUnit(realResult.metrics.vlm?.answer_total_ms, "ms")}, deterministic=${formatNumberWithUnit(deterministicResult.metrics.vlm?.answer_total_ms, "ms")}, delta=${formatDelta(realResult.metrics.vlm?.answer_total_ms, deterministicResult.metrics.vlm?.answer_total_ms, 2, "ms")}`,
      `- sec_per_image: real=${formatNumber(realResult.metrics.diffusion?.sec_per_image)}, deterministic=${formatNumber(deterministicResult.metrics.diffusion?.sec_per_image)}, delta=${formatDelta(realResult.metrics.diffusion?.sec_per_image, deterministicResult.metrics.diffusion?.sec_per_image)}`
    ];
  }
  if (repoName === "app-local-chat-arena") {
    return [
      adapterStatusLine(realAdapter, deterministicAdapter, "deterministic-chat-arena"),
      `- decode tok/s: real=${formatNumber(realResult.metrics.llm?.decode_tok_per_sec)}, deterministic=${formatNumber(deterministicResult.metrics.llm?.decode_tok_per_sec)}, delta=${formatDelta(realResult.metrics.llm?.decode_tok_per_sec, deterministicResult.metrics.llm?.decode_tok_per_sec)}`,
      `- TTFT: real=${formatNumberWithUnit(realResult.metrics.llm?.ttft_ms, "ms")}, deterministic=${formatNumberWithUnit(deterministicResult.metrics.llm?.ttft_ms, "ms")}, delta=${formatDelta(realResult.metrics.llm?.ttft_ms, deterministicResult.metrics.llm?.ttft_ms, 2, "ms")}`
    ];
  }
  if (repoName === "app-private-rag-lab") {
    return [
      adapterStatusLine(realAdapter, deterministicAdapter, "deterministic-private-rag"),
      `- citation_hit_rate: real=${formatNumber(realResult.metrics.rag?.citation_hit_rate)}, deterministic=${formatNumber(deterministicResult.metrics.rag?.citation_hit_rate)}, delta=${formatDelta(realResult.metrics.rag?.citation_hit_rate, deterministicResult.metrics.rag?.citation_hit_rate)}`,
      `- answer_total_ms: real=${formatNumberWithUnit(realResult.metrics.rag?.answer_total_ms, "ms")}, deterministic=${formatNumberWithUnit(deterministicResult.metrics.rag?.answer_total_ms, "ms")}, delta=${formatDelta(realResult.metrics.rag?.answer_total_ms, deterministicResult.metrics.rag?.answer_total_ms, 2, "ms")}`
    ];
  }
  if (repoName === "app-voice-agent-lab") {
    return [
      adapterStatusLine(realAdapter, deterministicAdapter, "deterministic-voice-agent"),
      `- roundtrip_ms: real=${formatNumberWithUnit(realResult.metrics.stt?.roundtrip_ms, "ms")}, deterministic=${formatNumberWithUnit(deterministicResult.metrics.stt?.roundtrip_ms, "ms")}, delta=${formatDelta(realResult.metrics.stt?.roundtrip_ms, deterministicResult.metrics.stt?.roundtrip_ms, 2, "ms")}`,
      `- task_success_rate: real=${formatNumber(realResult.metrics.agent?.task_success_rate)}, deterministic=${formatNumber(deterministicResult.metrics.agent?.task_success_rate)}, delta=${formatDelta(realResult.metrics.agent?.task_success_rate, deterministicResult.metrics.agent?.task_success_rate)}`
    ];
  }
  if (RENDERER_FALLBACK_LABEL_BY_REPO[repoName]) {
    return [
      adapterStatusLine(realAdapter, deterministicAdapter, RENDERER_FALLBACK_LABEL_BY_REPO[repoName]),
      `- avg_fps: real=${formatNumber(realResult.metrics.graphics?.avg_fps)}, deterministic=${formatNumber(deterministicResult.metrics.graphics?.avg_fps)}, delta=${formatDelta(realResult.metrics.graphics?.avg_fps, deterministicResult.metrics.graphics?.avg_fps)}`,
      `- p95_frametime: real=${formatNumberWithUnit(realResult.metrics.graphics?.p95_frametime_ms, "ms")}, deterministic=${formatNumberWithUnit(deterministicResult.metrics.graphics?.p95_frametime_ms, "ms")}, delta=${formatDelta(realResult.metrics.graphics?.p95_frametime_ms, deterministicResult.metrics.graphics?.p95_frametime_ms, 2, "ms")}`,
      `- scene_load_ms: real=${formatNumberWithUnit(realResult.metrics.graphics?.scene_load_ms, "ms")}, deterministic=${formatNumberWithUnit(deterministicResult.metrics.graphics?.scene_load_ms, "ms")}, delta=${formatDelta(realResult.metrics.graphics?.scene_load_ms, deterministicResult.metrics.graphics?.scene_load_ms, 2, "ms")}`
    ];
  }
  return [];
}

function fallbackComparisonLines(repoName, results) {
  if (!results.some((result) => result.environment?.fallback_triggered) || !results.some((result) => !result.environment?.fallback_triggered)) {
    return [];
  }

  if (repoName === "exp-embeddings-browser-throughput") {
    const lines = [];
    for (const cacheState of ["cold", "warm"]) {
      const webgpu = results.find((result) => result.environment.cache_state === cacheState && !result.environment.fallback_triggered);
      const fallback = results.find((result) => result.environment.cache_state === cacheState && result.environment.fallback_triggered);
      if (!webgpu || !fallback) {
        continue;
      }
      lines.push(`- ${cacheState} cache: docs/s webgpu=${formatNumber(webgpu.metrics.embeddings?.docs_per_sec)}, fallback=${formatNumber(fallback.metrics.embeddings?.docs_per_sec)}, delta=${formatDelta(webgpu.metrics.embeddings?.docs_per_sec, fallback.metrics.embeddings?.docs_per_sec)}; queries/s delta=${formatDelta(webgpu.metrics.embeddings?.queries_per_sec, fallback.metrics.embeddings?.queries_per_sec)}; recall delta=${formatDelta(webgpu.metrics.embeddings?.recall_at_10, fallback.metrics.embeddings?.recall_at_10)}`);
    }
    return lines;
  }

  if (repoName === "bench-embeddings-latency-quality") {
    const webgpu = results.find((result) => !result.environment.fallback_triggered);
    const fallback = results.find((result) => result.environment.fallback_triggered);
    if (!webgpu || !fallback) {
      return [];
    }
    return [
      `- embeddings benchmark: webgpu winner=${webgpu.workload?.model_id || "-"}, fallback winner=${fallback.workload?.model_id || "-"}`,
      `- docs/s: webgpu=${formatNumber(webgpu.metrics.embeddings?.docs_per_sec)}, fallback=${formatNumber(fallback.metrics.embeddings?.docs_per_sec)}, delta=${formatDelta(webgpu.metrics.embeddings?.docs_per_sec, fallback.metrics.embeddings?.docs_per_sec)}`,
      `- queries/s: webgpu=${formatNumber(webgpu.metrics.embeddings?.queries_per_sec)}, fallback=${formatNumber(fallback.metrics.embeddings?.queries_per_sec)}, delta=${formatDelta(webgpu.metrics.embeddings?.queries_per_sec, fallback.metrics.embeddings?.queries_per_sec)}`,
      `- recall@10: webgpu=${formatNumber(webgpu.metrics.embeddings?.recall_at_10)}, fallback=${formatNumber(fallback.metrics.embeddings?.recall_at_10)}, delta=${formatDelta(webgpu.metrics.embeddings?.recall_at_10, fallback.metrics.embeddings?.recall_at_10)}`
    ];
  }

  if (repoName === "bench-reranker-latency") {
    const webgpu = results.find((result) => !result.environment.fallback_triggered);
    const fallback = results.find((result) => result.environment.fallback_triggered);
    if (!webgpu || !fallback) {
      return [];
    }
    return [
      `- reranker benchmark: webgpu winner=${webgpu.workload?.model_id || "-"}, fallback winner=${fallback.workload?.model_id || "-"}`,
      `- candidates/s: webgpu=${formatNumber(webgpu.metrics.embeddings?.docs_per_sec)}, fallback=${formatNumber(fallback.metrics.embeddings?.docs_per_sec)}, delta=${formatDelta(webgpu.metrics.embeddings?.docs_per_sec, fallback.metrics.embeddings?.docs_per_sec)}`,
      `- p95_ms: webgpu=${formatNumberWithUnit(webgpu.metrics.embeddings?.p95_ms, "ms")}, fallback=${formatNumberWithUnit(fallback.metrics.embeddings?.p95_ms, "ms")}, delta=${formatDelta(webgpu.metrics.embeddings?.p95_ms, fallback.metrics.embeddings?.p95_ms, 2, "ms")}`,
      `- top-k hit: webgpu=${formatNumber(webgpu.metrics.embeddings?.recall_at_10)}, fallback=${formatNumber(fallback.metrics.embeddings?.recall_at_10)}, delta=${formatDelta(webgpu.metrics.embeddings?.recall_at_10, fallback.metrics.embeddings?.recall_at_10)}`
    ];
  }

  if (repoName === "bench-rag-endtoend") {
    const webgpu = results.find((result) => !result.environment.fallback_triggered);
    const fallback = results.find((result) => result.environment.fallback_triggered);
    if (!webgpu || !fallback) {
      return [];
    }
    return [
      `- RAG end-to-end: webgpu winner=${webgpu.workload?.model_id || "-"}, fallback winner=${fallback.workload?.model_id || "-"}`,
      `- answer_total_ms: webgpu=${formatNumberWithUnit(webgpu.metrics.rag?.answer_total_ms, "ms")}, fallback=${formatNumberWithUnit(fallback.metrics.rag?.answer_total_ms, "ms")}, delta=${formatDelta(webgpu.metrics.rag?.answer_total_ms, fallback.metrics.rag?.answer_total_ms, 2, "ms")}`,
      `- retrieve_ms: webgpu=${formatNumberWithUnit(webgpu.metrics.rag?.retrieve_ms, "ms")}, fallback=${formatNumberWithUnit(fallback.metrics.rag?.retrieve_ms, "ms")}, delta=${formatDelta(webgpu.metrics.rag?.retrieve_ms, fallback.metrics.rag?.retrieve_ms, 2, "ms")}`,
      `- citation_hit_rate: webgpu=${formatNumber(webgpu.metrics.rag?.citation_hit_rate)}, fallback=${formatNumber(fallback.metrics.rag?.citation_hit_rate)}, delta=${formatDelta(webgpu.metrics.rag?.citation_hit_rate, fallback.metrics.rag?.citation_hit_rate)}`
    ];
  }

  if (repoName === "bench-llm-prefill-decode") {
    const webgpu = results.find((result) => !result.environment.fallback_triggered);
    const fallback = results.find((result) => result.environment.fallback_triggered);
    if (!webgpu || !fallback) {
      return [];
    }
    return [
      `- LLM prefill/decode: webgpu winner=${webgpu.workload?.model_id || "-"}, fallback winner=${fallback.workload?.model_id || "-"}`,
      `- decode tok/s: webgpu=${formatNumber(webgpu.metrics.llm?.decode_tok_per_sec)}, fallback=${formatNumber(fallback.metrics.llm?.decode_tok_per_sec)}, delta=${formatDelta(webgpu.metrics.llm?.decode_tok_per_sec, fallback.metrics.llm?.decode_tok_per_sec)}`,
      `- prefill tok/s: webgpu=${formatNumber(webgpu.metrics.llm?.prefill_tok_per_sec)}, fallback=${formatNumber(fallback.metrics.llm?.prefill_tok_per_sec)}, delta=${formatDelta(webgpu.metrics.llm?.prefill_tok_per_sec, fallback.metrics.llm?.prefill_tok_per_sec)}`,
      `- TTFT: webgpu=${formatNumberWithUnit(webgpu.metrics.llm?.ttft_ms, "ms")}, fallback=${formatNumberWithUnit(fallback.metrics.llm?.ttft_ms, "ms")}, delta=${formatDelta(webgpu.metrics.llm?.ttft_ms, fallback.metrics.llm?.ttft_ms, 2, "ms")}`
    ];
  }

  if (repoName === "bench-stt-streaming-latency") {
    const webgpu = results.find((result) => !result.environment.fallback_triggered);
    const fallback = results.find((result) => result.environment.fallback_triggered);
    if (!webgpu || !fallback) {
      return [];
    }
    return [
      `- STT streaming: webgpu winner=${webgpu.workload?.model_id || "-"}, fallback winner=${fallback.workload?.model_id || "-"}`,
      `- first_partial_ms: webgpu=${formatNumberWithUnit(webgpu.metrics.stt?.first_partial_ms, "ms")}, fallback=${formatNumberWithUnit(fallback.metrics.stt?.first_partial_ms, "ms")}, delta=${formatDelta(webgpu.metrics.stt?.first_partial_ms, fallback.metrics.stt?.first_partial_ms, 2, "ms")}`,
      `- final_latency_ms: webgpu=${formatNumberWithUnit(webgpu.metrics.stt?.final_latency_ms, "ms")}, fallback=${formatNumberWithUnit(fallback.metrics.stt?.final_latency_ms, "ms")}, delta=${formatDelta(webgpu.metrics.stt?.final_latency_ms, fallback.metrics.stt?.final_latency_ms, 2, "ms")}`,
      `- WER: webgpu=${formatNumber(webgpu.metrics.stt?.wer, 4)}, fallback=${formatNumber(fallback.metrics.stt?.wer, 4)}, delta=${formatDelta(webgpu.metrics.stt?.wer, fallback.metrics.stt?.wer, 4)}`
    ];
  }

  if (repoName === "bench-voice-roundtrip") {
    const webgpu = results.find((result) => !result.environment.fallback_triggered);
    const fallback = results.find((result) => result.environment.fallback_triggered);
    if (!webgpu || !fallback) {
      return [];
    }
    return [
      `- Voice roundtrip: webgpu winner=${webgpu.workload?.model_id || "-"}, fallback winner=${fallback.workload?.model_id || "-"}`,
      `- first_partial_ms: webgpu=${formatNumberWithUnit(webgpu.metrics.stt?.first_partial_ms, "ms")}, fallback=${formatNumberWithUnit(fallback.metrics.stt?.first_partial_ms, "ms")}, delta=${formatDelta(webgpu.metrics.stt?.first_partial_ms, fallback.metrics.stt?.first_partial_ms, 2, "ms")}`,
      `- roundtrip_ms: webgpu=${formatNumberWithUnit(webgpu.metrics.stt?.roundtrip_ms, "ms")}, fallback=${formatNumberWithUnit(fallback.metrics.stt?.roundtrip_ms, "ms")}, delta=${formatDelta(webgpu.metrics.stt?.roundtrip_ms, fallback.metrics.stt?.roundtrip_ms, 2, "ms")}`,
      `- WER: webgpu=${formatNumber(webgpu.metrics.stt?.wer, 4)}, fallback=${formatNumber(fallback.metrics.stt?.wer, 4)}, delta=${formatDelta(webgpu.metrics.stt?.wer, fallback.metrics.stt?.wer, 4)}`
    ];
  }

  if (repoName === "bench-multimodal-latency") {
    const webgpu = results.find((result) => !result.environment.fallback_triggered);
    const fallback = results.find((result) => result.environment.fallback_triggered);
    if (!webgpu || !fallback) {
      return [];
    }
    return [
      `- Multimodal latency: webgpu winner=${webgpu.workload?.model_id || "-"}, fallback winner=${fallback.workload?.model_id || "-"}`,
      `- image_preprocess_ms: webgpu=${formatNumberWithUnit(webgpu.metrics.vlm?.image_preprocess_ms, "ms")}, fallback=${formatNumberWithUnit(fallback.metrics.vlm?.image_preprocess_ms, "ms")}, delta=${formatDelta(webgpu.metrics.vlm?.image_preprocess_ms, fallback.metrics.vlm?.image_preprocess_ms, 2, "ms")}`,
      `- image_to_first_token_ms: webgpu=${formatNumberWithUnit(webgpu.metrics.vlm?.image_to_first_token_ms, "ms")}, fallback=${formatNumberWithUnit(fallback.metrics.vlm?.image_to_first_token_ms, "ms")}, delta=${formatDelta(webgpu.metrics.vlm?.image_to_first_token_ms, fallback.metrics.vlm?.image_to_first_token_ms, 2, "ms")}`,
      `- answer_total_ms: webgpu=${formatNumberWithUnit(webgpu.metrics.vlm?.answer_total_ms, "ms")}, fallback=${formatNumberWithUnit(fallback.metrics.vlm?.answer_total_ms, "ms")}, delta=${formatDelta(webgpu.metrics.vlm?.answer_total_ms, fallback.metrics.vlm?.answer_total_ms, 2, "ms")}`,
      `- accuracy_task_score: webgpu=${formatNumber(webgpu.metrics.vlm?.accuracy_task_score)}, fallback=${formatNumber(fallback.metrics.vlm?.accuracy_task_score)}, delta=${formatDelta(webgpu.metrics.vlm?.accuracy_task_score, fallback.metrics.vlm?.accuracy_task_score)}`
    ];
  }

  if (repoName === "bench-diffusion-browser-shootout") {
    const webgpu = results.find((result) => !result.environment.fallback_triggered);
    const fallback = results.find((result) => result.environment.fallback_triggered);
    if (!webgpu || !fallback) {
      return [];
    }
    return [
      `- Diffusion shootout: webgpu winner=${webgpu.workload?.model_id || "-"}, fallback winner=${fallback.workload?.model_id || "-"}`,
      `- sec_per_image: webgpu=${formatNumberWithUnit(webgpu.metrics.diffusion?.sec_per_image, "s")}, fallback=${formatNumberWithUnit(fallback.metrics.diffusion?.sec_per_image, "s")}, delta=${formatDelta(webgpu.metrics.diffusion?.sec_per_image, fallback.metrics.diffusion?.sec_per_image, 3, "s")}`,
      `- steps_per_sec: webgpu=${formatNumber(webgpu.metrics.diffusion?.steps_per_sec)}, fallback=${formatNumber(fallback.metrics.diffusion?.steps_per_sec)}, delta=${formatDelta(webgpu.metrics.diffusion?.steps_per_sec, fallback.metrics.diffusion?.steps_per_sec)}`,
      `- resolution_success_rate: webgpu=${formatNumber(webgpu.metrics.diffusion?.resolution_success_rate)}, fallback=${formatNumber(fallback.metrics.diffusion?.resolution_success_rate)}, delta=${formatDelta(webgpu.metrics.diffusion?.resolution_success_rate, fallback.metrics.diffusion?.resolution_success_rate)}`,
      `- oom_or_fail_rate: webgpu=${formatNumber(webgpu.metrics.diffusion?.oom_or_fail_rate)}, fallback=${formatNumber(fallback.metrics.diffusion?.oom_or_fail_rate)}, delta=${formatDelta(webgpu.metrics.diffusion?.oom_or_fail_rate, fallback.metrics.diffusion?.oom_or_fail_rate)}`
    ];
  }

  if (repoName === "bench-agent-step-latency") {
    const webgpu = results.find((result) => !result.environment.fallback_triggered);
    const fallback = results.find((result) => result.environment.fallback_triggered);
    if (!webgpu || !fallback) {
      return [];
    }
    return [
      `- Agent step latency: webgpu winner=${webgpu.workload?.model_id || "-"}, fallback winner=${fallback.workload?.model_id || "-"}`,
      `- task_success_rate: webgpu=${formatNumber(webgpu.metrics.agent?.task_success_rate)}, fallback=${formatNumber(fallback.metrics.agent?.task_success_rate)}, delta=${formatDelta(webgpu.metrics.agent?.task_success_rate, fallback.metrics.agent?.task_success_rate)}`,
      `- avg_step_latency_ms: webgpu=${formatNumberWithUnit(webgpu.metrics.agent?.avg_step_latency_ms, "ms")}, fallback=${formatNumberWithUnit(fallback.metrics.agent?.avg_step_latency_ms, "ms")}, delta=${formatDelta(webgpu.metrics.agent?.avg_step_latency_ms, fallback.metrics.agent?.avg_step_latency_ms, 2, "ms")}`,
      `- tool_call_success_rate: webgpu=${formatNumber(webgpu.metrics.agent?.tool_call_success_rate)}, fallback=${formatNumber(fallback.metrics.agent?.tool_call_success_rate)}, delta=${formatDelta(webgpu.metrics.agent?.tool_call_success_rate, fallback.metrics.agent?.tool_call_success_rate)}`,
      `- user_intervention_count: webgpu=${formatNumber(webgpu.metrics.agent?.user_intervention_count, 0)}, fallback=${formatNumber(fallback.metrics.agent?.user_intervention_count, 0)}, delta=${formatDelta(webgpu.metrics.agent?.user_intervention_count, fallback.metrics.agent?.user_intervention_count, 0)}`
    ];
  }

  if (repoName === "bench-webgpu-vs-wasm-parity") {
    const webgpu = results.find((result) => !result.environment.fallback_triggered);
    const fallback = results.find((result) => result.environment.fallback_triggered);
    if (!webgpu || !fallback) {
      return [];
    }
    return [
      `- parity pass rate: webgpu=${formatNumber(webgpu.metrics.common?.success_rate)}, fallback=${formatNumber(fallback.metrics.common?.success_rate)}, delta=${formatDelta(webgpu.metrics.common?.success_rate, fallback.metrics.common?.success_rate)}`,
      `- comparison latency: webgpu=${formatNumberWithUnit(webgpu.metrics.common?.init_ms, "ms")}, fallback=${formatNumberWithUnit(fallback.metrics.common?.init_ms, "ms")}, delta=${formatDelta(webgpu.metrics.common?.init_ms, fallback.metrics.common?.init_ms, 2, "ms")}`,
      `- webgpu notes: ${webgpu.meta.notes || "-"}`,
      `- fallback notes: ${fallback.meta.notes || "-"}`
    ];
  }

  if (repoName === "bench-blackhole-render-shootout") {
    const webgpu = results.find((result) => !result.environment.fallback_triggered);
    const fallback = results.find((result) => result.environment.fallback_triggered);
    if (!webgpu || !fallback) {
      return [];
    }
    return [
      `- blackhole renderer winner: webgpu=${webgpu.workload?.model_id || "-"}, fallback=${fallback.workload?.model_id || "-"}`,
      `- avg_fps: webgpu=${formatNumber(webgpu.metrics.graphics?.avg_fps)}, fallback=${formatNumber(fallback.metrics.graphics?.avg_fps)}, delta=${formatDelta(webgpu.metrics.graphics?.avg_fps, fallback.metrics.graphics?.avg_fps)}`,
      `- p95_frametime_ms: webgpu=${formatNumberWithUnit(webgpu.metrics.graphics?.p95_frametime_ms, "ms")}, fallback=${formatNumberWithUnit(fallback.metrics.graphics?.p95_frametime_ms, "ms")}, delta=${formatDelta(webgpu.metrics.graphics?.p95_frametime_ms, fallback.metrics.graphics?.p95_frametime_ms, 2, "ms")}`,
      `- ray_steps: webgpu=${formatNumber(webgpu.metrics.graphics?.ray_steps, 0)}, fallback=${formatNumber(fallback.metrics.graphics?.ray_steps, 0)}`
    ];
  }

  if (repoName === "bench-renderer-shootout") {
    const webgpu = results.find((result) => !result.environment.fallback_triggered);
    const fallback = results.find((result) => result.environment.fallback_triggered);
    if (!webgpu || !fallback) {
      return [];
    }
    return [
      `- renderer winner: webgpu=${webgpu.workload?.model_id || "-"}, fallback=${fallback.workload?.model_id || "-"}`,
      `- avg_fps: webgpu=${formatNumber(webgpu.metrics.graphics?.avg_fps)}, fallback=${formatNumber(fallback.metrics.graphics?.avg_fps)}, delta=${formatDelta(webgpu.metrics.graphics?.avg_fps, fallback.metrics.graphics?.avg_fps)}`,
      `- p95_frametime_ms: webgpu=${formatNumberWithUnit(webgpu.metrics.graphics?.p95_frametime_ms, "ms")}, fallback=${formatNumberWithUnit(fallback.metrics.graphics?.p95_frametime_ms, "ms")}, delta=${formatDelta(webgpu.metrics.graphics?.p95_frametime_ms, fallback.metrics.graphics?.p95_frametime_ms, 2, "ms")}`,
      `- scene_load_ms: webgpu=${formatNumberWithUnit(webgpu.metrics.graphics?.scene_load_ms, "ms")}, fallback=${formatNumberWithUnit(fallback.metrics.graphics?.scene_load_ms, "ms")}, delta=${formatDelta(webgpu.metrics.graphics?.scene_load_ms, fallback.metrics.graphics?.scene_load_ms, 2, "ms")}`
    ];
  }

  if (repoName === "exp-llm-chat-runtime-shootout") {
    const lines = [];
    for (const modelId of uniqueValues(results.map((result) => result.workload?.model_id))) {
      const webgpu = results.find((result) => result.workload?.model_id === modelId && !result.environment.fallback_triggered);
      const fallback = results.find((result) => result.workload?.model_id === modelId && result.environment.fallback_triggered);
      if (!webgpu || !fallback) {
        continue;
      }
      lines.push(`- ${modelId}: decode tok/s webgpu=${formatNumber(webgpu.metrics.llm?.decode_tok_per_sec)}, fallback=${formatNumber(fallback.metrics.llm?.decode_tok_per_sec)}, delta=${formatDelta(webgpu.metrics.llm?.decode_tok_per_sec, fallback.metrics.llm?.decode_tok_per_sec)}; TTFT delta=${formatDelta(webgpu.metrics.llm?.ttft_ms, fallback.metrics.llm?.ttft_ms, 2, "ms")}; worker ${webgpu.environment.worker_mode} -> ${fallback.environment.worker_mode}`);
    }
    return lines;
  }

  if (repoName === "exp-ort-webgpu-baseline") {
    const webgpu = results.find((result) => !result.environment.fallback_triggered);
    const fallback = results.find((result) => result.environment.fallback_triggered);
    if (!webgpu || !fallback) {
      return [];
    }
    return [
      `- provider readiness: webgpu=${scenarioLabel(repoName, webgpu)}, fallback=${scenarioLabel(repoName, fallback)}`,
      `- throughput units/s: webgpu=${formatNumber(webgpu.metrics.llm?.decode_tok_per_sec)}, fallback=${formatNumber(fallback.metrics.llm?.decode_tok_per_sec)}, delta=${formatDelta(webgpu.metrics.llm?.decode_tok_per_sec, fallback.metrics.llm?.decode_tok_per_sec)}`,
      `- first output: webgpu=${formatNumberWithUnit(webgpu.metrics.llm?.ttft_ms, "ms")}, fallback=${formatNumberWithUnit(fallback.metrics.llm?.ttft_ms, "ms")}, delta=${formatDelta(webgpu.metrics.llm?.ttft_ms, fallback.metrics.llm?.ttft_ms, 2, "ms")}`
    ];
  }

  if (repoName === "bench-runtime-shootout") {
    const webgpu = results.find((result) => !result.environment.fallback_triggered);
    const fallback = results.find((result) => result.environment.fallback_triggered);
    if (!webgpu || !fallback) {
      return [];
    }
    return [
      `- fixed benchmark: webgpu winner=${scenarioLabel(repoName, webgpu)}, fallback winner=${scenarioLabel(repoName, fallback)}`,
      `- decode tok/s: webgpu=${formatNumber(webgpu.metrics.llm?.decode_tok_per_sec)}, fallback=${formatNumber(fallback.metrics.llm?.decode_tok_per_sec)}, delta=${formatDelta(webgpu.metrics.llm?.decode_tok_per_sec, fallback.metrics.llm?.decode_tok_per_sec)}`,
      `- TTFT: webgpu=${formatNumberWithUnit(webgpu.metrics.llm?.ttft_ms, "ms")}, fallback=${formatNumberWithUnit(fallback.metrics.llm?.ttft_ms, "ms")}, delta=${formatDelta(webgpu.metrics.llm?.ttft_ms, fallback.metrics.llm?.ttft_ms, 2, "ms")}`
    ];
  }

  return [];
}

function repoObservations(repoName, results) {
  const first = results[0];
  const notes = [];

  if (repoName === "tpl-webgpu-vanilla" || repoName === "tpl-webgpu-react") {
    notes.push(`- starter backend는 ${first.environment.backend}이고 fallback_triggered=${formatBoolean(first.environment.fallback_triggered)}로 기록됐다.`);
    notes.push(`- frame pacing summary는 avg_fps=${formatNumber(first.metrics.graphics?.avg_fps)}, p95_frametime_ms=${formatNumber(first.metrics.graphics?.p95_frametime_ms)}였다.`);
  } else if (repoName === "exp-three-webgpu-core") {
    notes.push(`- scene readiness baseline은 backend=${first.environment.backend}, fallback_triggered=${formatBoolean(first.environment.fallback_triggered)}로 기록됐다.`);
    notes.push(`- graphics summary는 avg_fps=${formatNumber(first.metrics.graphics?.avg_fps)}, p95_frametime_ms=${formatNumber(first.metrics.graphics?.p95_frametime_ms)}, scene_load_ms=${formatNumber(first.metrics.graphics?.scene_load_ms)}였다.`);
  } else if (repoName === "exp-babylon-webgpu-core") {
    notes.push(`- Babylon scene readiness baseline은 backend=${first.environment.backend}, fallback_triggered=${formatBoolean(first.environment.fallback_triggered)}로 기록됐다.`);
    notes.push(`- graphics summary는 avg_fps=${formatNumber(first.metrics.graphics?.avg_fps)}, p95_frametime_ms=${formatNumber(first.metrics.graphics?.p95_frametime_ms)}, scene_load_ms=${formatNumber(first.metrics.graphics?.scene_load_ms)}였다.`);
  } else if (repoName === "exp-playcanvas-webgpu-core") {
    notes.push(`- PlayCanvas scene readiness baseline은 backend=${first.environment.backend}, fallback_triggered=${formatBoolean(first.environment.fallback_triggered)}로 기록됐다.`);
    notes.push(`- graphics summary는 avg_fps=${formatNumber(first.metrics.graphics?.avg_fps)}, p95_frametime_ms=${formatNumber(first.metrics.graphics?.p95_frametime_ms)}, scene_load_ms=${formatNumber(first.metrics.graphics?.scene_load_ms)}였다.`);
  } else if (repoName === "exp-blackhole-three-singularity") {
    notes.push(`- blackhole singularity baseline은 backend=${first.environment.backend}, fallback_triggered=${formatBoolean(first.environment.fallback_triggered)}로 기록됐다.`);
    notes.push(`- graphics summary는 avg_fps=${formatNumber(first.metrics.graphics?.avg_fps)}, p95_frametime_ms=${formatNumber(first.metrics.graphics?.p95_frametime_ms)}, scene_load_ms=${formatNumber(first.metrics.graphics?.scene_load_ms)}였다.`);
    notes.push(`- lensing metadata는 ray_steps=${formatNumber(first.metrics.graphics?.ray_steps, 0)}, taa_enabled=${formatBoolean(first.metrics.graphics?.taa_enabled)}, resolution_scale=${formatNumber(first.metrics.graphics?.resolution_scale)}로 남았다.`);
  } else if (repoName === "exp-blackhole-kerr-engine") {
    notes.push(`- Kerr engine readiness baseline은 backend=${first.environment.backend}, fallback_triggered=${formatBoolean(first.environment.fallback_triggered)}로 기록됐다.`);
    notes.push(`- graphics summary는 avg_fps=${formatNumber(first.metrics.graphics?.avg_fps)}, p95_frametime_ms=${formatNumber(first.metrics.graphics?.p95_frametime_ms)}, scene_load_ms=${formatNumber(first.metrics.graphics?.scene_load_ms)}였다.`);
    notes.push(`- Kerr metadata는 ${first.meta.notes || "-"}로 남았다.`);
  } else if (repoName === "exp-blackhole-webgpu-fromscratch") {
    notes.push(`- Raw WebGPU blackhole readiness baseline은 backend=${first.environment.backend}, fallback_triggered=${formatBoolean(first.environment.fallback_triggered)}로 기록됐다.`);
    notes.push(`- graphics summary는 avg_fps=${formatNumber(first.metrics.graphics?.avg_fps)}, p95_frametime_ms=${formatNumber(first.metrics.graphics?.p95_frametime_ms)}, scene_load_ms=${formatNumber(first.metrics.graphics?.scene_load_ms)}였다.`);
    notes.push(`- raw WebGPU metadata는 ${first.meta.notes || "-"}로 남았다.`);
  } else if (repoName === "exp-nbody-webgpu-core") {
    notes.push(`- N-body compute readiness baseline은 backend=${first.environment.backend}, fallback_triggered=${formatBoolean(first.environment.fallback_triggered)}로 기록됐다.`);
    notes.push(`- compute summary는 steps_per_sec=${formatNumber(first.metrics.compute?.steps_per_sec)}, avg_dispatch_ms=${formatNumber(first.metrics.compute?.avg_dispatch_ms, 4)}, p95_dispatch_ms=${formatNumber(first.metrics.compute?.p95_dispatch_ms, 4)}였다.`);
    notes.push(`- compute metadata는 ${first.meta.notes || "-"}로 남았다.`);
  } else if (repoName === "exp-fluid-webgpu-core") {
    notes.push(`- fluid compute readiness baseline은 backend=${first.environment.backend}, fallback_triggered=${formatBoolean(first.environment.fallback_triggered)}로 기록됐다.`);
    notes.push(`- compute summary는 steps_per_sec=${formatNumber(first.metrics.compute?.steps_per_sec)}, pressure_solve_ms=${formatNumber(first.metrics.compute?.pressure_solve_ms, 4)}, divergence_error_pct=${formatNumber(first.metrics.compute?.divergence_error_pct, 4)}였다.`);
    notes.push(`- fluid metadata는 ${first.meta.notes || "-"}로 남았다.`);
  } else if (repoName === "exp-three-webgpu-particles-stress") {
    notes.push(`- particle stress readiness baseline은 backend=${first.environment.backend}, fallback_triggered=${formatBoolean(first.environment.fallback_triggered)}로 기록됐다.`);
    notes.push(`- graphics summary는 avg_fps=${formatNumber(first.metrics.graphics?.avg_fps)}, p95_frametime_ms=${formatNumber(first.metrics.graphics?.p95_frametime_ms)}, overdraw_ratio_pct=${formatNumber(first.metrics.graphics?.overdraw_ratio_pct)}였다.`);
    notes.push(`- particle stress metadata는 ${first.meta.notes || "-"}로 남았다.`);
  } else if (repoName === "bench-compute-stress-suite") {
    notes.push(`- compute stress suite benchmark는 backend=${first.environment.backend}, fallback_triggered=${formatBoolean(first.environment.fallback_triggered)}로 기록됐다.`);
    notes.push(`- compute summary는 steps_per_sec=${formatNumber(first.metrics.compute?.steps_per_sec)}, avg_dispatch_ms=${formatNumber(first.metrics.compute?.avg_dispatch_ms, 4)}, p95_dispatch_ms=${formatNumber(first.metrics.compute?.p95_dispatch_ms, 4)}였다.`);
    notes.push(`- compute stress suite metadata는 ${first.meta.notes || "-"}로 남았다.`);
  } else if (repoName === "bench-atomics-and-memory") {
    notes.push(`- atomics and memory benchmark는 backend=${first.environment.backend}, fallback_triggered=${formatBoolean(first.environment.fallback_triggered)}로 기록됐다.`);
    notes.push(`- compute summary는 steps_per_sec=${formatNumber(first.metrics.compute?.steps_per_sec)}, atomics_conflict_pct=${formatNumber(first.metrics.compute?.atomics_conflict_pct, 3)}, memory_bandwidth_gbps=${formatNumber(first.metrics.compute?.memory_bandwidth_gbps)}였다.`);
    notes.push(`- atomics memory metadata는 ${first.meta.notes || "-"}로 남았다.`);
  } else if (repoName === "bench-texture-upload-and-streaming") {
    notes.push(`- texture upload and streaming benchmark는 backend=${first.environment.backend}, fallback_triggered=${formatBoolean(first.environment.fallback_triggered)}로 기록됐다.`);
    notes.push(`- graphics summary는 sustained_stream_mbps=${formatNumber(first.metrics.graphics?.sustained_stream_mbps)}, upload_frame_ms=${formatNumber(first.metrics.graphics?.upload_frame_ms, 4)}, frame_drop_pct=${formatNumber(first.metrics.graphics?.frame_drop_pct, 3)}였다.`);
    notes.push(`- texture streaming metadata는 ${first.meta.notes || "-"}로 남았다.`);
  } else if (repoName === "exp-pixi-webgpu-2d") {
    notes.push(`- Pixi 2D readiness baseline은 backend=${first.environment.backend}, fallback_triggered=${formatBoolean(first.environment.fallback_triggered)}로 기록됐다.`);
    notes.push(`- graphics summary는 avg_fps=${formatNumber(first.metrics.graphics?.avg_fps)}, p95_frametime_ms=${formatNumber(first.metrics.graphics?.p95_frametime_ms)}, scene_load_ms=${formatNumber(first.metrics.graphics?.scene_load_ms)}였다.`);
    notes.push(`- sprite batching metadata는 ${first.meta.notes || "-"}로 남았다.`);
  } else if (repoName === "exp-luma-webgpu-viz") {
    notes.push(`- Luma viz readiness baseline은 backend=${first.environment.backend}, fallback_triggered=${formatBoolean(first.environment.fallback_triggered)}로 기록됐다.`);
    notes.push(`- graphics summary는 avg_fps=${formatNumber(first.metrics.graphics?.avg_fps)}, p95_frametime_ms=${formatNumber(first.metrics.graphics?.p95_frametime_ms)}, scene_load_ms=${formatNumber(first.metrics.graphics?.scene_load_ms)}였다.`);
    notes.push(`- layer/attribute metadata는 ${first.meta.notes || "-"}로 남았다.`);
  } else if (repoName === "exp-deckgl-webgpu-readiness") {
    notes.push(`- Deck.gl readiness baseline은 backend=${first.environment.backend}, fallback_triggered=${formatBoolean(first.environment.fallback_triggered)}로 기록됐다.`);
    notes.push(`- graphics summary는 avg_fps=${formatNumber(first.metrics.graphics?.avg_fps)}, p95_frametime_ms=${formatNumber(first.metrics.graphics?.p95_frametime_ms)}, scene_load_ms=${formatNumber(first.metrics.graphics?.scene_load_ms)}였다.`);
    notes.push(`- viewport/layer/picking metadata는 ${first.meta.notes || "-"}로 남았다.`);
  } else if (repoName === "bench-blackhole-render-shootout") {
    const sorted = [...results].sort((left, right) => (right.metrics.graphics?.avg_fps || 0) - (left.metrics.graphics?.avg_fps || 0));
    notes.push(`- blackhole renderer shootout은 backend=${first.environment.backend}, fallback_triggered=${formatBoolean(first.environment.fallback_triggered)}로 기록됐다.`);
    notes.push(`- 최고 avg_fps는 ${scenarioLabel(repoName, sorted[0])}의 ${formatNumber(sorted[0].metrics.graphics?.avg_fps)}였고 winner=${sorted[0].workload?.model_id || "-"}였다.`);
    notes.push(`- renderer metadata는 ray_steps=${formatNumber(first.metrics.graphics?.ray_steps, 0)}, taa_enabled=${formatBoolean(first.metrics.graphics?.taa_enabled)}, resolution_scale=${formatNumber(first.metrics.graphics?.resolution_scale)}로 남았다.`);
  } else if (repoName === "bench-renderer-shootout") {
    const sorted = [...results].sort((left, right) => (right.metrics.graphics?.avg_fps || 0) - (left.metrics.graphics?.avg_fps || 0));
    notes.push(`- renderer shootout은 backend=${first.environment.backend}, fallback_triggered=${formatBoolean(first.environment.fallback_triggered)}로 기록됐다.`);
    notes.push(`- 최고 avg_fps는 ${scenarioLabel(repoName, sorted[0])}의 ${formatNumber(sorted[0].metrics.graphics?.avg_fps)}였고 winner=${sorted[0].workload?.model_id || "-"}였다.`);
    notes.push(`- renderer metadata는 taa_enabled=${formatBoolean(first.metrics.graphics?.taa_enabled)}, resolution_scale=${formatNumber(first.metrics.graphics?.resolution_scale)}, renderer=${first.workload?.renderer || "-"}로 남았다.`);
  } else if (repoName === "exp-embeddings-browser-throughput") {
    const cold = results.find((result) => result.environment.cache_state === "cold");
    const warm = results.find((result) => result.environment.cache_state === "warm");
    if (cold && warm) {
      const delta = round((warm.metrics.embeddings?.docs_per_sec || 0) - (cold.metrics.embeddings?.docs_per_sec || 0));
      notes.push(`- warm run docs_per_sec는 ${formatNumber(warm.metrics.embeddings?.docs_per_sec)}이고 cold 대비 delta는 ${formatNumber(delta)}였다.`);
      notes.push(`- recall@10은 cold=${formatNumber(cold.metrics.embeddings?.recall_at_10)}, warm=${formatNumber(warm.metrics.embeddings?.recall_at_10)}로 유지됐다.`);
    }
  } else if (repoName === "exp-llm-chat-runtime-shootout") {
    const sorted = [...results].sort((left, right) => (right.metrics.llm?.decode_tok_per_sec || 0) - (left.metrics.llm?.decode_tok_per_sec || 0));
    notes.push(`- 최고 decode throughput은 ${scenarioLabel(repoName, sorted[0])}의 ${formatNumber(sorted[0].metrics.llm?.decode_tok_per_sec)} tok/s였다.`);
    notes.push(`- 가장 낮은 TTFT는 ${scenarioLabel(repoName, [...results].sort((left, right) => (left.metrics.llm?.ttft_ms || 0) - (right.metrics.llm?.ttft_ms || 0))[0])}에서 관찰됐다.`);
  } else if (repoName === "exp-ort-webgpu-baseline") {
    const webgpu = results.find((result) => !result.environment.fallback_triggered);
    const fallback = results.find((result) => result.environment.fallback_triggered);
    notes.push(`- ORT provider readiness baseline은 backend=${first.environment.backend}, worker_mode=${first.environment.worker_mode}로 기록됐다.`);
    if (webgpu && fallback) {
      notes.push(`- WebGPU provider throughput=${formatNumber(webgpu.metrics.llm?.decode_tok_per_sec)} units/s, fallback throughput=${formatNumber(fallback.metrics.llm?.decode_tok_per_sec)} units/s였다.`);
    }
  } else if (repoName === "exp-webllm-browser-chat") {
    notes.push(`- WebLLM browser chat baseline은 backend=${first.environment.backend}, worker_mode=${first.environment.worker_mode}로 기록됐다.`);
    notes.push(`- readiness summary는 TTFT=${formatNumber(first.metrics.llm?.ttft_ms)} ms, decode=${formatNumber(first.metrics.llm?.decode_tok_per_sec)} tok/s였다.`);
  } else if (repoName === "exp-llm-worker-ux") {
    const worker = results.find((result) => result.environment.worker_mode === "worker");
    const main = results.find((result) => result.environment.worker_mode === "main");
    if (worker && main) {
      notes.push(`- worker mode decode=${formatNumber(worker.metrics.llm?.decode_tok_per_sec)} tok/s, main mode decode=${formatNumber(main.metrics.llm?.decode_tok_per_sec)} tok/s로 기록됐다.`);
      notes.push(`- TTFT는 worker=${formatNumber(worker.metrics.llm?.ttft_ms)} ms, main=${formatNumber(main.metrics.llm?.ttft_ms)} ms로 비교됐다.`);
    } else {
      notes.push(`- LLM worker UX baseline은 worker_mode=${first.environment.worker_mode}, backend=${first.environment.backend}로 기록됐다.`);
    }
  } else if (repoName === "bench-llm-prefill-decode") {
    const sorted = [...results].sort((left, right) => (right.metrics.llm?.decode_tok_per_sec || 0) - (left.metrics.llm?.decode_tok_per_sec || 0));
    notes.push(`- LLM prefill/decode benchmark는 backend=${first.environment.backend}, fallback_triggered=${formatBoolean(first.environment.fallback_triggered)}로 기록됐다.`);
    notes.push(`- 최고 decode throughput은 ${scenarioLabel(repoName, sorted[0])}의 ${formatNumber(sorted[0].metrics.llm?.decode_tok_per_sec)} tok/s였고 TTFT=${formatNumber(sorted[0].metrics.llm?.ttft_ms)} ms였다.`);
  } else if (repoName === "exp-stt-whisper-webgpu") {
    notes.push(`- partial emission은 ${formatNumber(first.metrics.stt?.first_partial_ms)} ms에 시작됐고 최종 latency는 ${formatNumber(first.metrics.stt?.final_latency_ms)} ms였다.`);
    notes.push(`- deterministic transcript fixture 기준 WER=${formatNumber(first.metrics.stt?.wer, 4)}, CER=${formatNumber(first.metrics.stt?.cer, 4)}가 기록됐다.`);
  } else if (repoName === "exp-voice-assistant-local") {
    notes.push(`- local voice assistant readiness baseline은 backend=${first.environment.backend}, fallback_triggered=${formatBoolean(first.environment.fallback_triggered)}, worker_mode=${first.environment.worker_mode}로 기록됐다.`);
    notes.push(`- voice summary는 first_partial_ms=${formatNumber(first.metrics.stt?.first_partial_ms)}, final_latency_ms=${formatNumber(first.metrics.stt?.final_latency_ms)}, roundtrip_ms=${formatNumber(first.metrics.stt?.roundtrip_ms)}였다.`);
    notes.push(`- voice assistant metadata는 ${first.meta.notes || "-"}로 남았다.`);
  } else if (repoName === "bench-voice-roundtrip") {
    const sorted = [...results].sort((left, right) => (left.metrics.stt?.roundtrip_ms || 0) - (right.metrics.stt?.roundtrip_ms || 0));
    notes.push(`- voice roundtrip benchmark는 backend=${first.environment.backend}, fallback_triggered=${formatBoolean(first.environment.fallback_triggered)}로 기록됐다.`);
    notes.push(`- 가장 낮은 roundtrip_ms는 ${scenarioLabel(repoName, sorted[0])}의 ${formatNumber(sorted[0].metrics.stt?.roundtrip_ms)} ms였고 first_partial_ms=${formatNumber(sorted[0].metrics.stt?.first_partial_ms)} ms였다.`);
    notes.push(`- voice benchmark metadata는 ${first.meta.notes || "-"}로 남았다.`);
  } else if (repoName === "exp-vlm-browser-multimodal") {
    notes.push(`- browser VLM multimodal readiness baseline은 backend=${first.environment.backend}, fallback_triggered=${formatBoolean(first.environment.fallback_triggered)}, worker_mode=${first.environment.worker_mode}로 기록됐다.`);
    notes.push(`- multimodal summary는 image_preprocess_ms=${formatNumber(first.metrics.vlm?.image_preprocess_ms)}, image_to_first_token_ms=${formatNumber(first.metrics.vlm?.image_to_first_token_ms)}, answer_total_ms=${formatNumber(first.metrics.vlm?.answer_total_ms)}였다.`);
    notes.push(`- vlm metadata는 ${first.meta.notes || "-"}로 남았다.`);
  } else if (repoName === "bench-multimodal-latency") {
    const sorted = [...results].sort((left, right) => (left.metrics.vlm?.answer_total_ms || 0) - (right.metrics.vlm?.answer_total_ms || 0));
    notes.push(`- multimodal latency benchmark는 backend=${first.environment.backend}, fallback_triggered=${formatBoolean(first.environment.fallback_triggered)}로 기록됐다.`);
    notes.push(`- 가장 낮은 answer_total_ms는 ${scenarioLabel(repoName, sorted[0])}의 ${formatNumber(sorted[0].metrics.vlm?.answer_total_ms)} ms였고 accuracy_task_score=${formatNumber(sorted[0].metrics.vlm?.accuracy_task_score)}였다.`);
    notes.push(`- multimodal benchmark metadata는 ${first.meta.notes || "-"}로 남았다.`);
  } else if (repoName === "bench-diffusion-browser-shootout") {
    const sorted = [...results].sort((left, right) => (left.metrics.diffusion?.sec_per_image || 0) - (right.metrics.diffusion?.sec_per_image || 0));
    notes.push(`- diffusion browser shootout는 backend=${first.environment.backend}, fallback_triggered=${formatBoolean(first.environment.fallback_triggered)}로 기록됐다.`);
    notes.push(`- 가장 낮은 sec_per_image는 ${scenarioLabel(repoName, sorted[0])}의 ${formatNumber(sorted[0].metrics.diffusion?.sec_per_image)} s였고 resolution_success_rate=${formatNumber(sorted[0].metrics.diffusion?.resolution_success_rate)}였다.`);
    notes.push(`- diffusion benchmark metadata는 ${first.meta.notes || "-"}로 남았다.`);
  } else if (repoName === "exp-diffusion-webgpu-browser") {
    notes.push(`- browser diffusion readiness baseline은 backend=${first.environment.backend}, fallback_triggered=${formatBoolean(first.environment.fallback_triggered)}, worker_mode=${first.environment.worker_mode}로 기록됐다.`);
    notes.push(`- diffusion summary는 sec_per_image=${formatNumber(first.metrics.diffusion?.sec_per_image)}, steps_per_sec=${formatNumber(first.metrics.diffusion?.steps_per_sec)}, oom_or_fail_rate=${formatNumber(first.metrics.diffusion?.oom_or_fail_rate)}였다.`);
    notes.push(`- diffusion metadata는 ${first.meta.notes || "-"}로 남았다.`);
  } else if (repoName === "exp-browser-agent-local") {
    notes.push(`- browser agent local readiness baseline은 backend=${first.environment.backend}, fallback_triggered=${formatBoolean(first.environment.fallback_triggered)}, worker_mode=${first.environment.worker_mode}로 기록됐다.`);
    notes.push(`- agent summary는 task_success_rate=${formatNumber(first.metrics.agent?.task_success_rate)}, avg_step_latency_ms=${formatNumber(first.metrics.agent?.avg_step_latency_ms)}, tool_call_success_rate=${formatNumber(first.metrics.agent?.tool_call_success_rate)}였다.`);
    notes.push(`- agent metadata는 ${first.meta.notes || "-"}로 남았다.`);
  } else if (repoName === "bench-agent-step-latency") {
    const sorted = [...results].sort((left, right) => (left.metrics.agent?.avg_step_latency_ms || 0) - (right.metrics.agent?.avg_step_latency_ms || 0));
    notes.push(`- agent step latency benchmark는 backend=${first.environment.backend}, fallback_triggered=${formatBoolean(first.environment.fallback_triggered)}로 기록됐다.`);
    notes.push(`- 가장 낮은 avg_step_latency_ms는 ${scenarioLabel(repoName, sorted[0])}의 ${formatNumber(sorted[0].metrics.agent?.avg_step_latency_ms)} ms였고 task_success_rate=${formatNumber(sorted[0].metrics.agent?.task_success_rate)}였다.`);
    notes.push(`- agent benchmark metadata는 ${first.meta.notes || "-"}로 남았다.`);
  } else if (repoName === "bench-stt-streaming-latency") {
    const sorted = [...results].sort((left, right) => (left.metrics.stt?.first_partial_ms || 0) - (right.metrics.stt?.first_partial_ms || 0));
    notes.push(`- STT streaming benchmark는 backend=${first.environment.backend}, fallback_triggered=${formatBoolean(first.environment.fallback_triggered)}로 기록됐다.`);
    notes.push(`- 가장 낮은 first_partial_ms는 ${scenarioLabel(repoName, sorted[0])}의 ${formatNumber(sorted[0].metrics.stt?.first_partial_ms)} ms였고 WER=${formatNumber(sorted[0].metrics.stt?.wer, 4)}였다.`);
  } else if (repoName === "bench-webgpu-vs-wasm-parity") {
    const sorted = [...results].sort((left, right) => (right.metrics.common?.success_rate || 0) - (left.metrics.common?.success_rate || 0));
    notes.push(`- WebGPU/Wasm parity benchmark는 backend=${first.environment.backend}, fallback_triggered=${formatBoolean(first.environment.fallback_triggered)}로 기록됐다.`);
    notes.push(`- 최고 pass rate는 ${scenarioLabel(repoName, sorted[0])}의 ${formatNumber(sorted[0].metrics.common?.success_rate)}였고 comparison latency=${formatNumber(sorted[0].metrics.common?.init_ms)} ms였다.`);
  } else if (repoName === "exp-rag-browser-pipeline") {
    notes.push(`- end-to-end answer_total_ms는 ${formatNumber(first.metrics.rag?.answer_total_ms)} ms, citation_hit_rate는 ${formatNumber(first.metrics.rag?.citation_hit_rate)}였다.`);
    notes.push(`- 이 baseline은 fixture 기반 extractive answer여서 retrieval/rerank 경로 검증용으로 해석하는 편이 맞다.`);
  } else if (repoName === "exp-reranker-browser") {
    notes.push(`- browser reranker baseline은 backend=${first.environment.backend}, fallback_triggered=${formatBoolean(first.environment.fallback_triggered)}로 기록됐다.`);
    notes.push(`- reranker summary는 candidates/sec=${formatNumber(first.metrics.embeddings?.docs_per_sec)}, p95_ms=${formatNumber(first.metrics.embeddings?.p95_ms)}, top-k hit=${formatNumber(first.metrics.embeddings?.recall_at_10)}였다.`);
  } else if (repoName === "bench-embeddings-latency-quality") {
    const sorted = [...results].sort((left, right) => (right.metrics.embeddings?.docs_per_sec || 0) - (left.metrics.embeddings?.docs_per_sec || 0));
    notes.push(`- embeddings latency/quality benchmark는 backend=${first.environment.backend}, fallback_triggered=${formatBoolean(first.environment.fallback_triggered)}로 기록됐다.`);
    notes.push(`- 최고 docs_per_sec는 ${scenarioLabel(repoName, sorted[0])}의 ${formatNumber(sorted[0].metrics.embeddings?.docs_per_sec)}였고 recall@10=${formatNumber(sorted[0].metrics.embeddings?.recall_at_10)}였다.`);
  } else if (repoName === "bench-reranker-latency") {
    const sorted = [...results].sort((left, right) => (right.metrics.embeddings?.docs_per_sec || 0) - (left.metrics.embeddings?.docs_per_sec || 0));
    notes.push(`- reranker latency benchmark는 backend=${first.environment.backend}, fallback_triggered=${formatBoolean(first.environment.fallback_triggered)}로 기록됐다.`);
    notes.push(`- 최고 candidates/sec는 ${scenarioLabel(repoName, sorted[0])}의 ${formatNumber(sorted[0].metrics.embeddings?.docs_per_sec)}였고 top-k hit=${formatNumber(sorted[0].metrics.embeddings?.recall_at_10)}였다.`);
  } else if (repoName === "bench-rag-endtoend") {
    const sorted = [...results].sort((left, right) => (left.metrics.rag?.answer_total_ms || 0) - (right.metrics.rag?.answer_total_ms || 0));
    notes.push(`- RAG end-to-end benchmark는 backend=${first.environment.backend}, fallback_triggered=${formatBoolean(first.environment.fallback_triggered)}로 기록됐다.`);
    notes.push(`- 가장 낮은 answer_total_ms는 ${scenarioLabel(repoName, sorted[0])}의 ${formatNumber(sorted[0].metrics.rag?.answer_total_ms)} ms였고 citation_hit_rate=${formatNumber(sorted[0].metrics.rag?.citation_hit_rate)}였다.`);
  } else if (repoName === "app-private-rag-lab") {
    notes.push(`- private RAG lab demo는 answer_total_ms=${formatNumber(first.metrics.rag?.answer_total_ms)} ms, citation_hit_rate=${formatNumber(first.metrics.rag?.citation_hit_rate)}로 기록됐다.`);
    notes.push(`- local-only app surface가 ingest, retrieve, rerank, answer 지표를 같은 결과 문서에 남긴다.`);
  } else if (repoName === "app-voice-agent-lab") {
    notes.push(`- voice agent lab demo는 roundtrip_ms=${formatNumber(first.metrics.stt?.roundtrip_ms)} ms, task_success_rate=${formatNumber(first.metrics.agent?.task_success_rate)}로 기록됐다.`);
    notes.push(`- 앱 surface가 transcript, voice roundtrip, browser-agent task 지표를 같은 결과 문서에 남긴다.`);
  } else if (repoName === "app-browser-image-lab") {
    notes.push(`- browser image lab demo는 answer_total_ms=${formatNumber(first.metrics.vlm?.answer_total_ms)} ms, sec_per_image=${formatNumber(first.metrics.diffusion?.sec_per_image)} s로 기록됐다.`);
    notes.push(`- 앱 surface가 source-scene QA와 prompt-to-image preview 지표를 같은 결과 문서에 남긴다.`);
  } else if (repoName === "app-blackhole-observatory") {
    notes.push(`- blackhole observatory demo는 avg_fps=${formatNumber(first.metrics.graphics?.avg_fps)}, renderer_consensus_score=${formatNumber(first.metrics.blackhole?.renderer_consensus_score)}로 기록됐다.`);
    notes.push(`- 앱 surface가 preset telemetry, photon ring metric, renderer selection 결과를 같은 결과 문서에 남긴다.`);
  } else if (repoName === "bench-runtime-shootout") {
    notes.push(`- benchmark draft winner는 ${scenarioLabel(repoName, first)}였고 decode_tok_per_sec=${formatNumber(first.metrics.llm?.decode_tok_per_sec)}였다.`);
    notes.push(`- 비교 세부값은 raw JSON meta.notes에 profile별 TTFT/decode/turn latency로 함께 남겼다.`);
  } else if (repoName === "bench-model-load-and-cache") {
    const cold = results.find((result) => result.environment.cache_state === "cold");
    const warm = results.find((result) => result.environment.cache_state === "warm");
    if (cold && warm) {
      const delta = round((cold.metrics.common?.init_ms || 0) - (warm.metrics.common?.init_ms || 0));
      notes.push(`- cold init_ms=${formatNumber(cold.metrics.common?.init_ms)} ms, warm init_ms=${formatNumber(warm.metrics.common?.init_ms)} ms, delta=${formatNumber(delta)} ms였다.`);
      notes.push(`- warm run meta.notes에는 preparedHit=true가 남아 cache reuse 경로가 실제로 기록됐다.`);
    }
  } else if (repoName === "bench-worker-isolation-and-ui-jank") {
    const main = results.find((result) => result.environment.worker_mode === "main");
    const worker = results.find((result) => result.environment.worker_mode === "worker");
    if (main && worker) {
      notes.push(`- worker run avg_fps=${formatNumber(worker.metrics.graphics?.avg_fps)}, main run avg_fps=${formatNumber(main.metrics.graphics?.avg_fps)}였다.`);
      notes.push(`- p95 frametime은 main=${formatNumber(main.metrics.graphics?.p95_frametime_ms)} ms, worker=${formatNumber(worker.metrics.graphics?.p95_frametime_ms)} ms로 비교됐다.`);
    }
  } else if (repoName === "app-local-chat-arena") {
    notes.push(`- arena winner는 ${scenarioLabel(repoName, first)}가 아니라 raw meta.notes에 기록된 profile 비교로 계산됐다.`);
    notes.push(`- 앱 surface에서도 TTFT=${formatNumber(first.metrics.llm?.ttft_ms)} ms, decode=${formatNumber(first.metrics.llm?.decode_tok_per_sec)} tok/s를 바로 추적할 수 있게 됐다.`);
  }

  const captureContext = first.meta.capture_context;
  if (captureContext) {
    notes.push(`- ${captureContext.tool}로 수집된 automation baseline이며 headless=${formatBoolean(captureContext.headless)}, browser=${captureContext.browser_name || first.environment.browser?.name} ${captureContext.browser_version || first.environment.browser?.version}.`);
  } else {
    notes.push(`- automation baseline capture로 seed된 첫 raw result이며 브라우저는 ${first.environment.browser?.name || "unknown"} ${first.environment.browser?.version || ""} 환경이었다.`);
  }

  notes.push("- 실제 runtime/model/renderer 교체 전 deterministic harness 결과이므로, 절대 성능보다 보고 경로와 재현성 확인에 우선 의미가 있다.");
  return notes;
}

function repoConclusions(repoName, results) {
  switch (repoName) {
    case "tpl-webgpu-vanilla":
      return [
        "- raw WebGPU starter의 첫 baseline raw result와 summary 문서가 연결됐다.",
        "- 다음 단계는 같은 결과 형식을 유지한 채 downstream raw WebGPU 실험 저장소로 전파하는 것이다.",
        "- 실제 device/browser 다변화와 WebGPU/fallback 비교를 추가해야 템플릿 검증이 충분해진다."
      ];
    case "tpl-webgpu-react":
      return [
        "- React WebGPU starter도 첫 baseline raw result와 summary 문서를 갖게 됐다.",
        "- 다음 단계는 build-driven React repo로 승격하면서 동일 결과 구조를 유지하는 것이다.",
        "- 실제 app repo에서 state, worker, cache 경로를 덧붙여야 템플릿 검증이 완료된다."
      ];
    case "exp-three-webgpu-core":
      return [
        "- three.js 계열 그래픽스 실험으로 넘어가기 전 scene readiness baseline과 결과 문서가 연결됐다.",
        "- 다음 단계는 실제 three.js renderer를 붙이되 같은 graphics metric 구조를 유지하는 것이다.",
        "- 브라우저별 capability/fallback 반복 측정이 더 쌓여야 library baseline 역할을 충분히 수행한다."
      ];
    case "exp-babylon-webgpu-core":
      return [
        "- Babylon.js 계열 그래픽스 실험으로 넘어가기 전 scene readiness baseline과 결과 문서가 연결됐다.",
        "- 다음 단계는 실제 Babylon.js WebGPU engine을 붙이되 같은 graphics metric 구조를 유지하는 것이다.",
        "- three.js baseline과 같은 capture path를 쓰므로 이후 renderer shootout 입력으로 재사용할 수 있다."
      ];
    case "exp-playcanvas-webgpu-core":
      return [
        "- PlayCanvas 계열 그래픽스 실험으로 넘어가기 전 scene readiness baseline과 결과 문서가 연결됐다.",
        "- 다음 단계는 실제 PlayCanvas WebGPU app을 붙이되 같은 graphics metric 구조를 유지하는 것이다.",
        "- three.js/Babylon baseline과 같은 capture path를 쓰므로 이후 renderer shootout 입력으로 재사용할 수 있다."
      ];
    case "exp-blackhole-three-singularity":
      return [
        "- three.js/TSL 블랙홀 실험으로 넘어가기 전 lensing scene readiness baseline과 결과 문서가 연결됐다.",
        "- 다음 단계는 deterministic canvas surface를 실제 three.js WebGPU/WebGL renderer로 교체하되 ray_steps, TAA, frame pacing metric 구조를 유지하는 것이다.",
        "- 이후 blackhole renderer shootout의 첫 입력 baseline으로 재사용할 수 있다."
      ];
    case "exp-blackhole-kerr-engine":
      return [
        "- 과학형 Kerr 블랙홀 엔진 실험으로 넘어가기 전 geodesic readiness baseline과 결과 문서가 연결됐다.",
        "- 다음 단계는 deterministic canvas surface를 실제 Rust/WASM geodesic kernel 및 WebGPU renderer로 교체하되 spin/inclination/ray_steps/integration metric 구조를 유지하는 것이다.",
        "- 이후 raw WebGPU blackhole engine과 blackhole renderer shootout의 과학형 기준 입력으로 재사용할 수 있다."
      ];
    case "exp-blackhole-webgpu-fromscratch":
      return [
        "- raw WebGPU 블랙홀 실험으로 넘어가기 전 shader/pipeline readiness baseline과 결과 문서가 연결됐다.",
        "- 다음 단계는 deterministic canvas surface를 실제 WGSL shader, bind group, render pipeline으로 교체하되 dispatch/ray_steps/frame pacing metric 구조를 유지하는 것이다.",
        "- 이후 Kerr engine 및 blackhole renderer shootout과 비교할 raw WebGPU 기준 입력으로 재사용할 수 있다."
      ];
    case "exp-nbody-webgpu-core":
      return [
        "- N-body compute 실험으로 넘어가기 전 body/workgroup readiness baseline과 결과 문서가 연결됐다.",
        "- 다음 단계는 deterministic canvas surface를 실제 WGSL compute shader, storage buffer, integration loop로 교체하되 steps_per_sec/dispatch/energy drift metric 구조를 유지하는 것이다.",
        "- 이후 fluid, atomics, compute stress benchmark의 기준 입력으로 재사용할 수 있다."
      ];
    case "exp-fluid-webgpu-core":
      return [
        "- fluid compute 실험으로 넘어가기 전 particle/grid readiness baseline과 결과 문서가 연결됐다.",
        "- 다음 단계는 deterministic canvas surface를 실제 WGSL pressure solve, advection, particle-grid accumulation loop로 교체하되 steps_per_sec/pressure_solve/divergence metric 구조를 유지하는 것이다.",
        "- 이후 atomics, texture streaming, particle stress benchmark의 기준 입력으로 재사용할 수 있다."
      ];
    case "exp-three-webgpu-particles-stress":
      return [
        "- three.js particle/VFX stress 실험으로 넘어가기 전 particle stress readiness baseline과 결과 문서가 연결됐다.",
        "- 다음 단계는 deterministic canvas surface를 실제 three.js WebGPU particle material, billboard instancing, post-processing pass로 교체하되 particle_count/emitter_count/overdraw metric 구조를 유지하는 것이다.",
        "- 이후 renderer stress, texture-streaming, blackhole observatory의 VFX 기준 입력으로 재사용할 수 있다."
      ];
    case "bench-compute-stress-suite":
      return [
        "- compute stress 비교 실험으로 넘어가기 전 aggregate suite benchmark와 결과 문서가 연결됐다.",
        "- 다음 단계는 deterministic score surface를 실제 N-body, fluid, particle WGSL kernels와 shared benchmark runner로 교체하되 steps_per_sec/dispatch/winner metric 구조를 유지하는 것이다.",
        "- 이후 atomics, memory, texture streaming benchmark의 상위 suite 기준 입력으로 재사용할 수 있다."
      ];
    case "bench-atomics-and-memory":
      return [
        "- atomics 및 memory 비교 실험으로 넘어가기 전 contention-heavy benchmark와 결과 문서가 연결됐다.",
        "- 다음 단계는 deterministic score surface를 실제 WGSL histogram, scatter accumulation, reduction kernels로 교체하되 conflict/bandwidth/shared-memory metric 구조를 유지하는 것이다.",
        "- 이후 texture streaming benchmark와 compute regression suite의 memory stress 기준 입력으로 재사용할 수 있다."
      ];
    case "bench-texture-upload-and-streaming":
      return [
        "- texture upload 및 streaming 비교 실험으로 넘어가기 전 graphics/resource benchmark와 결과 문서가 연결됐다.",
        "- 다음 단계는 deterministic upload surface를 실제 atlas refresh, tile streaming, video frame texture path로 교체하되 stream/upload/frame-drop metric 구조를 유지하는 것이다.",
        "- 이후 blackhole observatory, browser image lab, renderer stress 실험의 resource streaming 기준 입력으로 재사용할 수 있다."
      ];
    case "exp-pixi-webgpu-2d":
      return [
        "- PixiJS 계열 2D 그래픽스 실험으로 넘어가기 전 sprite batch readiness baseline과 결과 문서가 연결됐다.",
        "- 다음 단계는 deterministic canvas surface를 실제 PixiJS WebGPU renderer로 교체하되 sprite/batch metadata와 graphics metric 구조를 유지하는 것이다.",
        "- 이후 renderer shootout의 2D workload 입력과 app/browser-image 계열 UI stress 기준으로 재사용할 수 있다."
      ];
    case "exp-luma-webgpu-viz":
      return [
        "- luma.gl 계열 visualization 실험으로 넘어가기 전 layer/attribute readiness baseline과 결과 문서가 연결됐다.",
        "- 다음 단계는 deterministic canvas surface를 실제 luma.gl WebGPU renderer로 교체하되 point/layer/attribute metadata와 graphics metric 구조를 유지하는 것이다.",
        "- 이후 deck.gl readiness와 visualization-heavy renderer 비교의 입력 baseline으로 재사용할 수 있다."
      ];
    case "exp-deckgl-webgpu-readiness":
      return [
        "- deck.gl 계열 WebGPU readiness 실험으로 넘어가기 전 viewport/layer/picking readiness baseline과 결과 문서가 연결됐다.",
        "- 다음 단계는 deterministic canvas surface를 실제 deck.gl WebGPU renderer로 교체하되 viewport/layer/tile/picking metadata와 graphics metric 구조를 유지하는 것이다.",
        "- 이후 luma.gl baseline과 geospatial visualization renderer 비교의 입력 baseline으로 재사용할 수 있다."
      ];
    case "bench-blackhole-render-shootout":
      return [
        "- blackhole renderer shootout이 WebGPU primary와 fallback primary pair를 raw JSON과 RESULTS.md 양쪽에 남기게 됐다.",
        "- 다음 단계는 deterministic renderer profiles를 실제 three.js/TSL, raw WebGPU, WebGL/Wasm implementation으로 교체하되 winner selection과 graphics metric 구조를 유지하는 것이다.",
        "- 이후 `bench-renderer-shootout`과 `app-blackhole-observatory`의 renderer 선택 기준으로 재사용할 수 있다."
      ];
    case "bench-renderer-shootout":
      return [
        "- renderer shootout이 WebGPU primary와 fallback primary pair를 raw JSON과 RESULTS.md 양쪽에 남기게 됐다.",
        "- 다음 단계는 deterministic renderer profiles를 실제 three.js, Babylon.js, PlayCanvas, raw WebGPU integration으로 교체하되 winner selection과 graphics metric 구조를 유지하는 것이다.",
        "- 이후 graphics baseline 저장소의 공통 비교표와 renderer 선택 기준으로 재사용할 수 있다."
      ];
    case "exp-embeddings-browser-throughput":
      return [
        "- cold/warm embeddings baseline 결과와 문서화 경로가 처음으로 연결됐다.",
        "- 동일 fixture와 cache state에서 WebGPU vs fallback 비교 경로가 raw JSON과 RESULTS.md 양쪽에 생겼다.",
        "- 다음 단계는 synthetic embedder를 실제 browser runtime으로 치환하고 동일한 결과 파일명을 유지하는 것이다."
      ];
    case "exp-llm-chat-runtime-shootout":
      return [
        "- runtime readiness 비교가 raw JSON과 RESULTS.md 둘 다에서 반복 가능해졌다.",
        "- 같은 prompt budget에서 WebGPU vs fallback compare pair를 두 profile 모두에 대해 남길 수 있게 됐다.",
        "- 다음 단계는 WebLLM, Transformers.js, ORT 계열 실제 runtime을 같은 prompt budget으로 연결하는 것이다."
      ];
    case "exp-ort-webgpu-baseline":
      return [
        "- ORT-Web provider readiness가 WebGPU와 Wasm fallback pair를 raw JSON과 RESULTS.md 양쪽에 남기게 됐다.",
        "- 다음 단계는 deterministic transformer-block fixture를 실제 ONNX Runtime Web session/load/run path로 교체하는 것이다.",
        "- real model asset, execution provider 설정, wasm/webgpu package build 경로를 같은 결과 포맷에 연결해야 한다."
      ];
    case "exp-stt-whisper-webgpu":
      return [
        "- 파일 전사 baseline의 timing, transcript, error scoring 경로가 실제 결과로 고정됐다.",
        "- 다음 단계는 Whisper runtime과 real audio asset을 연결해 같은 보고 포맷으로 교체하는 것이다.",
        "- partial latency와 final latency를 브라우저/모드별로 반복 측정할 필요가 있다."
      ];
    case "exp-voice-assistant-local":
      return [
        "- local voice assistant readiness harness가 STT, intent routing, reply draft, TTS roundtrip 결과를 같은 문서에 남기게 됐다.",
        "- 다음 단계는 deterministic voice turn을 실제 STT runtime, local planner, TTS provider로 교체하되 first_partial/final_latency/roundtrip metric 구조를 유지하는 것이다.",
        "- 이후 `bench-voice-roundtrip`과 `app-voice-agent-lab`의 roundtrip regression 기준으로 재사용할 수 있다."
      ];
    case "bench-voice-roundtrip":
      return [
        "- voice roundtrip benchmark가 WebGPU와 fallback pair를 raw JSON과 RESULTS.md 양쪽에 남기게 됐다.",
        "- 다음 단계는 deterministic voice-turn profiles를 실제 STT, local planner, TTS runtime 후보로 교체하되 roundtrip_ms와 transcript quality result fields를 유지하는 것이다.",
        "- 이후 `exp-voice-assistant-local`와 `app-voice-agent-lab`의 end-to-end roundtrip regression 기준으로 재사용할 수 있다."
      ];
    case "exp-vlm-browser-multimodal":
      return [
        "- browser VLM multimodal readiness harness가 image preprocess, first token, full answer latency와 accuracy score를 같은 문서에 남기게 됐다.",
        "- 다음 단계는 deterministic fixture를 실제 browser VLM runtime, image processor, multimodal tokenizer로 교체하되 image_preprocess/image_to_first_token/answer_total metric 구조를 유지하는 것이다.",
        "- 이후 `bench-multimodal-latency`와 `app-browser-image-lab`의 공통 multimodal fixture 입력으로 재사용할 수 있다."
      ];
    case "bench-multimodal-latency":
      return [
        "- multimodal latency benchmark가 WebGPU와 fallback pair를 raw JSON과 RESULTS.md 양쪽에 남기게 됐다.",
        "- 다음 단계는 deterministic multimodal profiles를 실제 browser VLM runtime 후보로 교체하되 image_preprocess_ms/image_to_first_token_ms/answer_total_ms/accuracy_task_score result fields를 유지하는 것이다.",
        "- 이후 `exp-vlm-browser-multimodal`와 `app-browser-image-lab`의 latency regression 기준으로 재사용할 수 있다."
      ];
    case "exp-diffusion-webgpu-browser":
      return [
        "- browser diffusion readiness harness가 prompt-to-image sec_per_image, steps_per_sec, resolution success, fail rate를 같은 문서에 남기게 됐다.",
        "- 다음 단계는 deterministic canvas surface를 실제 browser diffusion runtime, UNet, VAE, scheduler path로 교체하되 sec_per_image/steps_per_sec/resolution_success_rate/oom_or_fail_rate metric 구조를 유지하는 것이다.",
        "- 이후 `bench-diffusion-browser-shootout`와 `app-browser-image-lab`의 공통 diffusion fixture 입력으로 재사용할 수 있다."
      ];
    case "bench-diffusion-browser-shootout":
      return [
        "- diffusion browser shootout가 WebGPU와 fallback pair를 raw JSON과 RESULTS.md 양쪽에 남기게 됐다.",
        "- 다음 단계는 deterministic diffusion profiles를 실제 browser diffusion runtime 후보로 교체하되 sec_per_image/steps_per_sec/resolution_success_rate/oom_or_fail_rate result fields를 유지하는 것이다.",
        "- 이후 `exp-diffusion-webgpu-browser`와 `app-browser-image-lab`의 diffusion regression 기준으로 재사용할 수 있다."
      ];
    case "exp-browser-agent-local":
      return [
        "- browser agent readiness harness가 task success, step latency, tool success, intervention count를 같은 문서에 남기게 됐다.",
        "- 다음 단계는 deterministic local task deck을 실제 browser controller, planner, DOM policy, tool routing runtime으로 교체하되 task_success_rate/avg_step_latency_ms/tool_call_success_rate/user_intervention_count metric 구조를 유지하는 것이다.",
        "- 이후 `bench-agent-step-latency`와 `app-voice-agent-lab`의 공통 browser-agent fixture 입력으로 재사용할 수 있다."
      ];
    case "bench-agent-step-latency":
      return [
        "- browser agent latency benchmark가 WebGPU와 fallback pair를 raw JSON과 RESULTS.md 양쪽에 남기게 됐다.",
        "- 다음 단계는 deterministic planner profiles를 실제 browser controller/planner/tool routing runtime 후보로 교체하되 task_success_rate/avg_step_latency_ms/tool_call_success_rate/user_intervention_count result fields를 유지하는 것이다.",
        "- 이후 `exp-browser-agent-local`와 `app-voice-agent-lab`의 agent regression 기준으로 재사용할 수 있다."
      ];
    case "bench-stt-streaming-latency":
      return [
        "- STT streaming latency benchmark가 WebGPU와 fallback pair를 raw JSON과 RESULTS.md 양쪽에 남기게 됐다.",
        "- 다음 단계는 deterministic streaming profiles를 실제 Whisper/WebGPU runtime 후보로 교체하되 audio fixture와 streaming result fields를 유지하는 것이다.",
        "- 이후 `exp-stt-whisper-webgpu`와 `app-voice-agent-lab`의 streaming latency regression 기준으로 재사용할 수 있다."
      ];
    case "bench-webgpu-vs-wasm-parity":
      return [
        "- WebGPU/Wasm parity benchmark가 WebGPU primary와 fallback primary pair를 raw JSON과 RESULTS.md 양쪽에 남기게 됐다.",
        "- 다음 단계는 deterministic numeric kernels를 실제 WebGPU shader와 Wasm implementation으로 교체하되 tolerance contract를 유지하는 것이다.",
        "- 이후 runtime, embeddings, renderer benchmark의 correctness gate로 재사용할 수 있다."
      ];
    case "exp-webllm-browser-chat":
      return [
        "- WebLLM browser chat readiness harness가 첫 raw result와 summary 문서를 갖게 됐다.",
        "- 다음 단계는 synthetic single-runtime path를 실제 WebLLM integration으로 교체하는 것이다.",
        "- 이후 `app-local-chat-arena`와 shared prompt budget을 유지하면서 app 승격 기준으로 재사용할 수 있다."
      ];
    case "exp-llm-worker-ux":
      return [
        "- LLM worker UX harness가 main-thread와 dedicated worker 실행 결과를 같은 문서에 남기게 됐다.",
        "- 다음 단계는 deterministic chat loop를 실제 local runtime worker로 교체하되 prompt/output budget을 유지하는 것이다.",
        "- responsiveness metric은 현재 notes 기반이므로 후속 schema 확장 또는 UX 전용 benchmark와 연결해야 한다."
      ];
    case "exp-rag-browser-pipeline":
      return [
        "- deterministic RAG pipeline baseline의 raw result와 요약 문서가 처음으로 채워졌다.",
        "- 다음 단계는 실제 embedder, retriever, reranker를 붙여 같은 질문 세트를 유지하는 것이다.",
        "- citation hit-rate와 answer latency를 브라우저별로 누적해야 계획 기준에 도달한다."
      ];
    case "exp-reranker-browser":
      return [
        "- browser reranker readiness가 candidate scoring latency와 top-k quality를 raw JSON과 RESULTS.md 양쪽에 남기게 됐다.",
        "- 다음 단계는 deterministic scorer를 실제 reranker runtime으로 교체하되 candidate set과 output ranking contract를 유지하는 것이다.",
        "- 이후 `bench-reranker-latency`와 `bench-rag-endtoend`의 입력 baseline으로 재사용할 수 있다."
      ];
    case "bench-embeddings-latency-quality":
      return [
        "- embeddings latency/quality benchmark가 WebGPU와 fallback pair를 raw JSON과 RESULTS.md 양쪽에 남기게 됐다.",
        "- 다음 단계는 deterministic embedding profiles를 실제 browser embedder 후보로 교체하되 document/query fixture와 result filenames를 유지하는 것이다.",
        "- 이후 `bench-rag-endtoend`와 `app-private-rag-lab`의 embedder 선택 기준으로 재사용할 수 있다."
      ];
    case "bench-reranker-latency":
      return [
        "- reranker latency benchmark가 WebGPU와 fallback pair를 raw JSON과 RESULTS.md 양쪽에 남기게 됐다.",
        "- 다음 단계는 deterministic reranker profiles를 실제 browser reranker runtime 후보로 교체하되 candidate fixture와 result filenames를 유지하는 것이다.",
        "- 이후 `bench-rag-endtoend`와 `app-private-rag-lab`의 rerank 단계 선택 기준으로 재사용할 수 있다."
      ];
    case "bench-rag-endtoend":
      return [
        "- RAG end-to-end benchmark가 WebGPU와 fallback pair를 raw JSON과 RESULTS.md 양쪽에 남기게 됐다.",
        "- 다음 단계는 deterministic embed/retrieve/rerank/answer profiles를 실제 browser embedder, reranker, generator 후보로 교체하되 stage breakdown을 유지하는 것이다.",
        "- 이후 `app-private-rag-lab`의 provider 선택과 end-to-end regression 기준으로 재사용할 수 있다."
      ];
    case "bench-llm-prefill-decode":
      return [
        "- LLM prefill/decode benchmark가 WebGPU와 fallback pair를 raw JSON과 RESULTS.md 양쪽에 남기게 됐다.",
        "- 다음 단계는 deterministic runtime profiles를 실제 browser LLM runtime 후보로 교체하되 prompt/context/output budget을 유지하는 것이다.",
        "- 이후 `exp-llm-chat-runtime-shootout`, `exp-webllm-browser-chat`, `app-local-chat-arena`의 decode regression 기준으로 재사용할 수 있다."
      ];
    case "app-private-rag-lab":
      return [
        "- private RAG lab demo가 generic probe를 벗어나 local-only RAG app surface와 첫 raw result를 갖게 됐다.",
        "- 다음 단계는 deterministic private-note fixture를 실제 browser embedder, reranker, local generator로 교체하는 것이다.",
        "- 내부 데모 승격을 위해 문서 추가/삭제, 캐시 재방문, citation UX 메모를 더 기록해야 한다."
      ];
    case "app-voice-agent-lab":
      return [
        "- voice agent lab demo가 generic probe를 벗어나 integrated voice-to-agent surface와 첫 raw result를 갖게 됐다.",
        "- 다음 단계는 deterministic transcript/task deck 대신 실제 STT, planner, tool routing, TTS providers를 같은 app protocol에 연결하는 것이다.",
        "- 내부 데모 승격을 위해 voice quality, interruption, recovery UX 메모를 추가로 기록해야 한다."
      ];
    case "app-browser-image-lab":
      return [
        "- browser image lab demo가 generic probe를 벗어나 integrated scene-to-image surface와 첫 raw result를 갖게 됐다.",
        "- 다음 단계는 deterministic scene/prompt fixture 대신 실제 browser VLM, diffusion runtime, asset loading path를 같은 app protocol에 연결하는 것이다.",
        "- 내부 데모 승격을 위해 image upload, gallery state, prompt history, safety/retry UX 메모를 추가로 기록해야 한다."
      ];
    case "app-blackhole-observatory":
      return [
        "- blackhole observatory demo가 generic probe를 벗어나 integrated preset-to-renderer surface와 첫 raw result를 갖게 됐다.",
        "- 다음 단계는 deterministic preset/leaderboard 대신 실제 three.js, Kerr engine, raw WebGPU renderer 및 asset loading path를 같은 app protocol에 연결하는 것이다.",
        "- 내부 데모 승격을 위해 camera controls, preset gallery, annotation overlays, capture/export UX 메모를 추가로 기록해야 한다."
      ];
    case "bench-runtime-shootout":
      return [
        "- fixed-scenario runtime benchmark draft가 raw artifact와 summary 문서 양쪽에서 재현 가능해졌다.",
        "- fixed benchmark 한 벌에 대해 WebGPU vs fallback 비교 draft도 함께 누적할 수 있게 됐다.",
        "- 다음 단계는 synthetic profile을 실제 runtime implementation으로 바꾸되 동일한 prompt/output budget을 유지하는 것이다."
      ];
    case "bench-model-load-and-cache":
      return [
        "- cold/warm load delta가 처음으로 raw JSON과 RESULTS.md 둘 다에 기록됐다.",
        "- 다음 단계는 실제 model asset과 cache eviction 조건을 추가해 warm hit/miss 경계를 더 분명히 하는 것이다.",
        "- 브라우저별 storage path 차이와 fallback mode를 별도 결과로 누적해야 한다."
      ];
    case "bench-worker-isolation-and-ui-jank":
      return [
        "- main vs worker jank benchmark baseline이 실제 raw 결과와 summary 문서로 연결됐다.",
        "- 다음 단계는 실제 inference/compute workload를 같은 harness에 붙여 responsiveness 차이를 재측정하는 것이다.",
        "- 입력 지연과 frame pacing을 브라우저/디바이스별로 누적해야 계획 기준에 맞는다."
      ];
    case "app-local-chat-arena":
      return [
        "- local chat arena demo가 generic probe를 벗어나 pairwise 비교 surface와 첫 raw result를 갖게 됐다.",
        "- 다음 단계는 benchmark profile 대신 실제 local runtime providers를 같은 arena protocol에 연결하는 것이다.",
        "- 내부 데모 승격을 위해 transcript quality와 session UX 메모를 추가로 기록해야 한다."
      ];
    default:
      return [
        "- 첫 raw result와 summary 문서가 연결됐다.",
        "- 다음 단계는 deterministic harness를 실제 workload로 교체하는 것이다.",
        "- 브라우저와 cache-state 반복 측정이 더 필요하다."
      ];
  }
}

function buildMarkdown(repoName, results, artifacts) {
  const sortedResults = [...results].sort(compareRuns);
  const first = sortedResults[0];
  const last = sortedResults[sortedResults.length - 1];
  const comparisonLines = fallbackComparisonLines(repoName, sortedResults);
  const realRuntimeLines = realRuntimeComparisonLines(repoName, sortedResults);
  const status = sortedResults.every((result) => result.status === "success")
    ? "success"
    : sortedResults.some((result) => result.status === "failed")
      ? "failed"
      : "partial";
  const type = experimentType(repoName, first);
  const commits = summarizeValues(sortedResults.map((result) => shortCommit(result.meta.commit)));
  const timestamps = `${first.meta.timestamp} -> ${last.meta.timestamp}`;
  const browser = `${first.environment.browser?.name || "Unknown"} ${first.environment.browser?.version || "unknown"}`;
  const os = `${first.environment.os?.name || "Unknown"} ${first.environment.os?.version || "unknown"}`;
  const device = first.environment.device || {};
  const gpu = first.environment.gpu || {};
  const workloadValues = {
    scenarios: sortedResults.map((result) => scenarioLabel(repoName, result)),
    inputProfiles: sortedResults.map((result) => result.workload?.input_profile),
    datasets: sortedResults.map((result) => result.workload?.dataset),
    modelIds: sortedResults.map((result) => result.workload?.model_id),
    quantizations: sortedResults.map((result) => result.workload?.quantization),
    resolutions: sortedResults.map((result) => result.workload?.resolution),
    contextTokens: sortedResults.map((result) => result.workload?.context_tokens),
    outputTokens: sortedResults.map((result) => result.workload?.output_tokens)
  };

  const tableRows = sortedResults.map((result, index) => {
    const metrics = runTableMetrics(repoName, result);
    return `| ${index + 1} | ${scenarioLabel(repoName, result)} | ${result.environment.backend || "-"} | ${result.environment.cache_state || "-"} | ${metrics.mean} | ${metrics.p95} | ${metrics.notes} |`;
  }).join("\n");

  const attachments = {
    screenshots: artifacts.screenshots.length ? artifacts.screenshots.join(", ") : "-",
    logs: artifacts.logs.length ? artifacts.logs.join(", ") : "-",
    rawJson: artifacts.raw.length ? artifacts.raw.join(", ") : "-",
    deployUrls: summarizeValues(sortedResults.map((result) => result.artifacts?.deploy_url)),
    relatedIssues: summarizeValues(sortedResults.map((result) => result.artifacts?.related_issue)),
    relatedPrs: summarizeValues(sortedResults.map((result) => result.artifacts?.related_pr))
  };

  const lines = [
    "# Results",
    "",
    "## 1. 실험 요약",
    `- 저장소: ${repoName}`,
    `- 커밋 해시: ${commits}`,
    `- 실험 일시: ${timestamps}`,
    `- 담당자: ${summarizeValues(sortedResults.map((result) => result.meta.owner))}`,
    `- 실험 유형: \`${type}\``,
    `- 상태: \`${status}\``,
    "",
    "## 2. 질문",
    ...(REPO_QUESTIONS[repoName] || ["- 첫 baseline raw result를 실제 문서와 연결할 수 있는가"]).map((question) => `- ${question}`),
    "",
    "## 3. 실행 환경",
    "### 브라우저",
    `- 이름: ${browser.split(" ").slice(0, -1).join(" ") || first.environment.browser?.name || "Unknown"}`,
    `- 버전: ${first.environment.browser?.version || "unknown"}`,
    "",
    "### 운영체제",
    `- OS: ${first.environment.os?.name || "Unknown"}`,
    `- 버전: ${first.environment.os?.version || "unknown"}`,
    "",
    "### 디바이스",
    `- 장치명: ${device.name || "unknown"}`,
    `- device class: \`${device.class || "unknown"}\``,
    `- CPU: ${device.cpu || "unknown"}`,
    `- 메모리: ${device.memory_gb ? `${device.memory_gb} GB` : "unknown"}`,
    `- 전원 상태: \`${device.power_mode || "unknown"}\``,
    "",
    "### GPU / 실행 모드",
    `- adapter: ${summarizeValues(sortedResults.map((result) => result.environment.gpu?.adapter), gpu.adapter || "unknown")}`,
    `- backend: \`${summarizeValues(sortedResults.map((result) => result.environment.backend), first.environment.backend || "unknown")}\``,
    `- fallback triggered: \`${summarizeValues(sortedResults.map((result) => formatBoolean(result.environment.fallback_triggered)), formatBoolean(first.environment.fallback_triggered))}\``,
    `- worker mode: \`${summarizeValues(sortedResults.map((result) => result.environment.worker_mode), "unknown")}\``,
    `- cache state: \`${summarizeValues(sortedResults.map((result) => result.environment.cache_state), "unknown")}\``,
    `- required features: ${summarizeValues(sortedResults.map((result) => JSON.stringify(result.environment.gpu?.required_features || [])), JSON.stringify(gpu.required_features || []))}`,
    `- limits snapshot: ${summarizeValues(sortedResults.map((result) => JSON.stringify(result.environment.gpu?.limits || {})), JSON.stringify(gpu.limits || {}))}`,
    "",
    "## 4. 워크로드 정의",
    `- 시나리오 이름: ${summarizeValues(workloadValues.scenarios)}`,
    `- 입력 프로필: ${summarizeValues(workloadValues.inputProfiles)}`,
    `- 데이터 크기: ${summarizeValues(sortedResults.map((result) => result.meta.notes))}`,
    `- dataset: ${summarizeValues(workloadValues.datasets)}`,
    `- model_id 또는 renderer: ${summarizeValues(workloadValues.modelIds)}`,
    `- 양자화/정밀도: ${summarizeValues(workloadValues.quantizations)}`,
    `- resolution: ${summarizeValues(workloadValues.resolutions)}`,
    `- context_tokens: ${summarizeValues(workloadValues.contextTokens)}`,
    `- output_tokens: ${summarizeValues(workloadValues.outputTokens)}`,
    "",
    "## 5. 측정 지표",
    "### 공통",
    `- time_to_interactive_ms: ${summarizeRange(sortedResults.map((result) => result.metrics.common?.time_to_interactive_ms), "ms")}`,
    `- init_ms: ${summarizeRange(sortedResults.map((result) => result.metrics.common?.init_ms), "ms")}`,
    `- success_rate: ${summarizeRange(sortedResults.map((result) => result.metrics.common?.success_rate))}`,
    `- peak_memory_note: ${summarizeValues(sortedResults.map((result) => result.metrics.common?.peak_memory_note))}`,
    `- error_type: ${summarizeValues(sortedResults.map((result) => result.metrics.common?.error_type))}`,
    "",
    `### ${workloadHeading(repoName, type)}`,
    ...repoMetricSummary(repoName, sortedResults),
    "",
    "## 6. 결과 표",
    "| Run | Scenario | Backend | Cache | Mean | P95 | Notes |",
    "|---|---|---:|---:|---:|---:|---|",
    tableRows,
    "",
    "## 7. 관찰",
    ...repoObservations(repoName, sortedResults),
    "",
    ...(comparisonLines.length ? ["## 8. WebGPU vs Fallback", ...comparisonLines, ""] : []),
    ...(realRuntimeLines.length
      ? [`## ${comparisonLines.length ? "9" : "8"}. Real Adapter vs Deterministic`, ...realRuntimeLines, ""]
      : []),
    `## ${comparisonLines.length + realRuntimeLines.length === 0 ? "8" : comparisonLines.length && realRuntimeLines.length ? "10" : "9"}. 결론`,
    ...repoConclusions(repoName, sortedResults),
    "",
    `## ${comparisonLines.length + realRuntimeLines.length === 0 ? "9" : comparisonLines.length && realRuntimeLines.length ? "11" : "10"}. 첨부`,
    `- 스크린샷: ${attachments.screenshots}`,
    `- 로그 파일: ${attachments.logs}`,
    `- raw json: ${attachments.rawJson}`,
    `- 배포 URL: ${attachments.deployUrls}`,
    `- 관련 이슈/PR: ${[attachments.relatedIssues, attachments.relatedPrs].filter((item) => item && item !== "-").join(", ") || "-"}`,
    ""
  ];

  return lines.join("\n");
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function listRelativeFiles(rootDir, relativeDir, extension) {
  const absoluteDir = path.join(rootDir, relativeDir);
  try {
    const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
      .map((entry) => `./${path.posix.join(relativeDir, entry.name)}`)
      .sort();
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function renderResultsSummary({ repoDir, output = "RESULTS.md" }) {
  const rawDir = path.join(repoDir, "reports", "raw");
  const entries = await fs.readdir(rawDir, { withFileTypes: true });
  const rawFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(rawDir, entry.name))
    .sort();

  if (!rawFiles.length) {
    throw new Error(`No raw JSON files found in ${rawDir}`);
  }

  const results = [];
  for (const filePath of rawFiles) {
    results.push(await readJson(filePath));
  }

  results.sort(compareRuns);
  const repoName = results[0].meta.repo || path.basename(repoDir);
  const markdown = buildMarkdown(repoName, results, {
    raw: await listRelativeFiles(repoDir, "reports/raw", ".json"),
    screenshots: await listRelativeFiles(repoDir, "reports/screenshots", ".png"),
    logs: await listRelativeFiles(repoDir, "reports/logs", ".log")
  });

  await fs.writeFile(path.join(repoDir, output), markdown, "utf8");
  return markdown;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const markdown = await renderResultsSummary({
    repoDir: path.resolve(options.repoDir),
    output: options.output
  });

  if (options.stdout) {
    process.stdout.write(markdown);
  }
}

try {
  if (import.meta.url === `file://${process.argv[1]}`) {
    await main();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
