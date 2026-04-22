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
  rg -Fq "${pattern}" "${path}" || fail "missing pattern '${pattern}' in ${path}"
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

assert_file "${TMP_DIR}/out/shared-bench-schema/schemas/ai-webgpu-lab-result.schema.json"
assert_file "${TMP_DIR}/out/shared-bench-schema/templates/example-result.json"
assert_contains "${TMP_DIR}/out/shared-bench-schema/README.md" "## 사용 방식"
assert_file "${TMP_DIR}/out/shared-webgpu-capability/src/index.mjs"
assert_file "${TMP_DIR}/out/shared-webgpu-capability/docs/capability-contract.md"
assert_file "${TMP_DIR}/out/docs-lab-roadmap/README.md"
assert_dir "${TMP_DIR}/out/docs-lab-roadmap/docs"
assert_contains "${TMP_DIR}/out/docs-lab-roadmap/README.md" "## 유지 규칙"

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

assert_file "${TMP_DIR}/out/exp-rag-browser-pipeline/public/index.html"
assert_file "${TMP_DIR}/out/exp-rag-browser-pipeline/public/app.js"
assert_file "${TMP_DIR}/out/exp-rag-browser-pipeline/public/rag-fixture.json"
assert_contains "${TMP_DIR}/out/exp-rag-browser-pipeline/public/index.html" "Browser RAG Pipeline Harness"
assert_contains "${TMP_DIR}/out/exp-rag-browser-pipeline/public/app.js" "browser-rag-fixture"

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
assert_file "${TMP_DIR}/out/app-blackhole-observatory/public/app.js"
assert_file "${TMP_DIR}/out/app-blackhole-observatory/.github/workflows/deploy-pages.yml"
assert_contains "${TMP_DIR}/out/app-blackhole-observatory/.github/workflows/deploy-pages.yml" "actions/upload-pages-artifact@v4"
assert_contains "${TMP_DIR}/out/app-blackhole-observatory/README.md" "## 산출물"

echo "bootstrap-org-repos full inventory test passed"
