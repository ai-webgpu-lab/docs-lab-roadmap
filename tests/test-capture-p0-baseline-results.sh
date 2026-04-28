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

assert_contains() {
  local path="$1"
  local pattern="$2"
  if command -v rg >/dev/null 2>&1 && rg -Fq "${pattern}" "${path}" 2>/dev/null; then
    return 0
  fi
  grep -Fq "${pattern}" "${path}" || fail "missing pattern '${pattern}' in ${path}"
}

[[ -d "${REPO_ROOT}/node_modules/playwright" ]] || fail "playwright dependency missing; run npm install"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "bench-model-load-and-cache" \
  --output-root "${TMP_DIR}/out" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out/bench-model-load-and-cache" \
  --repo-name "bench-model-load-and-cache" \
  --commit "test-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out/bench-model-load-and-cache/reports/raw/01-cold-load.json"
assert_file "${TMP_DIR}/out/bench-model-load-and-cache/reports/raw/02-warm-load.json"
assert_file "${TMP_DIR}/out/bench-model-load-and-cache/reports/screenshots/01-cold-load.png"
assert_file "${TMP_DIR}/out/bench-model-load-and-cache/reports/screenshots/02-warm-load.png"
assert_file "${TMP_DIR}/out/bench-model-load-and-cache/reports/logs/01-cold-load.log"
assert_file "${TMP_DIR}/out/bench-model-load-and-cache/reports/logs/02-warm-load.log"
assert_contains "${TMP_DIR}/out/bench-model-load-and-cache/reports/raw/01-cold-load.json" "\"commit\": \"test-commit\""
assert_contains "${TMP_DIR}/out/bench-model-load-and-cache/reports/raw/02-warm-load.json" "\"tool\": \"playwright-chromium\""
assert_contains "${TMP_DIR}/out/bench-model-load-and-cache/RESULTS.md" "Cold Load"
assert_contains "${TMP_DIR}/out/bench-model-load-and-cache/RESULTS.md" "Warm Load"
assert_contains "${TMP_DIR}/out/bench-model-load-and-cache/RESULTS.md" "playwright-chromium"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "tpl-webgpu-vanilla" \
  --output-root "${TMP_DIR}/out-template" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-template/tpl-webgpu-vanilla" \
  --repo-name "tpl-webgpu-vanilla" \
  --commit "template-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-template/tpl-webgpu-vanilla/reports/raw/01-minimal-webgpu-starter.json"
assert_file "${TMP_DIR}/out-template/tpl-webgpu-vanilla/reports/screenshots/01-minimal-webgpu-starter.png"
assert_file "${TMP_DIR}/out-template/tpl-webgpu-vanilla/reports/logs/01-minimal-webgpu-starter.log"
assert_contains "${TMP_DIR}/out-template/tpl-webgpu-vanilla/reports/raw/01-minimal-webgpu-starter.json" "\"commit\": \"template-commit\""
assert_contains "${TMP_DIR}/out-template/tpl-webgpu-vanilla/RESULTS.md" "Minimal WebGPU Starter"
assert_contains "${TMP_DIR}/out-template/tpl-webgpu-vanilla/RESULTS.md" "playwright-chromium"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-embeddings-browser-throughput" \
  --output-root "${TMP_DIR}/out-embeddings" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-embeddings/exp-embeddings-browser-throughput" \
  --repo-name "exp-embeddings-browser-throughput" \
  --commit "compare-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-embeddings/exp-embeddings-browser-throughput/reports/raw/01-cold-index-webgpu.json"
assert_file "${TMP_DIR}/out-embeddings/exp-embeddings-browser-throughput/reports/raw/02-warm-query-webgpu.json"
assert_file "${TMP_DIR}/out-embeddings/exp-embeddings-browser-throughput/reports/raw/03-cold-index-fallback.json"
assert_file "${TMP_DIR}/out-embeddings/exp-embeddings-browser-throughput/reports/raw/04-warm-query-fallback.json"
assert_contains "${TMP_DIR}/out-embeddings/exp-embeddings-browser-throughput/reports/raw/01-cold-index-webgpu.json" "\"backend\": \"webgpu\""
assert_contains "${TMP_DIR}/out-embeddings/exp-embeddings-browser-throughput/reports/raw/03-cold-index-fallback.json" "\"fallback_triggered\": true"
assert_contains "${TMP_DIR}/out-embeddings/exp-embeddings-browser-throughput/RESULTS.md" "## 8. WebGPU vs Fallback"
assert_contains "${TMP_DIR}/out-embeddings/exp-embeddings-browser-throughput/RESULTS.md" "cold cache: docs/s"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-reranker-browser" \
  --output-root "${TMP_DIR}/out-reranker" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-reranker/exp-reranker-browser" \
  --repo-name "exp-reranker-browser" \
  --commit "reranker-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-reranker/exp-reranker-browser/reports/raw/01-browser-reranker.json"
assert_file "${TMP_DIR}/out-reranker/exp-reranker-browser/reports/screenshots/01-browser-reranker.png"
assert_file "${TMP_DIR}/out-reranker/exp-reranker-browser/reports/logs/01-browser-reranker.log"
assert_contains "${TMP_DIR}/out-reranker/exp-reranker-browser/reports/raw/01-browser-reranker.json" "\"scenario\": \"browser-reranker-readiness\""
assert_contains "${TMP_DIR}/out-reranker/exp-reranker-browser/RESULTS.md" "Browser Reranker"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "bench-embeddings-latency-quality" \
  --output-root "${TMP_DIR}/out-embeddings-bench" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-embeddings-bench/bench-embeddings-latency-quality" \
  --repo-name "bench-embeddings-latency-quality" \
  --commit "embeddings-bench-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-embeddings-bench/bench-embeddings-latency-quality/reports/raw/01-embeddings-quality-webgpu.json"
assert_file "${TMP_DIR}/out-embeddings-bench/bench-embeddings-latency-quality/reports/raw/02-embeddings-quality-fallback.json"
assert_file "${TMP_DIR}/out-embeddings-bench/bench-embeddings-latency-quality/reports/screenshots/01-embeddings-quality-webgpu.png"
assert_file "${TMP_DIR}/out-embeddings-bench/bench-embeddings-latency-quality/reports/logs/02-embeddings-quality-fallback.log"
assert_contains "${TMP_DIR}/out-embeddings-bench/bench-embeddings-latency-quality/reports/raw/01-embeddings-quality-webgpu.json" "\"scenario\": \"embeddings-latency-quality-webgpu\""
assert_contains "${TMP_DIR}/out-embeddings-bench/bench-embeddings-latency-quality/reports/raw/02-embeddings-quality-fallback.json" "\"fallback_triggered\": true"
assert_contains "${TMP_DIR}/out-embeddings-bench/bench-embeddings-latency-quality/RESULTS.md" "Embeddings Quality / WebGPU"
assert_contains "${TMP_DIR}/out-embeddings-bench/bench-embeddings-latency-quality/RESULTS.md" "embeddings benchmark: webgpu winner"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "bench-reranker-latency" \
  --output-root "${TMP_DIR}/out-reranker-bench" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-reranker-bench/bench-reranker-latency" \
  --repo-name "bench-reranker-latency" \
  --commit "reranker-bench-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-reranker-bench/bench-reranker-latency/reports/raw/01-reranker-latency-webgpu.json"
assert_file "${TMP_DIR}/out-reranker-bench/bench-reranker-latency/reports/raw/02-reranker-latency-fallback.json"
assert_file "${TMP_DIR}/out-reranker-bench/bench-reranker-latency/reports/screenshots/01-reranker-latency-webgpu.png"
assert_file "${TMP_DIR}/out-reranker-bench/bench-reranker-latency/reports/logs/02-reranker-latency-fallback.log"
assert_contains "${TMP_DIR}/out-reranker-bench/bench-reranker-latency/reports/raw/01-reranker-latency-webgpu.json" "\"scenario\": \"reranker-latency-webgpu\""
assert_contains "${TMP_DIR}/out-reranker-bench/bench-reranker-latency/reports/raw/02-reranker-latency-fallback.json" "\"fallback_triggered\": true"
assert_contains "${TMP_DIR}/out-reranker-bench/bench-reranker-latency/RESULTS.md" "Reranker Latency / WebGPU"
assert_contains "${TMP_DIR}/out-reranker-bench/bench-reranker-latency/RESULTS.md" "reranker benchmark: webgpu winner"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "bench-rag-endtoend" \
  --output-root "${TMP_DIR}/out-rag-bench" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-rag-bench/bench-rag-endtoend" \
  --repo-name "bench-rag-endtoend" \
  --commit "rag-bench-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-rag-bench/bench-rag-endtoend/reports/raw/01-rag-endtoend-webgpu.json"
