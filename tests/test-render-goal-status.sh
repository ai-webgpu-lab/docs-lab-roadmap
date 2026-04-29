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

OUTPUT_FILE="${TMP_DIR}/goal-status.md"
node "${REPO_ROOT}/scripts/render-goal-status.mjs" --output "${OUTPUT_FILE}" --fail-on-error >/dev/null

[[ -f "${OUTPUT_FILE}" ]] || fail "expected output file at ${OUTPUT_FILE}"

CONTENT="$(cat "${OUTPUT_FILE}")"

assert_contains "${CONTENT}" "# Goal Status"
assert_contains "${CONTENT}" "## Summary"
assert_contains "${CONTENT}" "## Phase Gates"
assert_contains "${CONTENT}" "## Operating Metrics"
assert_contains "${CONTENT}" "## Portfolio Shape"
assert_contains "${CONTENT}" "## Research Execution Backlog"
assert_contains "${CONTENT}" "## Next Objective Queue"

assert_contains "${CONTENT}" "- Inventory repos: 54 / 54"
assert_contains "${CONTENT}" "- P0 repos: 13 / 13"
assert_contains "${CONTENT}" "- P1 repos: 19 / 19"
assert_contains "${CONTENT}" "- P2 repos: 22 / 22"
assert_contains "${CONTENT}" "- Blocking phase gates: 0"

assert_contains "${CONTENT}" "Phase 0 — Organization Bootstrap | ✅ complete"
assert_contains "${CONTENT}" "Phase 1 — P0 Baseline | ✅ complete"
assert_contains "${CONTENT}" "Phase 2 — P1 Expansion | ✅ complete"
assert_contains "${CONTENT}" "Phase 3 — Research Portfolio | 🟡 in progress"
assert_contains "${CONTENT}" "Runtime recommendation doc"
assert_contains "${CONTENT}" "docs/RUNTIME-RECOMMENDATIONS.md"
assert_contains "${CONTENT}" "bench-runtime-shootout"

STDOUT_OUTPUT="$(node "${REPO_ROOT}/scripts/render-goal-status.mjs" --stdout)"
assert_contains "${STDOUT_OUTPUT}" "# Goal Status"
assert_contains "${STDOUT_OUTPUT}" "Real sketch/adapter coverage: 47/47"

BROKEN_PAGES="${TMP_DIR}/broken-pages.md"
sed 's|Healthy Pages: 54 / 54|Healthy Pages: 53 / 54|' "${REPO_ROOT}/docs/PAGES-STATUS.md" >"${BROKEN_PAGES}"

BROKEN_OUTPUT="${TMP_DIR}/broken-goal.md"
BROKEN_STDERR="${TMP_DIR}/broken-stderr.txt"
if node "${REPO_ROOT}/scripts/render-goal-status.mjs" \
  --pages-status "${BROKEN_PAGES}" \
  --output "${BROKEN_OUTPUT}" \
  --fail-on-error 2>"${BROKEN_STDERR}"; then
  fail "expected goal status gate to fail on broken Pages health"
fi

assert_contains "$(cat "${BROKEN_OUTPUT}")" "Phase 0 — Organization Bootstrap | ⚠ blocked"
assert_contains "$(cat "${BROKEN_OUTPUT}")" "Blocking phase gates: 1"
assert_contains "$(cat "${BROKEN_STDERR}")" "Goal status check failed"

echo "render-goal-status test passed"
