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
  if command -v rg >/dev/null 2>&1 && rg -Fq "${pattern}" "${path}" 2>/dev/null; then
    return 0
  fi
  grep -Fq "${pattern}" "${path}" || fail "missing pattern '${pattern}' in ${path}"
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
assert_file "${TMP_DIR}/out/shared-github-actions/.github/workflows/reusable-results-guard.yml"
assert_file "${TMP_DIR}/out/shared-github-actions/.github/workflows/reusable-pages-smoke.yml"
assert_file "${TMP_DIR}/out/shared-github-actions/docs/reusable-workflows.md"
assert_contains "${TMP_DIR}/out/shared-github-actions/README.md" "## 저장소 역할"
assert_contains "${TMP_DIR}/out/shared-github-actions/README.md" "공통 인프라 저장소"
assert_contains "${TMP_DIR}/out/shared-github-actions/.github/workflows/reusable-results-guard.yml" "workflow_call"
assert_contains "${TMP_DIR}/out/shared-github-actions/.github/workflows/reusable-pages-smoke.yml" "fallback_query"

COMMA_INVENTORY="${TMP_DIR}/comma-inventory.csv"
cat >"${COMMA_INVENTORY}" <<'CSV'
repo,category,purpose,priority_group
exp-comma-purpose,graphics,"comma, inside purpose",P1
CSV

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${COMMA_INVENTORY}" \
  --repo "exp-comma-purpose" \
  --output-root "${TMP_DIR}/out-comma" \
  --no-sync

assert_contains "${TMP_DIR}/out-comma/exp-comma-purpose/public/app.js" 'purpose: "comma, inside purpose"'
assert_contains "${TMP_DIR}/out-comma/exp-comma-purpose/public/app.js" 'priority: "P1"'
node --check "${TMP_DIR}/out-comma/exp-comma-purpose/public/app.js"

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
assert_file "${TMP_DIR}/out-capability/shared-webgpu-capability/public/index.html"
assert_file "${TMP_DIR}/out-capability/shared-webgpu-capability/public/app.js"
assert_file "${TMP_DIR}/out-capability/shared-webgpu-capability/public/capability-fixture.json"
assert_file "${TMP_DIR}/out-capability/shared-webgpu-capability/.github/workflows/deploy-pages.yml"
assert_dir "${TMP_DIR}/out-capability/shared-webgpu-capability/reports/raw"
assert_file "${TMP_DIR}/out-capability/shared-webgpu-capability/RESULTS.md"
assert_file "${TMP_DIR}/out-capability/shared-webgpu-capability/schemas/ai-webgpu-lab-result.schema.json"
assert_contains "${TMP_DIR}/out-capability/shared-webgpu-capability/public/app.js" "shared-webgpu-capability-baseline"
assert_contains "${TMP_DIR}/out-capability/shared-webgpu-capability/README.md" "docs-lab-roadmap/docs/SKETCH-METRICS.md"
node --check "${TMP_DIR}/out-capability/shared-webgpu-capability/public/app.js"

for repo in .github shared-bench-schema shared-github-actions docs-lab-roadmap; do
  bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
    --mode local \
    --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
    --repo "${repo}" \
    --output-root "${TMP_DIR}/out-${repo}" \
    --no-sync \
    --refresh-generated \
    --refresh-readme

  assert_file "${TMP_DIR}/out-${repo}/${repo}/public/index.html"
  assert_file "${TMP_DIR}/out-${repo}/${repo}/public/app.js"
  assert_file "${TMP_DIR}/out-${repo}/${repo}/.github/workflows/deploy-pages.yml"
  assert_dir "${TMP_DIR}/out-${repo}/${repo}/reports/raw"
  assert_file "${TMP_DIR}/out-${repo}/${repo}/RESULTS.md"
  node --check "${TMP_DIR}/out-${repo}/${repo}/public/app.js"
done

assert_file "${TMP_DIR}/out-.github/.github/public/community-files-fixture.json"
assert_contains "${TMP_DIR}/out-.github/.github/public/app.js" "dotgithub-community-baseline"
assert_contains "${TMP_DIR}/out-.github/.github/README.md" "## 조직 상태 대시보드"
assert_contains "${TMP_DIR}/out-.github/.github/README.md" "actions/workflows/operations-check.yml/badge.svg?branch=main"
assert_contains "${TMP_DIR}/out-.github/.github/README.md" "docs-lab-roadmap/docs/WORKFLOW-STATUS.md"
assert_contains "${TMP_DIR}/out-.github/.github/profile/README.md" "## Live Status"
assert_contains "${TMP_DIR}/out-.github/.github/profile/README.md" "actions/workflows/operations-check.yml/badge.svg?branch=main"
assert_contains "${TMP_DIR}/out-.github/.github/profile/README.md" "docs-lab-roadmap/docs/WORKFLOW-STATUS.md"
assert_file "${TMP_DIR}/out-shared-bench-schema/shared-bench-schema/public/schema-fixture.json"
assert_contains "${TMP_DIR}/out-shared-bench-schema/shared-bench-schema/public/app.js" "shared-bench-schema-baseline"
assert_contains "${TMP_DIR}/out-shared-bench-schema/shared-bench-schema/README.md" "docs-lab-roadmap/docs/PAGES-STATUS.md"
assert_contains "${TMP_DIR}/out-shared-bench-schema/shared-bench-schema/README.md" "docs-lab-roadmap/docs/SKETCH-METRICS.md"
assert_file "${TMP_DIR}/out-shared-github-actions/shared-github-actions/public/workflow-fixture.json"
assert_contains "${TMP_DIR}/out-shared-github-actions/shared-github-actions/public/app.js" "shared-github-actions-baseline"
assert_contains "${TMP_DIR}/out-shared-github-actions/shared-github-actions/README.md" "docs-lab-roadmap/docs/SKETCH-METRICS.md"
assert_file "${TMP_DIR}/out-docs-lab-roadmap/docs-lab-roadmap/public/docs-fixture.json"
assert_contains "${TMP_DIR}/out-docs-lab-roadmap/docs-lab-roadmap/public/app.js" "docs-lab-roadmap-baseline"
assert_contains "${TMP_DIR}/out-docs-lab-roadmap/docs-lab-roadmap/README.md" "node scripts/check-org-pages.mjs --fail-on-error"
assert_contains "${TMP_DIR}/out-docs-lab-roadmap/docs-lab-roadmap/README.md" "docs/README-STATUS.md"
assert_contains "${TMP_DIR}/out-docs-lab-roadmap/docs-lab-roadmap/README.md" "docs/WORKFLOW-STATUS.md"
assert_contains "${TMP_DIR}/out-docs-lab-roadmap/docs-lab-roadmap/README.md" "docs/PROJECT-STATUS.md"

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
assert_contains "${TMP_DIR}/out-vanilla/tpl-webgpu-vanilla/README.md" "docs-lab-roadmap/docs/PAGES-STATUS.md"
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
  --repo "exp-three-webgpu-core" \
  --output-root "${TMP_DIR}/out-three" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-three/exp-three-webgpu-core/public/index.html"