assert_file "${TMP_DIR}/out-rag-bench/bench-rag-endtoend/reports/raw/02-rag-endtoend-fallback.json"
assert_file "${TMP_DIR}/out-rag-bench/bench-rag-endtoend/reports/screenshots/01-rag-endtoend-webgpu.png"
assert_file "${TMP_DIR}/out-rag-bench/bench-rag-endtoend/reports/logs/02-rag-endtoend-fallback.log"
assert_contains "${TMP_DIR}/out-rag-bench/bench-rag-endtoend/reports/raw/01-rag-endtoend-webgpu.json" "\"scenario\": \"rag-endtoend-webgpu\""
assert_contains "${TMP_DIR}/out-rag-bench/bench-rag-endtoend/reports/raw/02-rag-endtoend-fallback.json" "\"fallback_triggered\": true"
assert_contains "${TMP_DIR}/out-rag-bench/bench-rag-endtoend/RESULTS.md" "RAG End-to-End / WebGPU"
assert_contains "${TMP_DIR}/out-rag-bench/bench-rag-endtoend/RESULTS.md" "RAG end-to-end: webgpu winner"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "bench-llm-prefill-decode" \
  --output-root "${TMP_DIR}/out-llm-prefill" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-llm-prefill/bench-llm-prefill-decode" \
  --repo-name "bench-llm-prefill-decode" \
  --commit "llm-prefill-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-llm-prefill/bench-llm-prefill-decode/reports/raw/01-llm-prefill-decode-webgpu.json"
assert_file "${TMP_DIR}/out-llm-prefill/bench-llm-prefill-decode/reports/raw/02-llm-prefill-decode-fallback.json"
assert_file "${TMP_DIR}/out-llm-prefill/bench-llm-prefill-decode/reports/screenshots/01-llm-prefill-decode-webgpu.png"
assert_file "${TMP_DIR}/out-llm-prefill/bench-llm-prefill-decode/reports/logs/02-llm-prefill-decode-fallback.log"
assert_contains "${TMP_DIR}/out-llm-prefill/bench-llm-prefill-decode/reports/raw/01-llm-prefill-decode-webgpu.json" "\"scenario\": \"llm-prefill-decode-webgpu\""
assert_contains "${TMP_DIR}/out-llm-prefill/bench-llm-prefill-decode/reports/raw/02-llm-prefill-decode-fallback.json" "\"fallback_triggered\": true"
assert_contains "${TMP_DIR}/out-llm-prefill/bench-llm-prefill-decode/RESULTS.md" "LLM Prefill Decode / WebGPU"
assert_contains "${TMP_DIR}/out-llm-prefill/bench-llm-prefill-decode/RESULTS.md" "LLM prefill/decode: webgpu winner"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "bench-stt-streaming-latency" \
  --output-root "${TMP_DIR}/out-stt-bench" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-stt-bench/bench-stt-streaming-latency" \
  --repo-name "bench-stt-streaming-latency" \
  --commit "stt-bench-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-stt-bench/bench-stt-streaming-latency/reports/raw/01-stt-streaming-webgpu.json"
assert_file "${TMP_DIR}/out-stt-bench/bench-stt-streaming-latency/reports/raw/02-stt-streaming-fallback.json"
assert_file "${TMP_DIR}/out-stt-bench/bench-stt-streaming-latency/reports/screenshots/01-stt-streaming-webgpu.png"
assert_file "${TMP_DIR}/out-stt-bench/bench-stt-streaming-latency/reports/logs/02-stt-streaming-fallback.log"
assert_contains "${TMP_DIR}/out-stt-bench/bench-stt-streaming-latency/reports/raw/01-stt-streaming-webgpu.json" "\"scenario\": \"stt-streaming-latency-webgpu\""
assert_contains "${TMP_DIR}/out-stt-bench/bench-stt-streaming-latency/reports/raw/02-stt-streaming-fallback.json" "\"fallback_triggered\": true"
assert_contains "${TMP_DIR}/out-stt-bench/bench-stt-streaming-latency/RESULTS.md" "STT Streaming / WebGPU"
assert_contains "${TMP_DIR}/out-stt-bench/bench-stt-streaming-latency/RESULTS.md" "STT streaming: webgpu winner"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "bench-voice-roundtrip" \
  --output-root "${TMP_DIR}/out-voice-bench" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-voice-bench/bench-voice-roundtrip" \
  --repo-name "bench-voice-roundtrip" \
  --commit "voice-bench-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-voice-bench/bench-voice-roundtrip/reports/raw/01-voice-roundtrip-webgpu.json"
assert_file "${TMP_DIR}/out-voice-bench/bench-voice-roundtrip/reports/raw/02-voice-roundtrip-fallback.json"
assert_file "${TMP_DIR}/out-voice-bench/bench-voice-roundtrip/reports/screenshots/01-voice-roundtrip-webgpu.png"
assert_file "${TMP_DIR}/out-voice-bench/bench-voice-roundtrip/reports/logs/02-voice-roundtrip-fallback.log"
assert_contains "${TMP_DIR}/out-voice-bench/bench-voice-roundtrip/reports/raw/01-voice-roundtrip-webgpu.json" "\"scenario\": \"voice-roundtrip-webgpu\""
assert_contains "${TMP_DIR}/out-voice-bench/bench-voice-roundtrip/reports/raw/02-voice-roundtrip-fallback.json" "\"fallback_triggered\": true"
assert_contains "${TMP_DIR}/out-voice-bench/bench-voice-roundtrip/RESULTS.md" "Voice Roundtrip / WebGPU"
assert_contains "${TMP_DIR}/out-voice-bench/bench-voice-roundtrip/RESULTS.md" "Voice roundtrip: webgpu winner"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "bench-multimodal-latency" \
  --output-root "${TMP_DIR}/out-multimodal-bench" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-multimodal-bench/bench-multimodal-latency" \
  --repo-name "bench-multimodal-latency" \
  --commit "multimodal-bench-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-multimodal-bench/bench-multimodal-latency/reports/raw/01-multimodal-latency-webgpu.json"
assert_file "${TMP_DIR}/out-multimodal-bench/bench-multimodal-latency/reports/raw/02-multimodal-latency-fallback.json"
assert_file "${TMP_DIR}/out-multimodal-bench/bench-multimodal-latency/reports/screenshots/01-multimodal-latency-webgpu.png"
assert_file "${TMP_DIR}/out-multimodal-bench/bench-multimodal-latency/reports/logs/02-multimodal-latency-fallback.log"
assert_contains "${TMP_DIR}/out-multimodal-bench/bench-multimodal-latency/reports/raw/01-multimodal-latency-webgpu.json" "\"scenario\": \"multimodal-latency-webgpu\""
assert_contains "${TMP_DIR}/out-multimodal-bench/bench-multimodal-latency/reports/raw/02-multimodal-latency-fallback.json" "\"fallback_triggered\": true"
assert_contains "${TMP_DIR}/out-multimodal-bench/bench-multimodal-latency/RESULTS.md" "Multimodal Latency / WebGPU"
assert_contains "${TMP_DIR}/out-multimodal-bench/bench-multimodal-latency/RESULTS.md" "Multimodal latency: webgpu winner"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "bench-diffusion-browser-shootout" \
  --output-root "${TMP_DIR}/out-diffusion-bench" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-diffusion-bench/bench-diffusion-browser-shootout" \
  --repo-name "bench-diffusion-browser-shootout" \
  --commit "diffusion-bench-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-diffusion-bench/bench-diffusion-browser-shootout/reports/raw/01-diffusion-browser-shootout-webgpu.json"
