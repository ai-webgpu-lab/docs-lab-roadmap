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

assert_not_file() {
  local path="$1"
  [[ ! -f "${path}" ]] || fail "unexpected file: ${path}"
}

assert_contains() {
  local path="$1"
  local pattern="$2"
  rg -Fq "${pattern}" "${path}" || fail "missing pattern '${pattern}' in ${path}"
}

assert_not_contains() {
  local path="$1"
  local pattern="$2"
  if rg -Fq "${pattern}" "${path}"; then
    fail "unexpected pattern '${pattern}' in ${path}"
  fi
}

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/tests/fixtures/repo-inventory-sample.csv" \
  --output-root "${TMP_DIR}/out" \
  --no-sync

assert_file "${TMP_DIR}/out/shared-github-actions/README.md"
assert_file "${TMP_DIR}/out/shared-github-actions/LICENSE"
assert_dir "${TMP_DIR}/out/shared-github-actions/src"
assert_contains "${TMP_DIR}/out/shared-github-actions/README.md" "## 저장소 역할"
assert_contains "${TMP_DIR}/out/shared-github-actions/README.md" "공통 인프라 저장소"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "shared-webgpu-capability" \
  --output-root "${TMP_DIR}/out-capability" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-capability/shared-webgpu-capability/package.json"
assert_file "${TMP_DIR}/out-capability/shared-webgpu-capability/src/index.mjs"
assert_file "${TMP_DIR}/out-capability/shared-webgpu-capability/docs/capability-contract.md"
assert_contains "${TMP_DIR}/out-capability/shared-webgpu-capability/src/index.mjs" "collectWebGpuCapability"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "tpl-webgpu-vanilla" \
  --output-root "${TMP_DIR}/out-vanilla" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-vanilla/tpl-webgpu-vanilla/public/index.html"
assert_file "${TMP_DIR}/out-vanilla/tpl-webgpu-vanilla/public/app.js"
assert_contains "${TMP_DIR}/out-vanilla/tpl-webgpu-vanilla/public/index.html" "Minimal WebGPU Starter"
assert_contains "${TMP_DIR}/out-vanilla/tpl-webgpu-vanilla/public/app.js" "minimal-webgpu-starter"
assert_contains "${TMP_DIR}/out-vanilla/tpl-webgpu-vanilla/README.md" "Repository-specific runnable baseline active"
assert_contains "${TMP_DIR}/out-vanilla/tpl-webgpu-vanilla/README.md" "repo-scaffolds/p0/tpl-webgpu-vanilla/"
node --check "${TMP_DIR}/out-vanilla/tpl-webgpu-vanilla/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "tpl-webgpu-react" \
  --output-root "${TMP_DIR}/out-react" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-react/tpl-webgpu-react/public/index.html"
assert_file "${TMP_DIR}/out-react/tpl-webgpu-react/public/app.js"
assert_contains "${TMP_DIR}/out-react/tpl-webgpu-react/public/index.html" "react.production.min.js"
assert_contains "${TMP_DIR}/out-react/tpl-webgpu-react/public/app.js" "bootReactWebGpuTemplate"
assert_contains "${TMP_DIR}/out-react/tpl-webgpu-react/README.md" "repo-scaffolds/p0/tpl-webgpu-react/"
node --check "${TMP_DIR}/out-react/tpl-webgpu-react/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "bench-worker-isolation-and-ui-jank" \
  --output-root "${TMP_DIR}/out-worker-jank" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-worker-jank/bench-worker-isolation-and-ui-jank/public/index.html"
assert_file "${TMP_DIR}/out-worker-jank/bench-worker-isolation-and-ui-jank/public/app.js"
assert_file "${TMP_DIR}/out-worker-jank/bench-worker-isolation-and-ui-jank/public/jank-worker.js"
assert_contains "${TMP_DIR}/out-worker-jank/bench-worker-isolation-and-ui-jank/public/index.html" "Worker Isolation vs Main Thread Jank"
assert_contains "${TMP_DIR}/out-worker-jank/bench-worker-isolation-and-ui-jank/public/app.js" "worker-isolation-jank-harness"
assert_contains "${TMP_DIR}/out-worker-jank/bench-worker-isolation-and-ui-jank/README.md" "repo-scaffolds/p0/bench-worker-isolation-and-ui-jank/"
node --check "${TMP_DIR}/out-worker-jank/bench-worker-isolation-and-ui-jank/public/app.js"
node --check "${TMP_DIR}/out-worker-jank/bench-worker-isolation-and-ui-jank/public/jank-worker.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "bench-model-load-and-cache" \
  --output-root "${TMP_DIR}/out-model-cache" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-model-cache/bench-model-load-and-cache/public/index.html"
