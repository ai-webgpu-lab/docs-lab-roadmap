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

assert_contains() {
  local path="$1"
  local pattern="$2"
  if command -v rg >/dev/null 2>&1 && rg -Fq "${pattern}" "${path}" 2>/dev/null; then
    return 0
  fi
  grep -Fq "${pattern}" "${path}" || fail "missing pattern '${pattern}' in ${path}"
}

mkdir -p \
  "${TMP_DIR}/repo/reports/raw" \
  "${TMP_DIR}/repo/reports/screenshots" \
  "${TMP_DIR}/repo/reports/logs"

cp "${REPO_ROOT}/tests/fixtures/results/bench-model-load-and-cache/01-cold-load.json" "${TMP_DIR}/repo/reports/raw/01-cold-load.json"
cp "${REPO_ROOT}/tests/fixtures/results/bench-model-load-and-cache/02-warm-load.json" "${TMP_DIR}/repo/reports/raw/02-warm-load.json"
touch "${TMP_DIR}/repo/reports/screenshots/01-cold-load.png"
touch "${TMP_DIR}/repo/reports/screenshots/02-warm-load.png"
touch "${TMP_DIR}/repo/reports/logs/01-cold-load.log"
touch "${TMP_DIR}/repo/reports/logs/02-warm-load.log"

node "${REPO_ROOT}/scripts/render-results-summary.mjs" --repo-dir "${TMP_DIR}/repo"

assert_contains "${TMP_DIR}/repo/RESULTS.md" "bench-model-load-and-cache"
assert_contains "${TMP_DIR}/repo/RESULTS.md" "Cold Load"
assert_contains "${TMP_DIR}/repo/RESULTS.md" "Warm Load"
assert_contains "${TMP_DIR}/repo/RESULTS.md" "delta=44.3 ms"
assert_contains "${TMP_DIR}/repo/RESULTS.md" "preparedHit=true"
assert_contains "${TMP_DIR}/repo/RESULTS.md" "./reports/screenshots/01-cold-load.png"
assert_contains "${TMP_DIR}/repo/RESULTS.md" "./reports/logs/02-warm-load.log"
assert_contains "${TMP_DIR}/repo/RESULTS.md" "playwright-chromium"

mkdir -p \
  "${TMP_DIR}/compare/reports/raw" \
  "${TMP_DIR}/compare/reports/screenshots" \
  "${TMP_DIR}/compare/reports/logs"

cp "${REPO_ROOT}/tests/fixtures/results/exp-embeddings-browser-throughput/01-cold-index-webgpu.json" "${TMP_DIR}/compare/reports/raw/01-cold-index-webgpu.json"
cp "${REPO_ROOT}/tests/fixtures/results/exp-embeddings-browser-throughput/02-warm-query-webgpu.json" "${TMP_DIR}/compare/reports/raw/02-warm-query-webgpu.json"
cp "${REPO_ROOT}/tests/fixtures/results/exp-embeddings-browser-throughput/03-cold-index-fallback.json" "${TMP_DIR}/compare/reports/raw/03-cold-index-fallback.json"
cp "${REPO_ROOT}/tests/fixtures/results/exp-embeddings-browser-throughput/04-warm-query-fallback.json" "${TMP_DIR}/compare/reports/raw/04-warm-query-fallback.json"
touch "${TMP_DIR}/compare/reports/screenshots/01-cold-index-webgpu.png"
touch "${TMP_DIR}/compare/reports/screenshots/02-warm-query-webgpu.png"
touch "${TMP_DIR}/compare/reports/screenshots/03-cold-index-fallback.png"
touch "${TMP_DIR}/compare/reports/screenshots/04-warm-query-fallback.png"
touch "${TMP_DIR}/compare/reports/logs/01-cold-index-webgpu.log"
touch "${TMP_DIR}/compare/reports/logs/02-warm-query-webgpu.log"
touch "${TMP_DIR}/compare/reports/logs/03-cold-index-fallback.log"
touch "${TMP_DIR}/compare/reports/logs/04-warm-query-fallback.log"

node "${REPO_ROOT}/scripts/render-results-summary.mjs" --repo-dir "${TMP_DIR}/compare"

assert_contains "${TMP_DIR}/compare/RESULTS.md" "exp-embeddings-browser-throughput"
assert_contains "${TMP_DIR}/compare/RESULTS.md" "## 8. WebGPU vs Fallback"
assert_contains "${TMP_DIR}/compare/RESULTS.md" "cold cache: docs/s webgpu=180, fallback=78"
assert_contains "${TMP_DIR}/compare/RESULTS.md" "warm cache: docs/s webgpu=315, fallback=142"

mkdir -p \
  "${TMP_DIR}/runtime/reports/raw" \
  "${TMP_DIR}/runtime/reports/screenshots" \
  "${TMP_DIR}/runtime/reports/logs"

cp "${REPO_ROOT}/tests/fixtures/results/bench-runtime-shootout/01-runtime-webgpu-cold.json" "${TMP_DIR}/runtime/reports/raw/01-runtime-webgpu-cold.json"
cp "${REPO_ROOT}/tests/fixtures/results/bench-runtime-shootout/02-runtime-webgpu-warm.json" "${TMP_DIR}/runtime/reports/raw/02-runtime-webgpu-warm.json"
cp "${REPO_ROOT}/tests/fixtures/results/bench-runtime-shootout/03-runtime-fallback-cold.json" "${TMP_DIR}/runtime/reports/raw/03-runtime-fallback-cold.json"
cp "${REPO_ROOT}/tests/fixtures/results/bench-runtime-shootout/04-runtime-fallback-warm.json" "${TMP_DIR}/runtime/reports/raw/04-runtime-fallback-warm.json"
touch "${TMP_DIR}/runtime/reports/screenshots/01-runtime-webgpu-cold.png"
touch "${TMP_DIR}/runtime/reports/screenshots/02-runtime-webgpu-warm.png"
touch "${TMP_DIR}/runtime/reports/screenshots/03-runtime-fallback-cold.png"
touch "${TMP_DIR}/runtime/reports/screenshots/04-runtime-fallback-warm.png"
touch "${TMP_DIR}/runtime/reports/logs/01-runtime-webgpu-cold.log"
touch "${TMP_DIR}/runtime/reports/logs/02-runtime-webgpu-warm.log"
touch "${TMP_DIR}/runtime/reports/logs/03-runtime-fallback-cold.log"
touch "${TMP_DIR}/runtime/reports/logs/04-runtime-fallback-warm.log"

node "${REPO_ROOT}/scripts/render-results-summary.mjs" --repo-dir "${TMP_DIR}/runtime"

assert_contains "${TMP_DIR}/runtime/RESULTS.md" "bench-runtime-shootout"
assert_contains "${TMP_DIR}/runtime/RESULTS.md" "Runtime Benchmark Winner: ORT WebGPU-style / WebGPU"
assert_contains "${TMP_DIR}/runtime/RESULTS.md" "decode tok/s: webgpu=36.8, fallback=17.3"
assert_contains "${TMP_DIR}/runtime/RESULTS.md" "TTFT: webgpu=418.6 ms, fallback=646.4 ms"
assert_contains "${TMP_DIR}/runtime/RESULTS.md" "./reports/raw/04-runtime-fallback-warm.json"

echo "render-results-summary test passed"
