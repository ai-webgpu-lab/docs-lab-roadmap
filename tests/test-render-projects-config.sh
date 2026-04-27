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
  local content="$1"
  local pattern="$2"
  if ! grep -Fq "${pattern}" <<<"${content}"; then
    fail "missing pattern '${pattern}' in: ${content}"
  fi
}

OUTPUT_FILE="${TMP_DIR}/projects-config.json"
node "${REPO_ROOT}/scripts/render-projects-config.mjs" --output "${OUTPUT_FILE}" >/dev/null

[[ -f "${OUTPUT_FILE}" ]] || fail "expected output file at ${OUTPUT_FILE}"

CONTENT="$(cat "${OUTPUT_FILE}")"
assert_contains "${CONTENT}" '"org": "ai-webgpu-lab"'
assert_contains "${CONTENT}" '"project": "AI WebGPU Lab Plan"'
assert_contains "${CONTENT}" '"inventory_repos": 54'
assert_contains "${CONTENT}" '"seeded_issues": 30'
assert_contains "${CONTENT}" '"P0": 13'
assert_contains "${CONTENT}" '"id": "by-priority"'
assert_contains "${CONTENT}" '"id": "by-track"'
assert_contains "${CONTENT}" '"id": "by-type"'
assert_contains "${CONTENT}" '"id": "by-category"'

REPO_COUNT="$(node -e "const data=require('${OUTPUT_FILE}'); console.log(data.items.length)")"
[[ "${REPO_COUNT}" == "30" ]] || fail "expected 30 items, got ${REPO_COUNT}"

CATEGORY_GUARD="$(node -e "const data=require('${OUTPUT_FILE}'); const item=data.items.find((i) => i.repo === '.github'); console.log(item ? item.inventory_category : 'missing')")"
[[ "${CATEGORY_GUARD}" == "org" ]] || fail "expected .github inventory_category=org, got ${CATEGORY_GUARD}"

APPLY_FILE="${TMP_DIR}/apply-projects.sh"
node "${REPO_ROOT}/scripts/render-projects-config.mjs" --output "${OUTPUT_FILE}" --apply "${APPLY_FILE}" >/dev/null

[[ -f "${APPLY_FILE}" ]] || fail "expected apply script at ${APPLY_FILE}"

APPLY_CONTENT="$(cat "${APPLY_FILE}")"
assert_contains "${APPLY_CONTENT}" "#!/usr/bin/env bash"
assert_contains "${APPLY_CONTENT}" "gh project create"
assert_contains "${APPLY_CONTENT}" "gh project field-create"
assert_contains "${APPLY_CONTENT}" "gh issue create"
assert_contains "${APPLY_CONTENT}" "gh project item-add"
assert_contains "${APPLY_CONTENT}" "gh label create"

bash -n "${APPLY_FILE}" || fail "apply script has shell syntax errors"

echo "render-projects-config test passed"