assert_file "${TMP_DIR}/out-three/exp-three-webgpu-core/public/app.js"
assert_contains "${TMP_DIR}/out-three/exp-three-webgpu-core/public/index.html" "Three Scene Readiness"
assert_contains "${TMP_DIR}/out-three/exp-three-webgpu-core/public/app.js" "three-webgpu-scene-readiness"
assert_contains "${TMP_DIR}/out-three/exp-three-webgpu-core/README.md" "repo-scaffolds/repos/exp-three-webgpu-core/"
node --check "${TMP_DIR}/out-three/exp-three-webgpu-core/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-babylon-webgpu-core" \
  --output-root "${TMP_DIR}/out-babylon" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-babylon/exp-babylon-webgpu-core/public/index.html"
assert_file "${TMP_DIR}/out-babylon/exp-babylon-webgpu-core/public/app.js"
assert_contains "${TMP_DIR}/out-babylon/exp-babylon-webgpu-core/public/index.html" "Babylon Scene Readiness"
assert_contains "${TMP_DIR}/out-babylon/exp-babylon-webgpu-core/public/app.js" "babylon-webgpu-scene-readiness"
assert_contains "${TMP_DIR}/out-babylon/exp-babylon-webgpu-core/README.md" "repo-scaffolds/repos/exp-babylon-webgpu-core/"
node --check "${TMP_DIR}/out-babylon/exp-babylon-webgpu-core/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-playcanvas-webgpu-core" \
  --output-root "${TMP_DIR}/out-playcanvas" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-playcanvas/exp-playcanvas-webgpu-core/public/index.html"
assert_file "${TMP_DIR}/out-playcanvas/exp-playcanvas-webgpu-core/public/app.js"
assert_contains "${TMP_DIR}/out-playcanvas/exp-playcanvas-webgpu-core/public/index.html" "PlayCanvas Scene Readiness"
assert_contains "${TMP_DIR}/out-playcanvas/exp-playcanvas-webgpu-core/public/app.js" "playcanvas-webgpu-scene-readiness"
assert_contains "${TMP_DIR}/out-playcanvas/exp-playcanvas-webgpu-core/README.md" "repo-scaffolds/repos/exp-playcanvas-webgpu-core/"
node --check "${TMP_DIR}/out-playcanvas/exp-playcanvas-webgpu-core/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-pixi-webgpu-2d" \
  --output-root "${TMP_DIR}/out-pixi" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-pixi/exp-pixi-webgpu-2d/public/index.html"
assert_file "${TMP_DIR}/out-pixi/exp-pixi-webgpu-2d/public/app.js"
assert_contains "${TMP_DIR}/out-pixi/exp-pixi-webgpu-2d/public/index.html" "Pixi 2D Readiness"
assert_contains "${TMP_DIR}/out-pixi/exp-pixi-webgpu-2d/public/app.js" "pixi-webgpu-2d-readiness"
assert_contains "${TMP_DIR}/out-pixi/exp-pixi-webgpu-2d/README.md" "repo-scaffolds/repos/exp-pixi-webgpu-2d/"
node --check "${TMP_DIR}/out-pixi/exp-pixi-webgpu-2d/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-luma-webgpu-viz" \
  --output-root "${TMP_DIR}/out-luma" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-luma/exp-luma-webgpu-viz/public/index.html"
assert_file "${TMP_DIR}/out-luma/exp-luma-webgpu-viz/public/app.js"
assert_contains "${TMP_DIR}/out-luma/exp-luma-webgpu-viz/public/index.html" "Luma Viz Readiness"
assert_contains "${TMP_DIR}/out-luma/exp-luma-webgpu-viz/public/app.js" "luma-webgpu-viz-readiness"
assert_contains "${TMP_DIR}/out-luma/exp-luma-webgpu-viz/README.md" "repo-scaffolds/repos/exp-luma-webgpu-viz/"
node --check "${TMP_DIR}/out-luma/exp-luma-webgpu-viz/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-deckgl-webgpu-readiness" \
  --output-root "${TMP_DIR}/out-deckgl" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-deckgl/exp-deckgl-webgpu-readiness/public/index.html"
assert_file "${TMP_DIR}/out-deckgl/exp-deckgl-webgpu-readiness/public/app.js"
assert_contains "${TMP_DIR}/out-deckgl/exp-deckgl-webgpu-readiness/public/index.html" "Deck.gl Readiness"
assert_contains "${TMP_DIR}/out-deckgl/exp-deckgl-webgpu-readiness/public/app.js" "deckgl-webgpu-readiness"
assert_contains "${TMP_DIR}/out-deckgl/exp-deckgl-webgpu-readiness/README.md" "repo-scaffolds/repos/exp-deckgl-webgpu-readiness/"
node --check "${TMP_DIR}/out-deckgl/exp-deckgl-webgpu-readiness/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-blackhole-three-singularity" \
  --output-root "${TMP_DIR}/out-blackhole" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-blackhole/exp-blackhole-three-singularity/public/index.html"
