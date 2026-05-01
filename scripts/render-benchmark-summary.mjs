#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { finalizeGeneratedMarkdown, GENERATED_AT_PLACEHOLDER } from "./lib/generated-markdown.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

const TRACKS = [
  {
    name: "Runtime",
    repos: ["bench-runtime-shootout", "bench-model-load-and-cache", "bench-worker-isolation-and-ui-jank"],
    current: "deterministic raw fixtures available; real runtime measurement pending",
    next: "cold/warm WebGPU and fallback rows with raw JSON"
  },
  {
    name: "Browser AI",
    repos: ["exp-embeddings-browser-throughput", "exp-stt-whisper-webgpu", "exp-llm-chat-runtime-shootout"],
    current: "embedding fixtures available; model-backed measurement pending",
    next: "model id, cache state, quality/latency pair"
  },
  {
    name: "Renderer",
    repos: ["exp-three-webgpu-core", "bench-renderer-shootout", "bench-blackhole-render-shootout"],
    current: "renderer adapter/sketch coverage ready; cross-device run pending",
    next: "frame time, load time, fallback status"
  },
  {
    name: "App surface",
    repos: ["app-private-rag-lab", "app-local-chat-arena", "app-blackhole-observatory"],
    current: "app surface adapters ready; end-to-end run pending",
    next: "task latency and user-visible failure notes"
  }
];

const PENDING_REAL_ROWS = [
  ["bench-runtime-shootout", "real-cold", "first usable result latency", "pending real run", "required before runtime promotion"],
  ["bench-runtime-shootout", "real-warm", "warmed interaction latency", "pending real run", "required before runtime promotion"],
  ["exp-stt-whisper-webgpu", "real WebGPU vs fallback", "audio sec/sec and WER/CER", "pending real run", "required before audio workload recommendation"],
  ["bench-renderer-shootout", "real renderer comparison", "p50/p95 frame time", "pending real run", "required before renderer recommendation"]
];

function usage() {
  console.log(`Usage: node scripts/render-benchmark-summary.mjs [options]

Renders docs/BENCHMARK-SUMMARY.md from committed raw result fixtures.

Options:
  --results-root <dir>  Root containing repo result fixtures. Default: tests/fixtures/results
  --output <file>       Markdown output. Default: docs/BENCHMARK-SUMMARY.md
  --stdout              Print markdown instead of writing it
  -h, --help            Show help`);
}

function parseArgs(argv) {
  const options = {
    resultsRoot: path.join(REPO_ROOT, "tests/fixtures/results"),
    output: path.join(REPO_ROOT, "docs/BENCHMARK-SUMMARY.md"),
    stdout: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--results-root") {
      options.resultsRoot = path.resolve(argv[index + 1]);
      index += 1;
    } else if (token === "--output") {
      options.output = path.resolve(argv[index + 1]);
      index += 1;
    } else if (token === "--stdout") {
      options.stdout = true;
    } else if (token === "--help" || token === "-h") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  return options;
}

async function listJsonFiles(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listJsonFiles(absolute));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(absolute);
    }
  }
  return files.sort();
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

function round(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  const factor = 10 ** digits;
  return String(Math.round(number * factor) / factor);
}

function primaryMetric(result) {
  if (result.metrics?.llm) {
    return `${round(result.metrics.llm.decode_tok_per_sec)} decode tok/s; TTFT ${round(result.metrics.llm.ttft_ms)} ms; p95/tail ${round(result.metrics.llm.turn_latency_ms)} ms`;
  }
  if (result.metrics?.embeddings) {
    return `${round(result.metrics.embeddings.docs_per_sec)} docs/s; p95 ${round(result.metrics.embeddings.p95_ms)} ms; recall@10 ${round(result.metrics.embeddings.recall_at_10, 4)}`;
  }
  if (result.metrics?.stt) {
    return `${round(result.metrics.stt.audio_sec_per_sec)} audio sec/sec; final ${round(result.metrics.stt.final_latency_ms)} ms; WER ${round(result.metrics.stt.wer, 4)}`;
  }
  if (result.metrics?.graphics) {
    return `${round(result.metrics.graphics.avg_fps)} fps; p95 ${round(result.metrics.graphics.p95_frametime_ms)} ms; load ${round(result.metrics.graphics.scene_load_ms)} ms`;
  }
  return `init ${round(result.metrics?.common?.init_ms)} ms; success ${round(result.metrics?.common?.success_rate)}`;
}

function resultState(result) {
  const backend = result.environment?.backend || "unknown";
  const cache = result.environment?.cache_state || "unknown-cache";
  const fallback = result.environment?.fallback_triggered ? "fallback" : "webgpu-primary";
  return `${result.status}; ${backend}/${cache}; ${fallback}`;
}

function decisionImpact(result) {
  if (result.meta?.repo === "bench-runtime-shootout") {
    return "runtime fixture baseline; rerun with real runtime before promotion";
  }
  if (result.meta?.repo === "exp-embeddings-browser-throughput") {
    return "browser AI fixture baseline; compare with model-backed run";
  }
  if (result.meta?.repo === "bench-model-load-and-cache") {
    return "cache fixture baseline; extend with real model assets";
  }
  return "fixture baseline; requires real browser rerun before promotion";
}

function escapeCell(value) {
  return String(value ?? "").replace(/\|/gu, "\\|").replace(/\n/gu, " ");
}

