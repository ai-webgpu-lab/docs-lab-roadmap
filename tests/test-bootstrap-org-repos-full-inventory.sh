#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

fail() {
  echo "test failed: $1" >&2
  exit 1
}

assert_file() {
  local path="$1"
  [[ -f "${path}" ]] || fail "missing file: ${path}"
}

assert_dir() {
  local path="$1"
  [[ -d "${path}" ]] || fail "missing directory: ${path}"
}

assert_contains() {
  local path="$1"
  local pattern="$2"
  if command -v rg >/dev/null 2>&1 && rg -Fq "${pattern}" "${path}" 2>/dev/null; then
    return 0
  fi
  grep -Fq "${pattern}" "${path}" || fail "missing pattern '${pattern}' in ${path}"
}

EXPECTED_REPO_COUNT="$(awk -F, 'NR > 1 && $1 != "" { count++ } END { print count + 0 }' "${REPO_ROOT}/docs/repo-inventory.csv")"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --output-root "${TMP_DIR}/out" \
  --no-sync

ACTUAL_REPO_COUNT="$(find "${TMP_DIR}/out" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
[[ "${ACTUAL_REPO_COUNT}" == "${EXPECTED_REPO_COUNT}" ]] || fail "expected ${EXPECTED_REPO_COUNT} repos, got ${ACTUAL_REPO_COUNT}"

assert_file "${TMP_DIR}/out/.github/profile/README.md"
assert_file "${TMP_DIR}/out/.github/.github/pull_request_template.md"
assert_contains "${TMP_DIR}/out/.github/README.md" "기본 커뮤니티 파일"
assert_contains "${TMP_DIR}/out/.github/README.md" "## 운영 원칙"
assert_file "${TMP_DIR}/out/.github/public/index.html"
assert_file "${TMP_DIR}/out/.github/public/app.js"
assert_file "${TMP_DIR}/out/.github/public/community-files-fixture.json"
assert_file "${TMP_DIR}/out/.github/.github/workflows/deploy-pages.yml"
assert_dir "${TMP_DIR}/out/.github/reports/raw"
assert_file "${TMP_DIR}/out/.github/RESULTS.md"
assert_contains "${TMP_DIR}/out/.github/public/app.js" "dotgithub-community-baseline"

assert_file "${TMP_DIR}/out/shared-bench-schema/schemas/ai-webgpu-lab-result.schema.json"
assert_file "${TMP_DIR}/out/shared-bench-schema/templates/example-result.json"
assert_contains "${TMP_DIR}/out/shared-bench-schema/README.md" "## 사용 방식"
assert_file "${TMP_DIR}/out/shared-bench-schema/public/index.html"
assert_file "${TMP_DIR}/out/shared-bench-schema/public/app.js"
assert_file "${TMP_DIR}/out/shared-bench-schema/public/schema-fixture.json"
assert_file "${TMP_DIR}/out/shared-bench-schema/.github/workflows/deploy-pages.yml"
assert_dir "${TMP_DIR}/out/shared-bench-schema/reports/raw"
assert_file "${TMP_DIR}/out/shared-bench-schema/RESULTS.md"
assert_contains "${TMP_DIR}/out/shared-bench-schema/public/app.js" "shared-bench-schema-baseline"
assert_contains "${TMP_DIR}/out/shared-bench-schema/README.md" "docs-lab-roadmap/docs/SKETCH-METRICS.md"

assert_file "${TMP_DIR}/out/shared-webgpu-capability/src/index.mjs"
assert_file "${TMP_DIR}/out/shared-webgpu-capability/docs/capability-contract.md"
assert_file "${TMP_DIR}/out/shared-webgpu-capability/public/index.html"
assert_file "${TMP_DIR}/out/shared-webgpu-capability/public/app.js"
assert_file "${TMP_DIR}/out/shared-webgpu-capability/public/capability-fixture.json"
assert_file "${TMP_DIR}/out/shared-webgpu-capability/.github/workflows/deploy-pages.yml"
assert_dir "${TMP_DIR}/out/shared-webgpu-capability/reports/raw"
assert_file "${TMP_DIR}/out/shared-webgpu-capability/RESULTS.md"
assert_contains "${TMP_DIR}/out/shared-webgpu-capability/public/app.js" "shared-webgpu-capability-baseline"
assert_contains "${TMP_DIR}/out/shared-webgpu-capability/README.md" "docs-lab-roadmap/docs/SKETCH-METRICS.md"