assert_file "${TMP_DIR}/out-blackhole/exp-blackhole-three-singularity/public/app.js"
assert_contains "${TMP_DIR}/out-blackhole/exp-blackhole-three-singularity/public/index.html" "Blackhole Singularity Readiness"
assert_contains "${TMP_DIR}/out-blackhole/exp-blackhole-three-singularity/public/app.js" "blackhole-three-singularity-readiness"
assert_contains "${TMP_DIR}/out-blackhole/exp-blackhole-three-singularity/README.md" "repo-scaffolds/repos/exp-blackhole-three-singularity/"
node --check "${TMP_DIR}/out-blackhole/exp-blackhole-three-singularity/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-blackhole-kerr-engine" \
  --output-root "${TMP_DIR}/out-kerr" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-kerr/exp-blackhole-kerr-engine/public/index.html"
assert_file "${TMP_DIR}/out-kerr/exp-blackhole-kerr-engine/public/app.js"
assert_contains "${TMP_DIR}/out-kerr/exp-blackhole-kerr-engine/public/index.html" "Kerr Engine Readiness"
assert_contains "${TMP_DIR}/out-kerr/exp-blackhole-kerr-engine/public/app.js" "blackhole-kerr-engine-readiness"
assert_contains "${TMP_DIR}/out-kerr/exp-blackhole-kerr-engine/README.md" "repo-scaffolds/repos/exp-blackhole-kerr-engine/"
node --check "${TMP_DIR}/out-kerr/exp-blackhole-kerr-engine/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-blackhole-webgpu-fromscratch" \
  --output-root "${TMP_DIR}/out-raw-blackhole" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-raw-blackhole/exp-blackhole-webgpu-fromscratch/public/index.html"
assert_file "${TMP_DIR}/out-raw-blackhole/exp-blackhole-webgpu-fromscratch/public/app.js"
assert_contains "${TMP_DIR}/out-raw-blackhole/exp-blackhole-webgpu-fromscratch/public/index.html" "Raw WebGPU Blackhole Readiness"
assert_contains "${TMP_DIR}/out-raw-blackhole/exp-blackhole-webgpu-fromscratch/public/app.js" "blackhole-webgpu-fromscratch-readiness"
assert_contains "${TMP_DIR}/out-raw-blackhole/exp-blackhole-webgpu-fromscratch/README.md" "repo-scaffolds/repos/exp-blackhole-webgpu-fromscratch/"
node --check "${TMP_DIR}/out-raw-blackhole/exp-blackhole-webgpu-fromscratch/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-nbody-webgpu-core" \
  --output-root "${TMP_DIR}/out-nbody" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-nbody/exp-nbody-webgpu-core/public/index.html"
assert_file "${TMP_DIR}/out-nbody/exp-nbody-webgpu-core/public/app.js"
assert_contains "${TMP_DIR}/out-nbody/exp-nbody-webgpu-core/public/index.html" "N-Body Compute Readiness"
assert_contains "${TMP_DIR}/out-nbody/exp-nbody-webgpu-core/public/app.js" "nbody-webgpu-core-readiness"
assert_contains "${TMP_DIR}/out-nbody/exp-nbody-webgpu-core/README.md" "repo-scaffolds/repos/exp-nbody-webgpu-core/"
node --check "${TMP_DIR}/out-nbody/exp-nbody-webgpu-core/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-fluid-webgpu-core" \
  --output-root "${TMP_DIR}/out-fluid" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-fluid/exp-fluid-webgpu-core/public/index.html"
assert_file "${TMP_DIR}/out-fluid/exp-fluid-webgpu-core/public/app.js"
assert_contains "${TMP_DIR}/out-fluid/exp-fluid-webgpu-core/public/index.html" "Fluid Compute Readiness"
assert_contains "${TMP_DIR}/out-fluid/exp-fluid-webgpu-core/public/app.js" "fluid-webgpu-core-readiness"
assert_contains "${TMP_DIR}/out-fluid/exp-fluid-webgpu-core/README.md" "repo-scaffolds/repos/exp-fluid-webgpu-core/"
node --check "${TMP_DIR}/out-fluid/exp-fluid-webgpu-core/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-three-webgpu-particles-stress" \
  --output-root "${TMP_DIR}/out-particles" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-particles/exp-three-webgpu-particles-stress/public/index.html"
assert_file "${TMP_DIR}/out-particles/exp-three-webgpu-particles-stress/public/app.js"
assert_contains "${TMP_DIR}/out-particles/exp-three-webgpu-particles-stress/public/index.html" "Three Particles Stress Readiness"
assert_contains "${TMP_DIR}/out-particles/exp-three-webgpu-particles-stress/public/app.js" "three-webgpu-particles-stress-readiness"
assert_contains "${TMP_DIR}/out-particles/exp-three-webgpu-particles-stress/README.md" "repo-scaffolds/repos/exp-three-webgpu-particles-stress/"
node --check "${TMP_DIR}/out-particles/exp-three-webgpu-particles-stress/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "bench-compute-stress-suite" \
  --output-root "${TMP_DIR}/out-compute-suite" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-compute-suite/bench-compute-stress-suite/public/index.html"
assert_file "${TMP_DIR}/out-compute-suite/bench-compute-stress-suite/public/app.js"
assert_file "${TMP_DIR}/out-compute-suite/bench-compute-stress-suite/public/compute-stress-profiles.json"
assert_contains "${TMP_DIR}/out-compute-suite/bench-compute-stress-suite/public/index.html" "Compute Stress Suite Benchmark"
assert_contains "${TMP_DIR}/out-compute-suite/bench-compute-stress-suite/public/app.js" "compute-stress-suite-benchmark"
assert_contains "${TMP_DIR}/out-compute-suite/bench-compute-stress-suite/README.md" "repo-scaffolds/repos/bench-compute-stress-suite/"
node --check "${TMP_DIR}/out-compute-suite/bench-compute-stress-suite/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "bench-atomics-and-memory" \
  --output-root "${TMP_DIR}/out-atomics-memory" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-atomics-memory/bench-atomics-and-memory/public/index.html"