assert_file "${TMP_DIR}/out-diffusion-bench/bench-diffusion-browser-shootout/reports/raw/02-diffusion-browser-shootout-fallback.json"
assert_file "${TMP_DIR}/out-diffusion-bench/bench-diffusion-browser-shootout/reports/screenshots/01-diffusion-browser-shootout-webgpu.png"
assert_file "${TMP_DIR}/out-diffusion-bench/bench-diffusion-browser-shootout/reports/logs/02-diffusion-browser-shootout-fallback.log"
assert_contains "${TMP_DIR}/out-diffusion-bench/bench-diffusion-browser-shootout/reports/raw/01-diffusion-browser-shootout-webgpu.json" "\"scenario\": \"diffusion-browser-shootout-webgpu\""
assert_contains "${TMP_DIR}/out-diffusion-bench/bench-diffusion-browser-shootout/reports/raw/02-diffusion-browser-shootout-fallback.json" "\"fallback_triggered\": true"
assert_contains "${TMP_DIR}/out-diffusion-bench/bench-diffusion-browser-shootout/RESULTS.md" "Diffusion Shootout / WebGPU"
assert_contains "${TMP_DIR}/out-diffusion-bench/bench-diffusion-browser-shootout/RESULTS.md" "Diffusion shootout: webgpu winner"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "bench-agent-step-latency" \
  --output-root "${TMP_DIR}/out-agent-bench" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-agent-bench/bench-agent-step-latency" \
  --repo-name "bench-agent-step-latency" \
  --commit "agent-bench-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-agent-bench/bench-agent-step-latency/reports/raw/01-agent-step-latency-webgpu.json"
assert_file "${TMP_DIR}/out-agent-bench/bench-agent-step-latency/reports/raw/02-agent-step-latency-fallback.json"
assert_file "${TMP_DIR}/out-agent-bench/bench-agent-step-latency/reports/screenshots/01-agent-step-latency-webgpu.png"
assert_file "${TMP_DIR}/out-agent-bench/bench-agent-step-latency/reports/logs/02-agent-step-latency-fallback.log"
assert_contains "${TMP_DIR}/out-agent-bench/bench-agent-step-latency/reports/raw/01-agent-step-latency-webgpu.json" "\"scenario\": \"agent-step-latency-webgpu\""
assert_contains "${TMP_DIR}/out-agent-bench/bench-agent-step-latency/reports/raw/02-agent-step-latency-fallback.json" "\"fallback_triggered\": true"
assert_contains "${TMP_DIR}/out-agent-bench/bench-agent-step-latency/RESULTS.md" "Agent Step Latency / WebGPU"
assert_contains "${TMP_DIR}/out-agent-bench/bench-agent-step-latency/RESULTS.md" "Agent step latency: webgpu winner"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-vlm-browser-multimodal" \
  --output-root "${TMP_DIR}/out-vlm" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-vlm/exp-vlm-browser-multimodal" \
  --repo-name "exp-vlm-browser-multimodal" \
  --commit "vlm-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-vlm/exp-vlm-browser-multimodal/reports/raw/01-vlm-browser-multimodal-readiness.json"
assert_file "${TMP_DIR}/out-vlm/exp-vlm-browser-multimodal/reports/screenshots/01-vlm-browser-multimodal-readiness.png"
assert_file "${TMP_DIR}/out-vlm/exp-vlm-browser-multimodal/reports/logs/01-vlm-browser-multimodal-readiness.log"
assert_contains "${TMP_DIR}/out-vlm/exp-vlm-browser-multimodal/reports/raw/01-vlm-browser-multimodal-readiness.json" "\"scenario\": \"vlm-browser-multimodal-readiness\""
assert_contains "${TMP_DIR}/out-vlm/exp-vlm-browser-multimodal/RESULTS.md" "Browser VLM Multimodal Readiness"
assert_contains "${TMP_DIR}/out-vlm/exp-vlm-browser-multimodal/RESULTS.md" "vlm metadata"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-diffusion-webgpu-browser" \
  --output-root "${TMP_DIR}/out-diffusion" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-diffusion/exp-diffusion-webgpu-browser" \
  --repo-name "exp-diffusion-webgpu-browser" \
  --commit "diffusion-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-diffusion/exp-diffusion-webgpu-browser/reports/raw/01-diffusion-browser-readiness.json"
assert_file "${TMP_DIR}/out-diffusion/exp-diffusion-webgpu-browser/reports/screenshots/01-diffusion-browser-readiness.png"
assert_file "${TMP_DIR}/out-diffusion/exp-diffusion-webgpu-browser/reports/logs/01-diffusion-browser-readiness.log"
assert_contains "${TMP_DIR}/out-diffusion/exp-diffusion-webgpu-browser/reports/raw/01-diffusion-browser-readiness.json" "\"scenario\": \"diffusion-webgpu-browser-readiness\""
assert_contains "${TMP_DIR}/out-diffusion/exp-diffusion-webgpu-browser/RESULTS.md" "Diffusion Browser Readiness"
assert_contains "${TMP_DIR}/out-diffusion/exp-diffusion-webgpu-browser/RESULTS.md" "diffusion metadata"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-browser-agent-local" \
  --output-root "${TMP_DIR}/out-agent" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-agent/exp-browser-agent-local" \
  --repo-name "exp-browser-agent-local" \
  --commit "agent-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-agent/exp-browser-agent-local/reports/raw/01-browser-agent-local-readiness.json"
assert_file "${TMP_DIR}/out-agent/exp-browser-agent-local/reports/screenshots/01-browser-agent-local-readiness.png"
assert_file "${TMP_DIR}/out-agent/exp-browser-agent-local/reports/logs/01-browser-agent-local-readiness.log"
assert_contains "${TMP_DIR}/out-agent/exp-browser-agent-local/reports/raw/01-browser-agent-local-readiness.json" "\"scenario\": \"browser-agent-local-readiness\""
assert_contains "${TMP_DIR}/out-agent/exp-browser-agent-local/RESULTS.md" "Browser Agent Local Readiness"
assert_contains "${TMP_DIR}/out-agent/exp-browser-agent-local/RESULTS.md" "agent metadata"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "bench-webgpu-vs-wasm-parity" \
  --output-root "${TMP_DIR}/out-parity" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-parity/bench-webgpu-vs-wasm-parity" \
  --repo-name "bench-webgpu-vs-wasm-parity" \
  --commit "parity-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-parity/bench-webgpu-vs-wasm-parity/reports/raw/01-parity-webgpu.json"
assert_file "${TMP_DIR}/out-parity/bench-webgpu-vs-wasm-parity/reports/raw/02-parity-fallback.json"
assert_file "${TMP_DIR}/out-parity/bench-webgpu-vs-wasm-parity/reports/screenshots/01-parity-webgpu.png"
assert_file "${TMP_DIR}/out-parity/bench-webgpu-vs-wasm-parity/reports/logs/02-parity-fallback.log"
assert_contains "${TMP_DIR}/out-parity/bench-webgpu-vs-wasm-parity/reports/raw/01-parity-webgpu.json" "\"scenario\": \"webgpu-wasm-parity-webgpu\""
assert_contains "${TMP_DIR}/out-parity/bench-webgpu-vs-wasm-parity/reports/raw/02-parity-fallback.json" "\"fallback_triggered\": true"
assert_contains "${TMP_DIR}/out-parity/bench-webgpu-vs-wasm-parity/RESULTS.md" "WebGPU Wasm Parity / WebGPU"
assert_contains "${TMP_DIR}/out-parity/bench-webgpu-vs-wasm-parity/RESULTS.md" "parity pass rate"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "bench-blackhole-render-shootout" \
  --output-root "${TMP_DIR}/out-blackhole-bench" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-blackhole-bench/bench-blackhole-render-shootout" \
  --repo-name "bench-blackhole-render-shootout" \
  --commit "blackhole-bench-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-blackhole-bench/bench-blackhole-render-shootout/reports/raw/01-blackhole-render-webgpu.json"
assert_file "${TMP_DIR}/out-blackhole-bench/bench-blackhole-render-shootout/reports/raw/02-blackhole-render-fallback.json"
assert_file "${TMP_DIR}/out-blackhole-bench/bench-blackhole-render-shootout/reports/screenshots/01-blackhole-render-webgpu.png"
assert_file "${TMP_DIR}/out-blackhole-bench/bench-blackhole-render-shootout/reports/logs/02-blackhole-render-fallback.log"
assert_contains "${TMP_DIR}/out-blackhole-bench/bench-blackhole-render-shootout/reports/raw/01-blackhole-render-webgpu.json" "\"scenario\": \"blackhole-render-shootout-webgpu\""
assert_contains "${TMP_DIR}/out-blackhole-bench/bench-blackhole-render-shootout/reports/raw/02-blackhole-render-fallback.json" "\"fallback_triggered\": true"
assert_contains "${TMP_DIR}/out-blackhole-bench/bench-blackhole-render-shootout/RESULTS.md" "Blackhole Render Shootout / WebGPU"
assert_contains "${TMP_DIR}/out-blackhole-bench/bench-blackhole-render-shootout/RESULTS.md" "blackhole renderer winner"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "bench-renderer-shootout" \
  --output-root "${TMP_DIR}/out-renderer-bench" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-renderer-bench/bench-renderer-shootout" \
  --repo-name "bench-renderer-shootout" \
  --commit "renderer-bench-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-renderer-bench/bench-renderer-shootout/reports/raw/01-renderer-shootout-webgpu.json"
