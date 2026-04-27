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

check_sketch() {
  local repo="$1"
  local sketch="$2"
  local file="${TMP_DIR}/out/${repo}/public/${sketch}"
  if [[ ! -f "${file}" ]]; then
    fail "${repo} missing ${sketch}"
  fi
}

check_no_sketch() {
  local repo="$1"
  local file="${TMP_DIR}/out/${repo}/public"
  if [[ -d "${file}" ]] && find "${file}" -maxdepth 1 -name 'real-*-sketch.js' -type f 2>/dev/null | grep -q .; then
    fail "${repo} unexpectedly has a real-*-sketch.js"
  fi
}

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --output-root "${TMP_DIR}/out" \
  --no-sync >/dev/null

# Renderer family — all graphics + blackhole exp-* repos
RENDERER_REPOS=(
  exp-three-webgpu-core
  exp-babylon-webgpu-core
  exp-playcanvas-webgpu-core
  exp-pixi-webgpu-2d
  exp-luma-webgpu-viz
  exp-deckgl-webgpu-readiness
  exp-blackhole-three-singularity
  exp-blackhole-kerr-engine
  exp-blackhole-webgpu-fromscratch
  exp-nbody-webgpu-core
  exp-fluid-webgpu-core
  exp-three-webgpu-particles-stress
)
for repo in "${RENDERER_REPOS[@]}"; do
  check_sketch "${repo}" "real-renderer-sketch.js"
done

# Runtime family — ml/llm/audio/multimodal/agent exp-* repos
RUNTIME_REPOS=(
  exp-embeddings-browser-throughput
  exp-reranker-browser
  exp-rag-browser-pipeline
  exp-ort-webgpu-baseline
  exp-webllm-browser-chat
  exp-llm-chat-runtime-shootout
  exp-llm-worker-ux
  exp-stt-whisper-webgpu
  exp-voice-assistant-local
  exp-vlm-browser-multimodal
  exp-diffusion-webgpu-browser
  exp-browser-agent-local
)
for repo in "${RUNTIME_REPOS[@]}"; do
  check_sketch "${repo}" "real-runtime-sketch.js"
done

# App surface family — every app-*
APP_REPOS=(
  app-private-rag-lab
  app-local-chat-arena
  app-voice-agent-lab
  app-browser-image-lab
  app-blackhole-observatory
)
for repo in "${APP_REPOS[@]}"; do
  check_sketch "${repo}" "real-surface-sketch.js"
done

# Benchmark family — every bench-*
BENCHMARK_REPOS=(
  bench-runtime-shootout
  bench-embeddings-latency-quality
  bench-reranker-latency
  bench-rag-endtoend
  bench-llm-prefill-decode
  bench-model-load-and-cache
  bench-stt-streaming-latency
  bench-voice-roundtrip
  bench-worker-isolation-and-ui-jank
  bench-multimodal-latency
  bench-diffusion-browser-shootout
  bench-agent-step-latency
  bench-webgpu-vs-wasm-parity
  bench-blackhole-render-shootout
  bench-compute-stress-suite
  bench-atomics-and-memory
  bench-texture-upload-and-streaming
  bench-renderer-shootout
)
for repo in "${BENCHMARK_REPOS[@]}"; do
  check_sketch "${repo}" "real-benchmark-sketch.js"
done

# bench-* runtime/renderer companions
check_sketch "bench-runtime-shootout" "real-runtime-sketch.js"
check_sketch "bench-llm-prefill-decode" "real-runtime-sketch.js"
check_sketch "bench-blackhole-render-shootout" "real-renderer-sketch.js"
check_sketch "bench-compute-stress-suite" "real-renderer-sketch.js"

# Repos that should NOT have any real sketch
NO_SKETCH_REPOS=(
  .github
  tpl-webgpu-vanilla
  tpl-webgpu-react
  shared-webgpu-capability
  shared-bench-schema
  shared-github-actions
  docs-lab-roadmap
)
for repo in "${NO_SKETCH_REPOS[@]}"; do
  check_no_sketch "${repo}"
done

SKETCH_COUNT="$(find "${TMP_DIR}/out" -mindepth 3 -maxdepth 3 -name 'real-*-sketch.js' -type f | wc -l | tr -d ' ')"
EXPECTED_MIN=44
if [[ "${SKETCH_COUNT}" -lt "${EXPECTED_MIN}" ]]; then
  fail "expected at least ${EXPECTED_MIN} real-*-sketch.js files across inventory, got ${SKETCH_COUNT}"
fi

echo "real-sketch-family-coverage test passed (${SKETCH_COUNT} sketch files across inventory)"
