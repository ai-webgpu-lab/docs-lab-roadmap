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

OUTPUT_FILE="${TMP_DIR}/integration-status.md"
node "${REPO_ROOT}/scripts/render-integration-status.mjs" --output "${OUTPUT_FILE}" >/dev/null

[[ -f "${OUTPUT_FILE}" ]] || fail "expected output file at ${OUTPUT_FILE}"

CONTENT="$(cat "${OUTPUT_FILE}")"

assert_contains "${CONTENT}" "# Integration Status"
assert_contains "${CONTENT}" "## Counts"
assert_contains "${CONTENT}" "## Per-repo coverage"
assert_contains "${CONTENT}" "## First movers"
assert_contains "${CONTENT}" "- Inventory: 54"
assert_contains "${CONTENT}" "- Repos with at least one adapter family: 47"
assert_contains "${CONTENT}" "- Repos without any adapter family: 7"
assert_contains "${CONTENT}" "runtime=25"
assert_contains "${CONTENT}" "renderer=17"
assert_contains "${CONTENT}" "app-surface=5"
assert_contains "${CONTENT}" "benchmark=18"
assert_contains "${CONTENT}" "exp-three-webgpu-core"
assert_contains "${CONTENT}" "**renderer**"
assert_contains "${CONTENT}" "renderer → \`exp-three-webgpu-core\`"
assert_contains "${CONTENT}" "runtime → \`bench-runtime-shootout\`"
assert_contains "${CONTENT}" "app-surface → \`app-blackhole-observatory\`"
assert_contains "${CONTENT}" "benchmark → \`bench-renderer-shootout\`"

# Last touched column should be present in the per-repo header
assert_contains "${CONTENT}" "| Repo | Category | Family | Scaffold | Adapter | Sketch | Fixtures | Last touched | First mover |"

# Stdout mode test
STDOUT_OUTPUT="$(node "${REPO_ROOT}/scripts/render-integration-status.mjs" --stdout)"
assert_contains "${STDOUT_OUTPUT}" "# Integration Status"
assert_contains "${STDOUT_OUTPUT}" "## Per-repo coverage"

echo "render-integration-status test passed"
