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
INCOMPLETE_RUNTIME_DOC="${TMP_DIR}/incomplete-runtime.md"
GOAL_TARGETS="${TMP_DIR}/goal-targets.json"
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
assert_contains "${CONTENT}" "Phase 3 — Research Portfolio | ✅ complete"
assert_contains "${CONTENT}" "4/4 decision/report artifacts complete"
assert_contains "${CONTENT}" "Runtime recommendation doc"
assert_contains "${CONTENT}" "Runtime recommendation doc | ✅ complete"
assert_contains "${CONTENT}" "docs/RUNTIME-RECOMMENDATIONS.md"
assert_contains "${CONTENT}" "Benchmark summary v1 | ✅ complete"
assert_contains "${CONTENT}" "Multi-browser/device results | ✅ complete"
assert_contains "${CONTENT}" "Promote / Continue / Archive decisions | ✅ complete"
assert_contains "${CONTENT}" "Required content gaps"
assert_contains "${CONTENT}" "bench-runtime-shootout"

STDOUT_OUTPUT="$(node "${REPO_ROOT}/scripts/render-goal-status.mjs" --stdout)"
assert_contains "${STDOUT_OUTPUT}" "# Goal Status"
assert_contains "${STDOUT_OUTPUT}" "Real sketch/adapter coverage: 47/47"
assert_contains "${STDOUT_OUTPUT}" "docs/goal-targets.json"

cat >"${GOAL_TARGETS}" <<'JSON'
{
  "inventory": 55,
  "priorities": {
    "P0": 13,
    "P1": 19,
    "P2": 22
  },
  "p0WorkloadRepos": [
    "exp-embeddings-browser-throughput",
    "exp-llm-chat-runtime-shootout",
    "exp-stt-whisper-webgpu",
    "exp-rag-browser-pipeline",
    "bench-runtime-shootout",
    "bench-model-load-and-cache",
    "bench-worker-isolation-and-ui-jank"
  ],
  "p0FoundationRepos": [
    ".github",
    "tpl-webgpu-vanilla",
    "tpl-webgpu-react",
    "shared-webgpu-capability",
    "shared-bench-schema",
    "docs-lab-roadmap"
  ]
}
JSON

CUSTOM_TARGET_OUTPUT="$(node "${REPO_ROOT}/scripts/render-goal-status.mjs" \
  --goal-targets "${GOAL_TARGETS}" \
  --stdout)"
assert_contains "${CUSTOM_TARGET_OUTPUT}" "- Inventory repos: 54 / 55"
assert_contains "${CUSTOM_TARGET_OUTPUT}" "Phase 0 — Organization Bootstrap | ⚠ blocked"

cat >"${INCOMPLETE_RUNTIME_DOC}" <<'MD'
# Runtime Recommendations

This is intentionally incomplete.
MD

INCOMPLETE_OUTPUT="$(node "${REPO_ROOT}/scripts/render-goal-status.mjs" \
  --runtime-recommendations "${INCOMPLETE_RUNTIME_DOC}" \
  --stdout)"
assert_contains "${INCOMPLETE_OUTPUT}" "Runtime recommendation doc | ⚠ incomplete"
assert_contains "${INCOMPLETE_OUTPUT}" "3/4 decision/report artifacts complete"
assert_contains "${INCOMPLETE_OUTPUT}" "## Current Recommendation State"

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