assert_file "${TMP_DIR}/out/shared-github-actions/public/index.html"
assert_file "${TMP_DIR}/out/shared-github-actions/public/app.js"
assert_file "${TMP_DIR}/out/shared-github-actions/public/workflow-fixture.json"
assert_file "${TMP_DIR}/out/shared-github-actions/.github/workflows/deploy-pages.yml"
assert_dir "${TMP_DIR}/out/shared-github-actions/reports/raw"
assert_file "${TMP_DIR}/out/shared-github-actions/RESULTS.md"
assert_contains "${TMP_DIR}/out/shared-github-actions/public/app.js" "shared-github-actions-baseline"
assert_contains "${TMP_DIR}/out/shared-github-actions/README.md" "docs-lab-roadmap/docs/SKETCH-METRICS.md"

assert_file "${TMP_DIR}/out/docs-lab-roadmap/README.md"
assert_dir "${TMP_DIR}/out/docs-lab-roadmap/docs"
assert_contains "${TMP_DIR}/out/docs-lab-roadmap/README.md" "## 유지 규칙"
assert_file "${TMP_DIR}/out/docs-lab-roadmap/public/index.html"
assert_file "${TMP_DIR}/out/docs-lab-roadmap/public/app.js"
assert_file "${TMP_DIR}/out/docs-lab-roadmap/public/docs-fixture.json"
assert_file "${TMP_DIR}/out/docs-lab-roadmap/.github/workflows/deploy-pages.yml"
assert_dir "${TMP_DIR}/out/docs-lab-roadmap/reports/raw"
assert_file "${TMP_DIR}/out/docs-lab-roadmap/RESULTS.md"
assert_contains "${TMP_DIR}/out/docs-lab-roadmap/public/app.js" "docs-lab-roadmap-baseline"
assert_contains "${TMP_DIR}/out/docs-lab-roadmap/README.md" "docs/README-STATUS.md"
assert_contains "${TMP_DIR}/out/docs-lab-roadmap/README.md" "docs/WORKFLOW-STATUS.md"
assert_contains "${TMP_DIR}/out/docs-lab-roadmap/README.md" "docs/PROJECT-STATUS.md"

assert_file "${TMP_DIR}/out/exp-embeddings-browser-throughput/RESULTS.md"
assert_file "${TMP_DIR}/out/exp-embeddings-browser-throughput/schemas/ai-webgpu-lab-result.schema.json"
assert_file "${TMP_DIR}/out/exp-embeddings-browser-throughput/public/index.html"
assert_file "${TMP_DIR}/out/exp-embeddings-browser-throughput/public/app.js"
assert_file "${TMP_DIR}/out/exp-embeddings-browser-throughput/public/docs-fixture.json"
assert_file "${TMP_DIR}/out/exp-embeddings-browser-throughput/.github/workflows/deploy-pages.yml"
assert_dir "${TMP_DIR}/out/exp-embeddings-browser-throughput/reports/raw"
assert_contains "${TMP_DIR}/out/exp-embeddings-browser-throughput/public/index.html" "Embeddings Throughput Harness"
assert_contains "${TMP_DIR}/out/exp-embeddings-browser-throughput/public/app.js" "synthetic-embedding-throughput"
assert_contains "${TMP_DIR}/out/exp-embeddings-browser-throughput/README.md" "## 측정 및 검증 포인트"

assert_file "${TMP_DIR}/out/exp-llm-chat-runtime-shootout/public/index.html"
assert_file "${TMP_DIR}/out/exp-llm-chat-runtime-shootout/public/app.js"
assert_file "${TMP_DIR}/out/exp-llm-chat-runtime-shootout/public/runtime-profiles.json"
assert_contains "${TMP_DIR}/out/exp-llm-chat-runtime-shootout/public/index.html" "LLM Chat Runtime Readiness"
assert_contains "${TMP_DIR}/out/exp-llm-chat-runtime-shootout/public/app.js" "runtime-readiness-chat"

