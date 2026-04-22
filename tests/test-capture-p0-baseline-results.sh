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

assert_contains() {
  local path="$1"
  local pattern="$2"
  rg -Fq "${pattern}" "${path}" || fail "missing pattern '${pattern}' in ${path}"
}

[[ -d "${REPO_ROOT}/node_modules/playwright" ]] || fail "playwright dependency missing; run npm install"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "bench-model-load-and-cache" \
  --output-root "${TMP_DIR}/out" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out/bench-model-load-and-cache" \
  --repo-name "bench-model-load-and-cache" \
  --commit "test-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out/bench-model-load-and-cache/reports/raw/01-cold-load.json"
assert_file "${TMP_DIR}/out/bench-model-load-and-cache/reports/raw/02-warm-load.json"
assert_file "${TMP_DIR}/out/bench-model-load-and-cache/reports/screenshots/01-cold-load.png"
assert_file "${TMP_DIR}/out/bench-model-load-and-cache/reports/screenshots/02-warm-load.png"
assert_file "${TMP_DIR}/out/bench-model-load-and-cache/reports/logs/01-cold-load.log"
assert_file "${TMP_DIR}/out/bench-model-load-and-cache/reports/logs/02-warm-load.log"
assert_contains "${TMP_DIR}/out/bench-model-load-and-cache/reports/raw/01-cold-load.json" "\"commit\": \"test-commit\""
assert_contains "${TMP_DIR}/out/bench-model-load-and-cache/reports/raw/02-warm-load.json" "\"tool\": \"playwright-chromium\""
assert_contains "${TMP_DIR}/out/bench-model-load-and-cache/RESULTS.md" "Cold Load"
assert_contains "${TMP_DIR}/out/bench-model-load-and-cache/RESULTS.md" "Warm Load"
assert_contains "${TMP_DIR}/out/bench-model-load-and-cache/RESULTS.md" "playwright-chromium"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "tpl-webgpu-vanilla" \
  --output-root "${TMP_DIR}/out-template" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
  --repo-dir "${TMP_DIR}/out-template/tpl-webgpu-vanilla" \
  --repo-name "tpl-webgpu-vanilla" \
  --commit "template-commit" \
  --owner "test-owner" \
  --captured-by "test-runner"

assert_file "${TMP_DIR}/out-template/tpl-webgpu-vanilla/reports/raw/01-minimal-webgpu-starter.json"
assert_file "${TMP_DIR}/out-template/tpl-webgpu-vanilla/reports/screenshots/01-minimal-webgpu-starter.png"
assert_file "${TMP_DIR}/out-template/tpl-webgpu-vanilla/reports/logs/01-minimal-webgpu-starter.log"
assert_contains "${TMP_DIR}/out-template/tpl-webgpu-vanilla/reports/raw/01-minimal-webgpu-starter.json" "\"commit\": \"template-commit\""
assert_contains "${TMP_DIR}/out-template/tpl-webgpu-vanilla/RESULTS.md" "Minimal WebGPU Starter"
assert_contains "${TMP_DIR}/out-template/tpl-webgpu-vanilla/RESULTS.md" "playwright-chromium"
