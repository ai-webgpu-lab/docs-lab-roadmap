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
  rg -Fq "${pattern}" "${path}" || fail "missing pattern '${pattern}' in ${path}"
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

echo "validate-lab-planning test passed"
