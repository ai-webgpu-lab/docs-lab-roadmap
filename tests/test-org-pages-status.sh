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
FIXTURE="${TMP_DIR}/pages-fixture.json"
BROKEN_FIXTURE="${TMP_DIR}/pages-fixture-broken.json"
BROKEN_MARKER_FIXTURE="${TMP_DIR}/pages-fixture-broken-marker.json"
OUTPUT="${TMP_DIR}/PAGES-STATUS.md"
BROKEN_OUTPUT="${TMP_DIR}/PAGES-STATUS-broken.md"
BROKEN_MARKER_OUTPUT="${TMP_DIR}/PAGES-STATUS-broken-marker.md"
BROKEN_STDERR="${TMP_DIR}/broken.stderr"
BROKEN_MARKER_STDERR="${TMP_DIR}/broken-marker.stderr"

cat >"${INVENTORY}" <<'CSV'
repo,category,purpose,priority_group
.github,org,조직 공통 템플릿,P0
exp-three-webgpu-core,graphics,three.js 기준선,P1
bench-runtime-shootout,benchmark,런타임 비교,P0
bench-renderer-shootout,benchmark,렌더러 비교,P1
app-blackhole-observatory,app,블랙홀 쇼케이스,P2
CSV

cat >"${FIXTURE}" <<'JSON'
{
  "repos": {
    ".github": {
      "pages": {
        "html_url": "https://ai-webgpu-lab.github.io/.github/",
        "build_type": "workflow",
        "source": { "branch": "main", "path": "/" }
      },
      "workflowFile": true,
      "latestRun": { "status": "completed", "conclusion": "success", "updatedAt": "2026-04-28T17:29:55Z" },
      "httpCode": 200,
      "publicFiles": [".nojekyll", "index.html", "app.js", "community-files-fixture.json"],
      "indexHtml": "<!doctype html><title>ai-webgpu-lab/.github Community Audit</title>"
    },
    "exp-three-webgpu-core": {
      "pages": {
        "html_url": "https://ai-webgpu-lab.github.io/exp-three-webgpu-core/",
        "build_type": "workflow",
        "source": { "branch": "main", "path": "/" }
      },
      "workflowFile": true,
      "latestRun": { "status": "completed", "conclusion": "success", "updatedAt": "2026-04-28T17:30:48Z" },
      "httpCode": 200,
      "publicFiles": [".nojekyll", "index.html", "app.js", "real-renderer-sketch.js", "renderer-adapter.js"],
      "indexHtml": "<!doctype html><title>exp-three-webgpu-core Three Scene Readiness</title>"
    },
    "bench-runtime-shootout": {
      "pages": {
        "html_url": "https://ai-webgpu-lab.github.io/bench-runtime-shootout/",
        "build_type": "workflow",
        "source": { "branch": "main", "path": "/" }
      },
      "workflowFile": true,
      "latestRun": { "status": "completed", "conclusion": "success", "updatedAt": "2026-04-28T17:33:21Z" },
      "httpCode": 200,
      "publicFiles": [".nojekyll", "index.html", "app.js", "real-runtime-sketch.js", "runtime-adapter.js", "real-benchmark-sketch.js", "benchmark-adapter.js"],
      "indexHtml": "<!doctype html><title>bench-runtime-shootout Fixed Scenario Runtime Benchmark</title>"
    },
    "bench-renderer-shootout": {
      "pages": {
        "html_url": "https://ai-webgpu-lab.github.io/bench-renderer-shootout/",
        "build_type": "workflow",
        "source": { "branch": "main", "path": "/" }
      },
      "workflowFile": true,
      "latestRun": { "status": "completed", "conclusion": "success", "updatedAt": "2026-04-28T17:35:14Z" },
      "httpCode": 200,
      "publicFiles": [".nojekyll", "index.html", "app.js", "real-renderer-sketch.js", "renderer-adapter.js", "real-benchmark-sketch.js", "benchmark-adapter.js"],
      "indexHtml": "<!doctype html><title>bench-renderer-shootout Renderer Shootout</title>"
    },
    "app-blackhole-observatory": {
      "pages": {
        "html_url": "https://ai-webgpu-lab.github.io/app-blackhole-observatory/",
        "build_type": "workflow",
        "source": { "branch": "main", "path": "/" }
      },
      "workflowFile": true,
      "latestRun": { "status": "completed", "conclusion": "success", "updatedAt": "2026-04-28T17:35:39Z" },
      "httpCode": 200,
      "publicFiles": [".nojekyll", "index.html", "app.js", "real-surface-sketch.js", "app-surface-adapter.js", "blackhole-observatory-fixture.json"],
      "indexHtml": "<!doctype html><title>app-blackhole-observatory Blackhole Observatory Demo</title>"
    }
  },
  "realModes": {
    "bench-runtime-shootout?mode=real-runtime": { "httpCode": 200, "appJs": "const isRealRuntimeMode = requestedMode.startsWith(\"real-\");" },
    "exp-three-webgpu-core?mode=real-three": { "httpCode": 200, "appJs": "const isRealRendererMode = requestedMode.startsWith(\"real-\");" },
    "bench-renderer-shootout?mode=real-benchmark": { "httpCode": 200, "appJs": "const isRealBenchmarkMode = requestedMode.startsWith(\"real-\");" },
    "app-blackhole-observatory?mode=real-surface": { "httpCode": 200, "appJs": "const isRealSurfaceMode = requestedMode.startsWith(\"real-\");" }
  }
}
JSON

