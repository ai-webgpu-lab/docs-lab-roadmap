#!/usr/bin/env bash

set -euo pipefail

ORG="ai-webgpu-lab"
INVENTORY_FILE="docs/repo-inventory.csv"
MODE="github"
OUTPUT_ROOT=""
TARGET_REPO=""
VISIBILITY="public"
RUN_SYNC=1

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

usage() {
  cat <<'EOF'
Usage:
  bash scripts/bootstrap-org-repos.sh [options]

Options:
  --org NAME               GitHub organization name
  --inventory FILE         Inventory CSV file
  --mode github|local      GitHub mode creates/updates repos, local mode renders scaffolds only
  --output-root DIR        Required in local mode
  --repo NAME              Only process a single repo from the inventory
  --visibility public|private
  --no-sync                Skip label/topic sync at the end
  -h, --help               Show help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --org)
      ORG="$2"
      shift 2
      ;;
    --inventory)
      INVENTORY_FILE="$2"
      shift 2
      ;;
    --mode)
      MODE="$2"
      shift 2
      ;;
    --output-root)
      OUTPUT_ROOT="$2"
      shift 2
      ;;
    --repo)
      TARGET_REPO="$2"
      shift 2
      ;;
    --visibility)
      VISIBILITY="$2"
      shift 2
      ;;
    --no-sync)
      RUN_SYNC=0
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

if [[ ! -f "${REPO_ROOT}/${INVENTORY_FILE}" && ! -f "${INVENTORY_FILE}" ]]; then
  echo "Inventory file not found: ${INVENTORY_FILE}" >&2
  exit 1
fi

if [[ -f "${REPO_ROOT}/${INVENTORY_FILE}" ]]; then
  INVENTORY_PATH="${REPO_ROOT}/${INVENTORY_FILE}"
else
  INVENTORY_PATH="${INVENTORY_FILE}"
fi

if [[ "${MODE}" != "github" && "${MODE}" != "local" ]]; then
  echo "--mode must be github or local" >&2
  exit 1
fi

if [[ "${MODE}" == "local" && -z "${OUTPUT_ROOT}" ]]; then
  echo "--output-root is required in local mode" >&2
  exit 1
fi

if [[ "${MODE}" == "github" ]] && ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required in github mode" >&2
  exit 1
fi

if [[ "${MODE}" == "github" ]] && ! command -v git >/dev/null 2>&1; then
  echo "git is required in github mode" >&2
  exit 1
fi

slugify() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr ' /' '--'
}

track_for_category() {
  case "$1" in
    graphics)
      echo "Graphics"
      ;;
    blackhole)
      echo "Blackhole"
      ;;
    ml)
      echo "ML"
      ;;
    llm)
      echo "LLM"
      ;;
    audio)
      echo "Audio"
      ;;
    multimodal)
      echo "Multimodal"
      ;;
    agent)
      echo "Agent"
      ;;
    benchmark)
      echo "Benchmark"
      ;;
    app)
      echo "Integration"
      ;;
    template)
      echo "Infra"
      ;;
    shared)
      echo "Infra"
      ;;
    docs)
      echo "Docs"
      ;;
    org)
      echo "Infra"
      ;;
    *)
      echo "Infra"
      ;;
  esac
}

kind_for_category() {
  case "$1" in
    benchmark)
      echo "benchmark"
      ;;
    app)
      echo "integration"
      ;;
    docs)
      echo "docs"
      ;;
    template|shared|org)
      echo "infra"
      ;;
    *)
      echo "experiment"
      ;;
  esac
}

needs_results_scaffold() {
  case "$1" in
    template|graphics|blackhole|ml|llm|audio|multimodal|agent|benchmark|app)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

needs_schema_copy() {
  case "$1" in
    template|graphics|blackhole|ml|llm|audio|multimodal|agent|benchmark|app)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

write_file() {
  local path="$1"
  mkdir -p "$(dirname "$path")"
  cat >"$path"
}

write_file_if_missing() {
  local path="$1"

  if [[ -f "${path}" ]]; then
    cat >/dev/null
    return
  fi

  write_file "${path}"
}

copy_file_if_missing() {
  local src="$1"
  local dest="$2"

  mkdir -p "$(dirname "${dest}")"
  if [[ ! -f "${dest}" ]]; then
    cp "${src}" "${dest}"
  fi
}