assert_file "${TMP_DIR}/out/exp-stt-whisper-webgpu/public/index.html"
assert_file "${TMP_DIR}/out/exp-stt-whisper-webgpu/public/app.js"
assert_file "${TMP_DIR}/out/exp-stt-whisper-webgpu/public/transcript-fixture.json"
assert_contains "${TMP_DIR}/out/exp-stt-whisper-webgpu/public/index.html" "File Transcription Readiness"
assert_contains "${TMP_DIR}/out/exp-stt-whisper-webgpu/public/app.js" "file-transcription-readiness"

assert_file "${TMP_DIR}/out/exp-voice-assistant-local/public/index.html"
assert_file "${TMP_DIR}/out/exp-voice-assistant-local/public/app.js"
assert_file "${TMP_DIR}/out/exp-voice-assistant-local/public/voice-fixture.json"
assert_contains "${TMP_DIR}/out/exp-voice-assistant-local/public/index.html" "Voice Assistant Local Readiness"
assert_contains "${TMP_DIR}/out/exp-voice-assistant-local/public/app.js" "voice-assistant-local-readiness"

assert_file "${TMP_DIR}/out/exp-vlm-browser-multimodal/public/index.html"
assert_file "${TMP_DIR}/out/exp-vlm-browser-multimodal/public/app.js"
assert_file "${TMP_DIR}/out/exp-vlm-browser-multimodal/public/multimodal-fixture.json"
assert_file "${TMP_DIR}/out/exp-vlm-browser-multimodal/public/scene-fixture.svg"
assert_contains "${TMP_DIR}/out/exp-vlm-browser-multimodal/public/index.html" "Browser VLM Multimodal Readiness"
assert_contains "${TMP_DIR}/out/exp-vlm-browser-multimodal/public/app.js" "vlm-browser-multimodal-readiness"

assert_file "${TMP_DIR}/out/exp-diffusion-webgpu-browser/public/index.html"
assert_file "${TMP_DIR}/out/exp-diffusion-webgpu-browser/public/app.js"
assert_file "${TMP_DIR}/out/exp-diffusion-webgpu-browser/public/diffusion-fixture.json"
assert_contains "${TMP_DIR}/out/exp-diffusion-webgpu-browser/public/index.html" "Diffusion Browser Readiness"
assert_contains "${TMP_DIR}/out/exp-diffusion-webgpu-browser/public/app.js" "diffusion-webgpu-browser-readiness"

assert_file "${TMP_DIR}/out/exp-browser-agent-local/public/index.html"
assert_file "${TMP_DIR}/out/exp-browser-agent-local/public/app.js"
assert_file "${TMP_DIR}/out/exp-browser-agent-local/public/agent-fixture.json"
assert_contains "${TMP_DIR}/out/exp-browser-agent-local/public/index.html" "Browser Agent Local Readiness"
assert_contains "${TMP_DIR}/out/exp-browser-agent-local/public/app.js" "browser-agent-local-readiness"

assert_file "${TMP_DIR}/out/exp-rag-browser-pipeline/public/index.html"
assert_file "${TMP_DIR}/out/exp-rag-browser-pipeline/public/app.js"
assert_file "${TMP_DIR}/out/exp-rag-browser-pipeline/public/rag-fixture.json"
assert_contains "${TMP_DIR}/out/exp-rag-browser-pipeline/public/index.html" "Browser RAG Pipeline Harness"
assert_contains "${TMP_DIR}/out/exp-rag-browser-pipeline/public/app.js" "browser-rag-fixture"

assert_file "${TMP_DIR}/out/exp-reranker-browser/public/index.html"
assert_file "${TMP_DIR}/out/exp-reranker-browser/public/app.js"
assert_contains "${TMP_DIR}/out/exp-reranker-browser/public/index.html" "Browser Reranker Readiness"
assert_contains "${TMP_DIR}/out/exp-reranker-browser/public/app.js" "browser-reranker-readiness"

