#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

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
  if command -v rg >/dev/null 2>&1 && rg -Fq -- "${pattern}" "${path}" 2>/dev/null; then
    return 0
  fi
  grep -Fq -- "${pattern}" "${path}" || fail "missing pattern '${pattern}' in ${path}"
}

BENCHMARK_DOC="${REPO_ROOT}/docs/BENCHMARK-SUMMARY.md"
BROWSER_DOC="${REPO_ROOT}/docs/MULTI-BROWSER-RESULTS.md"
DECISION_DOC="${REPO_ROOT}/docs/PROMOTE-CONTINUE-ARCHIVE.md"
SCHEMA_DOC="${REPO_ROOT}/docs/RESULT-SCHEMA.md"

assert_file "${BENCHMARK_DOC}"
assert_contains "${BENCHMARK_DOC}" "# Benchmark Summary"
assert_contains "${BENCHMARK_DOC}" "## Measurement Scope"
assert_contains "${BENCHMARK_DOC}" "## Environment Matrix"
assert_contains "${BENCHMARK_DOC}" "## Result Summary"
assert_contains "${BENCHMARK_DOC}" "## Raw Result Index"
assert_contains "${BENCHMARK_DOC}" "## Known Limitations"
assert_contains "${BENCHMARK_DOC}" "reports/raw/*.json"
assert_contains "${BENCHMARK_DOC}" "pending real run"
assert_contains "${BENCHMARK_DOC}" "deterministic-webgpu"
assert_contains "${BENCHMARK_DOC}" "deterministic-fallback"

assert_file "${BROWSER_DOC}"
assert_contains "${BROWSER_DOC}" "# Multi-Browser Results"
assert_contains "${BROWSER_DOC}" "## Browser Matrix"
assert_contains "${BROWSER_DOC}" "## Device Matrix"
assert_contains "${BROWSER_DOC}" "## Compatibility Notes"
assert_contains "${BROWSER_DOC}" "## Repro Steps"
assert_contains "${BROWSER_DOC}" "## Result Links"
assert_contains "${BROWSER_DOC}" "Chrome stable"
assert_contains "${BROWSER_DOC}" "Safari Technology Preview"
assert_contains "${BROWSER_DOC}" "reports/raw/*.json"
assert_contains "${BROWSER_DOC}" "pending"

assert_file "${DECISION_DOC}"
assert_contains "${DECISION_DOC}" "# Promote / Continue / Archive"
assert_contains "${DECISION_DOC}" "## Decision Summary"
assert_contains "${DECISION_DOC}" "## Promote"
assert_contains "${DECISION_DOC}" "## Continue"
assert_contains "${DECISION_DOC}" "## Archive"
assert_contains "${DECISION_DOC}" "## Review Evidence"
assert_contains "${DECISION_DOC}" "No workload is promoted yet"
assert_contains "${DECISION_DOC}" "bench-runtime-shootout"
assert_contains "${DECISION_DOC}" "docs/BENCHMARK-SUMMARY.md"
assert_contains "${DECISION_DOC}" "docs/MULTI-BROWSER-RESULTS.md"

assert_file "${SCHEMA_DOC}"
assert_contains "${SCHEMA_DOC}" "# Result Schema"
assert_contains "${SCHEMA_DOC}" "## Required Top-Level Fields"
assert_contains "${SCHEMA_DOC}" '## Required `metrics.common` Fields'
assert_contains "${SCHEMA_DOC}" "metrics.llm"
assert_contains "${SCHEMA_DOC}" "node scripts/validate-result-schema.mjs"

echo "phase3-report-docs test passed"
