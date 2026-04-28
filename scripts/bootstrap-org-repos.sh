#!/usr/bin/env bash

set -euo pipefail

ORG="ai-webgpu-lab"
INVENTORY_FILE="docs/repo-inventory.csv"
MODE="github"
OUTPUT_ROOT=""
TARGET_REPO=""
VISIBILITY="public"
RUN_SYNC=1
RUN_PAGES=1
REFRESH_README=0
REFRESH_GENERATED=0

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
  --no-pages               Skip GitHub Pages demo scaffold/configuration
  --refresh-readme         Overwrite generated README files even if they already exist
  --refresh-generated      Overwrite generated demo/code scaffold files
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
    --no-pages)
      RUN_PAGES=0
      shift
      ;;
    --refresh-readme)
      REFRESH_README=1
      shift
      ;;
    --refresh-generated)
      REFRESH_GENERATED=1
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

track_slug_for_category() {
  case "$1" in
    graphics)
      echo "graphics"
      ;;
    blackhole)
      echo "blackhole"
      ;;
    ml)
      echo "ml"
      ;;
    llm)
      echo "llm"
      ;;
    audio)
      echo "audio"
      ;;
    multimodal)
      echo "multimodal"
      ;;
    agent)
      echo "agent"
      ;;
    benchmark)
      echo "benchmark"
      ;;
    app)
      echo "integration"
      ;;
    template|shared|org)
      echo "infra"
      ;;
    docs)
      echo "docs"
      ;;
    *)
      echo "infra"
      ;;
  esac
}

workload_kind_for_repo() {
  local repo="$1"
  local category="$2"

  case "${repo}" in
    *blackhole*)
      echo "blackhole"
      ;;
    *embeddings*)
      echo "embeddings"
      ;;
    *reranker*)
      echo "reranker"
      ;;
    *rag*)
      echo "rag"
      ;;
    *stt*|*whisper*)
      echo "stt"
      ;;
    *voice*)
      echo "voice"
      ;;
    *vlm*|*image*)
      echo "vlm"
      ;;
    *diffusion*)
      echo "diffusion"
      ;;
    *agent*)
      echo "agent"
      ;;
    *llm*|*chat*)
      echo "llm-chat"
      ;;
    *)
      case "${category}" in
        graphics|template)
          echo "graphics"
          ;;
        blackhole)
          echo "blackhole"
          ;;
        ml)
          echo "embeddings"
          ;;
        llm|benchmark|app)
          echo "llm-chat"
          ;;
        audio)
          echo "stt"
          ;;
        multimodal)
          echo "vlm"
          ;;
        agent)
          echo "agent"
          ;;
        *)
          echo "graphics"
          ;;
      esac
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

needs_pages_demo() {
  case "$1" in
    template|graphics|blackhole|ml|llm|audio|multimodal|agent|benchmark|app|org|shared|docs)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

pages_url_for_repo() {
  local repo="$1"
  printf 'https://%s.github.io/%s/\n' "${ORG}" "${repo}"
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

write_generated_readme() {
  local path="$1"

  if [[ "${REFRESH_README}" -eq 1 ]]; then
    write_file "${path}"
  else
    write_file_if_missing "${path}"
  fi
}

write_generated_file() {
  local path="$1"

  if [[ "${REFRESH_GENERATED}" -eq 1 ]]; then
    write_file "${path}"
  else
    write_file_if_missing "${path}"
  fi
}

copy_file_if_missing() {
  local src="$1"
  local dest="$2"

  mkdir -p "$(dirname "${dest}")"
  if [[ ! -f "${dest}" ]]; then
    cp "${src}" "${dest}"
  fi
}

copy_generated_file() {
  local src="$1"
  local dest="$2"

  mkdir -p "$(dirname "${dest}")"
  if [[ "${REFRESH_GENERATED}" -eq 1 || ! -f "${dest}" ]]; then
    cp "${src}" "${dest}"
  fi
}

copy_generated_tree() {
  local src_root="$1"
  local dest_root="$2"
  local src
  local rel

  if [[ ! -d "${src_root}" ]]; then
    return
  fi

  while IFS= read -r -d '' src; do
    rel="${src#${src_root}/}"
    copy_generated_file "${src}" "${dest_root}/${rel}"
  done < <(find "${src_root}" -type f -print0 | sort -z)
}

repo_specific_pages_baseline_root() {
  local repo="$1"

  if [[ -d "${REPO_ROOT}/repo-scaffolds/repos/${repo}" ]]; then
    printf '%s\n' "${REPO_ROOT}/repo-scaffolds/repos/${repo}"
    return 0
  fi

  if [[ -d "${REPO_ROOT}/repo-scaffolds/p0/${repo}" ]]; then
    printf '%s\n' "${REPO_ROOT}/repo-scaffolds/p0/${repo}"
    return 0
  fi

  return 1
}

repo_specific_pages_baseline_source() {
  local repo="$1"
  local root

  if ! root="$(repo_specific_pages_baseline_root "${repo}")"; then
    return 1
  fi

  root="${root#${REPO_ROOT}/}"
  printf '%s/\n' "${root}"
}

has_repo_specific_pages_baseline() {
  repo_specific_pages_baseline_root "$1" >/dev/null 2>&1
}

repo_specific_pages_baseline_summary() {
  case "$1" in
    tpl-webgpu-vanilla)
      echo "minimal raw WebGPU starter with adapter/device acquisition, animated triangle sample, and schema-aligned result export"
      ;;
    tpl-webgpu-react)
      echo "no-build React WebGPU starter with capability panel, React mount flow, and live canvas sample"
      ;;
    exp-embeddings-browser-throughput)
      echo "synthetic browser embeddings throughput harness with cold/warm cache modes, deterministic vectorization, and query recall checks"
      ;;
    exp-llm-chat-runtime-shootout)
      echo "interactive runtime readiness harness comparing deterministic WebLLM-style and Transformers.js-style chat profiles"
      ;;
    exp-stt-whisper-webgpu)
      echo "file transcription readiness harness with deterministic segment processing, first-partial timing, and WER/CER estimation"
      ;;
    exp-voice-assistant-local)
      echo "local voice assistant readiness harness with deterministic STT, intent routing, TTS roundtrip timing, and schema-aligned audio result export"
      ;;
    exp-vlm-browser-multimodal)
      echo "browser VLM readiness harness with deterministic image fixture prompts, multimodal latency metrics, and schema-aligned result export"
      ;;
    exp-diffusion-webgpu-browser)
      echo "browser diffusion readiness harness with deterministic prompt fixture, generated canvas output, and schema-aligned diffusion result export"
      ;;
    exp-browser-agent-local)
      echo "browser agent readiness harness with deterministic task deck, tool routing trace, intervention handling, and schema-aligned agent result export"
      ;;
    exp-rag-browser-pipeline)
      echo "browser-only RAG pipeline harness with ingest, chunk, embed, retrieve, and citation hit-rate measurement"
      ;;
    exp-reranker-browser)
      echo "browser reranker readiness harness with deterministic candidate scoring, top-k quality, and latency reporting"
      ;;
    bench-embeddings-latency-quality)
      echo "embeddings latency and quality benchmark comparing deterministic browser embedder profiles with WebGPU/fallback modes"
      ;;
    bench-reranker-latency)
      echo "reranker latency benchmark comparing deterministic browser reranker profiles with top-k quality and WebGPU/fallback modes"
      ;;
    bench-rag-endtoend)
      echo "browser RAG end-to-end benchmark comparing deterministic ingest, embed, retrieve, rerank, and answer profiles"
      ;;
    bench-llm-prefill-decode)
      echo "LLM prefill/decode benchmark comparing deterministic browser runtime profiles with fixed context and output budgets"
      ;;
    bench-stt-streaming-latency)
      echo "STT streaming latency benchmark comparing deterministic transcription profiles with first-partial, final-latency, and WER/CER metrics"
      ;;
    bench-voice-roundtrip)
      echo "voice roundtrip benchmark comparing deterministic STT, intent, reply, and TTS profiles with WebGPU/fallback modes"
      ;;
    bench-multimodal-latency)
      echo "multimodal latency benchmark comparing deterministic browser VLM profiles with WebGPU/fallback modes and image-question fixtures"
      ;;
    bench-diffusion-browser-shootout)
      echo "diffusion browser benchmark comparing deterministic prompt-to-image profiles with WebGPU/fallback modes and schema-aligned latency reporting"
      ;;
    bench-agent-step-latency)
      echo "browser agent benchmark comparing deterministic planner profiles with WebGPU/fallback modes and schema-aligned task and latency reporting"
      ;;
    bench-webgpu-vs-wasm-parity)
      echo "WebGPU versus Wasm parity benchmark comparing deterministic numeric kernels with fixed tolerance reporting"
      ;;
    exp-ort-webgpu-baseline)
      echo "ORT-Web style provider readiness harness with WebGPU/fallback modes, worker metadata, and deterministic inference timing"
      ;;
    app-private-rag-lab)
      echo "private RAG lab demo with bundled local notes, deterministic retrieval, citation scoring, and app-level result export"
      ;;
    app-voice-agent-lab)
      echo "integrated voice agent lab demo with deterministic wake word, transcript, task routing, and app-level result export"
      ;;
    app-browser-image-lab)
      echo "integrated browser image lab demo with deterministic scene inspection, multimodal answers, and prompt-to-image preview export"
      ;;
    app-blackhole-observatory)
      echo "integrated blackhole observatory demo with deterministic preset telemetry, renderer leaderboard, and app-level result export"
      ;;
    bench-runtime-shootout)
      echo "fixed-scenario runtime benchmark comparing deterministic browser-side LLM runtime profiles with shared prompt settings"
      ;;
    bench-model-load-and-cache)
      echo "cold/warm model load harness with synthetic fixture materialization, Cache Storage, and prepared-artifact reuse"
      ;;
    bench-worker-isolation-and-ui-jank)
      echo "main-thread vs worker stress harness with frame-gap, timer-lag, and optional input-lag capture"
      ;;
    exp-three-webgpu-core)
      echo "three-style scene readiness harness with capability probe, animated scene baseline, and schema-aligned graphics result export"
      ;;
    exp-babylon-webgpu-core)
      echo "Babylon-style scene readiness harness with capability probe, material/submesh metadata, and schema-aligned graphics result export"
      ;;
    exp-playcanvas-webgpu-core)
      echo "PlayCanvas-style scene readiness harness with capability probe, entity/script metadata, and schema-aligned graphics result export"
      ;;
    exp-blackhole-three-singularity)
      echo "blackhole lensing readiness harness with capability probe, ray-step metadata, frame pacing, and schema-aligned graphics result export"
      ;;
    exp-blackhole-kerr-engine)
      echo "Kerr geodesic engine readiness harness with capability probe, spin/inclination metadata, integration timing, and schema-aligned blackhole result export"
      ;;
    exp-blackhole-webgpu-fromscratch)
      echo "raw WebGPU blackhole readiness harness with capability probe, shader/pipeline metadata, dispatch timing, and schema-aligned blackhole result export"
      ;;
    exp-nbody-webgpu-core)
      echo "N-body compute readiness harness with capability probe, body/workgroup metadata, dispatch timing, and schema-aligned compute result export"
      ;;
    exp-fluid-webgpu-core)
      echo "fluid compute readiness harness with capability probe, particle/grid metadata, pressure solve timing, and schema-aligned compute result export"
      ;;
    exp-three-webgpu-particles-stress)
      echo "three.js-style particle stress readiness harness with capability probe, emitter/overdraw metadata, and schema-aligned graphics result export"
      ;;
    bench-compute-stress-suite)
      echo "compute stress benchmark comparing deterministic N-body, fluid, and particle-heavy cases with one schema-aligned result export"
      ;;
    bench-atomics-and-memory)
      echo "atomics and memory benchmark comparing deterministic histogram, scatter, and reduction kernels with contention and bandwidth reporting"
      ;;
    bench-texture-upload-and-streaming)
      echo "texture upload and streaming benchmark comparing deterministic atlas, tile, and video upload profiles with bandwidth and frame-drop reporting"
      ;;
    exp-pixi-webgpu-2d)
      echo "PixiJS-style 2D sprite batching readiness harness with capability probe, batch metadata, and schema-aligned graphics result export"
      ;;
    exp-luma-webgpu-viz)
      echo "luma.gl-style visualization readiness harness with capability probe, layer/attribute metadata, and schema-aligned graphics result export"
      ;;
    exp-deckgl-webgpu-readiness)
      echo "deck.gl-style map layer readiness harness with capability probe, viewport/picking metadata, and schema-aligned graphics result export"
      ;;
    bench-blackhole-render-shootout)
      echo "blackhole renderer shootout benchmark comparing deterministic renderer profiles with WebGPU/fallback capture pairs"
      ;;
    bench-renderer-shootout)
      echo "renderer shootout benchmark comparing deterministic three.js, Babylon.js, PlayCanvas, and raw WebGPU-style profiles"
      ;;
    exp-webllm-browser-chat)
      echo "single-runtime browser chat readiness harness with streamed response surface, TTFT/decode metrics, and fallback-ready metadata"
      ;;
    exp-llm-worker-ux)
      echo "LLM worker UX readiness harness comparing dedicated worker and main-thread chat execution with responsiveness metadata"
      ;;
    app-local-chat-arena)
      echo "local chat arena demo with pairwise synthetic runtime battle, shared prompt input, and app-level scoreboard export"
      ;;
    .github)
      echo "org-wide community files audit harness with deterministic issue-form, profile, and contributing inventory plus schema-aligned baseline result export"
      ;;
    shared-webgpu-capability)
      echo "shared WebGPU capability probe harness that runs the helper exports against the live browser and emits a schema-aligned baseline result"
      ;;
    shared-bench-schema)
      echo "shared result-schema validation harness with deterministic root/required/metric-group counts and schema-aligned baseline result export"
      ;;
    shared-github-actions)
      echo "shared CI reusable workflow inventory harness with deterministic workflow/input/consumer counts and schema-aligned baseline result export"
      ;;
    docs-lab-roadmap)
      echo "docs roadmap inventory harness snapshotting docs/scripts/templates plus repo inventory counts with schema-aligned baseline result export"
      ;;
    *)
      echo "shared browser/device/WebGPU baseline probe"
      ;;
  esac
}