assert_file "${TMP_DIR}/out/bench-embeddings-latency-quality/public/index.html"
assert_file "${TMP_DIR}/out/bench-embeddings-latency-quality/public/app.js"
assert_contains "${TMP_DIR}/out/bench-embeddings-latency-quality/public/index.html" "Embeddings Latency Quality Benchmark"
assert_contains "${TMP_DIR}/out/bench-embeddings-latency-quality/public/app.js" "embeddings-latency-quality-benchmark"

assert_file "${TMP_DIR}/out/bench-reranker-latency/public/index.html"
assert_file "${TMP_DIR}/out/bench-reranker-latency/public/app.js"
assert_contains "${TMP_DIR}/out/bench-reranker-latency/public/index.html" "Browser Reranker Latency Benchmark"
assert_contains "${TMP_DIR}/out/bench-reranker-latency/public/app.js" "reranker-latency-benchmark"

assert_file "${TMP_DIR}/out/bench-rag-endtoend/public/index.html"
assert_file "${TMP_DIR}/out/bench-rag-endtoend/public/app.js"
assert_contains "${TMP_DIR}/out/bench-rag-endtoend/public/index.html" "Browser RAG End-to-End Benchmark"
assert_contains "${TMP_DIR}/out/bench-rag-endtoend/public/app.js" "rag-endtoend-benchmark"

assert_file "${TMP_DIR}/out/bench-llm-prefill-decode/public/index.html"
assert_file "${TMP_DIR}/out/bench-llm-prefill-decode/public/app.js"
assert_contains "${TMP_DIR}/out/bench-llm-prefill-decode/public/index.html" "LLM Prefill Decode Benchmark"
assert_contains "${TMP_DIR}/out/bench-llm-prefill-decode/public/app.js" "llm-prefill-decode-benchmark"

assert_file "${TMP_DIR}/out/bench-stt-streaming-latency/public/index.html"
assert_file "${TMP_DIR}/out/bench-stt-streaming-latency/public/app.js"
assert_contains "${TMP_DIR}/out/bench-stt-streaming-latency/public/index.html" "STT Streaming Latency Benchmark"
assert_contains "${TMP_DIR}/out/bench-stt-streaming-latency/public/app.js" "stt-streaming-latency-benchmark"
assert_file "${TMP_DIR}/out/bench-voice-roundtrip/public/index.html"
assert_file "${TMP_DIR}/out/bench-voice-roundtrip/public/app.js"
assert_file "${TMP_DIR}/out/bench-voice-roundtrip/public/voice-benchmark-fixture.json"
assert_contains "${TMP_DIR}/out/bench-voice-roundtrip/public/index.html" "Voice Roundtrip Benchmark"
assert_contains "${TMP_DIR}/out/bench-voice-roundtrip/public/app.js" "voice-roundtrip-benchmark"
assert_file "${TMP_DIR}/out/bench-multimodal-latency/public/index.html"
assert_file "${TMP_DIR}/out/bench-multimodal-latency/public/app.js"
assert_file "${TMP_DIR}/out/bench-multimodal-latency/public/multimodal-benchmark-fixture.json"
assert_file "${TMP_DIR}/out/bench-multimodal-latency/public/scene-fixture.svg"
assert_contains "${TMP_DIR}/out/bench-multimodal-latency/public/index.html" "Multimodal Latency Benchmark"
assert_contains "${TMP_DIR}/out/bench-multimodal-latency/public/app.js" "multimodal-latency-benchmark"
assert_file "${TMP_DIR}/out/bench-diffusion-browser-shootout/public/index.html"
assert_file "${TMP_DIR}/out/bench-diffusion-browser-shootout/public/app.js"
assert_file "${TMP_DIR}/out/bench-diffusion-browser-shootout/public/diffusion-benchmark-fixture.json"
assert_contains "${TMP_DIR}/out/bench-diffusion-browser-shootout/public/index.html" "Diffusion Browser Shootout"
assert_contains "${TMP_DIR}/out/bench-diffusion-browser-shootout/public/app.js" "diffusion-browser-shootout-benchmark"
assert_file "${TMP_DIR}/out/bench-agent-step-latency/public/index.html"
assert_file "${TMP_DIR}/out/bench-agent-step-latency/public/app.js"
assert_file "${TMP_DIR}/out/bench-agent-step-latency/public/agent-benchmark-fixture.json"
assert_contains "${TMP_DIR}/out/bench-agent-step-latency/public/index.html" "Agent Step Latency Benchmark"
assert_contains "${TMP_DIR}/out/bench-agent-step-latency/public/app.js" "agent-step-latency-benchmark"

