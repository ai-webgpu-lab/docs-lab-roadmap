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
FIXTURE="${TMP_DIR}/workflows-fixture.json"
BROKEN_FIXTURE="${TMP_DIR}/workflows-fixture-broken.json"
OUTPUT="${TMP_DIR}/WORKFLOW-STATUS.md"
BROKEN_OUTPUT="${TMP_DIR}/WORKFLOW-STATUS-broken.md"
BROKEN_STDERR="${TMP_DIR}/broken.stderr"

cat >"${INVENTORY}" <<'CSV'
repo,category,purpose,priority_group
docs-lab-roadmap,docs,운영 로드맵,P0
bench-runtime-shootout,benchmark,런타임 비교,P0
CSV

cat >"${FIXTURE}" <<'JSON'
{
  "repos": {
    "docs-lab-roadmap": {
      "url": "https://github.com/ai-webgpu-lab/docs-lab-roadmap",
      "defaultBranch": "main",
      "pushedAt": "2026-04-29T10:00:00Z",
      "deployWorkflowFile": true,
      "deployWorkflowContent": "uses: actions/configure-pages@v6\nuses: actions/upload-pages-artifact@v5\nuses: actions/deploy-pages@v5\n",
      "latestRun": { "workflowName": "Deploy GitHub Pages Demo", "status": "completed", "conclusion": "success", "createdAt": "2026-04-29T10:02:00Z" },
      "deployRun": { "workflowName": "Deploy GitHub Pages Demo", "status": "completed", "conclusion": "success", "createdAt": "2026-04-29T10:02:00Z" },
      "ciRun": { "workflowName": "CI", "status": "completed", "conclusion": "success", "createdAt": "2026-04-29T10:01:00Z" },
      "operationsRun": { "workflowName": "Operations Status Check", "status": "completed", "conclusion": "success", "createdAt": "2026-04-29T10:05:00Z" }
    },
    "bench-runtime-shootout": {
      "url": "https://github.com/ai-webgpu-lab/bench-runtime-shootout",
      "defaultBranch": "main",
      "pushedAt": "2026-04-29T10:03:00Z",
      "deployWorkflowFile": true,
      "deployWorkflowContent": "uses: actions/configure-pages@v6\nuses: actions/upload-pages-artifact@v5\nuses: actions/deploy-pages@v5\n",
      "latestRun": { "workflowName": "Deploy GitHub Pages Demo", "status": "completed", "conclusion": "success", "createdAt": "2026-04-29T10:04:00Z" },
      "deployRun": { "workflowName": "Deploy GitHub Pages Demo", "status": "completed", "conclusion": "success", "createdAt": "2026-04-29T10:04:00Z" }
    }
  }
}
JSON

node "${REPO_ROOT}/scripts/check-org-workflows.mjs" \
  --inventory "${INVENTORY}" \
  --fixture "${FIXTURE}" \
  --output "${OUTPUT}" \
  --fail-on-error

assert_contains "${OUTPUT}" "# Workflow Status"
assert_contains "${OUTPUT}" "Healthy workflow gates: 2 / 2"
assert_contains "${OUTPUT}" "deploy-pages.yml present: 2 / 2"
assert_contains "${OUTPUT}" "Pages action versions current: 2 / 2"
assert_contains "${OUTPUT}" "Latest Pages deploy success: 2 / 2"
assert_contains "${OUTPUT}" "Required CI success: 2 / 2"
assert_contains "${OUTPUT}" "Operations check latest success: 1 / 1"
assert_contains "${OUTPUT}" "Operations Status Check completed/success"
assert_contains "${OUTPUT}" "No workflow gaps detected."

node -e '
const fs = require("fs");
const fixture = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
fixture.repos["docs-lab-roadmap"].operationsRun.conclusion = "failure";
fs.writeFileSync(process.argv[2], JSON.stringify(fixture, null, 2));
' "${FIXTURE}" "${BROKEN_FIXTURE}"

node "${REPO_ROOT}/scripts/check-org-workflows.mjs" \
  --inventory "${INVENTORY}" \
  --fixture "${BROKEN_FIXTURE}" \
  --output "${BROKEN_OUTPUT}" \
  --fail-on-error

assert_contains "${BROKEN_OUTPUT}" "Healthy workflow gates: 2 / 2"
assert_contains "${BROKEN_OUTPUT}" "Operations check latest success: 0 / 1"
assert_contains "${BROKEN_OUTPUT}" "Operations Status Check completed/failure"
assert_contains "${BROKEN_OUTPUT}" "No workflow gaps detected."

node -e '
const fs = require("fs");
const fixture = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
fixture.repos["bench-runtime-shootout"].deployRun.conclusion = "failure";
fixture.repos["bench-runtime-shootout"].latestRun.conclusion = "failure";
fs.writeFileSync(process.argv[2], JSON.stringify(fixture, null, 2));
' "${FIXTURE}" "${BROKEN_FIXTURE}"

if node "${REPO_ROOT}/scripts/check-org-workflows.mjs" \
  --inventory "${INVENTORY}" \
  --fixture "${BROKEN_FIXTURE}" \
  --output "${BROKEN_OUTPUT}" \
  --fail-on-error 2>"${BROKEN_STDERR}"; then
  fail "expected failed workflow fixture to fail"
fi

assert_contains "${BROKEN_OUTPUT}" "Healthy workflow gates: 1 / 2"
assert_contains "${BROKEN_OUTPUT}" "deploy-not-success"
assert_contains "${BROKEN_STDERR}" "workflow status check failed"

node -e '
const fs = require("fs");
const fixture = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
fixture.repos["bench-runtime-shootout"].deployRun.conclusion = "success";
fixture.repos["bench-runtime-shootout"].latestRun.conclusion = "success";
fixture.repos["bench-runtime-shootout"].deployWorkflowContent = "uses: actions/configure-pages@v5\nuses: actions/upload-pages-artifact@v4\nuses: actions/deploy-pages@v4\n";
fs.writeFileSync(process.argv[2], JSON.stringify(fixture, null, 2));
' "${FIXTURE}" "${BROKEN_FIXTURE}"

if node "${REPO_ROOT}/scripts/check-org-workflows.mjs" \
  --inventory "${INVENTORY}" \
  --fixture "${BROKEN_FIXTURE}" \
  --output "${BROKEN_OUTPUT}" \
  --fail-on-error 2>"${BROKEN_STDERR}"; then
  fail "expected stale workflow action fixture to fail"
fi

assert_contains "${BROKEN_OUTPUT}" "Pages action versions current: 1 / 2"
assert_contains "${BROKEN_OUTPUT}" "upload-pages-artifact-v5"
assert_contains "${BROKEN_STDERR}" "workflow status check failed"

STDOUT_OUTPUT="$(node "${REPO_ROOT}/scripts/check-org-workflows.mjs" --inventory "${INVENTORY}" --fixture "${FIXTURE}" --stdout)"
if ! grep -Fq "No workflow gaps detected." <<<"${STDOUT_OUTPUT}"; then
  fail "stdout mode did not render report"
fi

echo "org-workflows-status test passed"
