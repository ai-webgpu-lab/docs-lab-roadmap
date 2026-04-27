#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

fail() {
  echo "test failed: $1" >&2
  exit 1
}

assert_contains() {
  local content="$1"
  local pattern="$2"
  if ! grep -Fq -e "${pattern}" <<<"${content}"; then
    fail "missing pattern '${pattern}' in: ${content:0:300}..."
  fi
}

# 1. Healthy run: all 65 sketches conform to per-family contract
OUTPUT="$(node "${REPO_ROOT}/scripts/check-real-sketch-contract.mjs" 2>&1)"
assert_contains "${OUTPUT}" "scanned 65 sketches (expected 65)"
assert_contains "${OUTPUT}" "families: renderer=17, runtime=25, app-surface=5, benchmark=18, unknown=0"
assert_contains "${OUTPUT}" "per-sketch contract failures: 0"
assert_contains "${OUTPUT}" "family count mismatches: 0"
assert_contains "${OUTPUT}" "OK real-sketch contract"

# 2. Drift simulation: temporarily corrupt one sketch and verify the checker fails
TARGET="${REPO_ROOT}/repo-scaffolds/repos/exp-three-webgpu-core/public/real-renderer-sketch.js"
BACKUP="$(mktemp)"
trap 'cp "${BACKUP}" "${TARGET}"; rm -f "${BACKUP}"' EXIT

cp "${TARGET}" "${BACKUP}"
# Replace one canonical method name to simulate drift
sed -i 's/createRenderer/createRendererXXX/g' "${TARGET}"

if BAD_OUT="$(node "${REPO_ROOT}/scripts/check-real-sketch-contract.mjs" 2>&1)"; then
  cp "${BACKUP}" "${TARGET}"
  fail "checker should fail when canonical method is renamed"
fi
assert_contains "${BAD_OUT}" "missing canonical method createRenderer"

# Restore for clean exit (trap also restores, but be explicit)
cp "${BACKUP}" "${TARGET}"

echo "real-sketch-contract test passed"
