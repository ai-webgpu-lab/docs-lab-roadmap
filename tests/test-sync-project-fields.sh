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
  if command -v rg >/dev/null 2>&1 && rg -Fq -- "${pattern}" "${path}" 2>/dev/null; then
    return 0
  fi
  grep -Fq -- "${pattern}" "${path}" || fail "missing pattern '${pattern}' in ${path}"
}

assert_not_contains() {
  local path="$1"
  local pattern="$2"
  if grep -Fq -- "${pattern}" "${path}"; then
    fail "unexpected pattern '${pattern}' in ${path}"
  fi
}

INVENTORY="${TMP_DIR}/inventory.csv"
ISSUES="${TMP_DIR}/issues.csv"
FAKE_BIN="${TMP_DIR}/fake-bin"
GH_LOG="${TMP_DIR}/gh.log"
GH_FIELD_STATE="${TMP_DIR}/project-fields.state"

cat >"${INVENTORY}" <<'CSV'
repo,category,purpose,priority_group
bench-runtime-shootout,benchmark,Runtime shootout,P0
exp-three-webgpu-core,graphics,Renderer baseline,P1
CSV

cat >"${ISSUES}" <<'CSV'
title,repo,type,priority,track,summary
[p0] Runtime baseline,bench-runtime-shootout,benchmark,P0,Benchmark,Runtime baseline issue
[p1] Renderer follow-up,exp-three-webgpu-core,experiment,P1,Graphics,Renderer follow-up issue
CSV

mkdir -p "${FAKE_BIN}"
cat >"${FAKE_BIN}/gh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

printf '%s\n' "$*" >>"${GH_LOG}"

field_was_created() {
  local name="$1"
  [[ -n "${GH_FIELD_STATE:-}" && -f "${GH_FIELD_STATE}" ]] && grep -Fxq "${name}" "${GH_FIELD_STATE}"
}

fields_json() {
  local seed_type=""
  local seed_repo=""
  if field_was_created "Seed Type"; then
    seed_type=',{"id":"field-seed-type","name":"Seed Type","type":"ProjectV2SingleSelectField","options":[{"id":"option-seed-type-benchmark","name":"benchmark"},{"id":"option-seed-type-experiment","name":"experiment"}]}'
  fi
  if field_was_created "Seed Repo"; then
    seed_repo=',{"id":"field-seed-repo","name":"Seed Repo","type":"ProjectV2Field"}'
  fi
  cat <<JSON
{"fields":[{"id":"field-status","name":"Status","type":"ProjectV2SingleSelectField","options":[{"id":"option-status-todo","name":"Todo"},{"id":"option-status-in-progress","name":"In Progress"},{"id":"option-status-done","name":"Done"}]},{"id":"field-priority","name":"Priority","type":"ProjectV2SingleSelectField","options":[{"id":"option-priority-p0","name":"P0"},{"id":"option-priority-p1","name":"P1"}]},{"id":"field-track","name":"Track","type":"ProjectV2SingleSelectField","options":[{"id":"option-track-benchmark","name":"Benchmark"},{"id":"option-track-graphics","name":"Graphics"}]},{"id":"field-category","name":"Category","type":"ProjectV2SingleSelectField","options":[{"id":"option-category-benchmark","name":"benchmark"},{"id":"option-category-experiment","name":"experiment"}]}${seed_type}${seed_repo}]}
JSON
}