assert_file "${TMP_DIR}/out-model-cache/bench-model-load-and-cache/public/app.js"
assert_file "${TMP_DIR}/out-model-cache/bench-model-load-and-cache/public/model-manifest.json"
assert_contains "${TMP_DIR}/out-model-cache/bench-model-load-and-cache/public/index.html" "Cold vs Warm Model Load Harness"
assert_contains "${TMP_DIR}/out-model-cache/bench-model-load-and-cache/public/app.js" "synthetic-model-load-cache-harness"
assert_contains "${TMP_DIR}/out-model-cache/bench-model-load-and-cache/README.md" "repo-scaffolds/p0/bench-model-load-and-cache/"
node --check "${TMP_DIR}/out-model-cache/bench-model-load-and-cache/public/app.js"

assert_file "${TMP_DIR}/out/docs-track-notes/README.md"
assert_dir "${TMP_DIR}/out/docs-track-notes/docs"
assert_contains "${TMP_DIR}/out/docs-track-notes/README.md" "문서 기준 저장소"
assert_contains "${TMP_DIR}/out/docs-track-notes/README.md" "## 기본 구조"

assert_file "${TMP_DIR}/out/bench-runtime-shootout/README.md"
assert_file "${TMP_DIR}/out/bench-runtime-shootout/RESULTS.md"
assert_file "${TMP_DIR}/out/bench-runtime-shootout/schemas/ai-webgpu-lab-result.schema.json"
assert_file "${TMP_DIR}/out/bench-runtime-shootout/public/index.html"
assert_file "${TMP_DIR}/out/bench-runtime-shootout/public/app.js"
assert_file "${TMP_DIR}/out/bench-runtime-shootout/public/.nojekyll"
assert_file "${TMP_DIR}/out/bench-runtime-shootout/.github/workflows/deploy-pages.yml"
assert_dir "${TMP_DIR}/out/bench-runtime-shootout/reports/raw"
assert_contains "${TMP_DIR}/out/bench-runtime-shootout/README.md" "benchmark 저장소"
assert_contains "${TMP_DIR}/out/bench-runtime-shootout/README.md" "## 작업 및 갱신 절차"
assert_contains "${TMP_DIR}/out/bench-runtime-shootout/README.md" "## 완료 기준"
assert_contains "${TMP_DIR}/out/bench-runtime-shootout/public/index.html" "AI WebGPU Lab Baseline Probe"
assert_contains "${TMP_DIR}/out/bench-runtime-shootout/public/app.js" "Collect a reproducible browser and device snapshot"
assert_contains "${TMP_DIR}/out/bench-runtime-shootout/.github/workflows/deploy-pages.yml" "actions/deploy-pages@v4"
node --check "${TMP_DIR}/out/bench-runtime-shootout/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/tests/fixtures/repo-inventory-sample.csv" \
  --output-root "${TMP_DIR}/out-no-pages" \
  --no-sync \
  --no-pages

assert_file "${TMP_DIR}/out-no-pages/bench-runtime-shootout/README.md"
assert_not_file "${TMP_DIR}/out-no-pages/bench-runtime-shootout/public/index.html"
assert_not_file "${TMP_DIR}/out-no-pages/bench-runtime-shootout/public/app.js"
assert_not_file "${TMP_DIR}/out-no-pages/bench-runtime-shootout/.github/workflows/deploy-pages.yml"
assert_contains "${TMP_DIR}/out-no-pages/bench-runtime-shootout/README.md" "GitHub Pages scaffold skipped"
assert_not_contains "${TMP_DIR}/out-no-pages/bench-runtime-shootout/README.md" "## GitHub Pages Demo"

printf 'sentinel\n' > "${TMP_DIR}/out/bench-runtime-shootout/README.md"
printf 'legacy\n' > "${TMP_DIR}/out/bench-runtime-shootout/public/index.html"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/tests/fixtures/repo-inventory-sample.csv" \
  --output-root "${TMP_DIR}/out" \
  --no-sync

assert_contains "${TMP_DIR}/out/bench-runtime-shootout/README.md" "sentinel"
assert_contains "${TMP_DIR}/out/bench-runtime-shootout/public/index.html" "legacy"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/tests/fixtures/repo-inventory-sample.csv" \
  --output-root "${TMP_DIR}/out" \
  --no-sync \
  --refresh-readme \
  --refresh-generated

assert_not_contains "${TMP_DIR}/out/bench-runtime-shootout/README.md" "sentinel"
assert_not_contains "${TMP_DIR}/out/bench-runtime-shootout/public/index.html" "legacy"
assert_contains "${TMP_DIR}/out/bench-runtime-shootout/README.md" "## 저장소 역할"
assert_contains "${TMP_DIR}/out/bench-runtime-shootout/README.md" "## GitHub Pages 운영 메모"
assert_contains "${TMP_DIR}/out/bench-runtime-shootout/public/index.html" "AI WebGPU Lab Baseline Probe"
assert_contains "${TMP_DIR}/out/bench-runtime-shootout/public/app.js" "downloadJson"

echo "bootstrap-org-repos local mode test passed"