assert_file "${TMP_DIR}/out/bench-webgpu-vs-wasm-parity/public/index.html"
assert_file "${TMP_DIR}/out/bench-webgpu-vs-wasm-parity/public/app.js"
assert_contains "${TMP_DIR}/out/bench-webgpu-vs-wasm-parity/public/index.html" "WebGPU Wasm Parity Benchmark"
assert_contains "${TMP_DIR}/out/bench-webgpu-vs-wasm-parity/public/app.js" "webgpu-wasm-parity-benchmark"

assert_file "${TMP_DIR}/out/bench-blackhole-render-shootout/public/index.html"
assert_file "${TMP_DIR}/out/bench-blackhole-render-shootout/public/app.js"
assert_contains "${TMP_DIR}/out/bench-blackhole-render-shootout/public/index.html" "Blackhole Render Shootout"
assert_contains "${TMP_DIR}/out/bench-blackhole-render-shootout/public/app.js" "blackhole-render-shootout-benchmark"

assert_file "${TMP_DIR}/out/bench-renderer-shootout/public/index.html"
assert_file "${TMP_DIR}/out/bench-renderer-shootout/public/app.js"
assert_contains "${TMP_DIR}/out/bench-renderer-shootout/public/index.html" "Renderer Shootout"
assert_contains "${TMP_DIR}/out/bench-renderer-shootout/public/app.js" "renderer-shootout-benchmark"

assert_file "${TMP_DIR}/out/exp-babylon-webgpu-core/public/index.html"
assert_file "${TMP_DIR}/out/exp-babylon-webgpu-core/public/app.js"
assert_contains "${TMP_DIR}/out/exp-babylon-webgpu-core/public/index.html" "Babylon Scene Readiness"
assert_contains "${TMP_DIR}/out/exp-babylon-webgpu-core/public/app.js" "babylon-webgpu-scene-readiness"

assert_file "${TMP_DIR}/out/exp-playcanvas-webgpu-core/public/index.html"
assert_file "${TMP_DIR}/out/exp-playcanvas-webgpu-core/public/app.js"
assert_contains "${TMP_DIR}/out/exp-playcanvas-webgpu-core/public/index.html" "PlayCanvas Scene Readiness"
assert_contains "${TMP_DIR}/out/exp-playcanvas-webgpu-core/public/app.js" "playcanvas-webgpu-scene-readiness"

assert_file "${TMP_DIR}/out/exp-pixi-webgpu-2d/public/index.html"
assert_file "${TMP_DIR}/out/exp-pixi-webgpu-2d/public/app.js"
assert_contains "${TMP_DIR}/out/exp-pixi-webgpu-2d/public/index.html" "Pixi 2D Readiness"
assert_contains "${TMP_DIR}/out/exp-pixi-webgpu-2d/public/app.js" "pixi-webgpu-2d-readiness"

assert_file "${TMP_DIR}/out/exp-luma-webgpu-viz/public/index.html"
assert_file "${TMP_DIR}/out/exp-luma-webgpu-viz/public/app.js"
assert_contains "${TMP_DIR}/out/exp-luma-webgpu-viz/public/index.html" "Luma Viz Readiness"
assert_contains "${TMP_DIR}/out/exp-luma-webgpu-viz/public/app.js" "luma-webgpu-viz-readiness"

