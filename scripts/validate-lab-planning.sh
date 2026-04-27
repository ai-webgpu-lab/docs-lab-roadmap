#!/usr/bin/env bash

set -euo pipefail

INVENTORY_FILE="docs/repo-inventory.csv"
ISSUES_FILE="issues/initial-draft-issues-30.csv"
MASTER_PLAN_FILE="docs/07-master-experiment-plan.md"
EXECUTION_PLAN_FILE="docs/06-six-week-execution-plan.md"
SKIP_INFRA_FIXTURES=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/validate-lab-planning.sh [options]

Options:
  --inventory FILE         Inventory CSV file
  --issues-file FILE       Seed issue CSV file
  --master-plan FILE       Master experiment plan markdown file
  --execution-plan FILE    Six-week execution plan markdown file
  --skip-infra-fixtures    Skip the infra fixture drift check
  -h, --help               Show help
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --inventory)
      INVENTORY_FILE="$2"
      shift 2
      ;;
    --issues-file)
      ISSUES_FILE="$2"
      shift 2
      ;;
    --master-plan)
      MASTER_PLAN_FILE="$2"
      shift 2
      ;;
    --execution-plan)
      EXECUTION_PLAN_FILE="$2"
      shift 2
      ;;
    --skip-infra-fixtures)
      SKIP_INFRA_FIXTURES=1
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

resolve_input_path() {
  local candidate="$1"

  if [[ -f "${REPO_ROOT}/${candidate}" ]]; then
    printf '%s\n' "${REPO_ROOT}/${candidate}"
    return
  fi

  if [[ -f "${candidate}" ]]; then
    printf '%s\n' "${candidate}"
    return
  fi

  printf '%s\n' "${REPO_ROOT}/${candidate}"
}

INVENTORY_PATH="$(resolve_input_path "${INVENTORY_FILE}")"
ISSUES_PATH="$(resolve_input_path "${ISSUES_FILE}")"
MASTER_PLAN_PATH="$(resolve_input_path "${MASTER_PLAN_FILE}")"
EXECUTION_PLAN_PATH="$(resolve_input_path "${EXECUTION_PLAN_FILE}")"

for path in "${INVENTORY_PATH}" "${ISSUES_PATH}" "${MASTER_PLAN_PATH}" "${EXECUTION_PLAN_PATH}"; do
  if [[ ! -f "${path}" ]]; then
    echo "Required file not found: ${path}" >&2
    exit 1
  fi
done

python3 - "${INVENTORY_PATH}" "${ISSUES_PATH}" "${MASTER_PLAN_PATH}" "${EXECUTION_PLAN_PATH}" <<'PY2'
import csv
import re
import sys
from collections import Counter

inventory_path, issues_path, master_plan_path, execution_plan_path = sys.argv[1:5]

allowed_inventory_categories = {
    "org",
    "template",
    "shared",
    "docs",
    "graphics",
    "blackhole",
    "ml",
    "llm",
    "audio",
    "multimodal",
    "agent",
    "benchmark",
    "app",
}
allowed_priority_values = {"P0", "P1", "P2", "P3"}
allowed_issue_types = {"infra", "docs", "benchmark", "experiment", "integration"}
expected_issue_type_by_category = {
    "org": {"infra"},
    "template": {"infra"},
    "shared": {"infra"},
    "docs": {"docs"},
    "graphics": {"experiment"},
    "blackhole": {"experiment"},
    "ml": {"experiment"},
    "llm": {"experiment"},
    "audio": {"experiment"},
    "multimodal": {"experiment"},
    "agent": {"experiment"},
    "benchmark": {"benchmark"},
    "app": {"integration"},
}
expected_title_prefix_by_type = {
    "infra": "[infra]",
    "docs": "[docs]",
    "benchmark": "[bench]",
    "experiment": "[exp]",
    "integration": "[app]",
}


def read_csv(path):
    with open(path, newline="", encoding="utf-8-sig") as handle:
        return list(csv.DictReader(handle))


def read_text(path):
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def extract_section(text, heading):
    pattern = rf"^{re.escape(heading)}\n(.*?)(?=^## |\Z)"
    match = re.search(pattern, text, flags=re.MULTILINE | re.DOTALL)
    return match.group(1) if match else ""


inventory_rows = read_csv(inventory_path)
issue_rows = read_csv(issues_path)
master_plan_text = read_text(master_plan_path)
execution_plan_text = read_text(execution_plan_path)

errors = []
inventory_repos = []
inventory_by_repo = {}
inventory_category_counts = Counter()
inventory_priority_counts = Counter()

required_inventory_fields = ["repo", "category", "purpose", "priority_group"]
for field in required_inventory_fields:
    if not inventory_rows or field not in inventory_rows[0]:
        errors.append(f"inventory is missing required column '{field}'")

for line_no, row in enumerate(inventory_rows, start=2):
    repo = (row.get("repo") or "").strip()
    category = (row.get("category") or "").strip()
    purpose = (row.get("purpose") or "").strip()
    priority = (row.get("priority_group") or "").strip()

    if not repo or not category or not purpose or not priority:
        errors.append(f"inventory row {line_no} has an empty required field")
        continue
    if repo in inventory_by_repo:
        errors.append(f"inventory row {line_no} duplicates repo '{repo}'")
        continue
    if category not in allowed_inventory_categories:
        errors.append(f"inventory row {line_no} has unknown category '{category}'")
    if priority not in allowed_priority_values:
        errors.append(f"inventory row {line_no} has unknown priority '{priority}'")

    inventory_by_repo[repo] = row
    inventory_repos.append(repo)
    inventory_category_counts[category] += 1
    inventory_priority_counts[priority] += 1

