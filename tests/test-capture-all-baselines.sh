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

ALL_OUTPUT="$(bash "${REPO_ROOT}/scripts/capture-all-baselines.sh" --dry-run --output-root "${TMP_DIR}/all" 2>&1)"
assert_contains "${ALL_OUTPUT}" "would capture 54 repos"
assert_contains "${ALL_OUTPUT}" ".github (org, P0)"
assert_contains "${ALL_OUTPUT}" "shared-webgpu-capability (shared, P0)"
assert_contains "${ALL_OUTPUT}" "docs-lab-roadmap (docs, P0)"
assert_contains "${ALL_OUTPUT}" "shared-github-actions (shared, P1)"
assert_contains "${ALL_OUTPUT}" "bench-texture-upload-and-streaming (benchmark, P2)"

P0_OUTPUT="$(bash "${REPO_ROOT}/scripts/capture-all-baselines.sh" --priority P0 --dry-run --output-root "${TMP_DIR}/p0" 2>&1)"
assert_contains "${P0_OUTPUT}" "would capture 13 repos"
assert_contains "${P0_OUTPUT}" "tpl-webgpu-vanilla (template, P0)"

CAT_OUTPUT="$(bash "${REPO_ROOT}/scripts/capture-all-baselines.sh" --category shared --dry-run --output-root "${TMP_DIR}/shared" 2>&1)"
assert_contains "${CAT_OUTPUT}" "would capture 3 repos"
assert_contains "${CAT_OUTPUT}" "shared-bench-schema (shared, P0)"
assert_contains "${CAT_OUTPUT}" "shared-github-actions (shared, P1)"
assert_contains "${CAT_OUTPUT}" "shared-webgpu-capability (shared, P0)"

REPO_OUTPUT="$(bash "${REPO_ROOT}/scripts/capture-all-baselines.sh" --repo .github --repo docs-lab-roadmap --dry-run --output-root "${TMP_DIR}/two" 2>&1)"
assert_contains "${REPO_OUTPUT}" "would capture 2 repos"
assert_contains "${REPO_OUTPUT}" ".github (org, P0)"
assert_contains "${REPO_OUTPUT}" "docs-lab-roadmap (docs, P0)"

COMMA_INVENTORY="${TMP_DIR}/comma-inventory.csv"
cat >"${COMMA_INVENTORY}" <<'CSV'
repo,category,purpose,priority_group
.github,org,"org templates, shared defaults",P0
CSV

COMMA_OUTPUT="$(bash "${REPO_ROOT}/scripts/capture-all-baselines.sh" --inventory "${COMMA_INVENTORY}" --dry-run --output-root "${TMP_DIR}/comma" 2>&1)"
assert_contains "${COMMA_OUTPUT}" "would capture 1 repos"
assert_contains "${COMMA_OUTPUT}" ".github (org, P0)"

if bash "${REPO_ROOT}/scripts/capture-all-baselines.sh" --repo nonexistent-repo --dry-run --output-root "${TMP_DIR}/none" 2>/dev/null; then
  fail "expected non-zero exit when no repos match"
fi

# Live capture path: capture a single small infra harness end-to-end.
LIVE_OUTPUT="$(bash "${REPO_ROOT}/scripts/capture-all-baselines.sh" --repo .github --output-root "${TMP_DIR}/live" 2>&1)"
assert_contains "${LIVE_OUTPUT}" "captured 1 raw result"
assert_contains "${LIVE_OUTPUT}" "summary: 1 ok"

if [[ ! -f "${TMP_DIR}/live/summary.tsv" ]]; then
  fail "missing summary.tsv"
fi
assert_contains "$(cat "${TMP_DIR}/live/summary.tsv")" $'.github\torg\tP0\tok'

if [[ ! -f "${TMP_DIR}/live/.github/reports/raw/01-dotgithub-community-baseline.json" ]]; then
  fail "live capture did not produce raw json"
fi

if [[ ! -f "${TMP_DIR}/live/summary.md" ]]; then
  fail "missing summary.md"
fi
assert_contains "$(cat "${TMP_DIR}/live/summary.md")" "# capture-all-baselines summary"
assert_contains "$(cat "${TMP_DIR}/live/summary.md")" "| .github | org | P0 | ok"

echo "capture-all-baselines test passed"
