#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

INCLUDE_BOOTSTRAP=0
INCLUDE_INTEGRATION_STATUS=1
INCLUDE_FAMILY_COVERAGE=1
QUIET=0
PRESET=""

usage() {
  cat <<'EOF'
Usage: bash scripts/check-coverage.sh [options]

Runs the lab planning validators and coverage tests in a single pass:
  1. validate-lab-planning (inventory + issues + plan + infra fixtures)
  2. adapter-family-coverage (47 family-mapped repos x adapter files)
  3. real-sketch-family-coverage (47 family-mapped repos x sketch files)
  4. real-sketch-conformance (each real-*-sketch.js exports connect/build/load)
  5. real-sketch-contract (per-family registry/method/query-gate contract)
  6. render-integration-status (markdown report at docs/INTEGRATION-STATUS.md)
  7. render-sketch-metrics (markdown report at docs/SKETCH-METRICS.md)
  8. render-capabilities-matrix (markdown report at docs/CAPABILITIES-MATRIX.md)

Options:
  --preset smoke|full|strict  Apply a preset (smoke = lab-planning + status only,
                              full = all 5 default steps, strict = full + bootstrap)
  --skip-coverage          Skip family coverage checks (faster, schema-only)
  --skip-status            Skip integration status renderer
  --bootstrap              Also run bootstrap + full-inventory tests (slow)
  --quiet                  Only print failures and the final summary
  -h, --help               Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --preset)
      PRESET="$2"
      shift 2
      ;;
    --skip-coverage)
      INCLUDE_FAMILY_COVERAGE=0
      shift
      ;;
    --skip-status)
      INCLUDE_INTEGRATION_STATUS=0
      shift
      ;;
    --bootstrap)
      INCLUDE_BOOTSTRAP=1
      shift
      ;;
    --quiet)
      QUIET=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

case "${PRESET}" in
  "")
    ;;
  smoke)
    INCLUDE_FAMILY_COVERAGE=0
    INCLUDE_INTEGRATION_STATUS=1
    INCLUDE_BOOTSTRAP=0
    SKIP_ADAPTER_FAMILY_COVERAGE=1
    SKIP_REAL_SKETCH_CONFORMANCE=0
    ;;
  full)
    INCLUDE_FAMILY_COVERAGE=1
    INCLUDE_INTEGRATION_STATUS=1
    INCLUDE_BOOTSTRAP=0
    ;;
  strict)
    INCLUDE_FAMILY_COVERAGE=1
    INCLUDE_INTEGRATION_STATUS=1
    INCLUDE_BOOTSTRAP=1
    ;;
  *)
    echo "unknown preset: ${PRESET} (expected smoke|full|strict)" >&2
    exit 1
    ;;
esac

SKIP_ADAPTER_FAMILY_COVERAGE="${SKIP_ADAPTER_FAMILY_COVERAGE:-0}"

step() {
  local name="$1"
  shift
  if [[ "${QUIET}" -eq 0 ]]; then
    echo "==> ${name}"
  fi
  local log
  if log="$("$@" 2>&1)"; then
    PASSED+=("${name}")
  else
    FAILED+=("${name}")
    if [[ -n "${log}" ]]; then
      echo "${log}" >&2
    fi
  fi
}

PASSED=()
FAILED=()

step "validate-lab-planning" bash "${REPO_ROOT}/scripts/validate-lab-planning.sh"

if [[ "${SKIP_ADAPTER_FAMILY_COVERAGE}" -eq 0 ]]; then
  step "adapter-family-coverage" bash "${REPO_ROOT}/tests/test-adapter-family-coverage.sh"
fi

if [[ "${INCLUDE_FAMILY_COVERAGE}" -eq 1 ]]; then
  step "real-sketch-family-coverage" bash "${REPO_ROOT}/tests/test-real-sketch-family-coverage.sh"
fi

step "real-sketch-conformance" bash "${REPO_ROOT}/tests/test-real-sketch-conformance.sh"
step "real-sketch-contract" bash "${REPO_ROOT}/tests/test-real-sketch-contract.sh"

if [[ "${INCLUDE_INTEGRATION_STATUS}" -eq 1 ]]; then
  step "render-integration-status" node "${REPO_ROOT}/scripts/render-integration-status.mjs" --output "${REPO_ROOT}/docs/INTEGRATION-STATUS.md"
  step "render-sketch-metrics" node "${REPO_ROOT}/scripts/render-sketch-metrics.mjs" --output "${REPO_ROOT}/docs/SKETCH-METRICS.md"
  step "render-capabilities-matrix" node "${REPO_ROOT}/scripts/render-capabilities-matrix.mjs" --output "${REPO_ROOT}/docs/CAPABILITIES-MATRIX.md"
fi

if [[ "${INCLUDE_BOOTSTRAP}" -eq 1 ]]; then
  step "bootstrap-org-repos" bash "${REPO_ROOT}/tests/test-bootstrap-org-repos.sh"
  step "bootstrap-org-repos-full-inventory" bash "${REPO_ROOT}/tests/test-bootstrap-org-repos-full-inventory.sh"
fi

echo
echo "check-coverage summary: ${#PASSED[@]} passed, ${#FAILED[@]} failed"
for name in "${PASSED[@]}"; do
  echo "  ✅ ${name}"
done
for name in "${FAILED[@]}"; do
  echo "  ❌ ${name}"
done

if [[ "${#FAILED[@]}" -gt 0 ]]; then
  exit 1
fi