apply_repo_specific_pages_demo_scaffold() {
  local dir="$1"
  local repo="$2"
  local scaffold_root

  scaffold_root="$(repo_specific_pages_baseline_root "${repo}")"

  copy_generated_tree "${scaffold_root}" "${dir}"
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
  : >"${dir}/reports/raw/.gitkeep"
  : >"${dir}/reports/screenshots/.gitkeep"
  : >"${dir}/reports/logs/.gitkeep"
}

create_pages_demo_scaffold() {
  local dir="$1"
  local repo="$2"
  local category="$3"
  local purpose="$4"
  local priority="$5"
  local track
  local kind
  local track_slug
  local workload_kind
  local pages_url

  track="$(track_for_category "${category}")"
  kind="$(kind_for_category "${category}")"
  track_slug="$(track_slug_for_category "${category}")"
  workload_kind="$(workload_kind_for_repo "${repo}" "${category}")"
  pages_url="$(pages_url_for_repo "${repo}")"

  mkdir -p "${dir}/.github/workflows"

  write_generated_file "${dir}/public/.nojekyll" <<'EOF'
EOF

  if ! has_repo_specific_pages_baseline "${repo}"; then
    write_generated_file "${dir}/public/index.html" <<EOF
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${repo} Baseline Probe</title>
    <meta name="description" content="${purpose} baseline probe">
    <style>
      :root {
        color-scheme: light;
        --bg: #08111b;
        --surface: rgba(9, 18, 31, 0.88);
        --surface-strong: rgba(15, 31, 49, 0.94);
        --surface-soft: rgba(16, 30, 46, 0.72);
        --border: rgba(125, 211, 252, 0.16);
        --text: #e6effd;
        --muted: #9fb6cf;
        --accent: #7dd3fc;
        --accent-strong: #38bdf8;
        --success: #86efac;
        --warn: #fde68a;
        --danger: #fca5a5;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(56, 189, 248, 0.22), transparent 32%),
          radial-gradient(circle at bottom right, rgba(16, 185, 129, 0.18), transparent 30%),
          linear-gradient(160deg, #04070d 0%, #0c1727 48%, #07121a 100%);
      }

      main {
        width: min(1180px, calc(100% - 32px));
        margin: 40px auto;
        padding: 32px;
        border: 1px solid var(--border);
        border-radius: 28px;
        background: var(--surface);
        backdrop-filter: blur(16px);
        box-shadow: 0 32px 72px rgba(0, 0, 0, 0.32);
      }

      .eyebrow {
        display: inline-flex;
        gap: 8px;
        align-items: center;
        margin-bottom: 16px;
        padding: 6px 12px;
        border-radius: 999px;
        background: rgba(125, 211, 252, 0.12);
        color: var(--accent);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      h1 {
        margin: 0 0 12px;
        font-size: clamp(32px, 5vw, 56px);
        line-height: 1.04;
      }

      p {
        margin: 0 0 12px;
        color: var(--muted);
        font-size: 16px;
        line-height: 1.7;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 18px;
        margin: 24px 0;
      }

      .panel {
        padding: 18px;
        border-radius: 18px;
        background: var(--surface-soft);
        border: 1px solid rgba(148, 163, 184, 0.14);
      }

      .panel h2 {
        margin: 0 0 14px;
        font-size: 18px;
      }

      .meta-grid,
      .metrics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 12px;
      }

      .meta-card,
      .metric-card {
        padding: 14px;
        border-radius: 16px;
        background: var(--surface-strong);
        border: 1px solid rgba(148, 163, 184, 0.14);
      }

      .label {
        display: block;
        margin-bottom: 8px;
        color: var(--muted);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .value {
        font-size: 18px;
        font-weight: 600;
        word-break: break-word;
      }

      .status-row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-bottom: 14px;
      }

      .badge {
        display: inline-flex;
        align-items: center;
        min-height: 34px;
        padding: 0 12px;
        border-radius: 999px;
        border: 1px solid rgba(148, 163, 184, 0.2);
        background: rgba(148, 163, 184, 0.12);
        color: var(--text);
        font-size: 13px;
        font-weight: 600;
      }

      .badge.success {
        border-color: rgba(134, 239, 172, 0.26);
        color: var(--success);
      }

      .badge.warn {
        border-color: rgba(253, 230, 138, 0.26);
        color: var(--warn);
      }

      .badge.danger {
        border-color: rgba(252, 165, 165, 0.26);
        color: var(--danger);
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin: 28px 0 0;
      }

      button,
      a.button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 46px;
        padding: 0 18px;
        border-radius: 999px;
        color: #04111c;
        background: linear-gradient(135deg, var(--accent) 0%, var(--accent-strong) 100%);
        font-weight: 700;
        text-decoration: none;
        border: 0;
        cursor: pointer;
      }

      button.secondary {
        color: var(--text);
        background: rgba(148, 163, 184, 0.12);
        border: 1px solid rgba(148, 163, 184, 0.18);
      }

      button:disabled {
        opacity: 0.55;
        cursor: default;
      }

      a.link {
        color: var(--accent);
        text-decoration: none;
      }

      ul {
        margin: 0;
        padding-left: 18px;
        color: var(--muted);
      }

      li + li {
        margin-top: 8px;
      }

      pre {
        margin: 0;
        max-height: 360px;
        overflow: auto;
        padding: 14px;
        border-radius: 16px;
        background: rgba(5, 10, 18, 0.86);
        border: 1px solid rgba(148, 163, 184, 0.14);
        color: #cde3ff;
        font-size: 13px;
        line-height: 1.6;
      }

      footer {
        margin-top: 28px;
        color: var(--muted);
        font-size: 14px;
      }

      code {
        font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      }

      @media (max-width: 720px) {
        main {
          padding: 20px;
          margin: 16px auto;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <!-- ai-webgpu-lab-generated: baseline-probe-v1 -->
      <div class="eyebrow">AI WebGPU Lab Baseline Probe</div>
      <h1>${repo}</h1>
      <p>${purpose}. This page is the first runnable baseline for the repository: it collects browser/device context, probes WebGPU readiness, runs lightweight frame and worker samples, and exports a schema-aligned JSON draft you can promote into <code>reports/raw/</code>.</p>

      <section class="panel" aria-label="Repository metadata">
        <h2>Repository Metadata</h2>
        <div class="meta-grid" id="meta-grid"></div>
        <div class="actions">
          <button id="detect-environment" type="button">Detect Environment</button>
          <button id="run-webgpu" type="button">Run WebGPU Probe</button>
          <button id="run-frame" class="secondary" type="button">Run Frame Probe</button>
          <button id="run-worker" class="secondary" type="button">Run Worker Probe</button>
          <button id="download-json" class="secondary" type="button">Download JSON</button>
        </div>
      </section>

      <section class="panel" aria-label="Probe status">
        <h2>Probe Status</h2>
        <div class="status-row" id="status-row"></div>
        <p id="status-summary">Run the environment and WebGPU probes first. The exported JSON is intentionally minimal: it captures the first reproducible browser baseline and should be replaced by workload-specific metrics as the repository matures.</p>
      </section>

      <section class="grid" aria-label="Baseline guidance">
        <article class="panel">
          <h2>Focus For This Repo</h2>
          <ul id="focus-list"></ul>
        </article>
        <article class="panel">
          <h2>Next Baseline Steps</h2>
          <ul id="next-steps"></ul>
        </article>
      </section>

      <section class="panel" aria-label="Probe metrics">
        <h2>Key Metrics</h2>
        <div class="metrics-grid" id="metrics-grid"></div>
      </section>

      <section class="grid" aria-label="Probe output">
        <article class="panel">
          <h2>Environment Snapshot</h2>
          <pre id="environment-json">{
  "status": "pending"
}</pre>
        </article>
        <article class="panel">
          <h2>Schema-Aligned Result Draft</h2>
          <pre id="result-json">{
  "status": "pending"
}</pre>
        </article>
      </section>

      <section class="panel" aria-label="Probe activity">
        <h2>Activity Log</h2>
        <ul id="activity-log"></ul>
      </section>

      <div class="actions">
        <a class="button" href="https://github.com/${ORG}/${repo}">Open Repository</a>
        <a class="button" href="https://github.com/${ORG}/${repo}/blob/main/README.md">Read README</a>
        <a class="button" href="https://github.com/${ORG}/${repo}/blob/main/RESULTS.md">View Results</a>
      </div>

      <footer>
        Published with GitHub Pages using <code>.github/workflows/deploy-pages.yml</code>. Replace this shared probe with a repository-specific harness when the first real workload implementation lands.
      </footer>
    </main>
    <script type="module" src="./app.js"></script>
  </body>
</html>
EOF

  write_generated_file "${dir}/public/app.js" <<EOF
const metadata = Object.freeze({
  repo: "${repo}",
  category: "${category}",
  purpose: "${purpose}",
  priority: "${priority}",
  trackLabel: "${track}",
  kindLabel: "${kind}",
  trackSlug: "${track_slug}",
  workloadKind: "${workload_kind}",
  pagesUrl: "${pages_url}",
  repoUrl: "https://github.com/${ORG}/${repo}",
  readmeUrl: "https://github.com/${ORG}/${repo}/blob/main/README.md",
  resultsUrl: "https://github.com/${ORG}/${repo}/blob/main/RESULTS.md"
});

const state = {
  startedAt: performance.now(),
  environment: null,
  probes: {
    webgpu: null,
    frame: null,
    worker: null
  },
  logs: []
};

const knownLimitKeys = [
  "maxTextureDimension1D",
  "maxTextureDimension2D",
  "maxTextureDimension3D",
  "maxBindGroups",
  "maxBindingsPerBindGroup",
  "maxUniformBufferBindingSize",
  "maxStorageBufferBindingSize",
  "maxComputeInvocationsPerWorkgroup",
  "maxComputeWorkgroupStorageSize",
  "maxBufferSize"
];

const elements = {
  metaGrid: document.getElementById("meta-grid"),
  statusRow: document.getElementById("status-row"),
  statusSummary: document.getElementById("status-summary"),
  focusList: document.getElementById("focus-list"),
  nextSteps: document.getElementById("next-steps"),
  metricsGrid: document.getElementById("metrics-grid"),
  environmentJson: document.getElementById("environment-json"),
  resultJson: document.getElementById("result-json"),
  activityLog: document.getElementById("activity-log"),
  detectEnvironment: document.getElementById("detect-environment"),
  runWebgpu: document.getElementById("run-webgpu"),
  runFrame: document.getElementById("run-frame"),
  runWorker: document.getElementById("run-worker"),
  downloadJson: document.getElementById("download-json")
};

function round(value, digits = 2) {
  if (!Number.isFinite(value)) {
    return null;
  }

  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

function percentile(values, ratio) {
  if (!values.length) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function nowIso() {
  return new Date().toISOString();
}

function parseBrowser() {
  const ua = navigator.userAgent;
  const candidates = [
    ["Edg/", "Edge"],
    ["Chrome/", "Chrome"],
    ["Firefox/", "Firefox"],
    ["Version/", "Safari"]
  ];

  for (const [needle, name] of candidates) {
    const marker = ua.indexOf(needle);
    if (marker >= 0) {
      const version = ua.slice(marker + needle.length).split(/[\\s)/;]/)[0] || "unknown";
      return { name, version };
    }
  }

  return { name: "Unknown", version: "unknown" };
}

function parseOs() {
  const ua = navigator.userAgent;

  if (/Windows NT/i.test(ua)) {
    const match = ua.match(/Windows NT ([0-9.]+)/i);
    return { name: "Windows", version: match ? match[1] : "unknown" };
  }

  if (/Mac OS X/i.test(ua)) {
    const match = ua.match(/Mac OS X ([0-9_]+)/i);
    return { name: "macOS", version: match ? match[1].replace(/_/g, ".") : "unknown" };
  }

  if (/Android/i.test(ua)) {
    const match = ua.match(/Android ([0-9.]+)/i);
    return { name: "Android", version: match ? match[1] : "unknown" };
  }

  if (/(iPhone|iPad|CPU OS)/i.test(ua)) {
    const match = ua.match(/OS ([0-9_]+)/i);
    return { name: "iOS", version: match ? match[1].replace(/_/g, ".") : "unknown" };
  }

  if (/Linux/i.test(ua)) {
    return { name: "Linux", version: "unknown" };
  }

  return { name: "Unknown", version: "unknown" };
}

function inferDeviceClass() {
  const threads = navigator.hardwareConcurrency || 0;
  const memory = navigator.deviceMemory || 0;
  const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

  if (mobile) {
    if (memory >= 6 && threads >= 8) {
      return "mobile-high";
    }

    return "mobile-mid";
  }

  if (memory >= 16 && threads >= 12) {
    return "desktop-high";
  }

  if (memory >= 8 && threads >= 8) {
    return "desktop-mid";
  }

  if (threads >= 4) {
    return "laptop";
  }

  return "unknown";
}

function baseEnvironment() {
  return {
    browser: parseBrowser(),
    os: parseOs(),
    device: {
      name: navigator.platform || "unknown",
      class: inferDeviceClass(),
      cpu: navigator.hardwareConcurrency ? String(navigator.hardwareConcurrency) + " threads" : "unknown",
      memory_gb: navigator.deviceMemory || undefined,
      power_mode: "unknown"
    },
    gpu: {
      adapter: "unknown",
      required_features: [],
      limits: {}
    },
    backend: "wasm",
    fallback_triggered: true,
    worker_mode: "unknown",
    cache_state: "unknown"
  };
}

function ensureEnvironment() {
  if (!state.environment) {
    state.environment = baseEnvironment();
  }

  return state.environment;
}

function log(message) {
  state.logs.unshift("[" + new Date().toLocaleTimeString() + "] " + message);
  state.logs = state.logs.slice(0, 14);
  renderLogs();
}

function metadataCards() {
  return [
    ["Track", metadata.trackLabel],
    ["Kind", metadata.kindLabel],
    ["Priority", metadata.priority],
    ["Workload", metadata.workloadKind],
    ["Pages URL", metadata.pagesUrl]
  ];
}

function focusItems() {
  const common = [
    "Collect a reproducible browser and device snapshot before adding workload-specific code.",
    "Use the exported JSON as the first draft for reports/raw once you validate it in the target browser."
  ];

  switch (metadata.category) {
    case "template":
      return common.concat([
        "Verify the smallest WebGPU success path and copy that shape into downstream repositories.",
        "Document capability and fallback behavior before adding framework-specific layers."
      ]);
    case "benchmark":
      return common.concat([
        "Replace lightweight frame and worker probes with workload-specific comparison harnesses.",
        "Keep input profiles and environment notes identical across runs."
      ]);
    case "app":
      return common.concat([
        "Check whether the integration surface can acquire GPU resources without blocking the UI.",
        "Turn this probe into the first user-facing end-to-end demo once the core flow exists."
      ]);
    case "graphics":
    case "blackhole":
      return common.concat([
        "Prioritize adapter/device acquisition, frame pacing, and scene-load instrumentation.",
        "Capture visual correctness notes together with frame timing."
      ]);
    default:
      return common.concat([
        "Prioritize adapter readiness, worker offload viability, and result export hygiene.",
        "Replace generic probes with model or runtime-specific metrics as soon as the first harness lands."
      ]);
  }
}

function nextSteps() {
  const steps = [
    "Save an exported JSON after validating it in the target browser and move it into reports/raw/.",
    "Replace generic probes in public/app.js with workload-specific setup and KPI collection.",
    "Update RESULTS.md with the first measured run and record fallback conditions explicitly."
  ];

  if (metadata.category === "template") {
    steps.unshift("Promote the minimal setup path into a copyable starter template for downstream repos.");
  }

  if (metadata.category === "benchmark") {
    steps.unshift("Define the comparison matrix and freeze one shared input profile before collecting numbers.");
  }

  if (metadata.category === "app") {
    steps.unshift("Connect one real user flow and treat this probe as the readiness gate before adding polish.");
  }

  return steps;
}

function renderList(element, items) {
  element.innerHTML = "";
  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = item;
    element.appendChild(li);
  }
}

function renderMeta() {
  elements.metaGrid.innerHTML = "";

  for (const [label, value] of metadataCards()) {
    const card = document.createElement("article");
    card.className = "meta-card";

    const labelNode = document.createElement("span");
    labelNode.className = "label";
    labelNode.textContent = label;

    const valueNode = document.createElement(label === "Pages URL" ? "a" : "div");
    valueNode.className = "value";
    if (label === "Pages URL") {
      valueNode.href = value;
      valueNode.className = "value link";
    }
    valueNode.textContent = value;

    card.appendChild(labelNode);
    card.appendChild(valueNode);
    elements.metaGrid.appendChild(card);
  }
}

function summarizeStatus() {
  if (!state.environment) {
    return "Environment detection has not run yet.";
  }

  if (!state.probes.webgpu) {
    return "Environment captured. Run the WebGPU probe to see whether the repository can stay on the GPU path.";
  }

  if (!state.probes.webgpu.available) {
    return "Environment captured, but WebGPU is not available. The exported JSON records a fallback path so you can keep the run reproducible.";
  }

  if (!state.probes.frame || !state.probes.worker) {
    return "WebGPU is available. Run the frame and worker probes next to capture baseline responsiveness metrics.";
  }

  return "Environment, WebGPU, frame pacing, and worker round-trip probes are complete. Promote this JSON into reports/raw after validating it against the intended workload.";
}

function renderStatus() {
  const badges = [];

  badges.push({
    tone: state.environment ? "success" : "warn",
    text: state.environment ? "Environment ready" : "Environment pending"
  });

  if (!state.probes.webgpu) {
    badges.push({ tone: "warn", text: "WebGPU probe pending" });
  } else if (state.probes.webgpu.available) {
    badges.push({ tone: "success", text: "WebGPU available" });
  } else {
    badges.push({ tone: "danger", text: "WebGPU unavailable" });
  }

  badges.push({
    tone: state.probes.frame ? "success" : "warn",
    text: state.probes.frame ? "Frame probe done" : "Frame probe pending"
  });
  badges.push({
    tone: state.probes.worker ? "success" : "warn",
    text: state.probes.worker ? "Worker probe done" : "Worker probe pending"
  });

  elements.statusRow.innerHTML = "";
  for (const badge of badges) {
    const node = document.createElement("span");
    node.className = "badge " + badge.tone;
    node.textContent = badge.text;
    elements.statusRow.appendChild(node);
  }

  elements.statusSummary.textContent = summarizeStatus();
}

function metricCards() {
  const cards = [];
  cards.push(["TTI", round(performance.now() - state.startedAt, 1) ? round(performance.now() - state.startedAt, 1) + " ms" : "pending"]);

  if (state.probes.webgpu) {
    cards.push(["WebGPU Init", state.probes.webgpu.initMs ? round(state.probes.webgpu.initMs, 1) + " ms" : state.probes.webgpu.available ? "ready" : "fallback"]);
  } else {
    cards.push(["WebGPU Init", "pending"]);
  }

  if (state.probes.frame) {
    cards.push(["Avg FPS", round(state.probes.frame.avgFps, 1) + " fps"]);
    cards.push(["P95 Frame", round(state.probes.frame.p95FrameMs, 2) + " ms"]);
  } else {
    cards.push(["Avg FPS", "pending"]);
    cards.push(["P95 Frame", "pending"]);
  }

  if (state.probes.worker) {
    cards.push(["Worker RTT", round(state.probes.worker.avgRttMs, 2) + " ms"]);
    cards.push(["Worker P95", round(state.probes.worker.p95RttMs, 2) + " ms"]);
  } else {
    cards.push(["Worker RTT", "pending"]);
    cards.push(["Worker P95", "pending"]);
  }

  return cards;
}

function renderMetrics() {
  elements.metricsGrid.innerHTML = "";

  for (const [label, value] of metricCards()) {
    const card = document.createElement("article");
    card.className = "metric-card";

    const labelNode = document.createElement("span");
    labelNode.className = "label";
    labelNode.textContent = label;

    const valueNode = document.createElement("div");
    valueNode.className = "value";
    valueNode.textContent = value;

    card.appendChild(labelNode);
    card.appendChild(valueNode);
    elements.metricsGrid.appendChild(card);
  }
}

function renderLogs() {
  elements.activityLog.innerHTML = "";

  if (!state.logs.length) {
    const li = document.createElement("li");
    li.textContent = "No probe activity yet.";
    elements.activityLog.appendChild(li);
    return;
  }

  for (const item of state.logs) {
    const li = document.createElement("li");
    li.textContent = item;
    elements.activityLog.appendChild(li);
  }
}

function schemaResult() {
  const environment = ensureEnvironment();
  const webgpu = state.probes.webgpu;

  if (webgpu) {
    environment.backend = webgpu.available ? "webgpu" : "wasm";
    environment.fallback_triggered = !webgpu.available;
    environment.gpu = {
      adapter: webgpu.adapter || "unknown",
      required_features: webgpu.features || [],
      limits: webgpu.limits || {}
    };
  }

  environment.worker_mode = state.probes.worker ? "worker" : "main";

  const initMs = webgpu && webgpu.initMs ? round(webgpu.initMs, 2) : round(performance.now() - state.startedAt, 2);
  const successRate = webgpu ? (webgpu.available ? 1 : 0) : 0.5;
  const errorType = webgpu && webgpu.error ? webgpu.error : "";

  return {
    meta: {
      repo: metadata.repo,
      commit: "bootstrap-generated",
      timestamp: nowIso(),
      owner: "ai-webgpu-lab",
      track: metadata.trackSlug,
      scenario: "baseline-probe",
      notes: metadata.purpose + ". Replace generic probes with workload-specific logic before treating this as a final benchmark."
    },
    environment,
    workload: {
      kind: metadata.workloadKind,
      name: metadata.repo + " baseline probe",
      input_profile: "bootstrap-default"
    },
    metrics: {
      common: {
        time_to_interactive_ms: round(performance.now() - state.startedAt, 2),
        init_ms: initMs,
        success_rate: successRate,
        peak_memory_note: navigator.deviceMemory ? String(navigator.deviceMemory) + " GB reported by browser" : "deviceMemory unavailable",
        error_type: errorType
      }
    },
    status: webgpu ? (webgpu.available ? "success" : "partial") : "partial",
    artifacts: {
      deploy_url: metadata.pagesUrl
    }
  };
}

function renderJson() {
  const environment = state.environment || baseEnvironment();
  elements.environmentJson.textContent = JSON.stringify(environment, null, 2);
  elements.resultJson.textContent = JSON.stringify(schemaResult(), null, 2);
}

async function detectEnvironment() {
  ensureEnvironment();
  log("Captured base environment snapshot.");
  render();
}

function extractLimits(source) {
  const limits = {};

  if (!source) {
    return limits;
  }

  for (const key of knownLimitKeys) {
    if (key in source && Number.isFinite(source[key])) {
      limits[key] = Number(source[key]);
    }
  }

  return limits;
}

async function runWebgpuProbe() {
  ensureEnvironment();
  const startedAt = performance.now();

  if (!("gpu" in navigator)) {
    state.probes.webgpu = {
      available: false,
      initMs: performance.now() - startedAt,
      error: "navigator.gpu unavailable",
      adapter: "unavailable",
      features: [],
      limits: {}
    };
    log("WebGPU probe failed: navigator.gpu is not available in this browser.");
    render();
    return;
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error("No GPU adapter returned");
    }

    let adapterInfo = null;
    if (typeof adapter.requestAdapterInfo === "function") {
      try {
        adapterInfo = await adapter.requestAdapterInfo();
      } catch (error) {
        adapterInfo = null;
      }
    }

    const device = await adapter.requestDevice();
    const adapterName = (adapterInfo && (adapterInfo.description || adapterInfo.vendor || adapterInfo.architecture)) || "WebGPU adapter";
    const features = Array.from(device.features || []);
    const limits = extractLimits(device.limits || adapter.limits);

    state.probes.webgpu = {
      available: true,
      initMs: performance.now() - startedAt,
      adapter: adapterName,
      features,
      limits
    };
    log("WebGPU probe succeeded with adapter: " + adapterName + ".");
  } catch (error) {
    state.probes.webgpu = {
      available: false,
      initMs: performance.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      adapter: "unavailable",
      features: [],
      limits: {}
    };
    log("WebGPU probe failed: " + state.probes.webgpu.error + ".");
  }

  render();
}

async function runFrameProbe() {
  ensureEnvironment();
  const deltas = [];

  await new Promise((resolve) => {
    let previous = 0;
    function step(timestamp) {
      if (previous !== 0) {
        deltas.push(timestamp - previous);
      }
      previous = timestamp;

      if (deltas.length >= 120) {
        resolve();
        return;
      }

      requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  });

  const avgDelta = deltas.reduce((total, value) => total + value, 0) / deltas.length;
  state.probes.frame = {
    avgFrameMs: avgDelta,
    avgFps: avgDelta > 0 ? 1000 / avgDelta : 0,
    p95FrameMs: percentile(deltas, 0.95)
  };
  log("Frame probe captured " + deltas.length + " frames.");
  render();
}

async function runWorkerProbe() {
  ensureEnvironment();
  const workerScript = "self.onmessage = (event) => { if (event.data === 'ping') { self.postMessage(performance.now()); } };";
  const workerUrl = URL.createObjectURL(new Blob([workerScript], { type: "text/javascript" }));
  const probeWorker = new Worker(workerUrl);
  const roundTrips = [];

  try {
    for (let index = 0; index < 20; index += 1) {
      const sample = await new Promise((resolve, reject) => {
        const startedAt = performance.now();
        const timeout = setTimeout(() => reject(new Error("Worker probe timed out")), 2000);

        probeWorker.onmessage = () => {
          clearTimeout(timeout);
          resolve(performance.now() - startedAt);
        };

        probeWorker.postMessage("ping");
      });
      roundTrips.push(sample);
    }

    const avgRtt = roundTrips.reduce((total, value) => total + value, 0) / roundTrips.length;
    state.probes.worker = {
      avgRttMs: avgRtt,
      p95RttMs: percentile(roundTrips, 0.95)
    };
    log("Worker probe completed with " + roundTrips.length + " round-trips.");
  } catch (error) {
    state.probes.worker = {
      avgRttMs: null,
      p95RttMs: null,
      error: error instanceof Error ? error.message : String(error)
    };
    log("Worker probe failed: " + state.probes.worker.error + ".");
  } finally {
    probeWorker.terminate();
    URL.revokeObjectURL(workerUrl);
  }

  render();
}

function downloadJson() {
  const payload = JSON.stringify(schemaResult(), null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = metadata.repo + "-baseline-probe.json";
  anchor.click();
  URL.revokeObjectURL(objectUrl);
  log("Downloaded schema-aligned baseline JSON draft.");
}

function render() {
  renderMeta();
  renderStatus();
  renderMetrics();
  renderJson();
}

elements.detectEnvironment.addEventListener("click", detectEnvironment);
elements.runWebgpu.addEventListener("click", runWebgpuProbe);
elements.runFrame.addEventListener("click", runFrameProbe);
elements.runWorker.addEventListener("click", runWorkerProbe);
elements.downloadJson.addEventListener("click", downloadJson);

renderList(elements.focusList, focusItems());
renderList(elements.nextSteps, nextSteps());
log("Baseline probe ready. Capture environment first, then run WebGPU, frame, and worker probes.");
detectEnvironment();
render();
EOF
  fi

  write_generated_file "${dir}/.github/workflows/deploy-pages.yml" <<'EOF'
name: Deploy GitHub Pages Demo

on:
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: github-pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v5

      - name: Configure GitHub Pages
        uses: actions/configure-pages@v5

      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v4
        with:
          path: ./public
          include-hidden-files: true

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
EOF

  if has_repo_specific_pages_baseline "${repo}"; then
    apply_repo_specific_pages_demo_scaffold "${dir}" "${repo}"
  fi
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

adapter_families_for_repo() {
  local repo="$1"
  local category="$2"

  case "${repo}" in
    .github|tpl-webgpu-vanilla|tpl-webgpu-react|shared-webgpu-capability|shared-bench-schema|shared-github-actions|docs-lab-roadmap)
      echo ""
      return 0
      ;;
  esac

  case "${category}" in
    graphics|blackhole)
      echo "renderer"
      ;;
    ml|llm|audio|multimodal|agent)
      echo "runtime"
      ;;
    app)
      echo "app-surface"
      ;;
    benchmark)
      case "${repo}" in
        bench-blackhole-render-shootout|bench-renderer-shootout|bench-compute-stress-suite|bench-atomics-and-memory|bench-texture-upload-and-streaming)
          echo "benchmark renderer"
          ;;
        bench-runtime-shootout)
          echo "benchmark runtime"
          ;;
        *)
          echo "benchmark runtime"
          ;;
      esac
      ;;
    *)
      echo ""
      ;;
  esac
}

