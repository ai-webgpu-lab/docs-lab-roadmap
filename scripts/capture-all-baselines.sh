#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

INVENTORY="${REPO_ROOT}/docs/repo-inventory.csv"
OUTPUT_ROOT=""
PRIORITY_FILTER=""
CATEGORY_FILTER=""
DRY_RUN=0
SUMMARY_FILE=""
SUMMARY_MD_FILE=""
COMMIT="all-baselines"
CAPTURED_BY="$(git -C "${REPO_ROOT}" config --get user.name 2>/dev/null || printf 'automation')"
SELECTED_REPOS=()

usage() {
  cat <<'EOF'
Usage: bash scripts/capture-all-baselines.sh [options]

Captures every inventory repo that has a deterministic harness scaffold under
`repo-scaffolds/p0/<repo>/` or `repo-scaffolds/repos/<repo>/`. Each repo is
bootstrapped to a temporary directory, then captured via
`scripts/capture-p0-baseline-results.mjs`. Failures are isolated per repo, and
a summary line is written for each.

Options:
  --inventory <file>     Inventory CSV. Default: docs/repo-inventory.csv
  --output-root <dir>    Workspace root. Default: tmp/all-baselines (auto-created)
  --priority <P0|P1|P2>  Only capture repos at this priority level. Repeatable.
  --category <name>      Only capture repos in this category. Repeatable.
  --repo <name>          Only capture the named repo. Repeatable.
  --captured-by <name>   Capture metadata value. Default: git user.name
  --commit <hash>        Commit value stored in capture metadata.
  --summary <path>       Write a TSV summary (default: <output-root>/summary.tsv).
  --summary-md <path>    Write a markdown summary alongside the TSV.
  --dry-run              List repos that would be captured and exit.
  --help                 Show this help.
EOF
}

priority_filters=()
category_filters=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --inventory)
      INVENTORY="$2"
      shift 2
      ;;
    --output-root)
      OUTPUT_ROOT="$2"
      shift 2
      ;;
    --priority)
      priority_filters+=("$2")
      shift 2
      ;;
    --category)
      category_filters+=("$2")
      shift 2
      ;;
    --repo)
      SELECTED_REPOS+=("$2")
      shift 2
      ;;
    --captured-by)
      CAPTURED_BY="$2"
      shift 2
      ;;
    --commit)
      COMMIT="$2"
      shift 2
      ;;
    --summary)
      SUMMARY_FILE="$2"
      shift 2
      ;;
    --summary-md)
      SUMMARY_MD_FILE="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --help|-h)
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

if [[ -z "${OUTPUT_ROOT}" ]]; then
  OUTPUT_ROOT="${REPO_ROOT}/tmp/all-baselines"
fi
mkdir -p "${OUTPUT_ROOT}"

if [[ -z "${SUMMARY_FILE}" ]]; then
  SUMMARY_FILE="${OUTPUT_ROOT}/summary.tsv"
fi

if [[ -z "${SUMMARY_MD_FILE}" ]]; then
  SUMMARY_MD_FILE="${OUTPUT_ROOT}/summary.md"
fi