assert_file "${TMP_DIR}/out-renderer-bench/bench-renderer-shootout/reports/raw/02-renderer-shootout-fallback.json"
assert_file "${TMP_DIR}/out-renderer-bench/bench-renderer-shootout/reports/screenshots/01-renderer-shootout-webgpu.png"
assert_file "${TMP_DIR}/out-renderer-bench/bench-renderer-shootout/reports/logs/02-renderer-shootout-fallback.log"
assert_contains "${TMP_DIR}/out-renderer-bench/bench-renderer-shootout/reports/raw/01-renderer-shootout-webgpu.json" "\"scenario\": \"renderer-shootout-webgpu\""
assert_contains "${TMP_DIR}/out-renderer-bench/bench-renderer-shootout/reports/raw/02-renderer-shootout-fallback.json" "\"fallback_triggered\": true"
assert_contains "${TMP_DIR}/out-renderer-bench/bench-renderer-shootout/RESULTS.md" "Renderer Shootout / WebGPU"
assert_contains "${TMP_DIR}/out-renderer-bench/bench-renderer-shootout/RESULTS.md" "renderer winner"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "app-private-rag-lab" \
  --output-root "${TMP_DIR}/out-private-rag" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-private-rag/app-private-rag-lab" \
  --repo-name "app-private-rag-lab" \
  --commit "private-rag-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-private-rag/app-private-rag-lab/reports/raw/01-private-rag-lab.json"
assert_file "${TMP_DIR}/out-private-rag/app-private-rag-lab/reports/screenshots/01-private-rag-lab.png"
assert_file "${TMP_DIR}/out-private-rag/app-private-rag-lab/reports/logs/01-private-rag-lab.log"
assert_contains "${TMP_DIR}/out-private-rag/app-private-rag-lab/reports/raw/01-private-rag-lab.json" "\"scenario\": \"private-rag-lab-demo\""
assert_contains "${TMP_DIR}/out-private-rag/app-private-rag-lab/RESULTS.md" "Private RAG Lab"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "app-voice-agent-lab" \
  --output-root "${TMP_DIR}/out-voice-agent" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-voice-agent/app-voice-agent-lab" \
  --repo-name "app-voice-agent-lab" \
  --commit "voice-agent-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-voice-agent/app-voice-agent-lab/reports/raw/01-voice-agent-lab.json"
assert_file "${TMP_DIR}/out-voice-agent/app-voice-agent-lab/reports/screenshots/01-voice-agent-lab.png"
assert_file "${TMP_DIR}/out-voice-agent/app-voice-agent-lab/reports/logs/01-voice-agent-lab.log"
assert_contains "${TMP_DIR}/out-voice-agent/app-voice-agent-lab/reports/raw/01-voice-agent-lab.json" "\"scenario\": \"voice-agent-lab-demo\""
assert_contains "${TMP_DIR}/out-voice-agent/app-voice-agent-lab/RESULTS.md" "Voice Agent Lab"
assert_contains "${TMP_DIR}/out-voice-agent/app-voice-agent-lab/RESULTS.md" "roundtrip_ms"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "app-browser-image-lab" \
  --output-root "${TMP_DIR}/out-image-lab" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-image-lab/app-browser-image-lab" \
  --repo-name "app-browser-image-lab" \
  --commit "image-lab-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-image-lab/app-browser-image-lab/reports/raw/01-browser-image-lab.json"
assert_file "${TMP_DIR}/out-image-lab/app-browser-image-lab/reports/screenshots/01-browser-image-lab.png"
assert_file "${TMP_DIR}/out-image-lab/app-browser-image-lab/reports/logs/01-browser-image-lab.log"
assert_contains "${TMP_DIR}/out-image-lab/app-browser-image-lab/reports/raw/01-browser-image-lab.json" "\"scenario\": \"browser-image-lab-demo\""
assert_contains "${TMP_DIR}/out-image-lab/app-browser-image-lab/RESULTS.md" "Browser Image Lab"
assert_contains "${TMP_DIR}/out-image-lab/app-browser-image-lab/RESULTS.md" "sec_per_image"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "app-blackhole-observatory" \
  --output-root "${TMP_DIR}/out-blackhole-app" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-blackhole-app/app-blackhole-observatory" \
  --repo-name "app-blackhole-observatory" \
  --commit "blackhole-app-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-blackhole-app/app-blackhole-observatory/reports/raw/01-blackhole-observatory.json"
assert_file "${TMP_DIR}/out-blackhole-app/app-blackhole-observatory/reports/screenshots/01-blackhole-observatory.png"
assert_file "${TMP_DIR}/out-blackhole-app/app-blackhole-observatory/reports/logs/01-blackhole-observatory.log"
assert_contains "${TMP_DIR}/out-blackhole-app/app-blackhole-observatory/reports/raw/01-blackhole-observatory.json" "\"scenario\": \"blackhole-observatory-demo\""
assert_contains "${TMP_DIR}/out-blackhole-app/app-blackhole-observatory/RESULTS.md" "Blackhole Observatory"
assert_contains "${TMP_DIR}/out-blackhole-app/app-blackhole-observatory/RESULTS.md" "renderer_consensus_score"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-ort-webgpu-baseline" \
  --output-root "${TMP_DIR}/out-ort" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-ort/exp-ort-webgpu-baseline" \
  --repo-name "exp-ort-webgpu-baseline" \
  --commit "ort-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-ort/exp-ort-webgpu-baseline/reports/raw/01-ort-webgpu-provider.json"
assert_file "${TMP_DIR}/out-ort/exp-ort-webgpu-baseline/reports/raw/02-ort-wasm-fallback.json"
assert_file "${TMP_DIR}/out-ort/exp-ort-webgpu-baseline/reports/screenshots/01-ort-webgpu-provider.png"
assert_file "${TMP_DIR}/out-ort/exp-ort-webgpu-baseline/reports/screenshots/02-ort-wasm-fallback.png"
assert_file "${TMP_DIR}/out-ort/exp-ort-webgpu-baseline/reports/logs/01-ort-webgpu-provider.log"
assert_file "${TMP_DIR}/out-ort/exp-ort-webgpu-baseline/reports/logs/02-ort-wasm-fallback.log"
assert_contains "${TMP_DIR}/out-ort/exp-ort-webgpu-baseline/reports/raw/01-ort-webgpu-provider.json" "\"scenario\": \"ort-webgpu-baseline-webgpu\""
assert_contains "${TMP_DIR}/out-ort/exp-ort-webgpu-baseline/reports/raw/02-ort-wasm-fallback.json" "\"fallback_triggered\": true"
assert_contains "${TMP_DIR}/out-ort/exp-ort-webgpu-baseline/RESULTS.md" "ORT WebGPU Provider"
assert_contains "${TMP_DIR}/out-ort/exp-ort-webgpu-baseline/RESULTS.md" "provider readiness"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-three-webgpu-core" \
  --output-root "${TMP_DIR}/out-three" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-three/exp-three-webgpu-core" \
  --repo-name "exp-three-webgpu-core" \
  --commit "three-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-three/exp-three-webgpu-core/reports/raw/01-three-scene-readiness.json"
assert_file "${TMP_DIR}/out-three/exp-three-webgpu-core/reports/screenshots/01-three-scene-readiness.png"
assert_file "${TMP_DIR}/out-three/exp-three-webgpu-core/reports/logs/01-three-scene-readiness.log"
assert_contains "${TMP_DIR}/out-three/exp-three-webgpu-core/reports/raw/01-three-scene-readiness.json" "\"scenario\": \"three-webgpu-scene-readiness\""
assert_contains "${TMP_DIR}/out-three/exp-three-webgpu-core/RESULTS.md" "Three Scene Readiness"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-babylon-webgpu-core" \
  --output-root "${TMP_DIR}/out-babylon" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-babylon/exp-babylon-webgpu-core" \
  --repo-name "exp-babylon-webgpu-core" \
  --commit "babylon-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-babylon/exp-babylon-webgpu-core/reports/raw/01-babylon-scene-readiness.json"
