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

fixture_root="${TMP_DIR}/fixture"
fixture_scripts="${fixture_root}/scripts"
fixture_tests="${fixture_root}/tests"
mkdir -p "${fixture_scripts}" "${fixture_tests}" "${fixture_root}/docs"

make_pass_script() {
  local path="$1"
  local name="$2"
  cat >"${path}" <<EOF
#!/usr/bin/env bash
echo "${name}"
EOF
  chmod +x "${path}"
}

make_node_pass_script() {
  local path="$1"
  local name="$2"
  cat >"${path}" <<EOF
#!/usr/bin/env node
console.log("${name}");
EOF
  chmod +x "${path}"
}

make_render_script() {
  local path="$1"
  local title="$2"
  cat >"${path}" <<EOF
#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
const args = process.argv.slice(2);
const output = args[args.indexOf("--output") + 1];
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, "# ${title}\\n", "utf8");
console.log("${title}");
EOF
  chmod +x "${path}"
}

make_pass_script "${fixture_scripts}/validate-lab-planning.sh" "validate fixture"
make_pass_script "${fixture_tests}/test-adapter-family-coverage.sh" "adapter fixture"
make_pass_script "${fixture_tests}/test-real-sketch-family-coverage.sh" "family fixture"
make_pass_script "${fixture_tests}/test-real-sketch-conformance.sh" "conformance fixture"
make_pass_script "${fixture_tests}/test-real-sketch-contract.sh" "contract fixture"
make_node_pass_script "${fixture_scripts}/validate-result-schema.mjs" "schema fixture"
make_pass_script "${fixture_tests}/test-phase3-report-docs.sh" "phase3 fixture"
make_pass_script "${fixture_tests}/test-bootstrap-org-repos.sh" "bootstrap fixture"
make_pass_script "${fixture_tests}/test-bootstrap-org-repos-full-inventory.sh" "bootstrap full fixture"
make_render_script "${fixture_scripts}/render-integration-status.mjs" "Integration Status"
make_render_script "${fixture_scripts}/render-sketch-metrics.mjs" "Sketch Metrics"
make_render_script "${fixture_scripts}/render-capabilities-matrix.mjs" "Capabilities Matrix"
make_render_script "${fixture_scripts}/render-benchmark-summary.mjs" "Benchmark Summary"
make_render_script "${fixture_scripts}/render-goal-status.mjs" "Goal Status"

run_fixture() {
  CHECK_COVERAGE_REPO_ROOT="${fixture_root}" \
  CHECK_COVERAGE_SCRIPT_ROOT="${fixture_scripts}" \
  CHECK_COVERAGE_TEST_ROOT="${fixture_tests}" \
    bash "${REPO_ROOT}/scripts/check-coverage.sh" "$@"
}

OUTPUT="$(run_fixture 2>&1)"
assert_contains "${OUTPUT}" "==> validate-lab-planning"
assert_contains "${OUTPUT}" "==> adapter-family-coverage"
assert_contains "${OUTPUT}" "==> real-sketch-family-coverage"
assert_contains "${OUTPUT}" "==> real-sketch-conformance"
assert_contains "${OUTPUT}" "==> real-sketch-contract"
assert_contains "${OUTPUT}" "==> validate-result-schema"
assert_contains "${OUTPUT}" "==> render-integration-status"
assert_contains "${OUTPUT}" "==> render-sketch-metrics"
assert_contains "${OUTPUT}" "==> render-capabilities-matrix"
assert_contains "${OUTPUT}" "==> render-benchmark-summary"
assert_contains "${OUTPUT}" "==> phase3-report-docs"
assert_contains "${OUTPUT}" "==> render-goal-status"
assert_contains "${OUTPUT}" "check-coverage summary: 12 passed, 0 failed"

# --quiet mode should suppress step headers.
QUIET_OUTPUT="$(run_fixture --quiet 2>&1)"
if grep -Fq -e "==> validate-lab-planning" <<<"${QUIET_OUTPUT}"; then
  fail "quiet mode should not print step headers"
fi
assert_contains "${QUIET_OUTPUT}" "check-coverage summary: 12 passed, 0 failed"

# --skip-coverage should drop the real-sketch-family step.
SKIP_OUTPUT="$(run_fixture --skip-coverage 2>&1)"
if grep -Fq -e "real-sketch-family-coverage" <<<"${SKIP_OUTPUT}"; then
  fail "--skip-coverage should drop the family-coverage step"
fi
assert_contains "${SKIP_OUTPUT}" "check-coverage summary: 11 passed, 0 failed"

