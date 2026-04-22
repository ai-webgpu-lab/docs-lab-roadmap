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

EXPECTED_REPO_COUNT="$(awk -F, 'NR > 1 && $1 != "" { count++ } END { print count + 0 }' "${REPO_ROOT}/docs/repo-inventory.csv")"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --output-root "${TMP_DIR}/out" \
  --no-sync

ACTUAL_REPO_COUNT="$(find "${TMP_DIR}/out" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
[[ "${ACTUAL_REPO_COUNT}" == "${EXPECTED_REPO_COUNT}" ]] || fail "expected ${EXPECTED_REPO_COUNT} repos, got ${ACTUAL_REPO_COUNT}"

assert_file "${TMP_DIR}/out/.github/profile/README.md"
assert_file "${TMP_DIR}/out/.github/.github/pull_request_template.md"
assert_contains "${TMP_DIR}/out/.github/README.md" "Organization-wide community health files"

assert_file "${TMP_DIR}/out/shared-bench-schema/schemas/ai-webgpu-lab-result.schema.json"
assert_file "${TMP_DIR}/out/shared-bench-schema/templates/example-result.json"
assert_file "${TMP_DIR}/out/docs-lab-roadmap/README.md"
assert_dir "${TMP_DIR}/out/docs-lab-roadmap/docs"

assert_file "${TMP_DIR}/out/exp-embeddings-browser-throughput/RESULTS.md"
assert_file "${TMP_DIR}/out/exp-embeddings-browser-throughput/schemas/ai-webgpu-lab-result.schema.json"
assert_dir "${TMP_DIR}/out/exp-embeddings-browser-throughput/reports/raw"

assert_file "${TMP_DIR}/out/bench-runtime-shootout/RESULTS.md"
assert_file "${TMP_DIR}/out/app-blackhole-observatory/README.md"
assert_dir "${TMP_DIR}/out/app-blackhole-observatory/public"

echo "bootstrap-org-repos full inventory test passed"