assert_file "${TMP_DIR}/out-babylon/exp-babylon-webgpu-core/reports/screenshots/01-babylon-scene-readiness.png"
assert_file "${TMP_DIR}/out-babylon/exp-babylon-webgpu-core/reports/logs/01-babylon-scene-readiness.log"
assert_contains "${TMP_DIR}/out-babylon/exp-babylon-webgpu-core/reports/raw/01-babylon-scene-readiness.json" "\"scenario\": \"babylon-webgpu-scene-readiness\""
assert_contains "${TMP_DIR}/out-babylon/exp-babylon-webgpu-core/RESULTS.md" "Babylon Scene Readiness"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-playcanvas-webgpu-core" \
  --output-root "${TMP_DIR}/out-playcanvas" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-playcanvas/exp-playcanvas-webgpu-core" \
  --repo-name "exp-playcanvas-webgpu-core" \
  --commit "playcanvas-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-playcanvas/exp-playcanvas-webgpu-core/reports/raw/01-playcanvas-scene-readiness.json"
assert_file "${TMP_DIR}/out-playcanvas/exp-playcanvas-webgpu-core/reports/screenshots/01-playcanvas-scene-readiness.png"
assert_file "${TMP_DIR}/out-playcanvas/exp-playcanvas-webgpu-core/reports/logs/01-playcanvas-scene-readiness.log"
assert_contains "${TMP_DIR}/out-playcanvas/exp-playcanvas-webgpu-core/reports/raw/01-playcanvas-scene-readiness.json" "\"scenario\": \"playcanvas-webgpu-scene-readiness\""
assert_contains "${TMP_DIR}/out-playcanvas/exp-playcanvas-webgpu-core/RESULTS.md" "PlayCanvas Scene Readiness"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-pixi-webgpu-2d" \
  --output-root "${TMP_DIR}/out-pixi" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-pixi/exp-pixi-webgpu-2d" \
  --repo-name "exp-pixi-webgpu-2d" \
  --commit "pixi-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-pixi/exp-pixi-webgpu-2d/reports/raw/01-pixi-2d-readiness.json"
assert_file "${TMP_DIR}/out-pixi/exp-pixi-webgpu-2d/reports/screenshots/01-pixi-2d-readiness.png"
assert_file "${TMP_DIR}/out-pixi/exp-pixi-webgpu-2d/reports/logs/01-pixi-2d-readiness.log"
assert_contains "${TMP_DIR}/out-pixi/exp-pixi-webgpu-2d/reports/raw/01-pixi-2d-readiness.json" "\"scenario\": \"pixi-webgpu-2d-readiness\""
assert_contains "${TMP_DIR}/out-pixi/exp-pixi-webgpu-2d/RESULTS.md" "Pixi 2D Readiness"
assert_contains "${TMP_DIR}/out-pixi/exp-pixi-webgpu-2d/RESULTS.md" "sprite batching metadata"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-luma-webgpu-viz" \
  --output-root "${TMP_DIR}/out-luma" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-luma/exp-luma-webgpu-viz" \
  --repo-name "exp-luma-webgpu-viz" \
  --commit "luma-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-luma/exp-luma-webgpu-viz/reports/raw/01-luma-viz-readiness.json"
assert_file "${TMP_DIR}/out-luma/exp-luma-webgpu-viz/reports/screenshots/01-luma-viz-readiness.png"
assert_file "${TMP_DIR}/out-luma/exp-luma-webgpu-viz/reports/logs/01-luma-viz-readiness.log"
assert_contains "${TMP_DIR}/out-luma/exp-luma-webgpu-viz/reports/raw/01-luma-viz-readiness.json" "\"scenario\": \"luma-webgpu-viz-readiness\""
assert_contains "${TMP_DIR}/out-luma/exp-luma-webgpu-viz/RESULTS.md" "Luma Viz Readiness"
assert_contains "${TMP_DIR}/out-luma/exp-luma-webgpu-viz/RESULTS.md" "layer/attribute metadata"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-deckgl-webgpu-readiness" \
  --output-root "${TMP_DIR}/out-deckgl" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-deckgl/exp-deckgl-webgpu-readiness" \
  --repo-name "exp-deckgl-webgpu-readiness" \
  --commit "deckgl-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-deckgl/exp-deckgl-webgpu-readiness/reports/raw/01-deckgl-readiness.json"
assert_file "${TMP_DIR}/out-deckgl/exp-deckgl-webgpu-readiness/reports/screenshots/01-deckgl-readiness.png"
assert_file "${TMP_DIR}/out-deckgl/exp-deckgl-webgpu-readiness/reports/logs/01-deckgl-readiness.log"
assert_contains "${TMP_DIR}/out-deckgl/exp-deckgl-webgpu-readiness/reports/raw/01-deckgl-readiness.json" "\"scenario\": \"deckgl-webgpu-readiness\""
assert_contains "${TMP_DIR}/out-deckgl/exp-deckgl-webgpu-readiness/RESULTS.md" "Deck.gl Readiness"
assert_contains "${TMP_DIR}/out-deckgl/exp-deckgl-webgpu-readiness/RESULTS.md" "viewport/layer/picking metadata"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-blackhole-three-singularity" \
  --output-root "${TMP_DIR}/out-blackhole" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-blackhole/exp-blackhole-three-singularity" \
  --repo-name "exp-blackhole-three-singularity" \
  --commit "blackhole-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-blackhole/exp-blackhole-three-singularity/reports/raw/01-blackhole-singularity-readiness.json"
assert_file "${TMP_DIR}/out-blackhole/exp-blackhole-three-singularity/reports/screenshots/01-blackhole-singularity-readiness.png"
assert_file "${TMP_DIR}/out-blackhole/exp-blackhole-three-singularity/reports/logs/01-blackhole-singularity-readiness.log"
assert_contains "${TMP_DIR}/out-blackhole/exp-blackhole-three-singularity/reports/raw/01-blackhole-singularity-readiness.json" "\"scenario\": \"blackhole-three-singularity-readiness\""
assert_contains "${TMP_DIR}/out-blackhole/exp-blackhole-three-singularity/RESULTS.md" "Blackhole Singularity Readiness"
assert_contains "${TMP_DIR}/out-blackhole/exp-blackhole-three-singularity/RESULTS.md" "ray_steps="

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-blackhole-kerr-engine" \
  --output-root "${TMP_DIR}/out-kerr" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-kerr/exp-blackhole-kerr-engine" \
  --repo-name "exp-blackhole-kerr-engine" \
  --commit "kerr-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-kerr/exp-blackhole-kerr-engine/reports/raw/01-kerr-engine-readiness.json"
assert_file "${TMP_DIR}/out-kerr/exp-blackhole-kerr-engine/reports/screenshots/01-kerr-engine-readiness.png"
assert_file "${TMP_DIR}/out-kerr/exp-blackhole-kerr-engine/reports/logs/01-kerr-engine-readiness.log"
assert_contains "${TMP_DIR}/out-kerr/exp-blackhole-kerr-engine/reports/raw/01-kerr-engine-readiness.json" "\"scenario\": \"blackhole-kerr-engine-readiness\""
assert_contains "${TMP_DIR}/out-kerr/exp-blackhole-kerr-engine/RESULTS.md" "Kerr Engine Readiness"
assert_contains "${TMP_DIR}/out-kerr/exp-blackhole-kerr-engine/RESULTS.md" "Kerr metadata"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-blackhole-webgpu-fromscratch" \
  --output-root "${TMP_DIR}/out-raw-blackhole" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-raw-blackhole/exp-blackhole-webgpu-fromscratch" \
  --repo-name "exp-blackhole-webgpu-fromscratch" \
  --commit "raw-blackhole-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-raw-blackhole/exp-blackhole-webgpu-fromscratch/reports/raw/01-raw-webgpu-blackhole-readiness.json"
assert_file "${TMP_DIR}/out-raw-blackhole/exp-blackhole-webgpu-fromscratch/reports/screenshots/01-raw-webgpu-blackhole-readiness.png"
assert_file "${TMP_DIR}/out-raw-blackhole/exp-blackhole-webgpu-fromscratch/reports/logs/01-raw-webgpu-blackhole-readiness.log"
assert_contains "${TMP_DIR}/out-raw-blackhole/exp-blackhole-webgpu-fromscratch/reports/raw/01-raw-webgpu-blackhole-readiness.json" "\"scenario\": \"blackhole-webgpu-fromscratch-readiness\""
assert_contains "${TMP_DIR}/out-raw-blackhole/exp-blackhole-webgpu-fromscratch/RESULTS.md" "Raw WebGPU Blackhole Readiness"
assert_contains "${TMP_DIR}/out-raw-blackhole/exp-blackhole-webgpu-fromscratch/RESULTS.md" "raw WebGPU metadata"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-nbody-webgpu-core" \
  --output-root "${TMP_DIR}/out-nbody" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-nbody/exp-nbody-webgpu-core" \
  --repo-name "exp-nbody-webgpu-core" \
  --commit "nbody-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-nbody/exp-nbody-webgpu-core/reports/raw/01-nbody-compute-readiness.json"
