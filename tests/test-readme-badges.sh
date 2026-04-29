#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
README="${REPO_ROOT}/README.md"

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

assert_contains "${README}" "[![CI](https://github.com/ai-webgpu-lab/docs-lab-roadmap/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ai-webgpu-lab/docs-lab-roadmap/actions/workflows/ci.yml)"
assert_contains "${README}" "[![Deploy GitHub Pages Demo](https://github.com/ai-webgpu-lab/docs-lab-roadmap/actions/workflows/deploy-pages.yml/badge.svg?branch=main)](https://github.com/ai-webgpu-lab/docs-lab-roadmap/actions/workflows/deploy-pages.yml)"
assert_contains "${README}" "[![Operations Status Check](https://github.com/ai-webgpu-lab/docs-lab-roadmap/actions/workflows/operations-check.yml/badge.svg?branch=main)](https://github.com/ai-webgpu-lab/docs-lab-roadmap/actions/workflows/operations-check.yml)"
assert_contains "${README}" 'docs/WORKFLOW-STATUS.md` — 자동 생성 dashboard (54 repo × Actions/deploy workflow + Operations workflow 상태)'

echo "readme-badges test passed"
