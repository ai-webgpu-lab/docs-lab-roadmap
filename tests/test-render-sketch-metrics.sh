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
  local content="$1"
  local pattern="$2"
  if ! grep -Fq -e "${pattern}" <<<"${content}"; then
    fail "missing pattern '${pattern}' in: ${content:0:200}..."
  fi
}

OUTPUT_FILE="${TMP_DIR}/sketch-metrics.md"
node "${REPO_ROOT}/scripts/render-sketch-metrics.mjs" --output "${OUTPUT_FILE}" >/dev/null

[[ -f "${OUTPUT_FILE}" ]] || fail "expected output file at ${OUTPUT_FILE}"

CONTENT="$(cat "${OUTPUT_FILE}")"

assert_contains "${CONTENT}" "# Sketch Metrics"
assert_contains "${CONTENT}" "## Counts"
assert_contains "${CONTENT}" "## CDN distribution"
assert_contains "${CONTENT}" "## Backend / type distribution"
assert_contains "${CONTENT}" "## Per-sketch table"

assert_contains "${CONTENT}" "Total real-*-sketch.js files (repo-attached): 47"
assert_contains "${CONTENT}" "Renderer: 12"
assert_contains "${CONTENT}" "Runtime: 12"
assert_contains "${CONTENT}" "App-surface: 5"
assert_contains "${CONTENT}" "Benchmark: 18"
assert_contains "${CONTENT}" "Unknown family: 0"

# CDN sanity
assert_contains "${CONTENT}" "@huggingface/transformers@"
assert_contains "${CONTENT}" "benchmark@"
assert_contains "${CONTENT}" "three@"

# A sample of sketches across all families should appear in the per-sketch table
assert_contains "${CONTENT}" "exp-three-webgpu-core"
assert_contains "${CONTENT}" "exp-stt-whisper-webgpu"
assert_contains "${CONTENT}" "app-blackhole-observatory"
assert_contains "${CONTENT}" "bench-renderer-shootout"
assert_contains "${CONTENT}" "bench-runtime-shootout"

# Stdout mode test
STDOUT_OUTPUT="$(node "${REPO_ROOT}/scripts/render-sketch-metrics.mjs" --stdout)"
assert_contains "${STDOUT_OUTPUT}" "# Sketch Metrics"
assert_contains "${STDOUT_OUTPUT}" "Total real-*-sketch.js files (repo-attached): 47"

echo "render-sketch-metrics test passed"
