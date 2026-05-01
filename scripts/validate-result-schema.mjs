#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

const STATUS_VALUES = new Set(["success", "partial", "pending", "failure"]);
const WORKER_MODE_VALUES = new Set(["main", "worker", "shared-worker", "mixed", "hybrid", "unknown"]);

const REQUIRED_PATHS = [
  "meta.repo",
  "meta.commit",
  "meta.timestamp",
  "meta.owner",
  "meta.track",
  "meta.scenario",
  "meta.notes",
  "meta.capture_context.tool",
  "meta.capture_context.browser_name",
  "meta.capture_context.browser_version",
  "meta.capture_context.captured_at",
  "meta.capture_context.captured_by",
  "environment.browser.name",
  "environment.browser.version",
  "environment.os.name",
  "environment.os.version",
  "environment.device.name",
  "environment.device.class",
  "environment.device.cpu",
  "environment.device.memory_gb",
  "environment.device.power_mode",
  "environment.gpu.adapter",
  "environment.gpu.required_features",
  "environment.gpu.limits",
  "environment.backend",
  "environment.fallback_triggered",
  "environment.worker_mode",
  "environment.cache_state",
  "workload.kind",
  "workload.name",
  "workload.input_profile",
  "workload.model_id",
  "metrics.common.time_to_interactive_ms",
  "metrics.common.init_ms",
  "metrics.common.success_rate",
  "metrics.common.peak_memory_note",
  "status",
  "artifacts.screenshots",
  "artifacts.raw_logs",
  "artifacts.deploy_url"
];

const REPO_METRIC_REQUIREMENTS = {
  "bench-runtime-shootout": [
    "metrics.llm.ttft_ms",
    "metrics.llm.prefill_tok_per_sec",
    "metrics.llm.decode_tok_per_sec",
    "metrics.llm.turn_latency_ms"
  ],
  "exp-embeddings-browser-throughput": [
    "metrics.embeddings.docs_per_sec",
    "metrics.embeddings.queries_per_sec",
    "metrics.embeddings.p50_ms",
    "metrics.embeddings.p95_ms",
    "metrics.embeddings.recall_at_10",
    "metrics.embeddings.index_build_ms"
  ]
};

function usage() {
  console.log(`Usage: node scripts/validate-result-schema.mjs [options]

Validates raw benchmark result JSON files.

Options:
  --root <dir>       Recursively validate *.json files. Default: tests/fixtures/results
  --file <file>      Validate one JSON file. Can be repeated.
  --quiet            Print only failures
  -h, --help         Show help`);
}

function parseArgs(argv) {
  const options = {
    root: path.join(REPO_ROOT, "tests/fixtures/results"),
    files: [],
    quiet: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--root") {
      options.root = path.resolve(argv[index + 1]);
      index += 1;
    } else if (token === "--file") {
      options.files.push(path.resolve(argv[index + 1]));
      index += 1;
    } else if (token === "--quiet") {
      options.quiet = true;
    } else if (token === "--help" || token === "-h") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  return options;
}

function getPath(value, dottedPath) {
  return dottedPath.split(".").reduce((current, key) => current?.[key], value);
}

function isPresent(value) {
  if (Array.isArray(value)) return true;
  if (typeof value === "string") return value.length > 0;
  return value !== undefined && value !== null;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
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

function validateResult(result, file) {
  const errors = [];
  for (const requiredPath of REQUIRED_PATHS) {
    if (!isPresent(getPath(result, requiredPath))) {
      errors.push(`${requiredPath} is required`);
    }
  }

  const repoMetricPaths = REPO_METRIC_REQUIREMENTS[result.meta?.repo] || [];
  for (const requiredPath of repoMetricPaths) {
    if (!isFiniteNumber(getPath(result, requiredPath))) {
      errors.push(`${requiredPath} must be a finite number`);
    }
  }

  if (!STATUS_VALUES.has(result.status)) {
    errors.push(`status must be one of ${[...STATUS_VALUES].join(", ")}`);
  }
  if (typeof result.environment?.fallback_triggered !== "boolean") {
    errors.push("environment.fallback_triggered must be a boolean");
  }
  if (!Array.isArray(result.environment?.gpu?.required_features)) {
    errors.push("environment.gpu.required_features must be an array");
  }
  if (typeof result.environment?.gpu?.limits !== "object" || Array.isArray(result.environment?.gpu?.limits)) {
    errors.push("environment.gpu.limits must be an object");
  }
  if (!WORKER_MODE_VALUES.has(result.environment?.worker_mode)) {
    errors.push(`environment.worker_mode must be one of ${[...WORKER_MODE_VALUES].join(", ")}`);
  }
  if (!Array.isArray(result.artifacts?.screenshots)) {
    errors.push("artifacts.screenshots must be an array");
  }
  if (!Array.isArray(result.artifacts?.raw_logs)) {
    errors.push("artifacts.raw_logs must be an array");
  }
  const successRate = result.metrics?.common?.success_rate;
  if (!isFiniteNumber(successRate) || successRate < 0 || successRate > 1) {
    errors.push("metrics.common.success_rate must be between 0 and 1");
  }
  if (typeof result.metrics?.common?.error_type !== "string") {
    errors.push("metrics.common.error_type must be a string");
  }
  for (const numericPath of [
    "environment.device.memory_gb",
    "metrics.common.time_to_interactive_ms",
    "metrics.common.init_ms"
  ]) {
    if (!isFiniteNumber(getPath(result, numericPath))) {
      errors.push(`${numericPath} must be a finite number`);
    }
  }

  return errors.map((message) => `${file}: ${message}`);
}

async function readResult(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const files = options.files.length ? options.files : await listJsonFiles(options.root);
  if (!files.length) {
    throw new Error("No JSON result files found");
  }

  const errors = [];
  for (const file of files) {
    errors.push(...validateResult(await readResult(file), path.relative(REPO_ROOT, file)));
  }

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(error);
    }
    process.exit(1);
  }

  if (!options.quiet) {
    console.log(`validated ${files.length} result file(s)`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