create_common_files() {
  local dir="$1"

  write_file_if_missing "${dir}/.gitignore" <<'EOF'
.DS_Store
Thumbs.db

node_modules/
dist/
coverage/
.cache/

.idea/
.vscode/
EOF

  write_file_if_missing "${dir}/LICENSE" <<'EOF'
MIT License

Copyright (c) 2026 ai-webgpu-lab

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
EOF
}

create_result_scaffold() {
  local dir="$1"

  mkdir -p "${dir}/src" "${dir}/public" "${dir}/reports/raw" "${dir}/reports/screenshots" "${dir}/reports/logs"
  : >"${dir}/src/.gitkeep"
  : >"${dir}/public/.gitkeep"
  : >"${dir}/reports/raw/.gitkeep"
  : >"${dir}/reports/screenshots/.gitkeep"
  : >"${dir}/reports/logs/.gitkeep"
}

copy_results_template() {
  local dir="$1"
  copy_file_if_missing "${REPO_ROOT}/templates/RESULTS-template.md" "${dir}/RESULTS.md"
}

copy_schema() {
  local dir="$1"
  mkdir -p "${dir}/schemas"
  copy_file_if_missing "${REPO_ROOT}/schemas/ai-webgpu-lab-result.schema.json" "${dir}/schemas/ai-webgpu-lab-result.schema.json"
}

render_org_repo() {
  local dir="$1"

  mkdir -p "${dir}/.github/ISSUE_TEMPLATE" "${dir}/profile"
  cp "${REPO_ROOT}/.github/ISSUE_TEMPLATE/"*.yml "${dir}/.github/ISSUE_TEMPLATE/"
  cp "${REPO_ROOT}/.github/pull_request_template.md" "${dir}/.github/pull_request_template.md"
  cp "${REPO_ROOT}/.github/CODEOWNERS" "${dir}/.github/CODEOWNERS"
  cp "${REPO_ROOT}/.github/ISSUE_TEMPLATE/config.yml" "${dir}/.github/ISSUE_TEMPLATE/config.yml"

  write_file "${dir}/README.md" <<'EOF'
# ai-webgpu-lab/.github

Organization-wide community health files for AI WebGPU Lab.

## Included
- Issue forms for experiments, benchmarks, infra, docs, and bugs
- Pull request template
- Organization profile README
- Default `CODEOWNERS`

## Notes
- Repository-specific benchmark assets and schemas live in `docs-lab-roadmap` or the target repository.
- This repository provides organization defaults for public repositories in `ai-webgpu-lab`.
- Planning and bootstrap source material lives in `ai-webgpu-lab/docs-lab-roadmap`.
EOF

  write_file "${dir}/CONTRIBUTING.md" <<'EOF'
# Contributing

This repository provides organization defaults. Changes here affect issue and pull request UX across repositories.

## Minimum Requirements
- Update `README.md` when scope or setup changes.
- Add or update `RESULTS.md` for experiment and benchmark repositories.
- Keep raw result JSON in `reports/raw/` and validate it against the shared schema.
- Attach screenshots or logs to pull requests when relevant.

## Reporting Conventions
- Separate cold and warm cache runs.
- Record fallback reasons explicitly.
- Prefer reproducible scenarios over ad hoc measurements.

## When Editing This Repository
- Keep issue forms aligned with `docs-lab-roadmap`.
- Treat templates here as organization-wide defaults, not repo-specific customizations.
- Update the organization profile when the active repository set or lab focus changes.
EOF

  cp "${REPO_ROOT}/templates/RESULTS-template.md" "${dir}/RESULTS-template.md"

  write_file "${dir}/profile/README.md" <<'EOF'
# AI WebGPU Lab

Browser-first research organization for WebGPU graphics, scientific visualization, and on-device AI workloads.

## Focus Areas
- WebGPU graphics library comparisons
- Blackhole, compute, and scientific visualization experiments
- Browser ML, LLM, audio, multimodal, and agent baselines
- Reproducible benchmark harnesses and demo applications

## Repository Model
- `tpl-*`: starter templates
- `shared-*`: shared schema, capability, and automation utilities
- `exp-*`: single-question experiments
- `bench-*`: comparison and measurement harnesses
- `app-*`: integrated demos and showcases
- `docs-*`: roadmap, ADR, and reporting repositories

## Operating Rules
- One repository answers one question.
- Every experiment publishes `RESULTS.md` and raw JSON output.
- WebGPU-first, with fallback paths recorded explicitly.
- Repositories are reviewed on a promote / continue / archive cadence.

## Start Here
- Master summary: `docs-lab-roadmap/docs/00-master-summary.md`
- Repository map: `docs-lab-roadmap/docs/01-org-repo-map.md`
- Projects design: `docs-lab-roadmap/docs/04-github-projects-design.md`
EOF
}

