#!/usr/bin/env bash

set -euo pipefail

ORG="${1:-ai-webgpu-lab}"
INVENTORY_FILE="${2:-docs/repo-inventory.csv}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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

json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '%s' "$value"
}

emit_topics_json() {
  local first=1
  printf '{"names":['
  for topic in "$@"; do
    if [[ $first -eq 0 ]]; then
      printf ','
    fi
    first=0
    printf '"%s"' "$(json_escape "$topic")"
  done
  printf ']}'
}

topics_for_category() {
  local repo="$1"
  local category="$2"

  local topics=("ai-webgpu-lab")

  case "$category" in
    org)
      topics+=("community-health" "github-templates" "organization")
      ;;
    template)
      topics+=("template" "webgpu" "starter")
      ;;
    shared)
      topics+=("shared" "webgpu" "tooling")
      ;;
    docs)
      topics+=("docs" "roadmap" "benchmarking")
      ;;
    graphics)
      topics+=("graphics" "webgpu" "rendering")
      ;;
    blackhole)
      topics+=("blackhole" "webgpu" "scientific-visualization")
      ;;
    ml)
      topics+=("ml" "browser-ai" "webgpu")
      ;;
    llm)
      topics+=("llm" "browser-ai" "webgpu")
      ;;
    audio)
      topics+=("audio" "browser-ai" "webgpu")
      ;;
    multimodal)
      topics+=("multimodal" "browser-ai" "webgpu")
      ;;
    agent)
      topics+=("agent" "browser-ai" "webgpu")
      ;;
    benchmark)
      topics+=("benchmark" "performance" "webgpu")
      ;;
    app)
      topics+=("demo" "application" "webgpu")
      ;;
    *)
      topics+=("webgpu")
      ;;
  esac

  if [[ "$repo" == ".github" ]]; then
    topics+=("profile")
  fi

  printf '%s\n' "${topics[@]}"
}

while IFS=$'\x1f' read -r repo category purpose priority_group; do
  if [[ -z "$repo" ]]; then
    continue
  fi

  full_repo="${ORG}/${repo}"
  if ! repo_exists "$full_repo"; then
    echo "skip: $full_repo does not exist"
    continue
  fi

  mapfile -t topics < <(topics_for_category "$repo" "$category")
  payload="$(emit_topics_json "${topics[@]}")"

  gh api \
    --method PUT \
    -H "Accept: application/vnd.github+json" \
    "/repos/${full_repo}/topics" \
    --input - >/dev/null <<<"$payload"

  echo "synced topics: $full_repo -> ${topics[*]}"
done < <(python3 "${SCRIPT_DIR}/lib/read-inventory.py" "${INVENTORY_FILE}")
