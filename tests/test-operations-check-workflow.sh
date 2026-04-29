#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
WORKFLOW="${REPO_ROOT}/.github/workflows/operations-check.yml"

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

[[ -f "${WORKFLOW}" ]] || fail "missing operations workflow"

assert_contains "${WORKFLOW}" "name: Operations Status Check"
assert_contains "${WORKFLOW}" "workflow_dispatch:"
assert_contains "${WORKFLOW}" "run_fast_suite:"
assert_contains "${WORKFLOW}" "apply_project_fields:"
assert_contains "${WORKFLOW}" "AI_WEBGPU_LAB_ADMIN_TOKEN"
assert_contains "${WORKFLOW}" "gh project view 1 --owner ai-webgpu-lab --format json"
assert_contains "${WORKFLOW}" "node scripts/check-org-pages.mjs --fail-on-error"
assert_contains "${WORKFLOW}" "node scripts/check-org-readmes.mjs --fail-on-error"
assert_contains "${WORKFLOW}" "node scripts/check-org-workflows.mjs --fail-on-error"
assert_contains "${WORKFLOW}" "node scripts/sync-project-fields.mjs --dry-run"
assert_contains "${WORKFLOW}" "node scripts/check-project-status.mjs --fail-on-error --require-seeded-issues --require-project-items --require-project-fields"
assert_contains "${WORKFLOW}" "bash tests/run-all.sh --mode fast --quiet"
assert_contains "${WORKFLOW}" "actions/setup-node@v6"
assert_contains "${WORKFLOW}" "actions/upload-artifact@v7"
assert_contains "${WORKFLOW}" "docs/PAGES-STATUS.md"
assert_contains "${WORKFLOW}" "docs/PROJECT-STATUS.md"

echo "operations-check-workflow test passed"