assert_file "${TMP_DIR}/out-atomics-memory/bench-atomics-and-memory/public/app.js"
assert_file "${TMP_DIR}/out-atomics-memory/bench-atomics-and-memory/public/atomics-memory-profiles.json"
assert_contains "${TMP_DIR}/out-atomics-memory/bench-atomics-and-memory/public/index.html" "Atomics and Memory Benchmark"
assert_contains "${TMP_DIR}/out-atomics-memory/bench-atomics-and-memory/public/app.js" "atomics-and-memory-benchmark"
assert_contains "${TMP_DIR}/out-atomics-memory/bench-atomics-and-memory/README.md" "repo-scaffolds/repos/bench-atomics-and-memory/"
node --check "${TMP_DIR}/out-atomics-memory/bench-atomics-and-memory/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "bench-texture-upload-and-streaming" \
  --output-root "${TMP_DIR}/out-texture-stream" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-texture-stream/bench-texture-upload-and-streaming/public/index.html"
assert_file "${TMP_DIR}/out-texture-stream/bench-texture-upload-and-streaming/public/app.js"
assert_file "${TMP_DIR}/out-texture-stream/bench-texture-upload-and-streaming/public/texture-upload-profiles.json"
assert_contains "${TMP_DIR}/out-texture-stream/bench-texture-upload-and-streaming/public/index.html" "Texture Upload and Streaming Benchmark"
assert_contains "${TMP_DIR}/out-texture-stream/bench-texture-upload-and-streaming/public/app.js" "texture-upload-and-streaming-benchmark"
assert_contains "${TMP_DIR}/out-texture-stream/bench-texture-upload-and-streaming/README.md" "repo-scaffolds/repos/bench-texture-upload-and-streaming/"
node --check "${TMP_DIR}/out-texture-stream/bench-texture-upload-and-streaming/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-embeddings-browser-throughput" \
  --output-root "${TMP_DIR}/out-embeddings" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-embeddings/exp-embeddings-browser-throughput/public/index.html"
assert_file "${TMP_DIR}/out-embeddings/exp-embeddings-browser-throughput/public/app.js"
assert_file "${TMP_DIR}/out-embeddings/exp-embeddings-browser-throughput/public/docs-fixture.json"
assert_contains "${TMP_DIR}/out-embeddings/exp-embeddings-browser-throughput/public/index.html" "Embeddings Throughput Harness"
assert_contains "${TMP_DIR}/out-embeddings/exp-embeddings-browser-throughput/public/app.js" "synthetic-embedding-throughput"
assert_contains "${TMP_DIR}/out-embeddings/exp-embeddings-browser-throughput/README.md" "repo-scaffolds/p0/exp-embeddings-browser-throughput/"
node --check "${TMP_DIR}/out-embeddings/exp-embeddings-browser-throughput/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-llm-chat-runtime-shootout" \
  --output-root "${TMP_DIR}/out-llm-shootout" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-llm-shootout/exp-llm-chat-runtime-shootout/public/index.html"
assert_file "${TMP_DIR}/out-llm-shootout/exp-llm-chat-runtime-shootout/public/app.js"
assert_file "${TMP_DIR}/out-llm-shootout/exp-llm-chat-runtime-shootout/public/runtime-profiles.json"
assert_contains "${TMP_DIR}/out-llm-shootout/exp-llm-chat-runtime-shootout/public/index.html" "LLM Chat Runtime Readiness"
assert_contains "${TMP_DIR}/out-llm-shootout/exp-llm-chat-runtime-shootout/public/app.js" "runtime-readiness-chat"
assert_contains "${TMP_DIR}/out-llm-shootout/exp-llm-chat-runtime-shootout/README.md" "repo-scaffolds/p0/exp-llm-chat-runtime-shootout/"
node --check "${TMP_DIR}/out-llm-shootout/exp-llm-chat-runtime-shootout/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-stt-whisper-webgpu" \
  --output-root "${TMP_DIR}/out-stt" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-stt/exp-stt-whisper-webgpu/public/index.html"
assert_file "${TMP_DIR}/out-stt/exp-stt-whisper-webgpu/public/app.js"
assert_file "${TMP_DIR}/out-stt/exp-stt-whisper-webgpu/public/transcript-fixture.json"
assert_contains "${TMP_DIR}/out-stt/exp-stt-whisper-webgpu/public/index.html" "File Transcription Readiness"
assert_contains "${TMP_DIR}/out-stt/exp-stt-whisper-webgpu/public/app.js" "file-transcription-readiness"
assert_contains "${TMP_DIR}/out-stt/exp-stt-whisper-webgpu/README.md" "repo-scaffolds/p0/exp-stt-whisper-webgpu/"
node --check "${TMP_DIR}/out-stt/exp-stt-whisper-webgpu/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-voice-assistant-local" \
  --output-root "${TMP_DIR}/out-voice-assistant" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-voice-assistant/exp-voice-assistant-local/public/index.html"
assert_file "${TMP_DIR}/out-voice-assistant/exp-voice-assistant-local/public/app.js"
assert_file "${TMP_DIR}/out-voice-assistant/exp-voice-assistant-local/public/voice-fixture.json"
assert_contains "${TMP_DIR}/out-voice-assistant/exp-voice-assistant-local/public/index.html" "Voice Assistant Local Readiness"
assert_contains "${TMP_DIR}/out-voice-assistant/exp-voice-assistant-local/public/app.js" "voice-assistant-local-readiness"
assert_contains "${TMP_DIR}/out-voice-assistant/exp-voice-assistant-local/README.md" "repo-scaffolds/repos/exp-voice-assistant-local/"
node --check "${TMP_DIR}/out-voice-assistant/exp-voice-assistant-local/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-vlm-browser-multimodal" \
  --output-root "${TMP_DIR}/out-vlm" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-vlm/exp-vlm-browser-multimodal/public/index.html"
assert_file "${TMP_DIR}/out-vlm/exp-vlm-browser-multimodal/public/app.js"
assert_file "${TMP_DIR}/out-vlm/exp-vlm-browser-multimodal/public/multimodal-fixture.json"
assert_file "${TMP_DIR}/out-vlm/exp-vlm-browser-multimodal/public/scene-fixture.svg"
assert_contains "${TMP_DIR}/out-vlm/exp-vlm-browser-multimodal/public/index.html" "Browser VLM Multimodal Readiness"
assert_contains "${TMP_DIR}/out-vlm/exp-vlm-browser-multimodal/public/app.js" "vlm-browser-multimodal-readiness"
assert_contains "${TMP_DIR}/out-vlm/exp-vlm-browser-multimodal/README.md" "repo-scaffolds/repos/exp-vlm-browser-multimodal/"
node --check "${TMP_DIR}/out-vlm/exp-vlm-browser-multimodal/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-diffusion-webgpu-browser" \
  --output-root "${TMP_DIR}/out-diffusion" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-diffusion/exp-diffusion-webgpu-browser/public/index.html"
