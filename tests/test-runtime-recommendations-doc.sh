#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DOC="${REPO_ROOT}/docs/RUNTIME-RECOMMENDATIONS.md"

fail() {
  echo "test failed: $1" >&2
  exit 1
}

assert_contains() {
  local pattern="$1"
  if command -v rg >/dev/null 2>&1 && rg -Fq -- "${pattern}" "${DOC}" 2>/dev/null; then
    return 0
  fi
  grep -Fq -- "${pattern}" "${DOC}" || fail "missing pattern '${pattern}' in ${DOC}"
}

[[ -f "${DOC}" ]] || fail "missing runtime recommendations doc"

assert_contains "# Runtime Recommendations"
assert_contains "## Current Recommendation State"
assert_contains "## Candidate Order"
assert_contains "## Measurement Protocol"
assert_contains "## Required Comparison Table"
assert_contains "## Decision Rules"
assert_contains "## Initial Runtime Track Notes"
assert_contains "## Open Measurement Backlog"
assert_contains "## Current Decision"
assert_contains "bench-runtime-shootout"
assert_contains "exp-embeddings-browser-throughput"
assert_contains "exp-stt-whisper-webgpu"
assert_contains "cold"
assert_contains "warm"
assert_contains "deterministic-webgpu"
assert_contains "deterministic-fallback"
assert_contains "No runtime is promoted yet"

echo "runtime-recommendations-doc test passed"
