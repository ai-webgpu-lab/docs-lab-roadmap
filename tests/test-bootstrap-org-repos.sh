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

assert_file() {
  local path="$1"
  [[ -f "${path}" ]] || fail "missing file: ${path}"
}

assert_dir() {
  local path="$1"
  [[ -d "${path}" ]] || fail "missing directory: ${path}"
}

assert_contains() {
  local path="$1"
  local pattern="$2"
  rg -Fq "${pattern}" "${path}" || fail "missing pattern '${pattern}' in ${path}"
}

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/tests/fixtures/repo-inventory-sample.csv" \
  --output-root "${TMP_DIR}/out" \
  --no-sync

assert_file "${TMP_DIR}/out/shared-github-actions/README.md"
assert_file "${TMP_DIR}/out/shared-github-actions/LICENSE"
assert_dir "${TMP_DIR}/out/shared-github-actions/src"
assert_contains "${TMP_DIR}/out/shared-github-actions/README.md" "공통 CI."

assert_file "${TMP_DIR}/out/docs-track-notes/README.md"
assert_dir "${TMP_DIR}/out/docs-track-notes/docs"
assert_contains "${TMP_DIR}/out/docs-track-notes/README.md" "Documentation repository scaffold initialized"

assert_file "${TMP_DIR}/out/bench-runtime-shootout/README.md"
assert_file "${TMP_DIR}/out/bench-runtime-shootout/RESULTS.md"
assert_file "${TMP_DIR}/out/bench-runtime-shootout/schemas/ai-webgpu-lab-result.schema.json"
assert_dir "${TMP_DIR}/out/bench-runtime-shootout/reports/raw"
assert_contains "${TMP_DIR}/out/bench-runtime-shootout/README.md" "benchmark"

echo "bootstrap-org-repos local mode test passed"
