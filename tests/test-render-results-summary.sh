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
  rg -Fq "${pattern}" "${path}" || fail "missing pattern '${pattern}' in ${path}"
}

mkdir -p \
  "${TMP_DIR}/repo/reports/raw" \
  "${TMP_DIR}/repo/reports/screenshots" \
  "${TMP_DIR}/repo/reports/logs"

cp "${REPO_ROOT}/tests/fixtures/results/bench-model-load-and-cache/01-cold-load.json" "${TMP_DIR}/repo/reports/raw/01-cold-load.json"
cp "${REPO_ROOT}/tests/fixtures/results/bench-model-load-and-cache/02-warm-load.json" "${TMP_DIR}/repo/reports/raw/02-warm-load.json"
touch "${TMP_DIR}/repo/reports/screenshots/01-cold-load.png"
touch "${TMP_DIR}/repo/reports/screenshots/02-warm-load.png"
touch "${TMP_DIR}/repo/reports/logs/01-cold-load.log"
touch "${TMP_DIR}/repo/reports/logs/02-warm-load.log"

node "${REPO_ROOT}/scripts/render-results-summary.mjs" --repo-dir "${TMP_DIR}/repo"

assert_contains "${TMP_DIR}/repo/RESULTS.md" "bench-model-load-and-cache"
assert_contains "${TMP_DIR}/repo/RESULTS.md" "Cold Load"
assert_contains "${TMP_DIR}/repo/RESULTS.md" "Warm Load"
assert_contains "${TMP_DIR}/repo/RESULTS.md" "delta=44.3 ms"
assert_contains "${TMP_DIR}/repo/RESULTS.md" "preparedHit=true"
assert_contains "${TMP_DIR}/repo/RESULTS.md" "./reports/screenshots/01-cold-load.png"
assert_contains "${TMP_DIR}/repo/RESULTS.md" "./reports/logs/02-warm-load.log"
assert_contains "${TMP_DIR}/repo/RESULTS.md" "playwright-chromium"
