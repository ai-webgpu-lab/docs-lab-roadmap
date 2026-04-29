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
assert_contains "${CONTENT}" '"project": "AI WebGPU Lab — Master"'
assert_contains "${CONTENT}" '"inventory_repos": 54'
assert_contains "${CONTENT}" '"seeded_issues": 30'
assert_contains "${CONTENT}" '"P0": 13'
assert_contains "${CONTENT}" '"Todo"'
assert_contains "${CONTENT}" '"Seed Repo"'
assert_contains "${CONTENT}" '"Seed Type"'
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
assert_contains "${APPLY_CONTENT}" '"${ORG}/bench-runtime-shootout"'
assert_contains "${APPLY_CONTENT}" "DRY_RUN"
assert_contains "${APPLY_CONTENT}" "preflight()"
assert_contains "${APPLY_CONTENT}" "gh auth status"
assert_contains "${APPLY_CONTENT}" "gh repo view"
assert_contains "${APPLY_CONTENT}" "REUSE_PROJECT"
assert_contains "${APPLY_CONTENT}" "gh issue list"
assert_contains "${APPLY_CONTENT}" "Reusing issue:"
assert_contains "${APPLY_CONTENT}" "Seed Repo"

bash -n "${APPLY_FILE}" || fail "apply script has shell syntax errors"

DRY_RUN_OUTPUT="$(DRY_RUN=1 ORG="test-org" PROJECT_TITLE="Test Project" bash "${APPLY_FILE}" 2>&1)"
assert_contains "${DRY_RUN_OUTPUT}" "dry-run: skipping gh/jq/auth preflight"
assert_contains "${DRY_RUN_OUTPUT}" "+ gh project create --owner test-org --title Test\\ Project --format json"
assert_contains "${DRY_RUN_OUTPUT}" "https://github.com/test-org/bench-runtime-shootout/issues/DRY-RUN"

FAKE_BIN="${TMP_DIR}/fake-bin"
mkdir -p "${FAKE_BIN}"
cat >"${FAKE_BIN}/gh" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"${GH_LOG}"
if [[ "$1 $2" == "project create" ]]; then
  printf '{"number":321}\n'
elif [[ "$1 $2" == "issue list" && -n "${GH_REUSE_ISSUE_URL:-}" ]]; then
  printf '%s\n' "${GH_REUSE_ISSUE_URL}"
elif [[ "$1 $2" == "issue create" ]]; then
  repo=""
  while [[ $# -gt 0 ]]; do
    if [[ "$1" == "--repo" ]]; then
      repo="$2"
      break
    fi
    shift
  done
  printf 'https://github.com/%s/issues/1\n' "${repo}"
fi
SH
chmod +x "${FAKE_BIN}/gh"

cat >"${FAKE_BIN}/jq" <<'SH'
#!/usr/bin/env bash
cat >/dev/null
printf '321\n'
SH
chmod +x "${FAKE_BIN}/jq"

GH_LOG_FILE="${TMP_DIR}/gh.log"
GH_LOG="${GH_LOG_FILE}" ORG="test-org" PROJECT_TITLE="Test Project" SKIP_PREFLIGHT=1 PATH="${FAKE_BIN}:${PATH}" bash "${APPLY_FILE}" >/dev/null
assert_contains "$(cat "${GH_LOG_FILE}")" "label create priority:p0 --color BFD4F2 --description Auto-generated from inventory --repo test-org/bench-runtime-shootout"
assert_contains "$(cat "${GH_LOG_FILE}")" "issue list --repo test-org/bench-runtime-shootout"
assert_contains "$(cat "${GH_LOG_FILE}")" "issue create --repo test-org/bench-runtime-shootout"
assert_contains "$(cat "${GH_LOG_FILE}")" "project item-add 321 --owner test-org --url https://github.com/test-org/bench-runtime-shootout/issues/1"

REUSE_LOG_FILE="${TMP_DIR}/gh-reuse.log"
GH_LOG="${REUSE_LOG_FILE}" GH_REUSE_ISSUE_URL="https://github.com/test-org/bench-runtime-shootout/issues/99" ORG="test-org" PROJECT_TITLE="Test Project" PROJECT_NUMBER=654 SKIP_PREFLIGHT=1 PATH="${FAKE_BIN}:${PATH}" bash "${APPLY_FILE}" >/dev/null
assert_contains "$(cat "${REUSE_LOG_FILE}")" "issue list --repo test-org/bench-runtime-shootout"
if grep -Fq "project create" "${REUSE_LOG_FILE}"; then
  fail "PROJECT_NUMBER reuse should skip project create"
fi
if grep -Fq "issue create" "${REUSE_LOG_FILE}"; then
  fail "existing issue reuse should skip issue create"
fi
assert_contains "$(cat "${REUSE_LOG_FILE}")" "project item-add 654 --owner test-org"

echo "render-projects-config test passed"