assert_file "${TMP_DIR}/out-diffusion/exp-diffusion-webgpu-browser/public/app.js"
assert_file "${TMP_DIR}/out-diffusion/exp-diffusion-webgpu-browser/public/diffusion-fixture.json"
assert_contains "${TMP_DIR}/out-diffusion/exp-diffusion-webgpu-browser/public/index.html" "Diffusion Browser Readiness"
assert_contains "${TMP_DIR}/out-diffusion/exp-diffusion-webgpu-browser/public/app.js" "diffusion-webgpu-browser-readiness"
assert_contains "${TMP_DIR}/out-diffusion/exp-diffusion-webgpu-browser/README.md" "repo-scaffolds/repos/exp-diffusion-webgpu-browser/"
node --check "${TMP_DIR}/out-diffusion/exp-diffusion-webgpu-browser/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-browser-agent-local" \
  --output-root "${TMP_DIR}/out-agent" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-agent/exp-browser-agent-local/public/index.html"
assert_file "${TMP_DIR}/out-agent/exp-browser-agent-local/public/app.js"
assert_file "${TMP_DIR}/out-agent/exp-browser-agent-local/public/agent-fixture.json"
assert_contains "${TMP_DIR}/out-agent/exp-browser-agent-local/public/index.html" "Browser Agent Local Readiness"
assert_contains "${TMP_DIR}/out-agent/exp-browser-agent-local/public/app.js" "browser-agent-local-readiness"
assert_contains "${TMP_DIR}/out-agent/exp-browser-agent-local/README.md" "repo-scaffolds/repos/exp-browser-agent-local/"
node --check "${TMP_DIR}/out-agent/exp-browser-agent-local/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-rag-browser-pipeline" \
  --output-root "${TMP_DIR}/out-rag" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-rag/exp-rag-browser-pipeline/public/index.html"
assert_file "${TMP_DIR}/out-rag/exp-rag-browser-pipeline/public/app.js"
assert_file "${TMP_DIR}/out-rag/exp-rag-browser-pipeline/public/rag-fixture.json"
assert_contains "${TMP_DIR}/out-rag/exp-rag-browser-pipeline/public/index.html" "Browser RAG Pipeline Harness"
assert_contains "${TMP_DIR}/out-rag/exp-rag-browser-pipeline/public/app.js" "browser-rag-fixture"
assert_contains "${TMP_DIR}/out-rag/exp-rag-browser-pipeline/README.md" "repo-scaffolds/p0/exp-rag-browser-pipeline/"
node --check "${TMP_DIR}/out-rag/exp-rag-browser-pipeline/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-reranker-browser" \
  --output-root "${TMP_DIR}/out-reranker" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-reranker/exp-reranker-browser/public/index.html"
assert_file "${TMP_DIR}/out-reranker/exp-reranker-browser/public/app.js"
assert_contains "${TMP_DIR}/out-reranker/exp-reranker-browser/public/index.html" "Browser Reranker Readiness"
assert_contains "${TMP_DIR}/out-reranker/exp-reranker-browser/public/app.js" "browser-reranker-readiness"
assert_contains "${TMP_DIR}/out-reranker/exp-reranker-browser/README.md" "repo-scaffolds/repos/exp-reranker-browser/"
node --check "${TMP_DIR}/out-reranker/exp-reranker-browser/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "bench-embeddings-latency-quality" \
  --output-root "${TMP_DIR}/out-embeddings-bench" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-embeddings-bench/bench-embeddings-latency-quality/public/index.html"
assert_file "${TMP_DIR}/out-embeddings-bench/bench-embeddings-latency-quality/public/app.js"
assert_contains "${TMP_DIR}/out-embeddings-bench/bench-embeddings-latency-quality/public/index.html" "Embeddings Latency Quality Benchmark"
assert_contains "${TMP_DIR}/out-embeddings-bench/bench-embeddings-latency-quality/public/app.js" "embeddings-latency-quality-benchmark"
assert_contains "${TMP_DIR}/out-embeddings-bench/bench-embeddings-latency-quality/README.md" "repo-scaffolds/repos/bench-embeddings-latency-quality/"
node --check "${TMP_DIR}/out-embeddings-bench/bench-embeddings-latency-quality/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "bench-reranker-latency" \
  --output-root "${TMP_DIR}/out-reranker-bench" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-reranker-bench/bench-reranker-latency/public/index.html"
assert_file "${TMP_DIR}/out-reranker-bench/bench-reranker-latency/public/app.js"
assert_contains "${TMP_DIR}/out-reranker-bench/bench-reranker-latency/public/index.html" "Browser Reranker Latency Benchmark"
assert_contains "${TMP_DIR}/out-reranker-bench/bench-reranker-latency/public/app.js" "reranker-latency-benchmark"
assert_contains "${TMP_DIR}/out-reranker-bench/bench-reranker-latency/README.md" "repo-scaffolds/repos/bench-reranker-latency/"
node --check "${TMP_DIR}/out-reranker-bench/bench-reranker-latency/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "bench-rag-endtoend" \
  --output-root "${TMP_DIR}/out-rag-bench" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-rag-bench/bench-rag-endtoend/public/index.html"
assert_file "${TMP_DIR}/out-rag-bench/bench-rag-endtoend/public/app.js"
assert_contains "${TMP_DIR}/out-rag-bench/bench-rag-endtoend/public/index.html" "Browser RAG End-to-End Benchmark"
assert_contains "${TMP_DIR}/out-rag-bench/bench-rag-endtoend/public/app.js" "rag-endtoend-benchmark"
assert_contains "${TMP_DIR}/out-rag-bench/bench-rag-endtoend/README.md" "repo-scaffolds/repos/bench-rag-endtoend/"
node --check "${TMP_DIR}/out-rag-bench/bench-rag-endtoend/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "bench-llm-prefill-decode" \
  --output-root "${TMP_DIR}/out-llm-prefill" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-llm-prefill/bench-llm-prefill-decode/public/index.html"