assert_file "${TMP_DIR}/out-nbody/exp-nbody-webgpu-core/reports/screenshots/01-nbody-compute-readiness.png"
assert_file "${TMP_DIR}/out-nbody/exp-nbody-webgpu-core/reports/logs/01-nbody-compute-readiness.log"
assert_contains "${TMP_DIR}/out-nbody/exp-nbody-webgpu-core/reports/raw/01-nbody-compute-readiness.json" "\"scenario\": \"nbody-webgpu-core-readiness\""
assert_contains "${TMP_DIR}/out-nbody/exp-nbody-webgpu-core/RESULTS.md" "N-Body Compute Readiness"
assert_contains "${TMP_DIR}/out-nbody/exp-nbody-webgpu-core/RESULTS.md" "compute metadata"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-fluid-webgpu-core" \
  --output-root "${TMP_DIR}/out-fluid" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-fluid/exp-fluid-webgpu-core" \
  --repo-name "exp-fluid-webgpu-core" \
  --commit "fluid-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-fluid/exp-fluid-webgpu-core/reports/raw/01-fluid-compute-readiness.json"
assert_file "${TMP_DIR}/out-fluid/exp-fluid-webgpu-core/reports/screenshots/01-fluid-compute-readiness.png"
assert_file "${TMP_DIR}/out-fluid/exp-fluid-webgpu-core/reports/logs/01-fluid-compute-readiness.log"
assert_contains "${TMP_DIR}/out-fluid/exp-fluid-webgpu-core/reports/raw/01-fluid-compute-readiness.json" "\"scenario\": \"fluid-webgpu-core-readiness\""
assert_contains "${TMP_DIR}/out-fluid/exp-fluid-webgpu-core/RESULTS.md" "Fluid Compute Readiness"
assert_contains "${TMP_DIR}/out-fluid/exp-fluid-webgpu-core/RESULTS.md" "fluid metadata"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-three-webgpu-particles-stress" \
  --output-root "${TMP_DIR}/out-particles" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-particles/exp-three-webgpu-particles-stress" \
  --repo-name "exp-three-webgpu-particles-stress" \
  --commit "particles-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-particles/exp-three-webgpu-particles-stress/reports/raw/01-three-particles-stress-readiness.json"
assert_file "${TMP_DIR}/out-particles/exp-three-webgpu-particles-stress/reports/screenshots/01-three-particles-stress-readiness.png"
assert_file "${TMP_DIR}/out-particles/exp-three-webgpu-particles-stress/reports/logs/01-three-particles-stress-readiness.log"
assert_contains "${TMP_DIR}/out-particles/exp-three-webgpu-particles-stress/reports/raw/01-three-particles-stress-readiness.json" "\"scenario\": \"three-webgpu-particles-stress-readiness\""
assert_contains "${TMP_DIR}/out-particles/exp-three-webgpu-particles-stress/RESULTS.md" "Three Particles Stress Readiness"
assert_contains "${TMP_DIR}/out-particles/exp-three-webgpu-particles-stress/RESULTS.md" "particle stress metadata"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "bench-compute-stress-suite" \
  --output-root "${TMP_DIR}/out-compute-suite" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-compute-suite/bench-compute-stress-suite" \
  --repo-name "bench-compute-stress-suite" \
  --commit "compute-suite-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-compute-suite/bench-compute-stress-suite/reports/raw/01-compute-stress-suite-benchmark.json"
assert_file "${TMP_DIR}/out-compute-suite/bench-compute-stress-suite/reports/screenshots/01-compute-stress-suite-benchmark.png"
assert_file "${TMP_DIR}/out-compute-suite/bench-compute-stress-suite/reports/logs/01-compute-stress-suite-benchmark.log"
assert_contains "${TMP_DIR}/out-compute-suite/bench-compute-stress-suite/reports/raw/01-compute-stress-suite-benchmark.json" "\"scenario\": \"compute-stress-suite-benchmark\""
assert_contains "${TMP_DIR}/out-compute-suite/bench-compute-stress-suite/RESULTS.md" "Compute Stress Suite Benchmark"
assert_contains "${TMP_DIR}/out-compute-suite/bench-compute-stress-suite/RESULTS.md" "compute stress suite metadata"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "bench-atomics-and-memory" \
  --output-root "${TMP_DIR}/out-atomics-memory" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-atomics-memory/bench-atomics-and-memory" \
  --repo-name "bench-atomics-and-memory" \
  --commit "atomics-memory-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-atomics-memory/bench-atomics-and-memory/reports/raw/01-atomics-and-memory-benchmark.json"
assert_file "${TMP_DIR}/out-atomics-memory/bench-atomics-and-memory/reports/screenshots/01-atomics-and-memory-benchmark.png"
assert_file "${TMP_DIR}/out-atomics-memory/bench-atomics-and-memory/reports/logs/01-atomics-and-memory-benchmark.log"
assert_contains "${TMP_DIR}/out-atomics-memory/bench-atomics-and-memory/reports/raw/01-atomics-and-memory-benchmark.json" "\"scenario\": \"atomics-and-memory-benchmark\""
assert_contains "${TMP_DIR}/out-atomics-memory/bench-atomics-and-memory/RESULTS.md" "Atomics and Memory Benchmark"
assert_contains "${TMP_DIR}/out-atomics-memory/bench-atomics-and-memory/RESULTS.md" "atomics memory metadata"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "bench-texture-upload-and-streaming" \
  --output-root "${TMP_DIR}/out-texture-stream" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-texture-stream/bench-texture-upload-and-streaming" \
  --repo-name "bench-texture-upload-and-streaming" \
  --commit "texture-stream-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-texture-stream/bench-texture-upload-and-streaming/reports/raw/01-texture-upload-and-streaming-benchmark.json"
assert_file "${TMP_DIR}/out-texture-stream/bench-texture-upload-and-streaming/reports/screenshots/01-texture-upload-and-streaming-benchmark.png"
assert_file "${TMP_DIR}/out-texture-stream/bench-texture-upload-and-streaming/reports/logs/01-texture-upload-and-streaming-benchmark.log"
assert_contains "${TMP_DIR}/out-texture-stream/bench-texture-upload-and-streaming/reports/raw/01-texture-upload-and-streaming-benchmark.json" "\"scenario\": \"texture-upload-and-streaming-benchmark\""
assert_contains "${TMP_DIR}/out-texture-stream/bench-texture-upload-and-streaming/RESULTS.md" "Texture Upload and Streaming Benchmark"
assert_contains "${TMP_DIR}/out-texture-stream/bench-texture-upload-and-streaming/RESULTS.md" "texture streaming metadata"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-webllm-browser-chat" \
  --output-root "${TMP_DIR}/out-webllm" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-webllm/exp-webllm-browser-chat" \
  --repo-name "exp-webllm-browser-chat" \
  --commit "webllm-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-webllm/exp-webllm-browser-chat/reports/raw/01-webllm-browser-chat.json"
assert_file "${TMP_DIR}/out-webllm/exp-webllm-browser-chat/reports/screenshots/01-webllm-browser-chat.png"
assert_file "${TMP_DIR}/out-webllm/exp-webllm-browser-chat/reports/logs/01-webllm-browser-chat.log"
assert_contains "${TMP_DIR}/out-webllm/exp-webllm-browser-chat/reports/raw/01-webllm-browser-chat.json" "\"scenario\": \"webllm-browser-chat-readiness-webgpu\""
assert_contains "${TMP_DIR}/out-webllm/exp-webllm-browser-chat/RESULTS.md" "WebLLM Browser Chat"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-voice-assistant-local" \
  --output-root "${TMP_DIR}/out-voice-assistant" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-voice-assistant/exp-voice-assistant-local" \
  --repo-name "exp-voice-assistant-local" \
  --commit "voice-assistant-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-voice-assistant/exp-voice-assistant-local/reports/raw/01-voice-assistant-local-readiness.json"