render_shared_bench_schema_repo() {
  local dir="$1"
  local repo="$2"
  local purpose="$3"
  local priority="$4"

  mkdir -p "${dir}/docs" "${dir}/schemas" "${dir}/templates"
  cp "${REPO_ROOT}/schemas/ai-webgpu-lab-result.schema.json" "${dir}/schemas/ai-webgpu-lab-result.schema.json"
  cp "${REPO_ROOT}/templates/RESULTS-template.md" "${dir}/templates/RESULTS-template.md"
  cp "${REPO_ROOT}/templates/example-result.json" "${dir}/templates/example-result.json"

  write_file_if_missing "${dir}/README.md" <<EOF
# ${repo}

${purpose}.

## Track
- Infra

## Priority
- ${priority}

## Included
- \`schemas/ai-webgpu-lab-result.schema.json\`
- \`templates/example-result.json\`
- \`templates/RESULTS-template.md\`
- \`docs/RESULT-RULES.md\`

## Intended Use
Copy the schema and templates into experiment, benchmark, and app repositories that emit reproducible results.
EOF

  write_file_if_missing "${dir}/docs/RESULT-RULES.md" <<'EOF'
# Result Rules

- Keep raw outputs in `reports/raw/`.
- Record browser, OS, device, backend, worker mode, and cache state.
- Keep `RESULTS.md` in sync with the published raw JSON.
- Prefer multiple runs over one-off measurements.
EOF
}

render_shared_repo() {
  local dir="$1"
  local repo="$2"
  local purpose="$3"
  local priority="$4"

  mkdir -p "${dir}/src" "${dir}/docs"
  : >"${dir}/src/.gitkeep"
  : >"${dir}/docs/.gitkeep"

  write_file_if_missing "${dir}/README.md" <<EOF
# ${repo}

${purpose}.

## Track
- Infra

## Priority
- ${priority}

## Bootstrap Status
- Shared repository scaffold initialized
- Ready for reusable utilities, workflows, or schema support code

## Next Steps
- Define the public surface area for consumers
- Document integration points with target repositories
- Add the first reusable module or workflow
EOF
}

render_docs_repo() {
  local dir="$1"
  local repo="$2"
  local purpose="$3"
  local priority="$4"

  mkdir -p "${dir}/docs"
  : >"${dir}/docs/.gitkeep"

  write_file_if_missing "${dir}/README.md" <<EOF
# ${repo}

${purpose}.

## Track
- Docs

## Priority
- ${priority}

## Bootstrap Status
- Documentation repository scaffold initialized
- Ready for ADRs, reports, and planning documents

## Next Steps
- Add the first roadmap or decision document
- Link related repositories and experiments
- Keep planning artifacts aligned with the organization inventory
EOF
}

render_work_repo() {
  local dir="$1"
  local repo="$2"
  local category="$3"
  local purpose="$4"
  local priority="$5"

  local track
  local kind
  track="$(track_for_category "${category}")"
  kind="$(kind_for_category "${category}")"

  create_result_scaffold "${dir}"
  copy_results_template "${dir}"
  copy_schema "${dir}"

  write_file_if_missing "${dir}/README.md" <<EOF
# ${repo}

${purpose}.

## Track
- ${track}

## Priority
- ${priority}

## Kind
- ${kind}

## Bootstrap Status
- Repository scaffold initialized
- Shared result schema copied to \`schemas/ai-webgpu-lab-result.schema.json\`
- Shared reporting template copied to \`RESULTS.md\`

## Next Steps
- Define the concrete ${kind} question and acceptance criteria
- Implement the first runnable baseline in \`src/\`
- Store raw run outputs in \`reports/raw/\`
EOF
}

render_repo() {
  local dir="$1"
  local repo="$2"
  local category="$3"
  local purpose="$4"
  local priority="$5"

  create_common_files "${dir}"

  case "${category}" in
    org)
      render_org_repo "${dir}"
      ;;
    docs)
      render_docs_repo "${dir}" "${repo}" "${purpose}" "${priority}"
      ;;
    shared)
      if [[ "${repo}" == "shared-bench-schema" ]]; then
        render_shared_bench_schema_repo "${dir}" "${repo}" "${purpose}" "${priority}"
      else
        render_shared_repo "${dir}" "${repo}" "${purpose}" "${priority}"
      fi
      ;;
    template|graphics|blackhole|ml|llm|audio|multimodal|agent|benchmark|app)
      render_work_repo "${dir}" "${repo}" "${category}" "${purpose}" "${priority}"
      ;;
    *)
      render_shared_repo "${dir}" "${repo}" "${purpose}" "${priority}"
      ;;
  esac
}

repo_exists() {
  gh repo view "$1" >/dev/null 2>&1
}

ensure_repo_exists() {
  local full_repo="$1"
  local description="$2"

  if repo_exists "${full_repo}"; then
    gh repo edit "${full_repo}" --description "${description}" >/dev/null
    return
  fi

  gh repo create "${full_repo}" --"${VISIBILITY}" --description "${description}" --disable-wiki >/dev/null
}

configure_git_identity() {
  local dir="$1"
  local name
  local email

  name="$(git -C "${REPO_ROOT}" config user.name || true)"
  email="$(git -C "${REPO_ROOT}" config user.email || true)"

  if [[ -n "${name}" ]]; then
    git -C "${dir}" config user.name "${name}"
  fi

  if [[ -n "${email}" ]]; then
    git -C "${dir}" config user.email "${email}"
  fi
}

commit_if_needed() {
  local dir="$1"
  local message="$2"

  if [[ -z "$(git -C "${dir}" status --short)" ]]; then
    return 1
  fi

  git -C "${dir}" add .
  git -C "${dir}" commit -m "${message}" >/dev/null
  return 0
}

process_repo_local() {
  local repo="$1"
  local category="$2"
  local purpose="$3"
  local priority="$4"
  local dest_dir="${OUTPUT_ROOT}/${repo}"

  mkdir -p "${dest_dir}"
  render_repo "${dest_dir}" "${repo}" "${category}" "${purpose}" "${priority}"
  echo "rendered local scaffold: ${dest_dir}"
}

process_repo_github() {
  local repo="$1"
  local category="$2"
  local purpose="$3"
  local priority="$4"
  local full_repo="${ORG}/${repo}"
  local work_root
  local work_dir
  local repo_already_exists=0

  if repo_exists "${full_repo}"; then
    repo_already_exists=1
    work_root="$(mktemp -d)"
    gh repo clone "${full_repo}" "${work_root}/${repo}" >/dev/null 2>&1
    work_dir="${work_root}/${repo}"
  else
    ensure_repo_exists "${full_repo}" "${purpose}"
    work_root="$(mktemp -d)"
    work_dir="${work_root}/${repo}"
    mkdir -p "${work_dir}"
    git -C "${work_dir}" init -b main >/dev/null
    git -C "${work_dir}" remote add origin "https://github.com/${full_repo}.git"
  fi

  configure_git_identity "${work_dir}"
  render_repo "${work_dir}" "${repo}" "${category}" "${purpose}" "${priority}"

  if [[ "${repo_already_exists}" -eq 1 ]]; then
    gh repo edit "${full_repo}" --description "${purpose}" >/dev/null
  fi

  if commit_if_needed "${work_dir}" "Bootstrap repository scaffold"; then
    git -C "${work_dir}" push -u origin main >/dev/null 2>&1 || git -C "${work_dir}" push origin main >/dev/null 2>&1
    echo "pushed scaffold: ${full_repo}"
  else
    echo "no changes: ${full_repo}"
  fi

  rm -rf "${work_root}"
}

process_inventory() {
  local line
  local repo
  local category
  local purpose
  local priority

  while IFS=, read -r repo category purpose priority; do
    repo="${repo//$'\r'/}"
    category="${category//$'\r'/}"
    purpose="${purpose//$'\r'/}"
    priority="${priority//$'\r'/}"

    if [[ -z "${repo}" ]]; then
      continue
    fi

    if [[ "${repo}" == "repo" ]]; then
      continue
    fi

    if [[ -n "${TARGET_REPO}" && "${repo}" != "${TARGET_REPO}" ]]; then
      continue
    fi

    if [[ "${MODE}" == "local" ]]; then
      process_repo_local "${repo}" "${category}" "${purpose}" "${priority}"
    else
      process_repo_github "${repo}" "${category}" "${purpose}" "${priority}"
    fi
  done < <(sed '1s/^\xEF\xBB\xBF//' "${INVENTORY_PATH}")
}

process_inventory

if [[ "${MODE}" == "github" && "${RUN_SYNC}" -eq 1 ]]; then
  bash "${SCRIPT_DIR}/sync-org-labels.sh" "${ORG}" "${INVENTORY_PATH}"
  bash "${SCRIPT_DIR}/sync-org-repo-topics.sh" "${ORG}" "${INVENTORY_PATH}"
fi