attach_family_adapters() {
  local dir="$1"
  local repo="$2"
  local category="$3"
  local families
  families="$(adapter_families_for_repo "${repo}" "${category}")"

  if [[ -z "${families}" ]]; then
    return 0
  fi

  mkdir -p "${dir}/public"

  local family
  for family in ${families}; do
    local source="${REPO_ROOT}/repo-scaffolds/shared/adapters/${family}-adapter.js"
    local dest="${dir}/public/${family}-adapter.js"
    if [[ -f "${source}" ]]; then
      copy_generated_file "${source}" "${dest}"
    fi
  done
}

real_sketch_dest_for_family() {
  case "$1" in
    renderer)
      echo "real-renderer-sketch.js"
      ;;
    runtime)
      echo "real-runtime-sketch.js"
      ;;
    app-surface)
      echo "real-surface-sketch.js"
      ;;
    benchmark)
      echo "real-benchmark-sketch.js"
      ;;
    *)
      echo ""
      ;;
  esac
}

attach_family_real_sketches() {
  local dir="$1"
  local repo="$2"
  local category="$3"
  local families
  families="$(adapter_families_for_repo "${repo}" "${category}")"

  if [[ -z "${families}" ]]; then
    return 0
  fi

  mkdir -p "${dir}/public"

  local family
  for family in ${families}; do
    local source="${REPO_ROOT}/repo-scaffolds/shared/real-sketches/${family}.js"
    local dest_name
    dest_name="$(real_sketch_dest_for_family "${family}")"
    if [[ -z "${dest_name}" || ! -f "${source}" ]]; then
      continue
    fi
    local dest="${dir}/public/${dest_name}"
    # Only copy the canonical when the repo does not already ship a specific
    # sketch (which the repo-specific page baseline already wrote in place).
    if [[ ! -f "${dest}" ]]; then
      cp "${source}" "${dest}"
    fi
  done
}

