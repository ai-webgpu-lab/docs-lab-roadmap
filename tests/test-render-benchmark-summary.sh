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
    fail "missing pattern '${pattern}' in: ${content:0:300}..."
  fi
}

OUTPUT="${TMP_DIR}/BENCHMARK-SUMMARY.md"

node "${REPO_ROOT}/scripts/render-benchmark-summary.mjs" --output "${OUTPUT}" >/dev/null
CONTENT="$(cat "${OUTPUT}")"

assert_contains "${CONTENT}" "# Benchmark Summary"
assert_contains "${CONTENT}" "## Measurement Scope"
assert_contains "${CONTENT}" "## Environment Matrix"
assert_contains "${CONTENT}" "## Result Summary"
assert_contains "${CONTENT}" "## Raw Result Index"
assert_contains "${CONTENT}" "## Known Limitations"
assert_contains "${CONTENT}" "bench-runtime-shootout"
assert_contains "${CONTENT}" "runtime-benchmark-ort-webgpu-style-webgpu"
assert_contains "${CONTENT}" "42.4 decode tok/s"
assert_contains "${CONTENT}" "tests/fixtures/results/bench-runtime-shootout/01-runtime-webgpu-cold.json"
assert_contains "${CONTENT}" "tests/fixtures/results/exp-embeddings-browser-throughput/01-cold-index-webgpu.json"
assert_contains "${CONTENT}" "pending real run"
assert_contains "${CONTENT}" "docs/RESULT-SCHEMA.md"

STDOUT_OUTPUT="$(node "${REPO_ROOT}/scripts/render-benchmark-summary.mjs" --stdout)"
assert_contains "${STDOUT_OUTPUT}" "# Benchmark Summary"
assert_contains "${STDOUT_OUTPUT}" "raw result fixtures"

echo "render-benchmark-summary test passed"
