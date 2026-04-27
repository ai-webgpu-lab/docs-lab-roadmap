#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

QUIET=0
BAIL=0
JSON=0
FILTER=""
TESTS_DIR_OVERRIDE=""

usage() {
  cat <<'EOF'
Usage: bash tests/run-all.sh [options]

Runs every tests/test-*.sh in sequence and prints a pass/fail summary.

Options:
  --filter <pattern>     Only run tests whose filename contains <pattern>
  --bail                 Stop at first failure
  --quiet                Suppress per-test progress (still prints the final summary)
  --json                 Emit a structured JSON summary instead of the human-readable line
  --tests-dir <path>     Override the tests directory (used for self-tests)
  -h, --help             Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --filter)
      FILTER="$2"
      shift 2
      ;;
    --bail)
      BAIL=1
      shift
      ;;
    --quiet)
      QUIET=1
      shift
      ;;
    --json)
      JSON=1
      shift
      ;;
    --tests-dir)
      TESTS_DIR_OVERRIDE="$2"
      shift 2
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

TESTS_DIR="${TESTS_DIR_OVERRIDE:-${SCRIPT_DIR}}"

TESTS=()
while IFS= read -r -d '' file; do
  basename="$(basename "${file}")"
  if [[ -n "${FILTER}" && "${basename}" != *"${FILTER}"* ]]; then
    continue
  fi
  TESTS+=("${file}")
done < <(find "${TESTS_DIR}" -maxdepth 1 -type f -name 'test-*.sh' -print0 | sort -z)

if [[ ${#TESTS[@]} -eq 0 ]]; then
  echo "no matching tests" >&2
  exit 1
fi

PASSED=()
FAILED=()
FAILED_LOGS=()
START_TIME="$(date +%s)"

for test in "${TESTS[@]}"; do
  name="$(basename "${test}" .sh)"
  if [[ "${QUIET}" -eq 0 && "${JSON}" -eq 0 ]]; then
    echo "==> ${name}"
  fi
  if log="$(bash "${test}" 2>&1)"; then
    PASSED+=("${name}")
  else
    FAILED+=("${name}")
    FAILED_LOGS+=("${log}")
    if [[ "${JSON}" -eq 0 && -n "${log}" ]]; then
      echo "${log}" >&2
    fi
    if [[ "${BAIL}" -eq 1 ]]; then
      break
    fi
  fi
done

END_TIME="$(date +%s)"
ELAPSED=$((END_TIME - START_TIME))

if [[ "${JSON}" -eq 1 ]]; then
  json_escape() {
    local s="$1"
    s="${s//\\/\\\\}"
    s="${s//\"/\\\"}"
    s="${s//$'\n'/\\n}"
    s="${s//$'\r'/\\r}"
    s="${s//$'\t'/\\t}"
    printf '%s' "$s"
  }

  out='{"total":'"${#TESTS[@]}"',"passed":'"${#PASSED[@]}"',"failed":'"${#FAILED[@]}"',"elapsed_seconds":'"${ELAPSED}"',"bail":'
  if [[ "${BAIL}" -eq 1 ]]; then out+='true'; else out+='false'; fi
  out+=',"filter":"'"$(json_escape "${FILTER}")"'","passed_names":['
  first=1
  for name in "${PASSED[@]}"; do
    if [[ "${first}" -eq 0 ]]; then out+=','; fi
    out+='"'"$(json_escape "${name}")"'"'
    first=0
  done
  out+='],"failures":['
  first=1
  for i in "${!FAILED[@]}"; do
    if [[ "${first}" -eq 0 ]]; then out+=','; fi
    out+='{"name":"'"$(json_escape "${FAILED[$i]}")"'","log":"'"$(json_escape "${FAILED_LOGS[$i]}")"'"}'
    first=0
  done
  out+=']}'
  printf '%s\n' "${out}"
else
  echo
  echo "run-all summary: ${#PASSED[@]} passed, ${#FAILED[@]} failed, total=${#TESTS[@]} (${ELAPSED}s)"
  for name in "${FAILED[@]}"; do
    echo "  ❌ ${name}"
  done
fi

if [[ "${#FAILED[@]}" -gt 0 ]]; then
  exit 1
fi
