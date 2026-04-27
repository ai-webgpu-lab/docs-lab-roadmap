#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

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

OUTPUT="$(bash "${REPO_ROOT}/scripts/check-coverage.sh" 2>&1)"
EXIT_CODE=$?

if [[ "${EXIT_CODE}" -ne 0 ]]; then
  echo "${OUTPUT}" >&2
  fail "check-coverage exited with ${EXIT_CODE}"
fi

assert_contains "${OUTPUT}" "==> validate-lab-planning"
assert_contains "${OUTPUT}" "==> adapter-family-coverage"
assert_contains "${OUTPUT}" "==> real-sketch-family-coverage"
assert_contains "${OUTPUT}" "==> real-sketch-conformance"
assert_contains "${OUTPUT}" "==> real-sketch-contract"
assert_contains "${OUTPUT}" "==> render-integration-status"
assert_contains "${OUTPUT}" "==> render-sketch-metrics"
assert_contains "${OUTPUT}" "==> render-capabilities-matrix"
assert_contains "${OUTPUT}" "check-coverage summary: 8 passed, 0 failed"

# --quiet mode should suppress step headers
QUIET_OUTPUT="$(bash "${REPO_ROOT}/scripts/check-coverage.sh" --quiet 2>&1)"
if grep -Fq -e "==> validate-lab-planning" <<<"${QUIET_OUTPUT}"; then
  fail "quiet mode should not print step headers"
fi
assert_contains "${QUIET_OUTPUT}" "check-coverage summary: 8 passed, 0 failed"

# --skip-coverage should drop the family-coverage step
SKIP_OUTPUT="$(bash "${REPO_ROOT}/scripts/check-coverage.sh" --skip-coverage 2>&1)"
if grep -Fq -e "real-sketch-family-coverage" <<<"${SKIP_OUTPUT}"; then
  fail "--skip-coverage should drop the family-coverage step"
fi
assert_contains "${SKIP_OUTPUT}" "check-coverage summary: 7 passed, 0 failed"

# --skip-status should drop the integration-status + sketch-metrics + capabilities-matrix steps
SKIP_STATUS_OUTPUT="$(bash "${REPO_ROOT}/scripts/check-coverage.sh" --skip-status 2>&1)"
if grep -Fq -e "render-integration-status" <<<"${SKIP_STATUS_OUTPUT}"; then
  fail "--skip-status should drop the integration-status step"
fi
if grep -Fq -e "render-sketch-metrics" <<<"${SKIP_STATUS_OUTPUT}"; then
  fail "--skip-status should drop the sketch-metrics step"
fi
if grep -Fq -e "render-capabilities-matrix" <<<"${SKIP_STATUS_OUTPUT}"; then
  fail "--skip-status should drop the capabilities-matrix step"
fi
assert_contains "${SKIP_STATUS_OUTPUT}" "check-coverage summary: 5 passed, 0 failed"

# Status + metrics + capabilities docs should exist after run
[[ -f "${REPO_ROOT}/docs/INTEGRATION-STATUS.md" ]] || fail "docs/INTEGRATION-STATUS.md not produced"
assert_contains "$(cat "${REPO_ROOT}/docs/INTEGRATION-STATUS.md")" "# Integration Status"
[[ -f "${REPO_ROOT}/docs/SKETCH-METRICS.md" ]] || fail "docs/SKETCH-METRICS.md not produced"
assert_contains "$(cat "${REPO_ROOT}/docs/SKETCH-METRICS.md")" "# Sketch Metrics"
[[ -f "${REPO_ROOT}/docs/CAPABILITIES-MATRIX.md" ]] || fail "docs/CAPABILITIES-MATRIX.md not produced"
assert_contains "$(cat "${REPO_ROOT}/docs/CAPABILITIES-MATRIX.md")" "# Capabilities Matrix"

# --preset smoke skips adapter-family + real-sketch-family (6 steps remain)
SMOKE_OUTPUT="$(bash "${REPO_ROOT}/scripts/check-coverage.sh" --preset smoke 2>&1)"
assert_contains "${SMOKE_OUTPUT}" "check-coverage summary: 6 passed, 0 failed"
if grep -Fq -e "==> adapter-family-coverage" <<<"${SMOKE_OUTPUT}"; then
  fail "smoke preset should skip adapter-family-coverage"
fi
if grep -Fq -e "==> real-sketch-family-coverage" <<<"${SMOKE_OUTPUT}"; then
  fail "smoke preset should skip real-sketch-family-coverage"
fi
assert_contains "${SMOKE_OUTPUT}" "==> real-sketch-contract"
assert_contains "${SMOKE_OUTPUT}" "==> render-capabilities-matrix"

# --preset full == default (8 steps)
FULL_OUTPUT="$(bash "${REPO_ROOT}/scripts/check-coverage.sh" --preset full 2>&1)"
assert_contains "${FULL_OUTPUT}" "check-coverage summary: 8 passed, 0 failed"

# unknown preset should fail
if bash "${REPO_ROOT}/scripts/check-coverage.sh" --preset bogus 2>/dev/null; then
  fail "unknown preset should exit non-zero"
fi

echo "check-coverage test passed"