assert_file "${TMP_DIR}/out/exp-deckgl-webgpu-readiness/public/index.html"
assert_file "${TMP_DIR}/out/exp-deckgl-webgpu-readiness/public/app.js"
assert_contains "${TMP_DIR}/out/exp-deckgl-webgpu-readiness/public/index.html" "Deck.gl Readiness"
assert_contains "${TMP_DIR}/out/exp-deckgl-webgpu-readiness/public/app.js" "deckgl-webgpu-readiness"

assert_file "${TMP_DIR}/out/exp-blackhole-three-singularity/public/index.html"
assert_file "${TMP_DIR}/out/exp-blackhole-three-singularity/public/app.js"
assert_contains "${TMP_DIR}/out/exp-blackhole-three-singularity/public/index.html" "Blackhole Singularity Readiness"
assert_contains "${TMP_DIR}/out/exp-blackhole-three-singularity/public/app.js" "blackhole-three-singularity-readiness"

assert_file "${TMP_DIR}/out/exp-blackhole-kerr-engine/public/index.html"
assert_file "${TMP_DIR}/out/exp-blackhole-kerr-engine/public/app.js"
assert_contains "${TMP_DIR}/out/exp-blackhole-kerr-engine/public/index.html" "Kerr Engine Readiness"
assert_contains "${TMP_DIR}/out/exp-blackhole-kerr-engine/public/app.js" "blackhole-kerr-engine-readiness"

assert_file "${TMP_DIR}/out/exp-blackhole-webgpu-fromscratch/public/index.html"
assert_file "${TMP_DIR}/out/exp-blackhole-webgpu-fromscratch/public/app.js"
assert_contains "${TMP_DIR}/out/exp-blackhole-webgpu-fromscratch/public/index.html" "Raw WebGPU Blackhole Readiness"
assert_contains "${TMP_DIR}/out/exp-blackhole-webgpu-fromscratch/public/app.js" "blackhole-webgpu-fromscratch-readiness"

assert_file "${TMP_DIR}/out/exp-nbody-webgpu-core/public/index.html"
assert_file "${TMP_DIR}/out/exp-nbody-webgpu-core/public/app.js"
assert_contains "${TMP_DIR}/out/exp-nbody-webgpu-core/public/index.html" "N-Body Compute Readiness"
assert_contains "${TMP_DIR}/out/exp-nbody-webgpu-core/public/app.js" "nbody-webgpu-core-readiness"

assert_file "${TMP_DIR}/out/exp-fluid-webgpu-core/public/index.html"
assert_file "${TMP_DIR}/out/exp-fluid-webgpu-core/public/app.js"
assert_contains "${TMP_DIR}/out/exp-fluid-webgpu-core/public/index.html" "Fluid Compute Readiness"
assert_contains "${TMP_DIR}/out/exp-fluid-webgpu-core/public/app.js" "fluid-webgpu-core-readiness"

assert_file "${TMP_DIR}/out/exp-three-webgpu-particles-stress/public/index.html"
assert_file "${TMP_DIR}/out/exp-three-webgpu-particles-stress/public/app.js"
assert_contains "${TMP_DIR}/out/exp-three-webgpu-particles-stress/public/index.html" "Three Particles Stress Readiness"
assert_contains "${TMP_DIR}/out/exp-three-webgpu-particles-stress/public/app.js" "three-webgpu-particles-stress-readiness"

assert_file "${TMP_DIR}/out/bench-compute-stress-suite/public/index.html"
assert_file "${TMP_DIR}/out/bench-compute-stress-suite/public/app.js"
assert_file "${TMP_DIR}/out/bench-compute-stress-suite/public/compute-stress-profiles.json"
assert_contains "${TMP_DIR}/out/bench-compute-stress-suite/public/index.html" "Compute Stress Suite Benchmark"
assert_contains "${TMP_DIR}/out/bench-compute-stress-suite/public/app.js" "compute-stress-suite-benchmark"