assert_file "${TMP_DIR}/out-llm-prefill/bench-llm-prefill-decode/public/app.js"
assert_contains "${TMP_DIR}/out-llm-prefill/bench-llm-prefill-decode/public/index.html" "LLM Prefill Decode Benchmark"
assert_contains "${TMP_DIR}/out-llm-prefill/bench-llm-prefill-decode/public/app.js" "llm-prefill-decode-benchmark"
assert_contains "${TMP_DIR}/out-llm-prefill/bench-llm-prefill-decode/README.md" "repo-scaffolds/repos/bench-llm-prefill-decode/"
node --check "${TMP_DIR}/out-llm-prefill/bench-llm-prefill-decode/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "bench-stt-streaming-latency" \
  --output-root "${TMP_DIR}/out-stt-bench" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-stt-bench/bench-stt-streaming-latency/public/index.html"
assert_file "${TMP_DIR}/out-stt-bench/bench-stt-streaming-latency/public/app.js"
assert_contains "${TMP_DIR}/out-stt-bench/bench-stt-streaming-latency/public/index.html" "STT Streaming Latency Benchmark"
assert_contains "${TMP_DIR}/out-stt-bench/bench-stt-streaming-latency/public/app.js" "stt-streaming-latency-benchmark"
assert_contains "${TMP_DIR}/out-stt-bench/bench-stt-streaming-latency/README.md" "repo-scaffolds/repos/bench-stt-streaming-latency/"
node --check "${TMP_DIR}/out-stt-bench/bench-stt-streaming-latency/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "bench-voice-roundtrip" \
  --output-root "${TMP_DIR}/out-voice-bench" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-voice-bench/bench-voice-roundtrip/public/index.html"
assert_file "${TMP_DIR}/out-voice-bench/bench-voice-roundtrip/public/app.js"
assert_file "${TMP_DIR}/out-voice-bench/bench-voice-roundtrip/public/voice-benchmark-fixture.json"
assert_contains "${TMP_DIR}/out-voice-bench/bench-voice-roundtrip/public/index.html" "Voice Roundtrip Benchmark"
assert_contains "${TMP_DIR}/out-voice-bench/bench-voice-roundtrip/public/app.js" "voice-roundtrip-benchmark"
assert_contains "${TMP_DIR}/out-voice-bench/bench-voice-roundtrip/README.md" "repo-scaffolds/repos/bench-voice-roundtrip/"
node --check "${TMP_DIR}/out-voice-bench/bench-voice-roundtrip/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "bench-multimodal-latency" \
  --output-root "${TMP_DIR}/out-multimodal-bench" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-multimodal-bench/bench-multimodal-latency/public/index.html"
assert_file "${TMP_DIR}/out-multimodal-bench/bench-multimodal-latency/public/app.js"
assert_file "${TMP_DIR}/out-multimodal-bench/bench-multimodal-latency/public/multimodal-benchmark-fixture.json"
assert_file "${TMP_DIR}/out-multimodal-bench/bench-multimodal-latency/public/scene-fixture.svg"
assert_contains "${TMP_DIR}/out-multimodal-bench/bench-multimodal-latency/public/index.html" "Multimodal Latency Benchmark"
assert_contains "${TMP_DIR}/out-multimodal-bench/bench-multimodal-latency/public/app.js" "multimodal-latency-benchmark"
assert_contains "${TMP_DIR}/out-multimodal-bench/bench-multimodal-latency/README.md" "repo-scaffolds/repos/bench-multimodal-latency/"
node --check "${TMP_DIR}/out-multimodal-bench/bench-multimodal-latency/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "bench-diffusion-browser-shootout" \
  --output-root "${TMP_DIR}/out-diffusion-bench" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-diffusion-bench/bench-diffusion-browser-shootout/public/index.html"
assert_file "${TMP_DIR}/out-diffusion-bench/bench-diffusion-browser-shootout/public/app.js"
assert_file "${TMP_DIR}/out-diffusion-bench/bench-diffusion-browser-shootout/public/diffusion-benchmark-fixture.json"
assert_contains "${TMP_DIR}/out-diffusion-bench/bench-diffusion-browser-shootout/public/index.html" "Diffusion Browser Shootout"
assert_contains "${TMP_DIR}/out-diffusion-bench/bench-diffusion-browser-shootout/public/app.js" "diffusion-browser-shootout-benchmark"
assert_contains "${TMP_DIR}/out-diffusion-bench/bench-diffusion-browser-shootout/README.md" "repo-scaffolds/repos/bench-diffusion-browser-shootout/"
node --check "${TMP_DIR}/out-diffusion-bench/bench-diffusion-browser-shootout/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "bench-agent-step-latency" \
  --output-root "${TMP_DIR}/out-agent-bench" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-agent-bench/bench-agent-step-latency/public/index.html"
assert_file "${TMP_DIR}/out-agent-bench/bench-agent-step-latency/public/app.js"
assert_file "${TMP_DIR}/out-agent-bench/bench-agent-step-latency/public/agent-benchmark-fixture.json"
assert_contains "${TMP_DIR}/out-agent-bench/bench-agent-step-latency/public/index.html" "Agent Step Latency Benchmark"
assert_contains "${TMP_DIR}/out-agent-bench/bench-agent-step-latency/public/app.js" "agent-step-latency-benchmark"
assert_contains "${TMP_DIR}/out-agent-bench/bench-agent-step-latency/README.md" "repo-scaffolds/repos/bench-agent-step-latency/"
node --check "${TMP_DIR}/out-agent-bench/bench-agent-step-latency/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "bench-webgpu-vs-wasm-parity" \
  --output-root "${TMP_DIR}/out-parity" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-parity/bench-webgpu-vs-wasm-parity/public/index.html"