node "${REPO_ROOT}/scripts/check-org-pages.mjs" \
  --inventory "${INVENTORY}" \
  --fixture "${FIXTURE}" \
  --output "${OUTPUT}" \
  --fail-on-error

assert_contains "${OUTPUT}" "# GitHub Pages Demo Status"
assert_contains "${OUTPUT}" "Healthy Pages: 5 / 5"
assert_contains "${OUTPUT}" "HTTP 200: 5 / 5"
assert_contains "${OUTPUT}" "Real sketch/adapter coverage: 4 / 4"
assert_contains "${OUTPUT}" "Representative real-mode smoke: 4 / 4"
assert_contains "${OUTPUT}" "Activation marker"
assert_contains "${OUTPUT}" "isRealRuntimeMode"
assert_contains "${OUTPUT}" "bench-runtime-shootout Fixed Scenario Runtime Benchmark"
assert_contains "${OUTPUT}" "bench-renderer-shootout Renderer Shootout"
assert_contains "${OUTPUT}" "No blocking gaps detected."

node -e '
const fs = require("fs");
const fixture = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
fixture.repos["exp-three-webgpu-core"].publicFiles = [".nojekyll", "index.html", "app.js", "real-renderer-sketch.js"];
fs.writeFileSync(process.argv[2], JSON.stringify(fixture, null, 2));
' "${FIXTURE}" "${BROKEN_FIXTURE}"

if node "${REPO_ROOT}/scripts/check-org-pages.mjs" \
  --inventory "${INVENTORY}" \
  --fixture "${BROKEN_FIXTURE}" \
  --output "${BROKEN_OUTPUT}" \
  --fail-on-error 2>"${BROKEN_STDERR}"; then
  fail "expected missing adapter fixture to fail"
fi

assert_contains "${BROKEN_OUTPUT}" "Healthy Pages: 4 / 5"
assert_contains "${BROKEN_OUTPUT}" 'missing renderer-adapter.js'
assert_contains "${BROKEN_STDERR}" "pages status check failed"

node -e '
const fs = require("fs");
const fixture = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
fixture.realModes["bench-runtime-shootout?mode=real-runtime"].appJs = "const requestedMode = \"real-runtime\";";
fs.writeFileSync(process.argv[2], JSON.stringify(fixture, null, 2));
' "${FIXTURE}" "${BROKEN_MARKER_FIXTURE}"

if node "${REPO_ROOT}/scripts/check-org-pages.mjs" \
  --inventory "${INVENTORY}" \
  --fixture "${BROKEN_MARKER_FIXTURE}" \
  --output "${BROKEN_MARKER_OUTPUT}" \
  --fail-on-error 2>"${BROKEN_MARKER_STDERR}"; then
  fail "expected missing activation marker fixture to fail"
fi

assert_contains "${BROKEN_MARKER_OUTPUT}" "Representative real-mode smoke: 3 / 4"
assert_contains "${BROKEN_MARKER_OUTPUT}" "missing activation marker isRealRuntimeMode"
assert_contains "${BROKEN_MARKER_STDERR}" "pages status check failed"

STDOUT_OUTPUT="$(node "${REPO_ROOT}/scripts/check-org-pages.mjs" --inventory "${INVENTORY}" --fixture "${FIXTURE}" --stdout)"
if ! grep -Fq "Representative real-mode smoke: 4 / 4" <<<"${STDOUT_OUTPUT}"; then
  fail "stdout mode did not render report"
fi

echo "org-pages-status test passed"
