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
  local path="$1"
  local pattern="$2"
  if command -v rg >/dev/null 2>&1 && rg -Fq -- "${pattern}" "${path}" 2>/dev/null; then
    return 0
  fi
  grep -Fq -- "${pattern}" "${path}" || fail "missing pattern '${pattern}' in ${path}"
}

OUTPUT="${TMP_DIR}/schema.out"
BROKEN="${TMP_DIR}/broken.json"
BROKEN_ERR="${TMP_DIR}/broken.err"

node "${REPO_ROOT}/scripts/validate-result-schema.mjs" >"${OUTPUT}"
assert_contains "${OUTPUT}" "validated "
assert_contains "${OUTPUT}" "result file(s)"

node "${REPO_ROOT}/scripts/validate-result-schema.mjs" --quiet

cp "${REPO_ROOT}/tests/fixtures/results/bench-runtime-shootout/01-runtime-webgpu-cold.json" "${BROKEN}"
node -e '
const fs = require("fs");
const file = process.argv[1];
const data = JSON.parse(fs.readFileSync(file, "utf8"));
delete data.meta.commit;
data.metrics.common.success_rate = 2;
fs.writeFileSync(file, JSON.stringify(data, null, 2));
' "${BROKEN}"

if node "${REPO_ROOT}/scripts/validate-result-schema.mjs" --file "${BROKEN}" 2>"${BROKEN_ERR}"; then
  fail "expected broken result schema to fail"
fi

assert_contains "${BROKEN_ERR}" "meta.commit is required"
assert_contains "${BROKEN_ERR}" "metrics.common.success_rate must be between 0 and 1"

assert_contains "${REPO_ROOT}/docs/RESULT-SCHEMA.md" "# Result Schema"
assert_contains "${REPO_ROOT}/docs/RESULT-SCHEMA.md" "reports/raw/*.json"
assert_contains "${REPO_ROOT}/docs/RESULT-SCHEMA.md" "metrics.llm"

echo "result-schema test passed"