maybe_attach_infra_baseline_scaffold() {
  local dir="$1"
  local repo="$2"
  local category="$3"
  local purpose="$4"
  local priority="$5"

  if ! has_repo_specific_pages_baseline "${repo}"; then
    return 0
  fi

  create_result_scaffold "${dir}"
  copy_results_template "${dir}"
  copy_schema "${dir}"

  if [[ "${RUN_PAGES}" -eq 1 ]]; then
    create_pages_demo_scaffold "${dir}" "${repo}" "${category}" "${purpose}" "${priority}"
  fi
}

render_org_repo() {
  local dir="$1"

  mkdir -p "${dir}/.github/ISSUE_TEMPLATE" "${dir}/profile"
  cp "${REPO_ROOT}/.github/ISSUE_TEMPLATE/"*.yml "${dir}/.github/ISSUE_TEMPLATE/"
  cp "${REPO_ROOT}/.github/pull_request_template.md" "${dir}/.github/pull_request_template.md"
  cp "${REPO_ROOT}/.github/CODEOWNERS" "${dir}/.github/CODEOWNERS"
  cp "${REPO_ROOT}/.github/ISSUE_TEMPLATE/config.yml" "${dir}/.github/ISSUE_TEMPLATE/config.yml"

  write_generated_readme "${dir}/README.md" <<'EOF'
# ai-webgpu-lab/.github

`ai-webgpu-lab` 조직 전체에 적용되는 기본 커뮤니티 파일과 협업 규칙을 관리하는 저장소입니다. 각 개별 프로젝트에서 중복 관리하지 않아도 되도록 이슈 폼, PR 템플릿, 조직 프로필, 기본 리뷰 정책을 여기에서 통합 관리합니다.

## 저장소 역할
- 실험, 벤치마크, 앱, 인프라, 문서 저장소에 공통 적용되는 기본 협업 UX를 정의합니다.
- 조직 프로필과 공통 템플릿을 통해 저장소별 문서 품질과 리포팅 포맷을 일정 수준 이상으로 맞춥니다.
- 개별 저장소가 도메인 로직에 집중하도록 조직 차원의 기본 규칙을 분리합니다.

## 포함 내용
- `.github/ISSUE_TEMPLATE/` - 실험, 벤치, 인프라, 문서, 버그용 공통 이슈 폼
- `.github/pull_request_template.md` - 기본 PR 제출 형식
- `.github/CODEOWNERS` - 조직 기본 리뷰 책임자
- `profile/README.md` - 조직 메인 프로필 소개
- `CONTRIBUTING.md` - 조직 기본 운영 규칙

## 운영 원칙
- 저장소별 개별 폼보다 조직 공통 규칙을 우선하며, 예외가 필요하면 이유를 문서화합니다.
- 실험/벤치 저장소의 결과 리포팅 규칙은 `docs-lab-roadmap`의 계획 문서와 일치해야 합니다.
- 이 저장소의 변경은 조직 전체 UX에 영향을 주므로 문구 변경도 목적과 파급 범위를 명확히 남겨야 합니다.

## 조직 상태 대시보드
- 전체 repo/Pages 상태: `docs-lab-roadmap/docs/PAGES-STATUS.md`
- 통합 sketch/adapter 상태: `docs-lab-roadmap/docs/INTEGRATION-STATUS.md`
- sketch capabilities: `docs-lab-roadmap/docs/SKETCH-METRICS.md`
- 조직 프로필은 `.github/profile/README.md`에서 관리합니다.

## 갱신 기준
- 새 저장소 유형이 추가되면 대응 이슈 폼 또는 템플릿을 함께 추가합니다.
- 리뷰 흐름이 바뀌면 `CODEOWNERS`, PR 템플릿, 조직 프로필을 함께 갱신합니다.
- 마스터 플랜과 맞지 않는 템플릿은 유지하지 않습니다.

## 관련 저장소
- `docs-lab-roadmap` - 조직 운영 계획과 부트스트랩 기준 문서
- `shared-github-actions` - 공통 CI 재사용 자산
- `shared-bench-schema` - 결과 리포팅 공통 스키마

## 라이선스
MIT
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

  write_generated_readme "${dir}/profile/README.md" <<'EOF'
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

## Live Status
- Pages/demo status: `docs-lab-roadmap/docs/PAGES-STATUS.md`
- Integration status: `docs-lab-roadmap/docs/INTEGRATION-STATUS.md`
- Sketch metrics: `docs-lab-roadmap/docs/SKETCH-METRICS.md`
- Representative real-mode smoke targets: `bench-runtime-shootout`, `exp-three-webgpu-core`, `bench-renderer-shootout`, `app-blackhole-observatory`

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

  write_generated_readme "${dir}/README.md" <<EOF
# ${repo}

\`${purpose}\`를 조직 공통 자산으로 분리한 인프라 저장소입니다. 실험, 벤치마크, 앱 저장소가 동일한 결과 구조와 리포팅 규칙을 사용하도록 기준 스키마와 템플릿을 제공합니다.

## 저장소 역할
- 원시 결과 JSON의 구조를 표준화해 저장소 간 비교 가능성을 유지합니다.
- \`RESULTS.md\`와 예제 결과 파일의 최소 형식을 제공해 문서 품질 편차를 줄입니다.
- 각 프로젝트가 독자 포맷을 만들지 않도록 공통 스키마의 단일 source of truth 역할을 합니다.

## 우선순위
- ${priority}

## 포함 내용
- \`schemas/ai-webgpu-lab-result.schema.json\`
- \`templates/example-result.json\`
- \`templates/RESULTS-template.md\`
- \`docs/RESULT-RULES.md\`

## 조직 상태 대시보드
- 전체 Pages/demo 상태는 \`docs-lab-roadmap/docs/PAGES-STATUS.md\`에서 확인합니다.
- 이 저장소의 live demo는 \`https://ai-webgpu-lab.github.io/${repo}/\`에서 확인합니다.
- 결과 스키마 변경은 \`docs-lab-roadmap/docs/INTEGRATION-STATUS.md\`와 각 \`RESULTS.md\` 운영 규칙에 맞춰 반영합니다.
- sketch capabilities는 \`docs-lab-roadmap/docs/SKETCH-METRICS.md\`에서 확인합니다.

## 사용 방식
- 실험, 벤치마크, 앱 저장소는 이 저장소의 스키마와 템플릿을 기준으로 결과 파일을 복제합니다.
- \`reports/raw/\` 아래 JSON 산출물은 이 스키마와 일치해야 합니다.
- 결과 보고 규칙이 변경되면 개별 저장소 README/RESULTS 규칙도 함께 갱신해야 합니다.

## 완료 기준
- 새 결과 필드가 필요할 때 스키마, 예제, 결과 규칙 문서가 함께 업데이트됩니다.
- 공통 템플릿 변경이 실험/벤치/App 저장소의 실제 운영 흐름과 충돌하지 않습니다.
- 임의 포맷이 아니라 재현 가능한 결과 산출 구조를 유지합니다.

## 관련 저장소
- \`docs-lab-roadmap\` - 계획 문서와 리포팅 정책 기준
- \`shared-github-actions\` - CI에서 스키마 검증을 붙일 공통 액션 대상
- \`tpl-webgpu-vanilla\`, \`tpl-webgpu-react\` - 새 프로젝트가 가져갈 기본 출발점

## 라이선스
MIT
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

  write_generated_readme "${dir}/README.md" <<EOF
# ${repo}

\`${purpose}\`를 담당하는 공통 인프라 저장소입니다. 여러 실험/벤치/앱 저장소에서 반복될 코드를 별도 모듈로 분리하고, 조직 차원의 재사용 지점을 명확하게 관리하는 것이 목적입니다.

## 저장소 역할
- 개별 프로젝트에 흩어지면 유지비가 커지는 공통 유틸리티와 운영 자산을 분리합니다.
- 소비자 저장소가 어떤 함수, 워크플로우, 규칙을 기대할 수 있는지 명시적인 계약을 제공합니다.
- 실험 저장소의 속도를 해치지 않도록 안정화된 공통 조각만 수용합니다.

## 우선순위
- ${priority}

## 기본 구조
- \`src/\` - 재사용 가능한 모듈 또는 스크립트 구현
- \`docs/\` - 사용법, 설계 메모, 소비자 통합 가이드

## 조직 상태 대시보드
- 전체 Pages/demo 상태는 \`docs-lab-roadmap/docs/PAGES-STATUS.md\`에서 확인합니다.
- 이 저장소의 live demo는 \`https://ai-webgpu-lab.github.io/${repo}/\`에서 확인합니다.
- 통합 sketch/adapter 상태는 \`docs-lab-roadmap/docs/INTEGRATION-STATUS.md\`에서 확인합니다.
- sketch capabilities는 \`docs-lab-roadmap/docs/SKETCH-METRICS.md\`에서 확인합니다.

## 운영 규칙
- 공통화 후보는 둘 이상의 저장소에서 반복 사용되는 경우에만 승격합니다.
- 공개 API나 워크플로우 입력/출력은 README와 \`docs/\`에 함께 문서화합니다.
- 실험 중인 아이디어는 개별 저장소에서 검증한 뒤 안정화 후 이곳으로 이동합니다.

## 완료 기준
- 소비자 저장소가 따라 할 수 있는 최소 사용 예시가 README 또는 \`docs/\`에 있습니다.
- 변경 시 영향을 받는 저장소 범위를 설명할 수 있습니다.
- 저장소 목적과 무관한 도메인별 로직이 유입되지 않습니다.

## 관련 저장소
- \`docs-lab-roadmap\` - 어떤 공통 자산이 필요한지 결정하는 계획 기준
- \`shared-bench-schema\` - 결과 리포팅 공통 자산
- \`tpl-webgpu-vanilla\`, \`tpl-webgpu-react\` - 공통 자산을 가장 먼저 반영할 템플릿 저장소

## 라이선스
MIT
EOF

  if [[ "${repo}" == "shared-webgpu-capability" ]]; then
    write_generated_file "${dir}/package.json" <<'EOF'
{
  "name": "@ai-webgpu-lab/shared-webgpu-capability",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Shared browser-side WebGPU capability and baseline result helpers for AI WebGPU Lab.",
  "exports": {
    ".": "./src/index.mjs"
  }
}
EOF

    write_generated_file "${dir}/src/index.mjs" <<'EOF'
const knownLimitKeys = [
  "maxTextureDimension1D",
  "maxTextureDimension2D",
  "maxTextureDimension3D",
  "maxBindGroups",
  "maxBindingsPerBindGroup",
  "maxUniformBufferBindingSize",
  "maxStorageBufferBindingSize",
  "maxComputeInvocationsPerWorkgroup",
  "maxComputeWorkgroupStorageSize",
  "maxBufferSize"
];

export function inferDeviceClass({
  hardwareConcurrency = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 0 : 0,
  deviceMemory = typeof navigator !== "undefined" ? navigator.deviceMemory || 0 : 0,
  userAgent = typeof navigator !== "undefined" ? navigator.userAgent || "" : ""
} = {}) {
  const mobile = /Mobi|Android|iPhone|iPad/i.test(userAgent);

  if (mobile) {
    if (deviceMemory >= 6 && hardwareConcurrency >= 8) {
      return "mobile-high";
    }

    return "mobile-mid";
  }

  if (deviceMemory >= 16 && hardwareConcurrency >= 12) {
    return "desktop-high";
  }

  if (deviceMemory >= 8 && hardwareConcurrency >= 8) {
    return "desktop-mid";
  }

  if (hardwareConcurrency >= 4) {
    return "laptop";
  }

  return "unknown";
}

export function parseBrowser(userAgent = typeof navigator !== "undefined" ? navigator.userAgent || "" : "") {
  const candidates = [
    ["Edg/", "Edge"],
    ["Chrome/", "Chrome"],
    ["Firefox/", "Firefox"],
    ["Version/", "Safari"]
  ];

  for (const [needle, name] of candidates) {
    const marker = userAgent.indexOf(needle);
    if (marker >= 0) {
      const version = userAgent.slice(marker + needle.length).split(/[\s)/;]/)[0] || "unknown";
      return { name, version };
    }
  }

  return { name: "Unknown", version: "unknown" };
}

export function parseOs(userAgent = typeof navigator !== "undefined" ? navigator.userAgent || "" : "") {
  if (/Windows NT/i.test(userAgent)) {
    const match = userAgent.match(/Windows NT ([0-9.]+)/i);
    return { name: "Windows", version: match ? match[1] : "unknown" };
  }

  if (/Mac OS X/i.test(userAgent)) {
    const match = userAgent.match(/Mac OS X ([0-9_]+)/i);
    return { name: "macOS", version: match ? match[1].replace(/_/g, ".") : "unknown" };
  }

  if (/Android/i.test(userAgent)) {
    const match = userAgent.match(/Android ([0-9.]+)/i);
    return { name: "Android", version: match ? match[1] : "unknown" };
  }

  if (/(iPhone|iPad|CPU OS)/i.test(userAgent)) {
    const match = userAgent.match(/OS ([0-9_]+)/i);
    return { name: "iOS", version: match ? match[1].replace(/_/g, ".") : "unknown" };
  }

  if (/Linux/i.test(userAgent)) {
    return { name: "Linux", version: "unknown" };
  }

  return { name: "Unknown", version: "unknown" };
}

export function baseEnvironmentSnapshot() {
  const nav = typeof navigator !== "undefined" ? navigator : {};

  return {
    browser: parseBrowser(nav.userAgent || ""),
    os: parseOs(nav.userAgent || ""),
    device: {
      name: nav.platform || "unknown",
      class: inferDeviceClass({
        hardwareConcurrency: nav.hardwareConcurrency || 0,
        deviceMemory: nav.deviceMemory || 0,
        userAgent: nav.userAgent || ""
      }),
      cpu: nav.hardwareConcurrency ? `${nav.hardwareConcurrency} threads` : "unknown",
      memory_gb: nav.deviceMemory || undefined,
      power_mode: "unknown"
    },
    gpu: {
      adapter: "unknown",
      required_features: [],
      limits: {}
    },
    backend: "wasm",
    fallback_triggered: true,
    worker_mode: "unknown",
    cache_state: "unknown"
  };
}

export function extractGpuLimits(source) {
  const limits = {};

  if (!source) {
    return limits;
  }

  for (const key of knownLimitKeys) {
    if (key in source && Number.isFinite(source[key])) {
      limits[key] = Number(source[key]);
    }
  }

  return limits;
}

export async function collectWebGpuCapability() {
  const environment = baseEnvironmentSnapshot();

  if (typeof navigator === "undefined" || !("gpu" in navigator)) {
    return {
      environment,
      webgpu: {
        available: false,
        error: "navigator.gpu unavailable",
        adapter: "unavailable",
        features: [],
        limits: {}
      }
    };
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error("No GPU adapter returned");
    }

    let adapterInfo = null;
    if (typeof adapter.requestAdapterInfo === "function") {
      try {
        adapterInfo = await adapter.requestAdapterInfo();
      } catch (error) {
        adapterInfo = null;
      }
    }

    const device = await adapter.requestDevice();
    const webgpu = {
      available: true,
      adapter: (adapterInfo && (adapterInfo.description || adapterInfo.vendor || adapterInfo.architecture)) || "WebGPU adapter",
      features: Array.from(device.features || []),
      limits: extractGpuLimits(device.limits || adapter.limits)
    };

    environment.backend = "webgpu";
    environment.fallback_triggered = false;
    environment.gpu = {
      adapter: webgpu.adapter,
      required_features: webgpu.features,
      limits: webgpu.limits
    };

    return { environment, webgpu };
  } catch (error) {
    return {
      environment,
      webgpu: {
        available: false,
        error: error instanceof Error ? error.message : String(error),
        adapter: "unavailable",
        features: [],
        limits: {}
      }
    };
  }
}

export function buildBaselineResult({
  repo,
  track = "infra",
  workloadKind = "graphics",
  purpose = "WebGPU capability baseline"
} = {}, capability = { environment: baseEnvironmentSnapshot(), webgpu: null }) {
  const environment = capability.environment || baseEnvironmentSnapshot();
  const webgpu = capability.webgpu;

  if (webgpu) {
    environment.backend = webgpu.available ? "webgpu" : "wasm";
    environment.fallback_triggered = !webgpu.available;
    environment.gpu = {
      adapter: webgpu.adapter || "unknown",
      required_features: webgpu.features || [],
      limits: webgpu.limits || {}
    };
  }

  return {
    meta: {
      repo,
      commit: "bootstrap-generated",
      timestamp: new Date().toISOString(),
      owner: "ai-webgpu-lab",
      track,
      scenario: "baseline-probe",
      notes: `${purpose}. Replace generic capability capture with workload-specific metrics before publishing benchmark conclusions.`
    },
    environment,
    workload: {
      kind: workloadKind,
      name: `${repo} baseline probe`,
      input_profile: "bootstrap-default"
    },
    metrics: {
      common: {
        time_to_interactive_ms: 0,
        init_ms: 0,
        success_rate: webgpu ? (webgpu.available ? 1 : 0) : 0.5,
        peak_memory_note: "Populate after first workload-specific run.",
        error_type: webgpu && webgpu.error ? webgpu.error : ""
      }
    },
    status: webgpu ? (webgpu.available ? "success" : "partial") : "partial"
  };
}
EOF

    write_generated_file "${dir}/docs/capability-contract.md" <<'EOF'
# Capability Contract

`shared-webgpu-capability`는 브라우저 환경에서 WebGPU readiness를 캡처하고, 공통 결과 스키마와 맞는 baseline JSON 초안을 만드는 최소 유틸리티를 제공한다.

## Exported APIs
- `baseEnvironmentSnapshot()` - 브라우저/OS/디바이스 기본 스냅샷 생성
- `collectWebGpuCapability()` - adapter/device 요청 후 GPU capability 캡처
- `buildBaselineResult(options, capability)` - 공통 스키마에 맞춘 baseline 결과 초안 생성

## Intended Usage
1. 실험/벤치/앱 저장소에서 첫 baseline probe 시 environment snapshot을 캡처한다.
2. workload-specific KPI가 아직 없더라도 공통 메타데이터와 fallback 상태를 먼저 기록한다.
3. 이후 각 저장소에서 모델, 렌더러, 런타임별 세부 metric을 추가한다.

## Non-goals
- 저장소별 KPI 계산 로직 제공
- 브라우저별 완벽한 user agent 판별
- build tooling이나 framework integration 자동화
EOF
  fi

  if [[ "${repo}" == "shared-github-actions" ]]; then
    mkdir -p "${dir}/.github/workflows"

    write_generated_file "${dir}/.github/workflows/reusable-results-guard.yml" <<'EOF'
name: reusable-results-guard

on:
  workflow_call:
    inputs:
      repo_root:
        description: Repository subdirectory to validate
        required: false
        type: string
        default: .

jobs:
  validate-results:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Validate RESULTS.md and raw JSON
        shell: bash
        run: |
          set -euo pipefail
          cd "${{ inputs.repo_root }}"

          if [[ ! -f "RESULTS.md" ]]; then
            echo "RESULTS.md is required"
            exit 1
          fi

          if [[ ! -d "reports/raw" ]]; then
            echo "reports/raw is required"
            exit 1
          fi

          raw_files="$(find reports/raw -maxdepth 1 -type f -name '*.json' | sort)"
          if [[ -z "${raw_files}" ]]; then
            echo "at least one raw JSON file is required"
            exit 1
          fi

          while IFS= read -r file; do
            jq empty "${file}" >/dev/null
            basename "${file}" | sed 's#^#validated raw file: #'
          done <<< "${raw_files}"

          if grep -Fq "핵심 질문 1" RESULTS.md; then
            echo "RESULTS.md still contains placeholder template content"
            exit 1
          fi
EOF

    write_generated_file "${dir}/.github/workflows/reusable-pages-smoke.yml" <<'EOF'
name: reusable-pages-smoke

on:
  workflow_call:
    inputs:
      url:
        description: Absolute GitHub Pages URL
        required: true
        type: string
      expected_title:
        description: Optional expected page title substring
        required: false
        type: string
        default: ""
      fallback_query:
        description: Optional query string to probe after the main page
        required: false
        type: string
        default: ""

jobs:
  smoke-test:
    runs-on: ubuntu-latest
    steps:
      - name: Check primary page
        shell: bash
        run: |
          set -euo pipefail
          status="$(curl -I -L -s -o /dev/null -w '%{http_code}' "${{ inputs.url }}")"
          if [[ "${status}" != "200" ]]; then
            echo "unexpected status: ${status}"
            exit 1
          fi

          html="$(curl -fsSL "${{ inputs.url }}")"
          if [[ -n "${{ inputs.expected_title }}" ]] && [[ "${html}" != *"<title>${{ inputs.expected_title }}</title>"* ]] && [[ "${html}" != *"${{ inputs.expected_title }}"* ]]; then
            echo "expected title not found"
            exit 1
          fi

      - name: Check fallback query
        if: ${{ inputs.fallback_query != '' }}
        shell: bash
        run: |
          set -euo pipefail
          status="$(curl -I -L -s -o /dev/null -w '%{http_code}' "${{ inputs.url }}${{ inputs.fallback_query }}")"
          if [[ "${status}" != "200" ]]; then
            echo "unexpected fallback status: ${status}"
            exit 1
          fi
EOF

    write_generated_file "${dir}/docs/reusable-workflows.md" <<'EOF'
# Reusable Workflows

## Included Workflows
- `.github/workflows/reusable-results-guard.yml`
- `.github/workflows/reusable-pages-smoke.yml`

## Consumer Example
```yaml
name: repo-results-guard

on:
  push:
    branches: [main]
  pull_request:

jobs:
  results:
    uses: ai-webgpu-lab/shared-github-actions/.github/workflows/reusable-results-guard.yml@main
```

```yaml
name: repo-pages-smoke

on:
  workflow_dispatch:

jobs:
  pages:
    uses: ai-webgpu-lab/shared-github-actions/.github/workflows/reusable-pages-smoke.yml@main
    with:
      url: https://ai-webgpu-lab.github.io/exp-llm-chat-runtime-shootout/
      expected_title: exp-llm-chat-runtime-shootout Runtime Readiness Harness
      fallback_query: ?mode=fallback
```
EOF
  fi
}

render_docs_repo() {
  local dir="$1"
  local repo="$2"
  local purpose="$3"
  local priority="$4"

  mkdir -p "${dir}/docs"
  : >"${dir}/docs/.gitkeep"

  write_generated_readme "${dir}/README.md" <<EOF
# ${repo}

\`${purpose}\`를 담당하는 문서 기준 저장소입니다. 조직 전체의 실행 순서, ADR, 보고서, 운영 규칙을 한곳에 모아 각 프로젝트 README와 운영 자동화가 같은 방향을 보도록 유지합니다.

## 저장소 역할
- 저장소 인벤토리, 우선순위, 실행 순서, phase gate를 관리합니다.
- 실험/벤치/앱 저장소가 따라야 할 문서 규칙의 기준점을 제공합니다.
- 조직 자동화 스크립트와 실제 운영 문서가 어긋나지 않도록 검증 대상이 됩니다.

## 우선순위
- ${priority}

## 기본 구조
- \`docs/\` - 로드맵, 트랙 문서, 프로젝트 운영 설계, 실행 계획
- \`scripts/\` - 부트스트랩, 검증, 토픽/라벨 동기화 스크립트
- \`templates/\` - 공통 README/RESULTS 템플릿
- \`schemas/\` - 결과 JSON 스키마
- \`tests/\` - 문서/부트스트랩 정합성 검증

## 조직 상태 대시보드
- Pages/demo 상태: \`docs/PAGES-STATUS.md\`
- 통합 sketch/adapter 상태: \`docs/INTEGRATION-STATUS.md\`
- sketch capabilities: \`docs/SKETCH-METRICS.md\`
- README drift 상태: \`docs/README-STATUS.md\`
- Actions/deploy workflow 상태: \`docs/WORKFLOW-STATUS.md\`
- GitHub Projects/seeded issue 상태: \`docs/PROJECT-STATUS.md\`
- 실제 Pages smoke 검증: \`node scripts/check-org-pages.mjs --fail-on-error\`

## 유지 규칙
- 저장소 인벤토리가 바뀌면 관련 문서와 자동 검증 스크립트를 함께 수정합니다.
- 실행 계획 문서는 실제 bootstrap/seed 절차와 충돌하면 안 됩니다.
- 루트 README와 하위 문서는 서로 다른 메시지를 말하지 않도록 정합성을 유지합니다.

## 완료 기준
- 새 저장소 또는 새 트랙이 추가될 때 관련 문서와 스크립트가 함께 반영됩니다.
- 부트스트랩/검증 테스트가 문서 주장과 실제 산출물을 같이 검증합니다.
- 조직 운영자가 이 저장소만 읽어도 현재 실험 프로그램의 상태를 이해할 수 있습니다.

## 관련 저장소
- \`.github\` - 조직 기본 템플릿과 프로필
- \`shared-bench-schema\` - 문서와 실제 결과 스키마 연결점
- 모든 \`tpl-*\`, \`exp-*\`, \`bench-*\`, \`app-*\` 저장소 - 이 저장소를 기준으로 bootstrap됨

## 라이선스
MIT
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
  local pages_url
  local pages_bootstrap_status
  local pages_structure_entry
  local pages_section
  local baseline_status_block
  local role_block
  local question_block
  local scope_block
  local non_goal_block
  local measurement_block
  local deliverables_block
  local done_block
  local related_block
  local summary
  track="$(track_for_category "${category}")"
  kind="$(kind_for_category "${category}")"
  pages_url="$(pages_url_for_repo "${repo}")"

  create_result_scaffold "${dir}"
  copy_results_template "${dir}"
  copy_schema "${dir}"

  case "${category}" in
    template)
      summary="\`${purpose}\`를 위한 출발점 템플릿 저장소입니다. 새로운 실험/벤치/앱 저장소를 만들기 전에 가장 얇은 실행 경로와 결과 구조를 먼저 검증하는 기준선 역할을 합니다."
      role_block="$(cat <<'EOF'
- 새 저장소가 바로 가져갈 수 있는 최소 디렉터리 구조와 결과 리포팅 규칙을 제공합니다.
- WebGPU 기능 감지, 실패 표면, 기본 렌더/실행 루프 같은 공통 시작점을 정리합니다.
- 프레임워크 도입 전에 가장 단순한 baseline을 재현해 이후 비교 기준을 만듭니다.
EOF
)"
      question_block="$(cat <<'EOF'
- 이 스택에서 가장 작은 성공 경로로 baseline 데모를 띄울 수 있는가
- capability 확인, 오류 메시지, fallback 기록을 어떤 구조로 남길 것인가
- 이후 실험/벤치 저장소가 공통으로 복제할 README/RESULTS 흐름은 무엇인가
EOF
)"
      scope_block="$(cat <<'EOF'
- 최소 실행 예제와 기본 디렉터리 구조
- 결과 스키마, `RESULTS.md`, `reports/` 폴더 연결
- 첫 runnable baseline을 다른 저장소가 재사용할 수 있도록 문서화
EOF
)"
      non_goal_block="$(cat <<'EOF'
- 도메인별 완성 기능이나 대규모 제품 UX
- 여러 런타임/모델/렌더러의 폭넓은 비교
- 템플릿 단계에서의 과도한 추상화
EOF
)"
      measurement_block="$(cat <<'EOF'
- 첫 실행 성공 여부와 환경 재현성
- capability probe와 fallback 기록 가능 여부
- 템플릿에서 파생 저장소로 옮길 때 필요한 수정 범위
EOF
)"
      deliverables_block="$(cat <<'EOF'
- 최소 실행 예제
- 복제 가능한 README/RESULTS 문서 구조
- GitHub Pages에서 확인 가능한 baseline surface
EOF
)"
      done_block="$(cat <<'EOF'
- 새 저장소가 이 템플릿을 기준으로 바로 시작할 수 있습니다.
- 첫 baseline 실행 경로가 README에 정리되어 있습니다.
- 결과 스키마와 Pages baseline probe가 함께 연결되어 있습니다.
EOF
)"
      related_block="$(cat <<'EOF'
- `shared-webgpu-capability` - capability 수집 유틸
- `shared-bench-schema` - 결과 스키마와 결과 템플릿
- `docs-lab-roadmap` - 템플릿이 따라야 할 운영 기준
EOF
)"
      ;;
    benchmark)
      summary="\`${purpose}\`를 비교 가능한 형태로 측정하는 benchmark 저장소입니다. 동일한 입력과 보고 형식을 유지하면서 구현체 간 차이를 수치와 산출물로 남기는 것이 목적입니다."
      role_block="$(cat <<'EOF'
- 둘 이상의 런타임, 모델, 렌더러, 구현 방식을 같은 조건으로 비교합니다.
- 결과 수집과 표준화된 보고 형식을 우선하며, 단일 기능 구현 자체보다 비교 가능성이 더 중요합니다.
- 개별 실험 저장소의 가설을 수치로 검증하는 공통 벤치마크 기준점을 제공합니다.
EOF
)"
      question_block="$(cat <<'EOF'
- 같은 시나리오에서 어떤 구현이 더 빠르고 안정적인가
- 성능 차이가 초기 로드, warm run, cache 상태, worker 분리에 따라 어떻게 달라지는가
- 이후 제품/앱 선택에 필요한 최소 비교 지표는 무엇인가
EOF
)"
      scope_block="$(cat <<'EOF'
- 비교 대상과 공통 입력 시나리오 정의
- raw JSON, 로그, 스크린샷 등 재현 가능한 결과 저장
- `RESULTS.md`에 핵심 비교표와 해석 기록
EOF
)"
      non_goal_block="$(cat <<'EOF'
- 단일 구현의 세부 기능 확장
- 프로덕션 배포용 UI 완성도 추구
- 비교 조건이 제각각인 임의 측정
EOF
)"
      measurement_block="$(cat <<'EOF'
- latency, throughput, load time, cache hit 여부
- 브라우저/OS/디바이스별 편차
- 오류율, fallback 발생, UI jank 또는 frame budget 영향
EOF
)"
      deliverables_block="$(cat <<'EOF'
- 공통 입력 기준이 명시된 벤치마크 harness
- raw 결과 파일과 요약 보고서
- GitHub Pages 또는 README에서 확인 가능한 결과 surface
EOF
)"
      done_block="$(cat <<'EOF'
- 비교 대상별 결과가 같은 형식으로 수집됩니다.
- `RESULTS.md`가 raw JSON과 일치합니다.
- 의사결정에 필요한 최소 비교표와 해석이 문서화되어 있습니다.
EOF
)"
      related_block="$(cat <<'EOF'
- `shared-bench-schema` - 벤치 결과 공통 스키마
- `docs-lab-roadmap` - 벤치 우선순위와 실행 계획
- 관련 `exp-*` 저장소 - 벤치 입력과 baseline 출처
EOF
)"
      ;;
    app)
      summary="\`${purpose}\`를 실제 사용자 흐름으로 묶어 보여주는 통합 데모 저장소입니다. 여러 baseline을 하나의 사용 시나리오로 연결해 실험 결과가 제품 UX로 이어질 수 있는지 확인합니다."
      role_block="$(cat <<'EOF'
- 실험과 벤치 결과를 실제 사용자 플로우로 조합합니다.
- 조직 외부에서도 상태를 이해할 수 있는 데모 surface를 제공합니다.
- 각 기능 조합에서 병목, 실패 지점, UX 리스크를 조기에 드러냅니다.
EOF
)"
      question_block="$(cat <<'EOF'
- 개별 baseline을 묶었을 때 사용자 관점에서 충분히 동작하는가
- 성능과 품질이 UX 수준에서 허용 가능한가
- 어떤 실험/벤치 결과가 실제 통합 제품 설계에 가장 큰 영향을 주는가
EOF
)"
      scope_block="$(cat <<'EOF'
- 핵심 사용자 시나리오 1~2개 구현
- 필요한 baseline/모델/유틸 조합
- 데모 운영에 필요한 최소 상태 관리와 결과 보고
EOF
)"
      non_goal_block="$(cat <<'EOF'
- 제품 출시 수준의 완성도, 인증, 결제, 운영 백엔드
- 광범위한 기능 확장
- 원인 분리가 어려운 ad hoc 통합
EOF
)"
      measurement_block="$(cat <<'EOF'
- end-to-end latency와 사용자 상호작용 응답성
- load/cache behavior와 세션 지속성
- 통합 시 발생하는 오류 흐름과 fallback UX
EOF
)"
      deliverables_block="$(cat <<'EOF'
- 사용자 흐름을 보여주는 runnable demo
- 통합 결과 요약과 known issues
- GitHub Pages 또는 별도 정적 surface에서 확인 가능한 설명 페이지
EOF
)"
      done_block="$(cat <<'EOF'
- 핵심 사용자 흐름이 끝까지 재현됩니다.
- 통합 리스크와 병목이 README/RESULTS에 정리되어 있습니다.
- 관련 실험/벤치 저장소와 연결 관계가 문서화되어 있습니다.
EOF
)"
      related_block="$(cat <<'EOF'
- 관련 `exp-*` 저장소 - 개별 baseline 출처
- 관련 `bench-*` 저장소 - 통합 전에 확보한 비교 결과
- `shared-webgpu-capability`, `shared-bench-schema`, `docs-lab-roadmap`
EOF
)"
      ;;
    graphics|blackhole|ml|llm|audio|multimodal|agent)
      summary="\`${purpose}\`를 단일 질문으로 분리해 검증하는 experiment 저장소입니다. 하나의 가설과 baseline에 집중하고, 결과를 재현 가능한 형식으로 남겨 이후 benchmark/app 저장소의 입력으로 사용합니다."
      role_block="$(cat <<'EOF'
- 한 저장소가 한 질문만 답하도록 범위를 좁혀 baseline을 빠르게 검증합니다.
- 구현 자체보다 가설 검증과 결과 기록을 우선합니다.
- 이후 benchmark와 app 저장소에서 재사용할 입력, 구현, 한계 사항을 명확히 남깁니다.
EOF
)"
      question_block="$(cat <<EOF
- ${purpose}를 브라우저/WebGPU 환경에서 재현 가능한 baseline으로 만들 수 있는가
- 현재 트랙에서 가장 먼저 확인해야 할 병목, 제약, fallback 조건은 무엇인가
- 이후 비교 또는 통합 단계로 넘기기 전에 어떤 최소 증거가 필요한가
EOF
)"
      scope_block="$(cat <<'EOF'
- 단일 baseline 또는 소수의 명확한 비교 축
- 실행 환경, capability, raw 결과 기록
- `RESULTS.md`와 스크린샷/로그를 포함한 재현 가능한 검증
EOF
)"
      non_goal_block="$(cat <<'EOF'
- 한 저장소 안에서 여러 질문을 동시에 푸는 것
- 제품 수준의 UX 완성도
- 재현 경로 없이 주장만 남는 결과 요약
EOF
)"
      case "${category}" in
        graphics|blackhole)
          measurement_block="$(cat <<'EOF'
- frame time, FPS, shader/compute 안정성
- 장면 품질, artifact, visual correctness
- GPU memory pressure, upload cost, fallback 여부
EOF
)"
          ;;
        ml|llm|audio|multimodal|agent)
          measurement_block="$(cat <<'EOF'
- first-token or first-result latency, steady-state throughput
- model load time, cache behavior, worker/off-main-thread 영향
- 품질, 오류율, fallback 경로, 사용자 체감 응답성
EOF
)"
          ;;
      esac
      deliverables_block="$(cat <<'EOF'
- 첫 runnable baseline 또는 최소 비교 구현
- raw 결과, 로그, 스크린샷
- `RESULTS.md` 기반의 요약과 해석
EOF
)"
      done_block="$(cat <<'EOF'
- 핵심 가설에 대한 예/아니오 또는 조건부 결론을 낼 수 있습니다.
- raw 결과와 요약 문서가 함께 존재합니다.
- 다음 단계가 benchmark인지 app인지 README에서 판단할 수 있습니다.
EOF
)"
      related_block="$(cat <<'EOF'
- `tpl-webgpu-vanilla` 또는 `tpl-webgpu-react` - baseline 출발점
- `shared-webgpu-capability` - capability/fallback 수집
- `shared-bench-schema`, `docs-lab-roadmap`
EOF
)"
      ;;
  esac

  if [[ "${RUN_PAGES}" -eq 1 ]]; then
    create_pages_demo_scaffold "${dir}" "${repo}" "${category}" "${purpose}" "${priority}"
    attach_family_adapters "${dir}" "${repo}" "${category}"
    attach_family_real_sketches "${dir}" "${repo}" "${category}"
    if has_repo_specific_pages_baseline "${repo}"; then
      local baseline_source
      baseline_source="$(repo_specific_pages_baseline_source "${repo}")"
      baseline_status_block="$(cat <<EOF
- Repository-specific runnable baseline active: $(repo_specific_pages_baseline_summary "${repo}")
- Generated override source: \`${baseline_source}\`
- Results/report scaffold is ready to promote exported JSON into \`reports/raw/\` and \`RESULTS.md\`
EOF
)"
      pages_bootstrap_status="$(cat <<EOF
- Repo-specific Pages baseline copied from \`${baseline_source}\`
- Generated entry point updated in \`public/index.html\` and related assets
- GitHub Pages workflow copied to \`.github/workflows/deploy-pages.yml\`
EOF
)"
    else
      baseline_status_block="$(cat <<'EOF'
- Shared baseline probe active: browser/device/WebGPU readiness capture page
- Generated baseline is intended as a stopgap until a repository-specific harness replaces it
- Results/report scaffold is ready to promote exported JSON into `reports/raw/` and `RESULTS.md`
EOF
)"
      pages_bootstrap_status="$(cat <<EOF
- GitHub Pages baseline probe copied to \`public/index.html\`
- Browser probe logic copied to \`public/app.js\`
- GitHub Pages workflow copied to \`.github/workflows/deploy-pages.yml\`
EOF
)"
    fi
    pages_structure_entry='- `public/` - GitHub Pages baseline probe 또는 실제 정적 데모 산출물'
    pages_section="$(cat <<EOF
## GitHub Pages 운영 메모
- Pages URL: ${pages_url}
- 기본 bootstrap workflow는 \`public/\` baseline probe 정적 artifact를 배포합니다.
- 실제 빌드가 필요한 저장소는 install/build 단계와 artifact 경로를 저장소 사양에 맞게 교체해야 합니다.
EOF
)"
  else
    baseline_status_block="$(cat <<EOF
- GitHub Pages scaffold skipped in this run
- Intended Pages baseline: $(repo_specific_pages_baseline_summary "${repo}")
- Results/report scaffold is still ready in \`reports/raw/\`, \`schemas/\`, and \`RESULTS.md\`
EOF
)"
    pages_bootstrap_status='- GitHub Pages scaffold skipped by bootstrap option `--no-pages`'
    pages_structure_entry=""
    pages_section=""
  fi

  write_generated_readme "${dir}/README.md" <<EOF
# ${repo}

${summary}

## 저장소 역할
${role_block}

## 핵심 질문
${question_block}

## 포함 범위
${scope_block}

## 비범위
${non_goal_block}

## 기본 구조
- \`src/\` - 구현 코드 또는 baseline 프로토타입
${pages_structure_entry}
- \`reports/raw/\` - 원시 측정 결과 JSON/CSV/로그
- \`reports/screenshots/\` - 시각 결과 스크린샷
- \`reports/logs/\` - 실행 로그와 디버깅 산출물
- \`schemas/ai-webgpu-lab-result.schema.json\` - 공통 결과 스키마
- \`RESULTS.md\` - 핵심 결과 요약과 해석

## 메타데이터
- Track: ${track}
- Kind: ${kind}
- Priority: ${priority}

## 현재 상태
- Repository scaffold initialized
- Shared result schema copied to \`schemas/ai-webgpu-lab-result.schema.json\`
- Shared reporting template copied to \`RESULTS.md\`
${pages_bootstrap_status}

## 현재 baseline 상태
${baseline_status_block}

${pages_section}

## 조직 상태 대시보드
- 전체 Pages/demo 상태는 \`docs-lab-roadmap/docs/PAGES-STATUS.md\`에서 확인합니다.
- 이 저장소의 live demo는 \`${pages_url}\`입니다.
- 통합 sketch/adapter 상태는 \`docs-lab-roadmap/docs/INTEGRATION-STATUS.md\`에서 확인합니다.
- sketch capabilities는 \`docs-lab-roadmap/docs/SKETCH-METRICS.md\`에서 확인합니다.

## 측정 및 검증 포인트
${measurement_block}

## 산출물
${deliverables_block}

## 작업 및 갱신 절차
- \`src/\` 아래에 첫 runnable baseline 또는 비교 harness를 구현합니다.
- 실제 사용 스택이 정해지면 이 README에 install/dev/build/test 명령을 추가합니다.
- 측정 결과는 \`reports/raw/\`와 \`RESULTS.md\`에 함께 반영합니다.
- 브라우저, OS, 디바이스, cache, worker 여부 등 재현 조건을 결과와 같이 기록합니다.
- Pages를 유지하는 경우 baseline probe 또는 workflow를 실제 저장소 동작에 맞게 교체합니다.

## 완료 기준
${done_block}

## 관련 저장소
${related_block}

## 라이선스
MIT
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
      maybe_attach_infra_baseline_scaffold "${dir}" "${repo}" "${category}" "${purpose}" "${priority}"
      ;;
    docs)
      render_docs_repo "${dir}" "${repo}" "${purpose}" "${priority}"
      maybe_attach_infra_baseline_scaffold "${dir}" "${repo}" "${category}" "${purpose}" "${priority}"
      ;;
    shared)
      if [[ "${repo}" == "shared-bench-schema" ]]; then
        render_shared_bench_schema_repo "${dir}" "${repo}" "${purpose}" "${priority}"
      else
        render_shared_repo "${dir}" "${repo}" "${purpose}" "${priority}"
      fi
      maybe_attach_infra_baseline_scaffold "${dir}" "${repo}" "${category}" "${purpose}" "${priority}"
      ;;
    template|graphics|blackhole|ml|llm|audio|multimodal|agent|benchmark|app)
      render_work_repo "${dir}" "${repo}" "${category}" "${purpose}" "${priority}"
      ;;
    *)
      render_shared_repo "${dir}" "${repo}" "${purpose}" "${priority}"
      maybe_attach_infra_baseline_scaffold "${dir}" "${repo}" "${category}" "${purpose}" "${priority}"
      ;;
  esac
}

repo_exists() {
  gh repo view "$1" >/dev/null 2>&1
}

ensure_pages_site() {
  local full_repo="$1"
  local payload='{"build_type":"workflow","source":{"branch":"main","path":"/"}}'

  if gh api "/repos/${full_repo}/pages" >/dev/null 2>&1; then
    gh api \
      --method PUT \
      -H "Accept: application/vnd.github+json" \
      "/repos/${full_repo}/pages" \
      --input - >/dev/null <<<"${payload}"
  else
    gh api \
      --method POST \
      -H "Accept: application/vnd.github+json" \
      "/repos/${full_repo}/pages" \
      --input - >/dev/null <<<"${payload}"
  fi
}

trigger_pages_workflow() {
  local full_repo="$1"

  gh workflow run deploy-pages.yml --repo "${full_repo}" >/dev/null 2>&1
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
  local pushed_changes=0

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
    pushed_changes=1
    echo "pushed scaffold: ${full_repo}"
  else
    echo "no changes: ${full_repo}"
  fi

  if [[ "${RUN_PAGES}" -eq 1 ]] && needs_pages_demo "${category}"; then
    ensure_pages_site "${full_repo}"
    echo "configured pages: ${full_repo}"

    # Newly created repositories need a manual dispatch because Pages can only be
    # configured after the first push creates the default branch.
    if [[ "${repo_already_exists}" -eq 0 || "${pushed_changes}" -eq 0 ]]; then
      if trigger_pages_workflow "${full_repo}"; then
        echo "triggered pages workflow: ${full_repo}"
      else
        echo "warning: failed to trigger pages workflow: ${full_repo}" >&2
      fi
    fi
  fi

  rm -rf "${work_root}"
}

process_inventory() {
  local line
  local repo
  local category
  local purpose
  local priority

  while IFS=$'\x1f' read -r repo category purpose priority; do
    if [[ -z "${repo}" ]]; then
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
  done < <(python3 "${SCRIPT_DIR}/lib/read-inventory.py" "${INVENTORY_PATH}")
}

process_inventory

if [[ "${MODE}" == "github" && "${RUN_SYNC}" -eq 1 ]]; then
  bash "${SCRIPT_DIR}/sync-org-labels.sh" "${ORG}" "${INVENTORY_PATH}"
  bash "${SCRIPT_DIR}/sync-org-repo-topics.sh" "${ORG}" "${INVENTORY_PATH}"
fi
