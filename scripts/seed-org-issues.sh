#!/usr/bin/env bash

set -euo pipefail

ORG="ai-webgpu-lab"
ISSUES_FILE="issues/initial-draft-issues-30.csv"
PROJECT_TITLE="AI WebGPU Lab — Master"
TARGET_REPO=""
LIMIT=""
DRY_RUN=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

usage() {
  cat <<'EOF'
Usage:
  bash scripts/seed-org-issues.sh [options]

Options:
  --org NAME               GitHub organization name
  --issues-file FILE       Seed issue CSV file
  --project-title TITLE    GitHub Project title to attach created issues to
  --no-project             Create issues without adding them to a project
  --repo NAME              Only process a single target repo from the CSV
  --limit N                Only process the first N matching rows
  --dry-run                Print planned actions without calling GitHub
  -h, --help               Show help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --org)
      ORG="$2"
      shift 2
      ;;
    --issues-file)
      ISSUES_FILE="$2"
      shift 2
      ;;
    --project-title)
      PROJECT_TITLE="$2"
      shift 2
      ;;
    --no-project)
      PROJECT_TITLE=""
      shift
      ;;
    --repo)
      TARGET_REPO="$2"
      shift 2
      ;;
    --limit)
      LIMIT="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ ! -f "${REPO_ROOT}/${ISSUES_FILE}" && ! -f "${ISSUES_FILE}" ]]; then
  echo "Issues file not found: ${ISSUES_FILE}" >&2
  exit 1
fi

if [[ -f "${REPO_ROOT}/${ISSUES_FILE}" ]]; then
  ISSUES_PATH="${REPO_ROOT}/${ISSUES_FILE}"
else
  ISSUES_PATH="${ISSUES_FILE}"
fi

if [[ -n "${LIMIT}" && ! "${LIMIT}" =~ ^[0-9]+$ ]]; then
  echo "--limit must be a non-negative integer" >&2
  exit 1
fi

if [[ "${DRY_RUN}" -eq 0 ]]; then
  if ! command -v gh >/dev/null 2>&1; then
    echo "gh CLI is required." >&2
    exit 1
  fi

  if ! command -v jq >/dev/null 2>&1; then
    echo "jq is required." >&2
    exit 1
  fi
fi

type_label_for_issue_type() {
  case "$1" in
    infra)
      echo "infra"
      ;;
    docs)
      echo "docs"
      ;;
    benchmark)
      echo "benchmark"
      ;;
    experiment)
      echo "experiment"
      ;;
    integration)
      echo "integration"
      ;;
    *)
      echo ""
      ;;
  esac
}

priority_label_for_value() {
  local value="$1"
  printf 'priority:%s' "$(printf '%s' "${value}" | tr '[:upper:]' '[:lower:]')"
}

render_issue_body() {
  local repo="$1"
  local issue_type="$2"
  local priority="$3"
  local track="$4"
  local summary="$5"

  cat <<EOF
## Summary
${summary}

## Metadata
- Repo: \`${repo}\`
- Track: ${track}
- Type: \`${issue_type}\`
- Priority: \`${priority}\`

## Expected Outcome
- Establish the first concrete baseline or operational deliverable for this scope.
- Update \`README.md\`, \`RESULTS.md\`, and raw outputs where applicable.
- Record fallback paths, blockers, and next-step decisions when scope changes.

## Source
- Seeded from \`issues/initial-draft-issues-30.csv\`
- Master plan reference: \`docs/07-master-experiment-plan.md\`
EOF
}

project_number_for_title() {
  local title="$1"

  gh project list --owner "${ORG}" --limit 200 --format json |
    jq -r --arg title "${title}" '.projects[] | select(.title == $title) | .number' |
    head -n 1
}

issue_url_for_title() {
  local full_repo="$1"
  local title="$2"

  gh issue list --repo "${full_repo}" --state all --limit 200 --json title,url |
    jq -r --arg title "${title}" '.[] | select(.title == $title) | .url' |
    head -n 1
}

iter_issue_rows() {
  python3 - "${ISSUES_PATH}" <<'PY'
import csv
import sys

path = sys.argv[1]
separator = "\x1f"

with open(path, newline="", encoding="utf-8-sig") as handle:
    reader = csv.DictReader(handle)
    for row in reader:
        values = [
            row["title"].replace("\n", " ").replace("\r", " "),
            row["repo"].replace("\n", " ").replace("\r", " "),
            row["type"].replace("\n", " ").replace("\r", " "),
            row["priority"].replace("\n", " ").replace("\r", " "),
            row["track"].replace("\n", " ").replace("\r", " "),
            row["summary"].replace("\n", " ").replace("\r", " "),
        ]
        print(separator.join(values))
PY
}

PROJECT_NUMBER=""
if [[ -n "${PROJECT_TITLE}" && "${DRY_RUN}" -eq 0 ]]; then
  PROJECT_NUMBER="$(project_number_for_title "${PROJECT_TITLE}")"
  if [[ -z "${PROJECT_NUMBER}" ]]; then
    echo "Project not found: ${PROJECT_TITLE}" >&2
    exit 1
  fi
fi

created_count=0
skipped_count=0
processed_count=0

while IFS=$'\x1f' read -r title repo issue_type priority track summary; do
  if [[ -z "${title}" ]]; then
    continue
  fi

  if [[ -n "${TARGET_REPO}" && "${repo}" != "${TARGET_REPO}" ]]; then
    continue
  fi

  if [[ -n "${LIMIT}" && "${processed_count}" -ge "${LIMIT}" ]]; then
    break
  fi

  processed_count=$((processed_count + 1))
  full_repo="${ORG}/${repo}"
  type_label="$(type_label_for_issue_type "${issue_type}")"
  priority_label="$(priority_label_for_value "${priority}")"
  body="$(render_issue_body "${repo}" "${issue_type}" "${priority}" "${track}" "${summary}")"

  if [[ "${DRY_RUN}" -eq 1 ]]; then
    if [[ -n "${PROJECT_TITLE}" ]]; then
      echo "dry-run create: ${full_repo} :: ${title} :: labels=${type_label},${priority_label} :: project=${PROJECT_TITLE}"
    else
      echo "dry-run create: ${full_repo} :: ${title} :: labels=${type_label},${priority_label}"
    fi
    continue
  fi

  if ! gh repo view "${full_repo}" >/dev/null 2>&1; then
    echo "skip: ${full_repo} does not exist"
    skipped_count=$((skipped_count + 1))
    continue
  fi

  existing_url="$(issue_url_for_title "${full_repo}" "${title}")"
  if [[ -n "${existing_url}" ]]; then
    echo "skip existing issue: ${existing_url}"
    skipped_count=$((skipped_count + 1))
    continue
  fi

  create_args=(
    issue create
    --repo "${full_repo}"
    --title "${title}"
    --body "${body}"
    --label "${priority_label}"
  )

  if [[ -n "${type_label}" ]]; then
    create_args+=(--label "${type_label}")
  fi

  issue_url="$(gh "${create_args[@]}")"

  if [[ -n "${PROJECT_NUMBER}" ]]; then
    gh project item-add "${PROJECT_NUMBER}" --owner "${ORG}" --url "${issue_url}" >/dev/null
  fi

  echo "created issue: ${issue_url}"
  created_count=$((created_count + 1))
done < <(iter_issue_rows)

if [[ "${DRY_RUN}" -eq 1 ]]; then
  echo "dry-run summary: planned=${processed_count}"
else
  echo "seed summary: created=${created_count} skipped=${skipped_count} processed=${processed_count}"
fi