required_issue_fields = ["title", "repo", "type", "priority", "track", "summary"]
for field in required_issue_fields:
    if not issue_rows or field not in issue_rows[0]:
        errors.append(f"issue seed file is missing required column '{field}'")

issue_repo_set = set()
issue_pair_set = set()
for line_no, row in enumerate(issue_rows, start=2):
    title = (row.get("title") or "").strip()
    repo = (row.get("repo") or "").strip()
    issue_type = (row.get("type") or "").strip()
    priority = (row.get("priority") or "").strip()
    track = (row.get("track") or "").strip()
    summary = (row.get("summary") or "").strip()

    if not title or not repo or not issue_type or not priority or not track or not summary:
        errors.append(f"issue row {line_no} has an empty required field")
        continue
    if repo not in inventory_by_repo:
        errors.append(
            f"issue row {line_no} references repo '{repo}' which is not present in inventory"
        )
        continue
    if issue_type not in allowed_issue_types:
        errors.append(f"issue row {line_no} has unknown type '{issue_type}'")
    if priority not in allowed_priority_values:
        errors.append(f"issue row {line_no} has unknown priority '{priority}'")

    expected_types = expected_issue_type_by_category[inventory_by_repo[repo]["category"]]
    if issue_type not in expected_types:
        allowed = ", ".join(sorted(expected_types))
        errors.append(
            f"issue row {line_no} uses type '{issue_type}' for repo '{repo}', expected one of: {allowed}"
        )

    expected_prefix = expected_title_prefix_by_type.get(issue_type)
    if expected_prefix and not title.startswith(expected_prefix):
        errors.append(
            f"issue row {line_no} title '{title}' does not start with expected prefix '{expected_prefix}'"
        )

    pair = (repo, title)
    if pair in issue_pair_set:
        errors.append(f"issue row {line_no} duplicates title '{title}' for repo '{repo}'")
    issue_pair_set.add(pair)
    issue_repo_set.add(repo)

required_master_sections = [
    "### Phase 0 — Organization Bootstrap",
    "### Phase 1 — P0 Baseline",
    "### Phase 2 — P1 Expansion",
    "### Phase 3 — P2 Research Portfolio",
    "## 검증 전략",
    "## 종료 조건",
]
for section in required_master_sections:
    if section not in master_plan_text:
        errors.append(f"master plan is missing section '{section}'")

required_week_sections = [f"## Week {index} " for index in range(1, 7)]
for section in required_week_sections:
    if section not in execution_plan_text:
        errors.append(f"execution plan is missing week heading starting with '{section}'")

p0_repos = [
    row["repo"].strip()
    for row in inventory_rows
    if (row.get("priority_group") or "").strip() == "P0"
]
missing_p0_in_master = [repo for repo in p0_repos if repo and repo not in master_plan_text]
if missing_p0_in_master:
    errors.append(
        "master plan does not mention all P0 repos: " + ", ".join(missing_p0_in_master)
    )

execution_target_section = extract_section(execution_plan_text, "## 대상 저장소")
if not execution_target_section:
    errors.append("execution plan is missing the '## 대상 저장소' section")
    execution_target_repos = []
else:
    execution_target_repos = [
        repo for repo in inventory_repos if repo in execution_target_section
    ]

if execution_target_repos:
    non_p0_targets = [
        repo
        for repo in execution_target_repos
        if inventory_by_repo[repo]["priority_group"].strip() != "P0"
    ]
    if non_p0_targets:
        errors.append(
            "execution plan target repos must be P0 in inventory: "
            + ", ".join(non_p0_targets)
        )

    missing_execution_issues = [
        repo for repo in execution_target_repos if repo not in issue_repo_set
    ]
    if missing_execution_issues:
        errors.append(
            "execution plan target repos are missing seeded issues: "
            + ", ".join(missing_execution_issues)
        )

if errors:
    print("planning validation failed:", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    sys.exit(1)

print("planning validation passed")
print(f"- inventory repos: {len(inventory_repos)}")
print(f"- issue rows: {len(issue_rows)}")
print(
    "- inventory priorities: "
    + ", ".join(
        f"{priority}={inventory_priority_counts[priority]}"
        for priority in sorted(inventory_priority_counts)
    )
)
print(
    "- inventory categories: "
    + ", ".join(
        f"{category}={inventory_category_counts[category]}"
        for category in sorted(inventory_category_counts)
    )
)
print(f"- master plan P0 coverage: {len(p0_repos)}/{len(p0_repos)}")
print(
    f"- execution plan target repos with seeded issues: "
    f"{len(execution_target_repos)}/{len(execution_target_repos)}"
)
PY2

if [[ "${SKIP_INFRA_FIXTURES}" -eq 0 ]]; then
  if [[ -f "${SCRIPT_DIR}/validate-infra-fixtures.mjs" ]]; then
    node "${SCRIPT_DIR}/validate-infra-fixtures.mjs"
  fi
fi
