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
  if command -v rg >/dev/null 2>&1 && rg -Fq "${pattern}" "${path}" 2>/dev/null; then
    return 0
  fi
  grep -Fq "${pattern}" "${path}" || fail "missing pattern '${pattern}' in ${path}"
}

INVENTORY="${TMP_DIR}/inventory.csv"
ISSUES="${TMP_DIR}/issues.csv"
FIXTURE="${TMP_DIR}/project-fixture.json"
BROKEN_FIXTURE="${TMP_DIR}/project-fixture-broken.json"
OUTPUT="${TMP_DIR}/PROJECT-STATUS.md"
BROKEN_OUTPUT="${TMP_DIR}/PROJECT-STATUS-broken.md"
BROKEN_STDERR="${TMP_DIR}/broken.stderr"

cat >"${INVENTORY}" <<'CSV'
repo,category,purpose,priority_group
bench-runtime-shootout,benchmark,런타임 비교,P0
exp-three-webgpu-core,graphics,three.js 기준선,P1
CSV

cat >"${ISSUES}" <<'CSV'
title,repo,type,priority,track,summary
[p0] Runtime baseline,bench-runtime-shootout,benchmark,P0,Bench,Runtime baseline issue
[p1] Renderer follow-up,exp-three-webgpu-core,experiment,P1,Graphics,Renderer follow-up issue
CSV

cat >"${FIXTURE}" <<'JSON'
{
  "project": {
    "number": 1,
    "title": "AI WebGPU Lab — Master",
    "items": { "totalCount": 2 }
  },
  "projectItemUrls": [
    "https://github.com/ai-webgpu-lab/bench-runtime-shootout/issues/1",
    "https://github.com/ai-webgpu-lab/exp-three-webgpu-core/issues/2"
  ],
  "issues": {
    "[p0] Runtime baseline": {
      "url": "https://github.com/ai-webgpu-lab/bench-runtime-shootout/issues/1",
      "state": "OPEN"
    },
    "[p1] Renderer follow-up": {
      "url": "https://github.com/ai-webgpu-lab/exp-three-webgpu-core/issues/2",
      "state": "OPEN"
    }
  }
}
JSON

node "${REPO_ROOT}/scripts/check-project-status.mjs" \
  --inventory "${INVENTORY}" \
  --issues "${ISSUES}" \
  --fixture "${FIXTURE}" \
  --output "${OUTPUT}" \
  --fail-on-error \
  --require-seeded-issues \
  --require-project-items

assert_contains "${OUTPUT}" "# Project Status"
assert_contains "${OUTPUT}" "Project exists: yes (#1)"
assert_contains "${OUTPUT}" "Seeded issues found: 2 / 2"
assert_contains "${OUTPUT}" "Seeded issues linked to Project: 2 / 2"
assert_contains "${OUTPUT}" "No Project or seeded issue gaps detected."

node -e '
const fs = require("fs");
const fixture = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
delete fixture.issues["[p1] Renderer follow-up"];
fixture.projectItemUrls.pop();
fixture.project.items.totalCount = 1;
fs.writeFileSync(process.argv[2], JSON.stringify(fixture, null, 2));
' "${FIXTURE}" "${BROKEN_FIXTURE}"

if node "${REPO_ROOT}/scripts/check-project-status.mjs" \
  --inventory "${INVENTORY}" \
  --issues "${ISSUES}" \
  --fixture "${BROKEN_FIXTURE}" \
  --output "${BROKEN_OUTPUT}" \
  --fail-on-error \
  --require-seeded-issues \
  --require-project-items 2>"${BROKEN_STDERR}"; then
  fail "expected missing seeded issue fixture to fail"
fi

assert_contains "${BROKEN_OUTPUT}" "Seeded issues found: 1 / 2"
assert_contains "${BROKEN_OUTPUT}" "Seeded issues linked to Project: 1 / 2"
assert_contains "${BROKEN_OUTPUT}" "Missing issue in \`exp-three-webgpu-core\`: [p1] Renderer follow-up"
assert_contains "${BROKEN_STDERR}" "project status check failed"

STDOUT_OUTPUT="$(node "${REPO_ROOT}/scripts/check-project-status.mjs" --inventory "${INVENTORY}" --issues "${ISSUES}" --fixture "${FIXTURE}" --stdout)"
if ! grep -Fq "No Project or seeded issue gaps detected." <<<"${STDOUT_OUTPUT}"; then
  fail "stdout mode did not render report"
fi

echo "project-status test passed"