project_items_json() {
  if [[ "${GH_PROJECT_FIELDS_CURRENT:-0}" == "1" ]]; then
    cat <<'JSON'
{"data":{"node":{"items":{"pageInfo":{"hasNextPage":false,"endCursor":null},"nodes":[{"id":"ITEM1","content":{"title":"[p0] Runtime baseline","url":"https://github.com/test-org/bench-runtime-shootout/issues/1","repository":{"nameWithOwner":"test-org/bench-runtime-shootout"}},"fieldValues":{"nodes":[{"__typename":"ProjectV2ItemFieldSingleSelectValue","name":"Todo","field":{"name":"Status"}},{"__typename":"ProjectV2ItemFieldSingleSelectValue","name":"P0","field":{"name":"Priority"}},{"__typename":"ProjectV2ItemFieldSingleSelectValue","name":"Benchmark","field":{"name":"Track"}},{"__typename":"ProjectV2ItemFieldSingleSelectValue","name":"benchmark","field":{"name":"Category"}},{"__typename":"ProjectV2ItemFieldSingleSelectValue","name":"benchmark","field":{"name":"Seed Type"}},{"__typename":"ProjectV2ItemFieldTextValue","text":"bench-runtime-shootout","field":{"name":"Seed Repo"}}]}},{"id":"ITEM2","content":{"title":"[p1] Renderer follow-up","url":"https://github.com/test-org/exp-three-webgpu-core/issues/2","repository":{"nameWithOwner":"test-org/exp-three-webgpu-core"}},"fieldValues":{"nodes":[{"__typename":"ProjectV2ItemFieldSingleSelectValue","name":"Todo","field":{"name":"Status"}},{"__typename":"ProjectV2ItemFieldSingleSelectValue","name":"P1","field":{"name":"Priority"}},{"__typename":"ProjectV2ItemFieldSingleSelectValue","name":"Graphics","field":{"name":"Track"}},{"__typename":"ProjectV2ItemFieldSingleSelectValue","name":"experiment","field":{"name":"Category"}},{"__typename":"ProjectV2ItemFieldSingleSelectValue","name":"experiment","field":{"name":"Seed Type"}},{"__typename":"ProjectV2ItemFieldTextValue","text":"exp-three-webgpu-core","field":{"name":"Seed Repo"}}]}}]}}}}
JSON
  else
    cat <<'JSON'
{"data":{"node":{"items":{"pageInfo":{"hasNextPage":false,"endCursor":null},"nodes":[{"id":"ITEM1","content":{"title":"[p0] Runtime baseline","url":"https://github.com/test-org/bench-runtime-shootout/issues/1","repository":{"nameWithOwner":"test-org/bench-runtime-shootout"}},"fieldValues":{"nodes":[{"__typename":"ProjectV2ItemFieldSingleSelectValue","name":"Todo","field":{"name":"Status"}}]}},{"id":"ITEM2","content":{"title":"[p1] Renderer follow-up","url":"https://github.com/test-org/exp-three-webgpu-core/issues/2","repository":{"nameWithOwner":"test-org/exp-three-webgpu-core"}},"fieldValues":{"nodes":[{"__typename":"ProjectV2ItemFieldSingleSelectValue","name":"Todo","field":{"name":"Status"}}]}}]}}}}
JSON
  fi
}

if [[ "$1 $2" == "project list" ]]; then
  printf '{"projects":[{"number":7,"id":"PVT_test","title":"AI WebGPU Lab — Master","items":{"totalCount":2}}]}\n'
elif [[ "$1 $2" == "project view" ]]; then
  printf '{"id":"PVT_test","number":7,"title":"AI WebGPU Lab — Master"}\n'
elif [[ "$1 $2" == "project field-list" ]]; then
  fields_json