priority_match() {
  local priority="$1"
  if [[ ${#priority_filters[@]} -eq 0 ]]; then
    return 0
  fi
  local entry
  for entry in "${priority_filters[@]}"; do
    if [[ "${entry}" == "${priority}" ]]; then
      return 0
    fi
  done
  return 1
}

category_match() {
  local category="$1"
  if [[ ${#category_filters[@]} -eq 0 ]]; then
    return 0
  fi
  local entry
  for entry in "${category_filters[@]}"; do
    if [[ "${entry}" == "${category}" ]]; then
      return 0
    fi
  done
  return 1
}

repo_match() {
  local repo="$1"
  if [[ ${#SELECTED_REPOS[@]} -eq 0 ]]; then
    return 0
  fi
  local entry
  for entry in "${SELECTED_REPOS[@]}"; do
    if [[ "${entry}" == "${repo}" ]]; then
      return 0
    fi
  done
  return 1
}

has_scaffold() {
  local repo="$1"
  if [[ -d "${REPO_ROOT}/repo-scaffolds/repos/${repo}" ]]; then
    return 0
  fi
  if [[ -d "${REPO_ROOT}/repo-scaffolds/p0/${repo}" ]]; then
    return 0
  fi
  return 1
}

selected=()
while IFS=$'\x1f' read -r repo category purpose priority; do
  if [[ -z "${repo}" ]]; then
    continue
  fi

  if ! has_scaffold "${repo}"; then
    continue
  fi

  if ! priority_match "${priority}"; then
    continue
  fi

  if ! category_match "${category}"; then
    continue
  fi

  if ! repo_match "${repo}"; then
    continue
  fi

  selected+=("${repo}|${category}|${priority}")
done < <(python3 "${REPO_ROOT}/scripts/lib/read-inventory.py" "${INVENTORY}")

if [[ ${#selected[@]} -eq 0 ]]; then
  echo "no repos matched the requested filters" >&2
  exit 1
fi

if [[ "${DRY_RUN}" -eq 1 ]]; then
  echo "would capture ${#selected[@]} repos:"
  for entry in "${selected[@]}"; do
    repo="${entry%%|*}"
    rest="${entry#*|}"
    category="${rest%%|*}"
    priority="${rest#*|}"
    printf '  - %s (%s, %s)\n' "${repo}" "${category}" "${priority}"
  done
  exit 0
fi

printf 'repo\tcategory\tpriority\tstatus\tdetail\n' >"${SUMMARY_FILE}"

passed=0
failed=0
total=${#selected[@]}
index=0

for entry in "${selected[@]}"; do
  index=$((index + 1))
  repo="${entry%%|*}"
  rest="${entry#*|}"
  category="${rest%%|*}"
  priority="${rest#*|}"

  echo "[${index}/${total}] ${repo} (${category}, ${priority})"
  repo_workspace="${OUTPUT_ROOT}/${repo}"

  if ! bash "${REPO_ROOT}/scripts/bootstrap-org-repos.sh" \
      --mode local \
      --inventory "${INVENTORY}" \
      --repo "${repo}" \
      --output-root "${OUTPUT_ROOT}" \
      --no-sync \
      --refresh-generated \
      --refresh-readme >/dev/null 2>&1; then
    failed=$((failed + 1))
    printf '%s\t%s\t%s\tbootstrap-failed\t-\n' "${repo}" "${category}" "${priority}" >>"${SUMMARY_FILE}"
    echo "  bootstrap failed for ${repo}" >&2
    continue
  fi

  capture_log="${repo_workspace}/capture-stderr.log"
  if node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
      --repo-dir "${repo_workspace}" \
      --repo-name "${repo}" \
      --commit "${COMMIT}" \
      --captured-by "${CAPTURED_BY}" >/dev/null 2>"${capture_log}"; then
    raw_count="$(find "${repo_workspace}/reports/raw" -maxdepth 1 -type f -name '*.json' 2>/dev/null | wc -l | tr -d ' ')"
    passed=$((passed + 1))
    printf '%s\t%s\t%s\tok\traw=%s\n' "${repo}" "${category}" "${priority}" "${raw_count}" >>"${SUMMARY_FILE}"
    echo "  captured ${raw_count} raw result(s)"
  else
    failed=$((failed + 1))
    detail="$(tail -1 "${capture_log}" 2>/dev/null | tr '\t' ' ' | tr '\n' ' ' | head -c 160)"
    if [[ -z "${detail}" ]]; then
      detail="capture-failed"
    fi
    printf '%s\t%s\t%s\tcapture-failed\t%s\n' "${repo}" "${category}" "${priority}" "${detail}" >>"${SUMMARY_FILE}"
    echo "  capture failed for ${repo}: ${detail}" >&2
  fi
done

{
  printf '# capture-all-baselines summary\n\n'
  printf -- '- generated: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf -- '- total: %s\n' "${total}"
  printf -- '- ok: %s\n' "${passed}"
  printf -- '- failed: %s\n' "${failed}"
  printf '\n## Results\n\n'
  printf '| repo | category | priority | status | detail |\n'
  printf '|---|---|---|---|---|\n'
  awk -F'\t' 'NR>1 {gsub(/\|/, "\\|"); printf "| %s | %s | %s | %s | %s |\n", $1, $2, $3, $4, $5}' "${SUMMARY_FILE}"
} >"${SUMMARY_MD_FILE}"

printf '\nsummary: %s ok, %s failed (total=%s)\n' "${passed}" "${failed}" "${total}"
printf 'summary file: %s\n' "${SUMMARY_FILE}"
printf 'summary markdown: %s\n' "${SUMMARY_MD_FILE}"

if [[ "${failed}" -gt 0 ]]; then
  exit 1
fi