assert_file "${TMP_DIR}/out-voice-assistant/exp-voice-assistant-local/reports/screenshots/01-voice-assistant-local-readiness.png"
assert_file "${TMP_DIR}/out-voice-assistant/exp-voice-assistant-local/reports/logs/01-voice-assistant-local-readiness.log"
assert_contains "${TMP_DIR}/out-voice-assistant/exp-voice-assistant-local/reports/raw/01-voice-assistant-local-readiness.json" "\"scenario\": \"voice-assistant-local-readiness\""
assert_contains "${TMP_DIR}/out-voice-assistant/exp-voice-assistant-local/RESULTS.md" "Voice Assistant Local Readiness"
assert_contains "${TMP_DIR}/out-voice-assistant/exp-voice-assistant-local/RESULTS.md" "voice assistant metadata"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-llm-worker-ux" \
  --output-root "${TMP_DIR}/out-llm-worker" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-llm-worker/exp-llm-worker-ux" \
  --repo-name "exp-llm-worker-ux" \
  --commit "worker-ux-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-llm-worker/exp-llm-worker-ux/reports/raw/01-llm-worker-mode.json"
assert_file "${TMP_DIR}/out-llm-worker/exp-llm-worker-ux/reports/raw/02-llm-main-mode.json"
assert_file "${TMP_DIR}/out-llm-worker/exp-llm-worker-ux/reports/screenshots/01-llm-worker-mode.png"
assert_file "${TMP_DIR}/out-llm-worker/exp-llm-worker-ux/reports/screenshots/02-llm-main-mode.png"
assert_file "${TMP_DIR}/out-llm-worker/exp-llm-worker-ux/reports/logs/01-llm-worker-mode.log"
assert_file "${TMP_DIR}/out-llm-worker/exp-llm-worker-ux/reports/logs/02-llm-main-mode.log"
assert_contains "${TMP_DIR}/out-llm-worker/exp-llm-worker-ux/reports/raw/01-llm-worker-mode.json" "\"scenario\": \"llm-worker-ux-worker\""
assert_contains "${TMP_DIR}/out-llm-worker/exp-llm-worker-ux/reports/raw/02-llm-main-mode.json" "\"worker_mode\": \"main\""
assert_contains "${TMP_DIR}/out-llm-worker/exp-llm-worker-ux/RESULTS.md" "LLM Worker Mode"
assert_contains "${TMP_DIR}/out-llm-worker/exp-llm-worker-ux/RESULTS.md" "LLM Main Mode"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "app-local-chat-arena" \
  --output-root "${TMP_DIR}/out-arena" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-arena/app-local-chat-arena" \
  --repo-name "app-local-chat-arena" \
  --commit "arena-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-arena/app-local-chat-arena/reports/raw/01-local-chat-arena.json"
assert_file "${TMP_DIR}/out-arena/app-local-chat-arena/reports/screenshots/01-local-chat-arena.png"
assert_file "${TMP_DIR}/out-arena/app-local-chat-arena/reports/logs/01-local-chat-arena.log"
assert_contains "${TMP_DIR}/out-arena/app-local-chat-arena/reports/raw/01-local-chat-arena.json" "\"scenario\": \"local-chat-arena-demo\""
assert_contains "${TMP_DIR}/out-arena/app-local-chat-arena/RESULTS.md" "Local Chat Arena"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "shared-webgpu-capability" \
  --output-root "${TMP_DIR}/out-shared-capability" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-shared-capability/shared-webgpu-capability" \
  --repo-name "shared-webgpu-capability" \
  --commit "shared-capability-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-shared-capability/shared-webgpu-capability/reports/raw/01-shared-webgpu-capability-baseline.json"
assert_file "${TMP_DIR}/out-shared-capability/shared-webgpu-capability/reports/screenshots/01-shared-webgpu-capability-baseline.png"
assert_file "${TMP_DIR}/out-shared-capability/shared-webgpu-capability/reports/logs/01-shared-webgpu-capability-baseline.log"
assert_contains "${TMP_DIR}/out-shared-capability/shared-webgpu-capability/reports/raw/01-shared-webgpu-capability-baseline.json" "\"scenario\": \"shared-webgpu-capability-baseline\""
assert_contains "${TMP_DIR}/out-shared-capability/shared-webgpu-capability/reports/raw/01-shared-webgpu-capability-baseline.json" "\"track\": \"infra\""
assert_contains "${TMP_DIR}/out-shared-capability/shared-webgpu-capability/RESULTS.md" "shared-webgpu-capability Probe"
assert_contains "${TMP_DIR}/out-shared-capability/shared-webgpu-capability/RESULTS.md" "helper_function_count"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo ".github" \
  --output-root "${TMP_DIR}/out-dotgithub" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-dotgithub/.github" \
  --repo-name ".github" \
  --commit "dotgithub-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-dotgithub/.github/reports/raw/01-dotgithub-community-baseline.json"
assert_contains "${TMP_DIR}/out-dotgithub/.github/reports/raw/01-dotgithub-community-baseline.json" "\"scenario\": \"dotgithub-community-baseline\""
assert_contains "${TMP_DIR}/out-dotgithub/.github/RESULTS.md" ".github Community Audit"
assert_contains "${TMP_DIR}/out-dotgithub/.github/RESULTS.md" "issue_form_count"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "shared-bench-schema" \
  --output-root "${TMP_DIR}/out-shared-schema" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-shared-schema/shared-bench-schema" \
  --repo-name "shared-bench-schema" \
  --commit "shared-schema-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-shared-schema/shared-bench-schema/reports/raw/01-shared-bench-schema-baseline.json"
assert_contains "${TMP_DIR}/out-shared-schema/shared-bench-schema/reports/raw/01-shared-bench-schema-baseline.json" "\"scenario\": \"shared-bench-schema-baseline\""
assert_contains "${TMP_DIR}/out-shared-schema/shared-bench-schema/RESULTS.md" "shared-bench-schema Audit"
assert_contains "${TMP_DIR}/out-shared-schema/shared-bench-schema/RESULTS.md" "metric_group_count"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "shared-github-actions" \
  --output-root "${TMP_DIR}/out-shared-actions" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-shared-actions/shared-github-actions" \
  --repo-name "shared-github-actions" \
  --commit "shared-actions-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-shared-actions/shared-github-actions/reports/raw/01-shared-github-actions-baseline.json"
assert_contains "${TMP_DIR}/out-shared-actions/shared-github-actions/reports/raw/01-shared-github-actions-baseline.json" "\"scenario\": \"shared-github-actions-baseline\""
assert_contains "${TMP_DIR}/out-shared-actions/shared-github-actions/RESULTS.md" "shared-github-actions Inventory"
assert_contains "${TMP_DIR}/out-shared-actions/shared-github-actions/RESULTS.md" "workflow_count"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "docs-lab-roadmap" \
  --output-root "${TMP_DIR}/out-docs-roadmap" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-docs-roadmap/docs-lab-roadmap" \
  --repo-name "docs-lab-roadmap" \
  --commit "docs-roadmap-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-docs-roadmap/docs-lab-roadmap/reports/raw/01-docs-lab-roadmap-baseline.json"
assert_contains "${TMP_DIR}/out-docs-roadmap/docs-lab-roadmap/reports/raw/01-docs-lab-roadmap-baseline.json" "\"scenario\": \"docs-lab-roadmap-baseline\""
assert_contains "${TMP_DIR}/out-docs-roadmap/docs-lab-roadmap/reports/raw/01-docs-lab-roadmap-baseline.json" "\"track\": \"docs\""
assert_contains "${TMP_DIR}/out-docs-roadmap/docs-lab-roadmap/RESULTS.md" "docs-lab-roadmap Inventory"
assert_contains "${TMP_DIR}/out-docs-roadmap/docs-lab-roadmap/RESULTS.md" "inventory_repo_count"

# bench-runtime-shootout: deterministic + real-runtime capture, with capture metadata
bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "bench-runtime-shootout" \
  --output-root "${TMP_DIR}/out-runtime-shootout" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-runtime-shootout/bench-runtime-shootout" \
  --repo-name "bench-runtime-shootout" \
  --commit "real-runtime-test" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-runtime-shootout/bench-runtime-shootout/reports/raw/01-runtime-benchmark-webgpu.json"