elif [[ "$1 $2" == "project field-create" ]]; then
  name=""
  while [[ $# -gt 0 ]]; do
    if [[ "$1" == "--name" ]]; then
      name="$2"
      break
    fi
    shift
  done
  printf '%s\n' "${name}" >>"${GH_FIELD_STATE}"
  printf '{"id":"created-field"}\n'
elif [[ "$1 $2" == "project item-edit" ]]; then
  printf '{}\n'
elif [[ "$1 $2" == "api graphql" ]]; then
  project_items_json
elif [[ "$1 $2" == "issue list" ]]; then
  repo=""
  while [[ $# -gt 0 ]]; do
    if [[ "$1" == "--repo" ]]; then
      repo="$2"
      break
    fi
    shift
  done
  case "${repo}" in
    test-org/bench-runtime-shootout)
      printf '[{"title":"[p0] Runtime baseline","url":"https://github.com/test-org/bench-runtime-shootout/issues/1"}]\n'
      ;;
    test-org/exp-three-webgpu-core)
      printf '[{"title":"[p1] Renderer follow-up","url":"https://github.com/test-org/exp-three-webgpu-core/issues/2"}]\n'
      ;;
    *)
      printf '[]\n'
      ;;
  esac
else
  echo "unexpected gh command: $*" >&2
  exit 1
fi
SH
chmod +x "${FAKE_BIN}/gh"

: >"${GH_LOG}"
: >"${GH_FIELD_STATE}"
DRY_RUN_OUTPUT="${TMP_DIR}/dry-run.out"
GH_LOG="${GH_LOG}" GH_FIELD_STATE="${GH_FIELD_STATE}" PATH="${FAKE_BIN}:${PATH}" \
  node "${REPO_ROOT}/scripts/sync-project-fields.mjs" \
    --org test-org \
    --inventory "${INVENTORY}" \
    --issues "${ISSUES}" \
    --dry-run \
    --concurrency 1 >"${DRY_RUN_OUTPUT}"

assert_contains "${DRY_RUN_OUTPUT}" "dry-run create field: Seed Type"
assert_contains "${DRY_RUN_OUTPUT}" "dry-run create field: Seed Repo"
assert_contains "${DRY_RUN_OUTPUT}" "dry-run set: item=ITEM1 field=Priority value=P0"
assert_contains "${DRY_RUN_OUTPUT}" "dry-run set: item=ITEM2 field=Seed Repo value=exp-three-webgpu-core"
assert_contains "${DRY_RUN_OUTPUT}" "project field sync complete: project=#7, issues=2, edits=10, dry_run=true"
assert_not_contains "${GH_LOG}" "project field-create"
assert_not_contains "${GH_LOG}" "project item-edit"

: >"${GH_LOG}"
: >"${GH_FIELD_STATE}"
APPLY_OUTPUT="${TMP_DIR}/apply.out"
GH_LOG="${GH_LOG}" GH_FIELD_STATE="${GH_FIELD_STATE}" PATH="${FAKE_BIN}:${PATH}" \
  node "${REPO_ROOT}/scripts/sync-project-fields.mjs" \
    --org test-org \
    --inventory "${INVENTORY}" \
    --issues "${ISSUES}" \
    --concurrency 1 >"${APPLY_OUTPUT}"

assert_contains "${APPLY_OUTPUT}" "project field sync complete: project=#7, issues=2, edits=10, dry_run=false"
assert_contains "${GH_FIELD_STATE}" "Seed Type"
assert_contains "${GH_FIELD_STATE}" "Seed Repo"
assert_contains "${GH_LOG}" "project field-create 7 --owner test-org --name Seed Type --data-type SINGLE_SELECT --format json --single-select-options benchmark,docs,experiment,infra,integration"
assert_contains "${GH_LOG}" "project field-create 7 --owner test-org --name Seed Repo --data-type TEXT --format json"
assert_contains "${GH_LOG}" "project item-edit --id ITEM1 --project-id PVT_test --field-id field-priority --single-select-option-id option-priority-p0"
assert_contains "${GH_LOG}" "project item-edit --id ITEM1 --project-id PVT_test --field-id field-seed-repo --text bench-runtime-shootout"
ITEM_EDIT_COUNT="$(grep -c '^project item-edit ' "${GH_LOG}")"
[[ "${ITEM_EDIT_COUNT}" == "10" ]] || fail "expected 10 item edits, got ${ITEM_EDIT_COUNT}"

: >"${GH_LOG}"
printf '%s\n' "Seed Type" "Seed Repo" >"${GH_FIELD_STATE}"
CURRENT_OUTPUT="${TMP_DIR}/current.out"
GH_LOG="${GH_LOG}" GH_FIELD_STATE="${GH_FIELD_STATE}" GH_PROJECT_FIELDS_CURRENT=1 PATH="${FAKE_BIN}:${PATH}" \
  node "${REPO_ROOT}/scripts/sync-project-fields.mjs" \
    --org test-org \
    --inventory "${INVENTORY}" \
    --issues "${ISSUES}" \
    --dry-run \
    --concurrency 1 >"${CURRENT_OUTPUT}"

assert_contains "${CURRENT_OUTPUT}" "project field sync complete: project=#7, issues=2, edits=0, dry_run=true"
assert_not_contains "${CURRENT_OUTPUT}" "dry-run set:"
assert_not_contains "${GH_LOG}" "project field-create"
assert_not_contains "${GH_LOG}" "project item-edit"

echo "sync-project-fields test passed"
