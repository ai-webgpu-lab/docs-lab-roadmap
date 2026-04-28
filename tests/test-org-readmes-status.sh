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
FIXTURE="${TMP_DIR}/readmes-fixture.json"
BROKEN_FIXTURE="${TMP_DIR}/readmes-fixture-broken.json"
OUTPUT="${TMP_DIR}/README-STATUS.md"
BROKEN_OUTPUT="${TMP_DIR}/README-STATUS-broken.md"
BROKEN_STDERR="${TMP_DIR}/broken.stderr"

cat >"${INVENTORY}" <<'CSV'
repo,category,purpose,priority_group
.github,org,조직 공통 템플릿,P0
docs-lab-roadmap,docs,운영 로드맵,P0
bench-runtime-shootout,benchmark,런타임 비교,P0
CSV

cat >"${FIXTURE}" <<'JSON'
{
  "repos": {
    ".github": {
      "readme": "# .github\n\n## 조직 상태 대시보드\n- docs-lab-roadmap/docs/PAGES-STATUS.md\n- docs-lab-roadmap/docs/INTEGRATION-STATUS.md\n- docs-lab-roadmap/docs/SKETCH-METRICS.md\n",
      "profileReadme": "# AI WebGPU Lab\n\n## Live Status\n- docs-lab-roadmap/docs/PAGES-STATUS.md\n- docs-lab-roadmap/docs/INTEGRATION-STATUS.md\n- docs-lab-roadmap/docs/SKETCH-METRICS.md\n"
    },
    "docs-lab-roadmap": {
      "readme": "# docs-lab-roadmap\n\n- docs/PAGES-STATUS.md\n- docs/README-STATUS.md\n- docs/WORKFLOW-STATUS.md\n- docs/PROJECT-STATUS.md\n- scripts/check-org-pages.mjs\n"
    },
    "bench-runtime-shootout": {
      "readme": "# bench-runtime-shootout\n\nLive demo: https://ai-webgpu-lab.github.io/bench-runtime-shootout/\n\n## 조직 상태 대시보드\n- docs-lab-roadmap/docs/PAGES-STATUS.md\n- docs-lab-roadmap/docs/INTEGRATION-STATUS.md\n- docs-lab-roadmap/docs/SKETCH-METRICS.md\n"
    }
  }
}
JSON

node "${REPO_ROOT}/scripts/check-org-readmes.mjs" \
  --inventory "${INVENTORY}" \
  --fixture "${FIXTURE}" \
  --output "${OUTPUT}" \
  --fail-on-error

assert_contains "${OUTPUT}" "# README Status"
assert_contains "${OUTPUT}" "Healthy READMEs: 3 / 3"
assert_contains "${OUTPUT}" "Root README present: 3 / 3"
assert_contains "${OUTPUT}" "Organization profile gate: 3 / 3"
assert_contains "${OUTPUT}" "No README drift detected."

node -e '
const fs = require("fs");
const fixture = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
fixture.repos["bench-runtime-shootout"].readme = fixture.repos["bench-runtime-shootout"].readme.replace("Live demo: https://ai-webgpu-lab.github.io/bench-runtime-shootout/\n\n", "");
fs.writeFileSync(process.argv[2], JSON.stringify(fixture, null, 2));
' "${FIXTURE}" "${BROKEN_FIXTURE}"

if node "${REPO_ROOT}/scripts/check-org-readmes.mjs" \
  --inventory "${INVENTORY}" \
  --fixture "${BROKEN_FIXTURE}" \
  --output "${BROKEN_OUTPUT}" \
  --fail-on-error 2>"${BROKEN_STDERR}"; then
  fail "expected README drift fixture to fail"
fi

assert_contains "${BROKEN_OUTPUT}" "Healthy READMEs: 2 / 3"
assert_contains "${BROKEN_OUTPUT}" "live-demo-url"
assert_contains "${BROKEN_STDERR}" "README status check failed"

STDOUT_OUTPUT="$(node "${REPO_ROOT}/scripts/check-org-readmes.mjs" --inventory "${INVENTORY}" --fixture "${FIXTURE}" --stdout)"
if ! grep -Fq "No README drift detected." <<<"${STDOUT_OUTPUT}"; then
  fail "stdout mode did not render report"
fi

echo "org-readmes-status test passed"