assert_file "${TMP_DIR}/out-runtime-shootout/bench-runtime-shootout/reports/raw/02-runtime-benchmark-fallback.json"
assert_file "${TMP_DIR}/out-runtime-shootout/bench-runtime-shootout/reports/raw/03-runtime-benchmark-real-runtime.json"
assert_contains "${TMP_DIR}/out-runtime-shootout/bench-runtime-shootout/reports/raw/03-runtime-benchmark-real-runtime.json" "\"capture_scenario_id\": \"03-runtime-benchmark-real-runtime\""
assert_contains "${TMP_DIR}/out-runtime-shootout/bench-runtime-shootout/reports/raw/03-runtime-benchmark-real-runtime.json" "\"capture_url_search\": \"?mode=real-runtime\""
assert_contains "${TMP_DIR}/out-runtime-shootout/bench-runtime-shootout/reports/raw/01-runtime-benchmark-webgpu.json" "\"capture_url_search\": \"?mode=webgpu\""
assert_contains "${TMP_DIR}/out-runtime-shootout/bench-runtime-shootout/RESULTS.md" "Real Adapter vs Deterministic"
assert_contains "${TMP_DIR}/out-runtime-shootout/bench-runtime-shootout/RESULTS.md" "decode tok/s: real="

# exp-three-webgpu-core: deterministic + real-three capture, with real renderer routing
bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-three-webgpu-core" \
  --output-root "${TMP_DIR}/out-three-core" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-three-core/exp-three-webgpu-core" \
  --repo-name "exp-three-webgpu-core" \
  --commit "real-three-test" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-three-core/exp-three-webgpu-core/reports/raw/01-three-scene-readiness.json"
assert_file "${TMP_DIR}/out-three-core/exp-three-webgpu-core/reports/raw/02-three-scene-real-three.json"
assert_contains "${TMP_DIR}/out-three-core/exp-three-webgpu-core/reports/raw/02-three-scene-real-three.json" "\"capture_url_search\": \"?mode=real-three\""
assert_contains "${TMP_DIR}/out-three-core/exp-three-webgpu-core/RESULTS.md" "Real Adapter vs Deterministic"
assert_contains "${TMP_DIR}/out-three-core/exp-three-webgpu-core/RESULTS.md" "avg_fps: real="

# bench-renderer-shootout: deterministic + real-benchmark capture
bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "bench-renderer-shootout" \
  --output-root "${TMP_DIR}/out-renderer-shootout" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-renderer-shootout/bench-renderer-shootout" \
  --repo-name "bench-renderer-shootout" \
  --commit "real-benchmark-test" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-renderer-shootout/bench-renderer-shootout/reports/raw/03-renderer-shootout-real-benchmark.json"
assert_contains "${TMP_DIR}/out-renderer-shootout/bench-renderer-shootout/reports/raw/03-renderer-shootout-real-benchmark.json" "\"capture_url_search\": \"?mode=real-benchmark\""
assert_contains "${TMP_DIR}/out-renderer-shootout/bench-renderer-shootout/RESULTS.md" "Real Adapter vs Deterministic"

# app-blackhole-observatory: deterministic + real-surface capture
bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "app-blackhole-observatory" \
  --output-root "${TMP_DIR}/out-observatory" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-observatory/app-blackhole-observatory" \
  --repo-name "app-blackhole-observatory" \
  --commit "real-surface-test" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-observatory/app-blackhole-observatory/reports/raw/02-blackhole-observatory-real-surface.json"
assert_contains "${TMP_DIR}/out-observatory/app-blackhole-observatory/reports/raw/02-blackhole-observatory-real-surface.json" "\"capture_url_search\": \"?mode=real-surface\""
assert_contains "${TMP_DIR}/out-observatory/app-blackhole-observatory/RESULTS.md" "Real Adapter vs Deterministic"

# app-browser-image-lab: deterministic + real-image-lab capture
bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "app-browser-image-lab" \
  --output-root "${TMP_DIR}/out-image-lab-real" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-image-lab-real/app-browser-image-lab" \
  --repo-name "app-browser-image-lab" \
  --commit "real-image-lab-test" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-image-lab-real/app-browser-image-lab/reports/raw/02-browser-image-lab-real-image-lab.json"
assert_contains "${TMP_DIR}/out-image-lab-real/app-browser-image-lab/reports/raw/02-browser-image-lab-real-image-lab.json" "\"capture_url_search\": \"?mode=real-image-lab\""
assert_contains "${TMP_DIR}/out-image-lab-real/app-browser-image-lab/RESULTS.md" "Real Adapter vs Deterministic"

# app-local-chat-arena: deterministic + real-chat-arena capture
bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "app-local-chat-arena" \
  --output-root "${TMP_DIR}/out-chat-arena-real" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-chat-arena-real/app-local-chat-arena" \
  --repo-name "app-local-chat-arena" \
  --commit "real-chat-arena-test" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-chat-arena-real/app-local-chat-arena/reports/raw/02-local-chat-arena-real-chat-arena.json"
assert_contains "${TMP_DIR}/out-chat-arena-real/app-local-chat-arena/reports/raw/02-local-chat-arena-real-chat-arena.json" "\"capture_url_search\": \"?mode=real-chat-arena\""
assert_contains "${TMP_DIR}/out-chat-arena-real/app-local-chat-arena/RESULTS.md" "Real Adapter vs Deterministic"

# app-private-rag-lab: deterministic + real-private-rag capture
bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "app-private-rag-lab" \
  --output-root "${TMP_DIR}/out-private-rag-real" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-private-rag-real/app-private-rag-lab" \
  --repo-name "app-private-rag-lab" \
  --commit "real-private-rag-test" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-private-rag-real/app-private-rag-lab/reports/raw/02-private-rag-lab-real-private-rag.json"
assert_contains "${TMP_DIR}/out-private-rag-real/app-private-rag-lab/reports/raw/02-private-rag-lab-real-private-rag.json" "\"capture_url_search\": \"?mode=real-private-rag\""
assert_contains "${TMP_DIR}/out-private-rag-real/app-private-rag-lab/RESULTS.md" "Real Adapter vs Deterministic"

# app-voice-agent-lab: deterministic + real-voice-agent capture
bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "app-voice-agent-lab" \
  --output-root "${TMP_DIR}/out-voice-agent-real" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-voice-agent-real/app-voice-agent-lab" \
  --repo-name "app-voice-agent-lab" \
  --commit "real-voice-agent-test" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-voice-agent-real/app-voice-agent-lab/reports/raw/02-voice-agent-lab-real-voice-agent.json"
assert_contains "${TMP_DIR}/out-voice-agent-real/app-voice-agent-lab/reports/raw/02-voice-agent-lab-real-voice-agent.json" "\"capture_url_search\": \"?mode=real-voice-agent\""
assert_contains "${TMP_DIR}/out-voice-agent-real/app-voice-agent-lab/RESULTS.md" "Real Adapter vs Deterministic"

# Renderer family rollout: each repo gets deterministic + real-* capture
RENDERER_BATCH=(
  "exp-babylon-webgpu-core:babylon-webgpu-scene:real-babylon"
  "exp-pixi-webgpu-2d:pixi-webgpu-2d:real-pixi"
  "exp-playcanvas-webgpu-core:playcanvas-webgpu-scene:real-playcanvas"
  "exp-luma-webgpu-viz:luma-webgpu-viz:real-luma"
  "exp-deckgl-webgpu-readiness:deckgl-webgpu:real-deckgl"
  "exp-three-webgpu-particles-stress:three-webgpu-particles-stress:real-particles"
  "exp-blackhole-three-singularity:blackhole-three-singularity:real-blackhole-three"
  "exp-blackhole-kerr-engine:blackhole-kerr-engine:real-kerr"
  "exp-blackhole-webgpu-fromscratch:blackhole-webgpu-fromscratch:real-bhraw"
  "exp-nbody-webgpu-core:nbody-webgpu-core:real-nbody"
  "exp-fluid-webgpu-core:fluid-webgpu-core:real-fluid"
)

for entry in "${RENDERER_BATCH[@]}"; do
  IFS=':' read -r repo base mode <<<"${entry}"
  out_dir="${TMP_DIR}/out-renderer-batch-${repo}"
  bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
    --mode local \
    --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
    --repo "${repo}" \
    --output-root "${out_dir}" \
    --no-sync \
    --refresh-generated \
    --refresh-readme

  node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
    --repo-dir "${out_dir}/${repo}" \
    --repo-name "${repo}" \
    --commit "renderer-batch-test" \
    --owner "test-owner" \
    --captured-by "test-runner"

  assert_file "${out_dir}/${repo}/reports/raw/02-${base}-${mode}.json"
  assert_contains "${out_dir}/${repo}/reports/raw/02-${base}-${mode}.json" "\"capture_url_search\": \"?mode=${mode}\""
  assert_contains "${out_dir}/${repo}/RESULTS.md" "Real Adapter vs Deterministic"
done
