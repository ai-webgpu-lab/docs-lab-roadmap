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

OUT="${TMP_DIR}/CAPABILITIES-MATRIX.md"
node "${REPO_ROOT}/scripts/render-capabilities-matrix.mjs" --output "${OUT}"
[[ -f "${OUT}" ]] || fail "expected ${OUT} to exist"

CONTENT="$(cat "${OUT}")"
assert_contains "${CONTENT}" "# Capabilities Matrix"
assert_contains "${CONTENT}" "Total sketches: 47"
assert_contains "${CONTENT}" "## Top capability frequency"
assert_contains "${CONTENT}" "## By family"
assert_contains "${CONTENT}" "## Per-sketch matrix"

# Family rows present
assert_contains "${CONTENT}" "**renderer**"
assert_contains "${CONTENT}" "**runtime**"
assert_contains "${CONTENT}" "**app-surface**"
assert_contains "${CONTENT}" "**benchmark**"

# Heuristic-derived tags should surface
assert_contains "${CONTENT}" "transformers.js"
assert_contains "${CONTENT}" "benchmark.js"
assert_contains "${CONTENT}" "webgpu"

# Per-sketch table contains at least one known repo from each family
assert_contains "${CONTENT}" "| \`exp-three-webgpu-core\` | renderer |"
assert_contains "${CONTENT}" "| \`exp-webllm-browser-chat\` | runtime |"
assert_contains "${CONTENT}" "| \`app-private-rag-lab\` | app-surface |"
assert_contains "${CONTENT}" "| \`bench-runtime-shootout\` | benchmark |"

# --stdout mode emits to stdout
STDOUT_OUT="$(node "${REPO_ROOT}/scripts/render-capabilities-matrix.mjs" --stdout 2>&1)"
assert_contains "${STDOUT_OUT}" "# Capabilities Matrix"
assert_contains "${STDOUT_OUT}" "Total sketches: 47"

echo "render-capabilities-matrix test passed"