function envKey(result) {
  return [
    `${result.environment?.browser?.name || "unknown"} ${result.environment?.browser?.version || ""}`.trim(),
    result.environment?.device?.class || "unknown",
    result.environment?.gpu?.adapter || "unknown",
    result.environment?.backend || "unknown",
    result.environment?.cache_state || "unknown"
  ].join("|");
}

function environmentRows(results) {
  const rows = new Map();
  for (const result of results) {
    if (!rows.has(envKey(result))) {
      rows.set(envKey(result), [
        `${result.environment.browser.name} ${result.environment.browser.version}`,
        result.environment.device.class,
        result.environment.gpu.adapter,
        `${result.environment.backend}/${result.environment.cache_state}`,
        result.environment.fallback_triggered ? "fallback fixture" : "primary fixture"
      ]);
    }
  }
  rows.set("pending-chromium-webgpu", ["Chromium stable or Chrome stable", "desktop", "WebGPU adapter", "webgpu/cold+warm", "pending real run"]);
  rows.set("pending-chromium-fallback", ["Chromium stable or Chrome stable", "desktop", "fallback or WASM path", "fallback/cold+warm", "pending real run"]);
  rows.set("pending-cross-browser", ["Firefox Nightly/Safari Technology Preview", "desktop or laptop", "WebGPU availability varies", "compatibility", "pending compatibility run"]);
  return [...rows.values()];
}

function renderReport(results, files, resultsRoot) {
  const sorted = [...results].sort((left, right) =>
    `${left.meta.repo}/${left.meta.timestamp}/${left.meta.scenario}`.localeCompare(`${right.meta.repo}/${right.meta.timestamp}/${right.meta.scenario}`)
  );
  const relativeFiles = files.map((file) => path.relative(REPO_ROOT, file));
  const lines = [
    "# Benchmark Summary",
    "",
    `_Generated by \`scripts/render-benchmark-summary.mjs\` on ${GENERATED_AT_PLACEHOLDER}._`,
    "",
    "## Purpose",
    "This report is the Phase 3 benchmark summary entrypoint for `ai-webgpu-lab`. It is generated from committed raw result fixtures and keeps pending real browser measurements visible.",
    "",
    "## Measurement Scope",
    "| Track | Primary repos | Current state | Next required evidence |",
    "| --- | --- | --- | --- |",
    ...TRACKS.map((track) => `| ${track.name} | ${track.repos.map((repo) => `\`${repo}\``).join(", ")} | ${track.current} | ${track.next} |`),
    "",
    "## Environment Matrix",
    "| Environment | Device class | GPU path | Backend/cache | Status |",
    "| --- | --- | --- | --- | --- |",
    ...environmentRows(sorted).map((row) => `| ${row.map(escapeCell).join(" | ")} |`),
    "",
    "## Result Summary",
    "| Repo | Scenario | Primary metric | Current result | Decision impact |",
    "| --- | --- | --- | --- | --- |",
    ...sorted.map((result) => `| \`${escapeCell(result.meta.repo)}\` | ${escapeCell(result.meta.scenario)} | ${escapeCell(primaryMetric(result))} | ${escapeCell(resultState(result))} | ${escapeCell(decisionImpact(result))} |`),
    ...PENDING_REAL_ROWS.map((row) => `| \`${row[0]}\` | ${row.slice(1).map(escapeCell).join(" | ")} |`),
    "",
    "## Raw Result Index",
    "| Source | Path | Role |",
    "| --- | --- | --- |",
    ...relativeFiles.map((file, index) => `| Fixture baseline | \`${file}\` | committed raw result ${index + 1}/${relativeFiles.length} |`),
    "| Future real runs | `reports/raw/*.json` in each measured repo | required source for promoted benchmark rows |",
    "",
    "## Known Limitations",
    "- Current committed evidence proves schema, summary rendering, and deterministic fixture behavior; it does not yet prove a production runtime winner.",
    "- Real browser measurements must record browser version, OS/device, adapter name, cache state, worker mode, and failure mode before they can affect recommendations.",
    "- Pending rows must remain visible until raw JSON and a reproducible command are linked.",
    "- Deterministic rows such as deterministic-webgpu and deterministic-fallback are regression anchors, not substitutes for real WebGPU or fallback measurements.",
    "",
    "## Inputs",
    `- \`${path.relative(REPO_ROOT, resultsRoot)}\``,
    "- `docs/RESULT-SCHEMA.md`"
  ];
  return lines.join("\n");
}

async function renderBenchmarkSummary(options) {
  const files = await listJsonFiles(options.resultsRoot);
  if (!files.length) {
    throw new Error(`No raw result fixtures found in ${options.resultsRoot}`);
  }
  const results = [];
  for (const file of files) {
    results.push(await readJson(file));
  }
  const text = await finalizeGeneratedMarkdown({
    output: options.stdout ? "" : options.output,
    stdout: options.stdout,
    text: renderReport(results, files, options.resultsRoot)
  });
  if (options.stdout) {
    process.stdout.write(text);
    return text;
  }
  await fs.mkdir(path.dirname(options.output), { recursive: true });
  await fs.writeFile(options.output, `${text}\n`, "utf8");
  console.log(`benchmark summary written to ${options.output}`);
  console.log(`- raw result fixtures: ${files.length}`);
  return text;
}

async function main() {
  await renderBenchmarkSummary(parseArgs(process.argv.slice(2)));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
