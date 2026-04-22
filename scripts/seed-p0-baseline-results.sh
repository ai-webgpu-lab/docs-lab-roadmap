#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

OWNER="ai-webgpu-lab"
WORKSPACE="${REPO_ROOT}/tmp/p0-baseline-results"
PUSH_RESULTS=0
COMMIT_RESULTS=1
COMMIT_MESSAGE="Add baseline raw results"
GIT_USER_NAME="$(git -C "${REPO_ROOT}" config --get user.name 2>/dev/null || printf 'automation')"
GIT_USER_EMAIL="$(git -C "${REPO_ROOT}" config --get user.email 2>/dev/null || printf 'automation@example.invalid')"
CAPTURED_BY="${GIT_USER_NAME}"
REPOS=(
  "tpl-webgpu-vanilla"
  "tpl-webgpu-react"
  "exp-embeddings-browser-throughput"
  "exp-llm-chat-runtime-shootout"
  "exp-stt-whisper-webgpu"
  "exp-rag-browser-pipeline"
  "bench-runtime-shootout"
  "bench-model-load-and-cache"
  "bench-worker-isolation-and-ui-jank"
)

usage() {
  cat <<'EOF'
Usage: bash scripts/seed-p0-baseline-results.sh [options]

Options:
  --repo <name>         Capture only the given repo. Repeatable.
  --workspace <path>    Clone/update workspace root. Default: tmp/p0-baseline-results
  --owner <owner>       GitHub org/user name. Default: ai-webgpu-lab
  --captured-by <name>  Value stored in capture metadata. Default: git user.name
  --commit-message <m>  Commit message prefix. Default: Add baseline raw results
  --push                Push result commits to origin after capture
  --no-commit           Skip local git commit after capture
  --help                Show this help
EOF
}

selected_repos=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      selected_repos+=("$2")
      shift 2
      ;;
    --workspace)
      WORKSPACE="$2"
      shift 2
      ;;
    --owner)
      OWNER="$2"
      shift 2
      ;;
    --captured-by)
      CAPTURED_BY="$2"
      shift 2
      ;;
    --commit-message)
      COMMIT_MESSAGE="$2"
      shift 2
      ;;
    --push)
      PUSH_RESULTS=1
      shift
      ;;
    --no-commit)
      COMMIT_RESULTS=0
      shift
      ;;
    --help)
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

if [[ ${#selected_repos[@]} -gt 0 ]]; then
  REPOS=("${selected_repos[@]}")
fi

if [[ ! -d "${REPO_ROOT}/node_modules/playwright" ]]; then
  echo "playwright dependency is missing. Run 'npm install' first." >&2
  exit 1
fi

mkdir -p "${WORKSPACE}"

for repo in "${REPOS[@]}"; do
  dir="${WORKSPACE}/${repo}"
  remote="${OWNER}/${repo}"

  if [[ -d "${dir}/.git" ]]; then
    if [[ -n "$(git -C "${dir}" status --short)" ]]; then
      echo "workspace repo is dirty: ${dir}" >&2
      exit 1
    fi

    git -C "${dir}" fetch --all --prune
    git -C "${dir}" pull --ff-only
  else
    gh repo clone "${remote}" "${dir}"
  fi

  source_commit="$(git -C "${dir}" rev-parse --short HEAD)"
  echo "capturing ${repo} @ ${source_commit}"

  git -C "${dir}" config user.name "${GIT_USER_NAME}"
  git -C "${dir}" config user.email "${GIT_USER_EMAIL}"

  node "${REPO_ROOT}/scripts/capture-p0-baseline-results.mjs" \
    --repo-dir "${dir}" \
    --repo-name "${repo}" \
    --commit "${source_commit}" \
    --owner "${OWNER}" \
    --captured-by "${CAPTURED_BY}"

  if [[ "${COMMIT_RESULTS}" -eq 1 ]]; then
    git -C "${dir}" add RESULTS.md reports/raw reports/screenshots reports/logs
    if git -C "${dir}" diff --cached --quiet; then
      echo "no result changes for ${repo}"
    else
      branch="$(git -C "${dir}" branch --show-current)"
      git -C "${dir}" commit -m "${COMMIT_MESSAGE} (${repo})"
      echo "committed ${repo} on ${branch}"
      if [[ "${PUSH_RESULTS}" -eq 1 ]]; then
        git -C "${dir}" push origin "HEAD:${branch}"
        echo "pushed ${repo}"
      fi
    fi
  fi
done
