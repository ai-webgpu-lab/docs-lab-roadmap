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

# 1. Filter that matches a single fast test should produce summary "1 passed, 0 failed"
FILTER_OUTPUT="$(bash "${REPO_ROOT}/tests/run-all.sh" --filter render-sketch-metrics 2>&1)"
assert_contains "${FILTER_OUTPUT}" "==> test-render-sketch-metrics"
assert_contains "${FILTER_OUTPUT}" "run-all summary: 1 passed, 0 failed, total=1"

# 2. --quiet suppresses per-test progress headers, still emits summary
QUIET_OUTPUT="$(bash "${REPO_ROOT}/tests/run-all.sh" --filter render-sketch-metrics --quiet 2>&1)"
if grep -Fq -e "==> test-render-sketch-metrics" <<<"${QUIET_OUTPUT}"; then
  fail "--quiet should suppress per-test headers"
fi
assert_contains "${QUIET_OUTPUT}" "run-all summary: 1 passed, 0 failed, total=1"

# 3. Filter matching nothing should exit non-zero with "no matching tests"
if NOMATCH_OUTPUT="$(bash "${REPO_ROOT}/tests/run-all.sh" --filter __definitely-no-match__ 2>&1)"; then
  fail "no-match filter should exit non-zero"
fi
assert_contains "${NOMATCH_OUTPUT}" "no matching tests"

# 4. Unknown argument should fail with usage
if UNKNOWN_OUTPUT="$(bash "${REPO_ROOT}/tests/run-all.sh" --does-not-exist 2>&1)"; then
  fail "unknown arg should exit non-zero"
fi
assert_contains "${UNKNOWN_OUTPUT}" "unknown argument"

# 5. --help prints usage and exits 0
HELP_OUTPUT="$(bash "${REPO_ROOT}/tests/run-all.sh" --help 2>&1)"
assert_contains "${HELP_OUTPUT}" "Usage: bash tests/run-all.sh"
assert_contains "${HELP_OUTPUT}" "--filter"
assert_contains "${HELP_OUTPUT}" "--bail"
assert_contains "${HELP_OUTPUT}" "--quiet"
assert_contains "${HELP_OUTPUT}" "--json"

# 6. Filter matching multiple fast tests still prints expected counts
MULTI_OUTPUT="$(bash "${REPO_ROOT}/tests/run-all.sh" --filter render-sketch --quiet 2>&1)"
assert_contains "${MULTI_OUTPUT}" "run-all summary:"
assert_contains "${MULTI_OUTPUT}" "0 failed"

# 7. --json emits structured JSON, no human "run-all summary:" line
JSON_OUTPUT="$(bash "${REPO_ROOT}/tests/run-all.sh" --filter render-sketch-metrics --json 2>&1)"
if grep -Fq -e "run-all summary:" <<<"${JSON_OUTPUT}"; then
  fail "--json should not emit human summary line"
fi
PARSED="$(node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write([j.total,j.passed,j.failed,j.bail,Array.isArray(j.failures),Array.isArray(j.passed_names),typeof j.elapsed_seconds].join("|"));' <<<"${JSON_OUTPUT}")"
[[ "${PARSED}" == "1|1|0|false|true|true|number" ]] || fail "json shape mismatch: ${PARSED}"

# 8. --bail short-circuits at first failure when fixture suite contains a failing test
TMP_TESTS_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_TESTS_DIR}"' EXIT

cat >"${TMP_TESTS_DIR}/test-aaa-fast-pass.sh" <<'EOF'
#!/usr/bin/env bash
echo "fixture aaa pass"
exit 0
EOF
cat >"${TMP_TESTS_DIR}/test-bbb-fail.sh" <<'EOF'
#!/usr/bin/env bash
echo "fixture bbb intentional failure" >&2
exit 1
EOF
cat >"${TMP_TESTS_DIR}/test-ccc-should-not-run.sh" <<'EOF'
#!/usr/bin/env bash
touch "${TMP_TESTS_DIR}/ccc_ran.flag" 2>/dev/null || true
echo "fixture ccc should never appear when --bail is honored"
exit 0
EOF
chmod +x "${TMP_TESTS_DIR}"/test-*.sh

if BAIL_OUT="$(bash "${REPO_ROOT}/tests/run-all.sh" --tests-dir "${TMP_TESTS_DIR}" --bail --quiet 2>&1)"; then
  fail "fixture --bail run should exit non-zero (one fixture intentionally fails)"
fi
assert_contains "${BAIL_OUT}" "run-all summary: 1 passed, 1 failed, total=3"
if grep -Fq -e "fixture ccc" <<<"${BAIL_OUT}"; then
  fail "--bail should stop before running ccc"
fi
if [[ -f "${TMP_TESTS_DIR}/ccc_ran.flag" ]]; then
  fail "--bail should not have executed ccc fixture"
fi

# 9. Without --bail, all 3 fixture tests run and counts reflect that (1 pass after fail + 1 more pass)
if FULL_OUT="$(bash "${REPO_ROOT}/tests/run-all.sh" --tests-dir "${TMP_TESTS_DIR}" --quiet 2>&1)"; then
  fail "fixture full run should still exit non-zero (one fixture fails)"
fi
assert_contains "${FULL_OUT}" "run-all summary: 2 passed, 1 failed, total=3"

# 10. JSON failures payload includes the bbb fixture log content
JSON_FAIL="$(bash "${REPO_ROOT}/tests/run-all.sh" --tests-dir "${TMP_TESTS_DIR}" --json 2>&1 || true)"
JSON_PARSED="$(node -e '
const j=JSON.parse(require("fs").readFileSync(0,"utf8"));
process.stdout.write([
  j.total, j.passed, j.failed,
  j.failures.length,
  j.failures[0].name,
  j.failures[0].log.includes("fixture bbb intentional failure")
].join("|"));
' <<<"${JSON_FAIL}")"
[[ "${JSON_PARSED}" == "3|2|1|1|test-bbb-fail|true" ]] || fail "json failures payload mismatch: ${JSON_PARSED}"

echo "run-all test passed"
