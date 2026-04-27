#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

fail() {
  echo "test failed: $1" >&2
  exit 1
}

OUTPUT="$(node "${REPO_ROOT}/scripts/validate-infra-fixtures.mjs" 2>&1)" || fail "validate-infra-fixtures.mjs reported drift: ${OUTPUT}"

if ! grep -Fq "infra fixture validation passed" <<<"${OUTPUT}"; then
  fail "missing success line in output: ${OUTPUT}"
fi

if ! grep -Fq "5 infra harnesses" <<<"${OUTPUT}"; then
  fail "missing 5-harness summary in output: ${OUTPUT}"
fi

echo "validate-infra-fixtures test passed"
