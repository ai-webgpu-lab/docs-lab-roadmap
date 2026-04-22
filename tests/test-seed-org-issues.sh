#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
OUTPUT_FILE="$(mktemp)"
trap 'rm -f "${OUTPUT_FILE}"' EXIT

fail() {
  echo "test failed: $1" >&2
  exit 1
}

assert_contains() {
  local path="$1"
  local pattern="$2"
  rg -Fq "${pattern}" "${path}" || fail "missing pattern '${pattern}' in ${path}"
}

bash "${REPO_ROOT}/scripts/seed-org-issues.sh" \
  --dry-run \
  --org "sample-org" \
  --issues-file "${REPO_ROOT}/tests/fixtures/initial-draft-issues-sample.csv" \
  --project-title "Sample Project" \
  > "${OUTPUT_FILE}"

assert_contains "${OUTPUT_FILE}" "dry-run create: sample-org/shared-bench-schema :: [infra] 공통 결과 스키마 validation 추가 :: labels=infra,priority:p0 :: project=Sample Project"
assert_contains "${OUTPUT_FILE}" "dry-run create: sample-org/bench-runtime-shootout :: [bench] runtime shootout 시나리오 정의 :: labels=benchmark,priority:p0 :: project=Sample Project"
assert_contains "${OUTPUT_FILE}" "dry-run create: sample-org/app-local-chat-arena :: [app] Local Chat Arena 초안 생성 :: labels=integration,priority:p1 :: project=Sample Project"
assert_contains "${OUTPUT_FILE}" "dry-run summary: planned=3"

echo "seed-org-issues dry-run test passed"