# --skip-status should drop the generated dashboard steps.
SKIP_STATUS_OUTPUT="$(run_fixture --skip-status 2>&1)"
if grep -Fq -e "render-integration-status" <<<"${SKIP_STATUS_OUTPUT}"; then
  fail "--skip-status should drop the integration-status step"
fi
if grep -Fq -e "render-sketch-metrics" <<<"${SKIP_STATUS_OUTPUT}"; then
  fail "--skip-status should drop the sketch-metrics step"
fi
if grep -Fq -e "render-capabilities-matrix" <<<"${SKIP_STATUS_OUTPUT}"; then
  fail "--skip-status should drop the capabilities-matrix step"
fi
if grep -Fq -e "render-goal-status" <<<"${SKIP_STATUS_OUTPUT}"; then
  fail "--skip-status should drop the goal-status step"
fi
if grep -Fq -e "render-benchmark-summary" <<<"${SKIP_STATUS_OUTPUT}"; then
  fail "--skip-status should drop the benchmark-summary step"
fi
if grep -Fq -e "phase3-report-docs" <<<"${SKIP_STATUS_OUTPUT}"; then
  fail "--skip-status should drop the phase3-report-docs step"
fi
assert_contains "${SKIP_STATUS_OUTPUT}" "check-coverage summary: 6 passed, 0 failed"

# Status + metrics + capabilities docs should exist after fixture run.
[[ -f "${fixture_root}/docs/INTEGRATION-STATUS.md" ]] || fail "docs/INTEGRATION-STATUS.md not produced"
assert_contains "$(cat "${fixture_root}/docs/INTEGRATION-STATUS.md")" "# Integration Status"
[[ -f "${fixture_root}/docs/SKETCH-METRICS.md" ]] || fail "docs/SKETCH-METRICS.md not produced"
assert_contains "$(cat "${fixture_root}/docs/SKETCH-METRICS.md")" "# Sketch Metrics"
[[ -f "${fixture_root}/docs/CAPABILITIES-MATRIX.md" ]] || fail "docs/CAPABILITIES-MATRIX.md not produced"
assert_contains "$(cat "${fixture_root}/docs/CAPABILITIES-MATRIX.md")" "# Capabilities Matrix"
[[ -f "${fixture_root}/docs/BENCHMARK-SUMMARY.md" ]] || fail "docs/BENCHMARK-SUMMARY.md not produced"
assert_contains "$(cat "${fixture_root}/docs/BENCHMARK-SUMMARY.md")" "# Benchmark Summary"
[[ -f "${fixture_root}/docs/GOAL-STATUS.md" ]] || fail "docs/GOAL-STATUS.md not produced"
assert_contains "$(cat "${fixture_root}/docs/GOAL-STATUS.md")" "# Goal Status"

# --preset smoke skips adapter-family + real-sketch-family (10 steps remain).
SMOKE_OUTPUT="$(run_fixture --preset smoke 2>&1)"
assert_contains "${SMOKE_OUTPUT}" "check-coverage summary: 10 passed, 0 failed"
if grep -Fq -e "==> adapter-family-coverage" <<<"${SMOKE_OUTPUT}"; then
  fail "smoke preset should skip adapter-family-coverage"
fi
if grep -Fq -e "==> real-sketch-family-coverage" <<<"${SMOKE_OUTPUT}"; then
  fail "smoke preset should skip real-sketch-family-coverage"
fi
assert_contains "${SMOKE_OUTPUT}" "==> real-sketch-contract"
assert_contains "${SMOKE_OUTPUT}" "==> validate-result-schema"
assert_contains "${SMOKE_OUTPUT}" "==> render-capabilities-matrix"
assert_contains "${SMOKE_OUTPUT}" "==> render-benchmark-summary"
assert_contains "${SMOKE_OUTPUT}" "==> render-goal-status"

# --preset full == default (12 steps), strict adds bootstrap checks (14 steps).
FULL_OUTPUT="$(run_fixture --preset full 2>&1)"
assert_contains "${FULL_OUTPUT}" "check-coverage summary: 12 passed, 0 failed"

STRICT_OUTPUT="$(run_fixture --preset strict 2>&1)"
assert_contains "${STRICT_OUTPUT}" "==> bootstrap-org-repos"
assert_contains "${STRICT_OUTPUT}" "==> bootstrap-org-repos-full-inventory"
assert_contains "${STRICT_OUTPUT}" "check-coverage summary: 14 passed, 0 failed"

# unknown preset should fail.
if run_fixture --preset bogus >/dev/null 2>&1; then
  fail "unknown preset should exit non-zero"
fi

echo "check-coverage test passed"