assert_file "${TMP_DIR}/out/bench-atomics-and-memory/public/index.html"
assert_file "${TMP_DIR}/out/bench-atomics-and-memory/public/app.js"
assert_file "${TMP_DIR}/out/bench-atomics-and-memory/public/atomics-memory-profiles.json"
assert_contains "${TMP_DIR}/out/bench-atomics-and-memory/public/index.html" "Atomics and Memory Benchmark"
assert_contains "${TMP_DIR}/out/bench-atomics-and-memory/public/app.js" "atomics-and-memory-benchmark"

assert_file "${TMP_DIR}/out/bench-texture-upload-and-streaming/public/index.html"
assert_file "${TMP_DIR}/out/bench-texture-upload-and-streaming/public/app.js"
assert_file "${TMP_DIR}/out/bench-texture-upload-and-streaming/public/texture-upload-profiles.json"
assert_contains "${TMP_DIR}/out/bench-texture-upload-and-streaming/public/index.html" "Texture Upload and Streaming Benchmark"
assert_contains "${TMP_DIR}/out/bench-texture-upload-and-streaming/public/app.js" "texture-upload-and-streaming-benchmark"

assert_file "${TMP_DIR}/out/exp-ort-webgpu-baseline/public/index.html"
assert_file "${TMP_DIR}/out/exp-ort-webgpu-baseline/public/app.js"
assert_contains "${TMP_DIR}/out/exp-ort-webgpu-baseline/public/index.html" "ORT WebGPU Readiness"
assert_contains "${TMP_DIR}/out/exp-ort-webgpu-baseline/public/app.js" "ort-webgpu-baseline"

assert_file "${TMP_DIR}/out/exp-llm-worker-ux/public/index.html"
assert_file "${TMP_DIR}/out/exp-llm-worker-ux/public/app.js"
assert_file "${TMP_DIR}/out/exp-llm-worker-ux/public/llm-worker.js"
assert_contains "${TMP_DIR}/out/exp-llm-worker-ux/public/index.html" "LLM Worker UX Readiness"
assert_contains "${TMP_DIR}/out/exp-llm-worker-ux/public/app.js" "llm-worker-ux"

assert_file "${TMP_DIR}/out/app-private-rag-lab/public/index.html"
assert_file "${TMP_DIR}/out/app-private-rag-lab/public/app.js"
assert_contains "${TMP_DIR}/out/app-private-rag-lab/public/index.html" "Private RAG Lab Demo"
assert_contains "${TMP_DIR}/out/app-private-rag-lab/public/app.js" "private-rag-lab-demo"
assert_file "${TMP_DIR}/out/app-voice-agent-lab/public/index.html"
assert_file "${TMP_DIR}/out/app-voice-agent-lab/public/app.js"
assert_file "${TMP_DIR}/out/app-voice-agent-lab/public/voice-agent-fixture.json"
assert_contains "${TMP_DIR}/out/app-voice-agent-lab/public/index.html" "Voice Agent Lab Demo"
assert_contains "${TMP_DIR}/out/app-voice-agent-lab/public/app.js" "voice-agent-lab-demo"
assert_file "${TMP_DIR}/out/app-browser-image-lab/public/index.html"
assert_file "${TMP_DIR}/out/app-browser-image-lab/public/app.js"
assert_file "${TMP_DIR}/out/app-browser-image-lab/public/browser-image-fixture.json"
assert_file "${TMP_DIR}/out/app-browser-image-lab/public/scene-fixture.svg"
assert_contains "${TMP_DIR}/out/app-browser-image-lab/public/index.html" "Browser Image Lab Demo"
assert_contains "${TMP_DIR}/out/app-browser-image-lab/public/app.js" "browser-image-lab-demo"
assert_file "${TMP_DIR}/out/app-blackhole-observatory/public/index.html"
assert_file "${TMP_DIR}/out/app-blackhole-observatory/public/app.js"
assert_file "${TMP_DIR}/out/app-blackhole-observatory/public/blackhole-observatory-fixture.json"
assert_contains "${TMP_DIR}/out/app-blackhole-observatory/public/index.html" "Blackhole Observatory Demo"
assert_contains "${TMP_DIR}/out/app-blackhole-observatory/public/app.js" "blackhole-observatory-demo"

