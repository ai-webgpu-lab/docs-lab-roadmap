#!/usr/bin/env bash

set -euo pipefail

ORG="${1:-ai-webgpu-lab}"
INVENTORY_FILE="${2:-docs/repo-inventory.csv}"

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required." >&2
  exit 1
fi

if [[ ! -f "$INVENTORY_FILE" ]]; then
  echo "Inventory file not found: $INVENTORY_FILE" >&2
  exit 1
fi

repo_exists() {
  gh repo view "$1" >/dev/null 2>&1
}

sync_label() {
  local repo="$1"
  local name="$2"
  local color="$3"
  local description="$4"

  gh label create "$name" \
    --repo "$repo" \
    --color "$color" \
    --description "$description" \
    --force >/dev/null
}

while IFS=, read -r repo category purpose priority_group; do
  if [[ "$repo" == "repo" ]]; then
    continue
  fi

  full_repo="${ORG}/${repo}"
  if ! repo_exists "$full_repo"; then
    echo "skip: $full_repo does not exist"
    continue
  fi

  sync_label "$full_repo" "benchmark" "0e8a16" "Benchmark scenario or measurement work"
  sync_label "$full_repo" "blocked" "b60205" "Currently blocked by dependency or decision"
  sync_label "$full_repo" "demo-live" "fbca04" "Public demo is live"
  sync_label "$full_repo" "docs" "0075ca" "Documentation, ADR, or reporting work"
  sync_label "$full_repo" "experiment" "5319e7" "Experiment proposal or execution work"
  sync_label "$full_repo" "integration" "1d76db" "Integrated demo or showcase work"
  sync_label "$full_repo" "infra" "6f42c1" "Shared tooling, CI, schema, or org operations"
  sync_label "$full_repo" "priority:p0" "b60205" "Highest priority"
  sync_label "$full_repo" "priority:p1" "d93f0b" "Important but not immediate"
  sync_label "$full_repo" "priority:p2" "fbca04" "Exploratory or later priority"
  sync_label "$full_repo" "priority:p3" "c2e0c6" "Backlog or later follow-up"
  sync_label "$full_repo" "results-published" "1f883d" "Results have been published"

  echo "synced labels: $full_repo"
done < "$INVENTORY_FILE"