assert_file "${TMP_DIR}/out-parity/bench-webgpu-vs-wasm-parity/public/app.js"
assert_contains "${TMP_DIR}/out-parity/bench-webgpu-vs-wasm-parity/public/index.html" "WebGPU Wasm Parity Benchmark"
assert_contains "${TMP_DIR}/out-parity/bench-webgpu-vs-wasm-parity/public/app.js" "webgpu-wasm-parity-benchmark"
assert_contains "${TMP_DIR}/out-parity/bench-webgpu-vs-wasm-parity/README.md" "repo-scaffolds/repos/bench-webgpu-vs-wasm-parity/"
node --check "${TMP_DIR}/out-parity/bench-webgpu-vs-wasm-parity/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "bench-blackhole-render-shootout" \
  --output-root "${TMP_DIR}/out-blackhole-bench" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-blackhole-bench/bench-blackhole-render-shootout/public/index.html"
assert_file "${TMP_DIR}/out-blackhole-bench/bench-blackhole-render-shootout/public/app.js"
assert_contains "${TMP_DIR}/out-blackhole-bench/bench-blackhole-render-shootout/public/index.html" "Blackhole Render Shootout"
assert_contains "${TMP_DIR}/out-blackhole-bench/bench-blackhole-render-shootout/public/app.js" "blackhole-render-shootout-benchmark"
assert_contains "${TMP_DIR}/out-blackhole-bench/bench-blackhole-render-shootout/README.md" "repo-scaffolds/repos/bench-blackhole-render-shootout/"
node --check "${TMP_DIR}/out-blackhole-bench/bench-blackhole-render-shootout/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "bench-renderer-shootout" \
  --output-root "${TMP_DIR}/out-renderer-bench" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-renderer-bench/bench-renderer-shootout/public/index.html"
assert_file "${TMP_DIR}/out-renderer-bench/bench-renderer-shootout/public/app.js"
assert_contains "${TMP_DIR}/out-renderer-bench/bench-renderer-shootout/public/index.html" "Renderer Shootout"
assert_contains "${TMP_DIR}/out-renderer-bench/bench-renderer-shootout/public/app.js" "renderer-shootout-benchmark"
assert_contains "${TMP_DIR}/out-renderer-bench/bench-renderer-shootout/README.md" "repo-scaffolds/repos/bench-renderer-shootout/"
node --check "${TMP_DIR}/out-renderer-bench/bench-renderer-shootout/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-ort-webgpu-baseline" \
  --output-root "${TMP_DIR}/out-ort" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-ort/exp-ort-webgpu-baseline/public/index.html"
assert_file "${TMP_DIR}/out-ort/exp-ort-webgpu-baseline/public/app.js"
assert_contains "${TMP_DIR}/out-ort/exp-ort-webgpu-baseline/public/index.html" "ORT WebGPU Readiness"
assert_contains "${TMP_DIR}/out-ort/exp-ort-webgpu-baseline/public/app.js" "ort-webgpu-baseline"
assert_contains "${TMP_DIR}/out-ort/exp-ort-webgpu-baseline/README.md" "repo-scaffolds/repos/exp-ort-webgpu-baseline/"
node --check "${TMP_DIR}/out-ort/exp-ort-webgpu-baseline/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-webllm-browser-chat" \
  --output-root "${TMP_DIR}/out-webllm" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-webllm/exp-webllm-browser-chat/public/index.html"
assert_file "${TMP_DIR}/out-webllm/exp-webllm-browser-chat/public/app.js"
assert_contains "${TMP_DIR}/out-webllm/exp-webllm-browser-chat/public/index.html" "WebLLM Browser Chat Readiness"
assert_contains "${TMP_DIR}/out-webllm/exp-webllm-browser-chat/public/app.js" "webllm-browser-chat-readiness"
assert_contains "${TMP_DIR}/out-webllm/exp-webllm-browser-chat/README.md" "repo-scaffolds/repos/exp-webllm-browser-chat/"
node --check "${TMP_DIR}/out-webllm/exp-webllm-browser-chat/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "exp-llm-worker-ux" \
  --output-root "${TMP_DIR}/out-llm-worker" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-llm-worker/exp-llm-worker-ux/public/index.html"
assert_file "${TMP_DIR}/out-llm-worker/exp-llm-worker-ux/public/app.js"
assert_file "${TMP_DIR}/out-llm-worker/exp-llm-worker-ux/public/llm-worker.js"
assert_contains "${TMP_DIR}/out-llm-worker/exp-llm-worker-ux/public/index.html" "LLM Worker UX Readiness"
assert_contains "${TMP_DIR}/out-llm-worker/exp-llm-worker-ux/public/app.js" "llm-worker-ux"
assert_contains "${TMP_DIR}/out-llm-worker/exp-llm-worker-ux/README.md" "repo-scaffolds/repos/exp-llm-worker-ux/"
node --check "${TMP_DIR}/out-llm-worker/exp-llm-worker-ux/public/app.js"
node --check "${TMP_DIR}/out-llm-worker/exp-llm-worker-ux/public/llm-worker.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "bench-runtime-shootout" \
  --output-root "${TMP_DIR}/out-runtime-bench" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-runtime-bench/bench-runtime-shootout/public/index.html"
assert_file "${TMP_DIR}/out-runtime-bench/bench-runtime-shootout/public/app.js"
assert_file "${TMP_DIR}/out-runtime-bench/bench-runtime-shootout/public/runtime-benchmark-profiles.json"
assert_contains "${TMP_DIR}/out-runtime-bench/bench-runtime-shootout/public/index.html" "Fixed Scenario Runtime Shootout"
assert_contains "${TMP_DIR}/out-runtime-bench/bench-runtime-shootout/public/app.js" "fixed-runtime-shootout"
assert_contains "${TMP_DIR}/out-runtime-bench/bench-runtime-shootout/README.md" "repo-scaffolds/p0/bench-runtime-shootout/"
node --check "${TMP_DIR}/out-runtime-bench/bench-runtime-shootout/public/app.js"

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

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "app-private-rag-lab" \
  --output-root "${TMP_DIR}/out-private-rag" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-private-rag/app-private-rag-lab/public/index.html"
