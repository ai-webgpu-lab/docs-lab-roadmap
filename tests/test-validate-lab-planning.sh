#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
OUTPUT_FILE="$(mktemp)"
INVALID_ISSUES_FILE="$(mktemp)"
FAIL_OUTPUT_FILE="$(mktemp)"
trap 'rm -f "${OUTPUT_FILE}" "${INVALID_ISSUES_FILE}" "${FAIL_OUTPUT_FILE}"' EXIT

fail() {
  echo "test failed: $1" >&2
  exit 1
}

assert_contains() {
  local path="$1"
  local pattern="$2"
  if command -v rg >/dev/null 2>&1 && rg -Fq "${pattern}" "${path}" 2>/dev/null; then
    return 0
  fi
  grep -Fq "${pattern}" "${path}" || fail "missing pattern '${pattern}' in ${path}"
}

bash "${REPO_ROOT}/scripts/validate-lab-planning.sh" > "${OUTPUT_FILE}"

assert_contains "${OUTPUT_FILE}" "planning validation passed"
assert_contains "${OUTPUT_FILE}" "master plan P0 coverage:"
assert_contains "${OUTPUT_FILE}" "execution plan target repos with seeded issues:"

cat > "${INVALID_ISSUES_FILE}" <<'EOF2'
title,repo,type,priority,track,summary
[infra] 잘못된 저장소 참조,missing-repo,infra,P0,Infra,존재하지 않는 저장소
EOF2

if bash "${REPO_ROOT}/scripts/validate-lab-planning.sh" \
  --issues-file "${INVALID_ISSUES_FILE}" \
  > /dev/null 2> "${FAIL_OUTPUT_FILE}"; then
  fail "validator should fail for an issue repo missing from inventory"
fi

assert_contains "${FAIL_OUTPUT_FILE}" "planning validation failed:"
assert_contains "${FAIL_OUTPUT_FILE}" "references repo 'missing-repo' which is not present in inventory"

assert_contains "${OUTPUT_FILE}" "infra fixture validation passed"

SKIP_OUTPUT_FILE="$(mktemp)"
bash "${REPO_ROOT}/scripts/validate-lab-planning.sh" --skip-infra-fixtures > "${SKIP_OUTPUT_FILE}"
assert_contains "${SKIP_OUTPUT_FILE}" "planning validation passed"
if grep -Fq "infra fixture validation passed" "${SKIP_OUTPUT_FILE}"; then
  rm -f "${SKIP_OUTPUT_FILE}"
  fail "infra fixture hook should be skipped with --skip-infra-fixtures"
fi
rm -f "${SKIP_OUTPUT_FILE}"

echo "validate-lab-planning test passed"