assert_file "${TMP_DIR}/out/tpl-webgpu-vanilla/public/index.html"
assert_file "${TMP_DIR}/out/tpl-webgpu-vanilla/public/app.js"
assert_contains "${TMP_DIR}/out/tpl-webgpu-vanilla/public/index.html" "Minimal WebGPU Starter"
assert_contains "${TMP_DIR}/out/tpl-webgpu-vanilla/public/app.js" "minimal-webgpu-starter"

assert_file "${TMP_DIR}/out/tpl-webgpu-react/public/index.html"
assert_file "${TMP_DIR}/out/tpl-webgpu-react/public/app.js"
assert_contains "${TMP_DIR}/out/tpl-webgpu-react/public/index.html" "react.production.min.js"
assert_contains "${TMP_DIR}/out/tpl-webgpu-react/public/app.js" "bootReactWebGpuTemplate"

assert_file "${TMP_DIR}/out/bench-runtime-shootout/RESULTS.md"
assert_file "${TMP_DIR}/out/bench-runtime-shootout/public/index.html"
assert_file "${TMP_DIR}/out/bench-runtime-shootout/public/app.js"
assert_file "${TMP_DIR}/out/bench-runtime-shootout/public/runtime-benchmark-profiles.json"
assert_contains "${TMP_DIR}/out/bench-runtime-shootout/public/index.html" "Fixed Scenario Runtime Shootout"
assert_contains "${TMP_DIR}/out/bench-runtime-shootout/public/app.js" "fixed-runtime-shootout"
assert_contains "${TMP_DIR}/out/bench-runtime-shootout/README.md" "repo-scaffolds/p0/bench-runtime-shootout/"

assert_file "${TMP_DIR}/out/bench-worker-isolation-and-ui-jank/public/index.html"
assert_file "${TMP_DIR}/out/bench-worker-isolation-and-ui-jank/public/app.js"
assert_file "${TMP_DIR}/out/bench-worker-isolation-and-ui-jank/public/jank-worker.js"
assert_contains "${TMP_DIR}/out/bench-worker-isolation-and-ui-jank/public/index.html" "Worker Isolation vs Main Thread Jank"
assert_contains "${TMP_DIR}/out/bench-worker-isolation-and-ui-jank/public/app.js" "worker-isolation-jank-harness"

assert_file "${TMP_DIR}/out/bench-model-load-and-cache/public/index.html"
assert_file "${TMP_DIR}/out/bench-model-load-and-cache/public/app.js"
assert_file "${TMP_DIR}/out/bench-model-load-and-cache/public/model-manifest.json"
assert_contains "${TMP_DIR}/out/bench-model-load-and-cache/public/index.html" "Cold vs Warm Model Load Harness"
assert_contains "${TMP_DIR}/out/bench-model-load-and-cache/public/model-manifest.json" "\"modelId\": \"synthetic-browser-load-v1\""

assert_file "${TMP_DIR}/out/app-blackhole-observatory/README.md"
assert_dir "${TMP_DIR}/out/app-blackhole-observatory/public"
assert_file "${TMP_DIR}/out/app-blackhole-observatory/public/.nojekyll"
assert_file "${TMP_DIR}/out/app-blackhole-observatory/public/index.html"
assert_file "${TMP_DIR}/out/app-blackhole-observatory/public/app.js"
assert_file "${TMP_DIR}/out/app-blackhole-observatory/public/blackhole-observatory-fixture.json"
assert_file "${TMP_DIR}/out/app-blackhole-observatory/.github/workflows/deploy-pages.yml"
assert_contains "${TMP_DIR}/out/app-blackhole-observatory/.github/workflows/deploy-pages.yml" "actions/upload-pages-artifact@v4"
assert_contains "${TMP_DIR}/out/app-blackhole-observatory/public/index.html" "Blackhole Observatory Demo"
assert_contains "${TMP_DIR}/out/app-blackhole-observatory/public/app.js" "blackhole-observatory-demo"
assert_contains "${TMP_DIR}/out/app-blackhole-observatory/README.md" "## 산출물"

echo "bootstrap-org-repos full inventory test passed"