assert_file "${TMP_DIR}/out-private-rag/app-private-rag-lab/public/app.js"
assert_contains "${TMP_DIR}/out-private-rag/app-private-rag-lab/public/index.html" "Private RAG Lab Demo"
assert_contains "${TMP_DIR}/out-private-rag/app-private-rag-lab/public/app.js" "private-rag-lab-demo"
assert_contains "${TMP_DIR}/out-private-rag/app-private-rag-lab/README.md" "repo-scaffolds/repos/app-private-rag-lab/"
node --check "${TMP_DIR}/out-private-rag/app-private-rag-lab/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "app-voice-agent-lab" \
  --output-root "${TMP_DIR}/out-voice-agent" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-voice-agent/app-voice-agent-lab/public/index.html"
assert_file "${TMP_DIR}/out-voice-agent/app-voice-agent-lab/public/app.js"
assert_file "${TMP_DIR}/out-voice-agent/app-voice-agent-lab/public/voice-agent-fixture.json"
assert_contains "${TMP_DIR}/out-voice-agent/app-voice-agent-lab/public/index.html" "Voice Agent Lab Demo"
assert_contains "${TMP_DIR}/out-voice-agent/app-voice-agent-lab/public/app.js" "voice-agent-lab-demo"
assert_contains "${TMP_DIR}/out-voice-agent/app-voice-agent-lab/README.md" "repo-scaffolds/repos/app-voice-agent-lab/"
node --check "${TMP_DIR}/out-voice-agent/app-voice-agent-lab/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "app-browser-image-lab" \
  --output-root "${TMP_DIR}/out-image-lab" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-image-lab/app-browser-image-lab/public/index.html"
assert_file "${TMP_DIR}/out-image-lab/app-browser-image-lab/public/app.js"
assert_file "${TMP_DIR}/out-image-lab/app-browser-image-lab/public/browser-image-fixture.json"
assert_file "${TMP_DIR}/out-image-lab/app-browser-image-lab/public/scene-fixture.svg"
assert_contains "${TMP_DIR}/out-image-lab/app-browser-image-lab/public/index.html" "Browser Image Lab Demo"
assert_contains "${TMP_DIR}/out-image-lab/app-browser-image-lab/public/app.js" "browser-image-lab-demo"
assert_contains "${TMP_DIR}/out-image-lab/app-browser-image-lab/README.md" "repo-scaffolds/repos/app-browser-image-lab/"
node --check "${TMP_DIR}/out-image-lab/app-browser-image-lab/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "app-blackhole-observatory" \
  --output-root "${TMP_DIR}/out-blackhole-app" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-blackhole-app/app-blackhole-observatory/public/index.html"
assert_file "${TMP_DIR}/out-blackhole-app/app-blackhole-observatory/public/app.js"
assert_file "${TMP_DIR}/out-blackhole-app/app-blackhole-observatory/public/blackhole-observatory-fixture.json"
assert_contains "${TMP_DIR}/out-blackhole-app/app-blackhole-observatory/public/index.html" "Blackhole Observatory Demo"
assert_contains "${TMP_DIR}/out-blackhole-app/app-blackhole-observatory/public/app.js" "blackhole-observatory-demo"
assert_contains "${TMP_DIR}/out-blackhole-app/app-blackhole-observatory/README.md" "repo-scaffolds/repos/app-blackhole-observatory/"
node --check "${TMP_DIR}/out-blackhole-app/app-blackhole-observatory/public/app.js"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/docs/repo-inventory.csv" \
  --repo "app-local-chat-arena" \
  --output-root "${TMP_DIR}/out-arena" \
  --no-sync \
  --refresh-generated \
  --refresh-readme

assert_file "${TMP_DIR}/out-arena/app-local-chat-arena/public/index.html"
assert_file "${TMP_DIR}/out-arena/app-local-chat-arena/public/app.js"
assert_contains "${TMP_DIR}/out-arena/app-local-chat-arena/public/index.html" "Local Chat Arena Demo"
assert_contains "${TMP_DIR}/out-arena/app-local-chat-arena/public/app.js" "local-chat-arena-demo"
assert_contains "${TMP_DIR}/out-arena/app-local-chat-arena/README.md" "repo-scaffolds/repos/app-local-chat-arena/"
node --check "${TMP_DIR}/out-arena/app-local-chat-arena/public/app.js"

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
assert_contains "${TMP_DIR}/out/bench-runtime-shootout/public/index.html" "Fixed Scenario Runtime Shootout"
assert_contains "${TMP_DIR}/out/bench-runtime-shootout/public/app.js" "fixed-runtime-shootout"
assert_contains "${TMP_DIR}/out/bench-runtime-shootout/.github/workflows/deploy-pages.yml" "actions/configure-pages@v6"
assert_contains "${TMP_DIR}/out/bench-runtime-shootout/.github/workflows/deploy-pages.yml" "actions/upload-pages-artifact@v5"
assert_contains "${TMP_DIR}/out/bench-runtime-shootout/.github/workflows/deploy-pages.yml" "actions/deploy-pages@v5"
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
printf 'legacy workflow\n' > "${TMP_DIR}/out/bench-runtime-shootout/.github/workflows/deploy-pages.yml"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/tests/fixtures/repo-inventory-sample.csv" \
  --output-root "${TMP_DIR}/out" \
  --no-sync

assert_contains "${TMP_DIR}/out/bench-runtime-shootout/README.md" "sentinel"
assert_contains "${TMP_DIR}/out/bench-runtime-shootout/public/index.html" "legacy"
assert_contains "${TMP_DIR}/out/bench-runtime-shootout/.github/workflows/deploy-pages.yml" "legacy workflow"

bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
  --mode local \
  --inventory "${REPO_ROOT}/tests/fixtures/repo-inventory-sample.csv" \
  --output-root "${TMP_DIR}/out" \
  --no-sync \
  --refresh-pages-workflow

assert_contains "${TMP_DIR}/out/bench-runtime-shootout/README.md" "sentinel"
assert_contains "${TMP_DIR}/out/bench-runtime-shootout/public/index.html" "legacy"
assert_contains "${TMP_DIR}/out/bench-runtime-shootout/.github/workflows/deploy-pages.yml" "actions/upload-pages-artifact@v5"

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
assert_contains "${TMP_DIR}/out/bench-runtime-shootout/public/index.html" "Fixed Scenario Runtime Shootout"
assert_contains "${TMP_DIR}/out/bench-runtime-shootout/public/app.js" "runBenchmark"

echo "bootstrap-org-repos local mode test passed"
