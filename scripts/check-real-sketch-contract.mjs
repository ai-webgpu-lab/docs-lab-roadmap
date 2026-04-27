#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

const FAMILY_BY_FILENAME = {
  "real-renderer-sketch.js": "renderer",
  "real-runtime-sketch.js": "runtime",
  "real-surface-sketch.js": "app-surface",
  "real-benchmark-sketch.js": "benchmark"
};

const FAMILY_REGISTRY = {
  renderer: "__aiWebGpuLabRendererRegistry",
  runtime: "__aiWebGpuLabRuntimeRegistry",
  "app-surface": "__aiWebGpuLabAppSurfaceRegistry",
  benchmark: "__aiWebGpuLabBenchmarkRegistry"
};

const FAMILY_METHODS = {
  renderer: ["createRenderer", "loadScene", "renderFrame"],
  runtime: ["loadRuntime", "prefill", "decode"],
  "app-surface": ["loadDataset", "renderSurface", "recordTelemetry"],
  benchmark: ["createBenchmark", "runProfile", "aggregateResults"]
};

// Counts reflect committed sketches across all family memberships:
// - renderer: 12 graphics/blackhole exp-* + 5 bench-* dual-family (renderer companion)
// - runtime: 12 ml/llm/audio/multimodal/agent exp-* + 13 bench-* dual-family
// - app-surface: 5 app-* repos
// - benchmark: 18 bench-* repos (primary)
const EXPECTED_FAMILY_COUNTS = {
  renderer: 17,
  runtime: 25,
  "app-surface": 5,
  benchmark: 18
};

async function* walk(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile() && /^real-[a-z0-9-]+-sketch\.js$/.test(entry.name)) {
      yield full;
    }
  }
}

function verifyContract(filePath, source) {
  const filename = path.basename(filePath);
  const family = FAMILY_BY_FILENAME[filename];
  const errors = [];
  const rel = path.relative(REPO_ROOT, filePath);

  if (!family) {
    errors.push(`unknown family for filename ${filename}`);
    return { rel, family: "unknown", errors };
  }

  const registry = FAMILY_REGISTRY[family];
  if (!source.includes(registry)) {
    errors.push(`missing registry reference ${registry}`);
  }

  for (const method of FAMILY_METHODS[family]) {
    // Match either object literal key (e.g. `runProfile:` or `runProfile (...)`)
    // or property method shorthand (e.g. `async runProfile(`).
    const pattern = new RegExp(`(?:\\b${method}\\s*[:(])|(?:\\b${method}\\s*\\()`);
    if (!pattern.test(source)) {
      errors.push(`missing canonical method ${method}`);
    }
  }

  if (!/params\.get\("mode"\)\s*===\s*"real-/.test(source)) {
    errors.push("missing ?mode=real-* query gate");
  }

  if (!/export (?:async function|function) connect[A-Z]\w*/.test(source)) {
    errors.push("missing exported connect* function");
  }
  if (!/export function build[A-Z]\w*/.test(source)) {
    errors.push("missing exported build* function");
  }
  if (!/export (?:async function|function) load[A-Z]\w*/.test(source)) {
    errors.push("missing exported load* function");
  }

  return { rel, family, errors };
}

async function main() {
  const sketches = [];
  for await (const file of walk(path.join(REPO_ROOT, "repo-scaffolds"))) {
    if (file.includes("/shared/real-sketches/")) continue;
    sketches.push(file);
  }
  sketches.sort();

  const results = [];
  const familyCounts = { renderer: 0, runtime: 0, "app-surface": 0, benchmark: 0, unknown: 0 };
  for (const file of sketches) {
    const source = await fs.readFile(file, "utf8");
    const result = verifyContract(file, source);
    results.push(result);
    familyCounts[result.family] = (familyCounts[result.family] || 0) + 1;
  }

  const failures = results.filter((r) => r.errors.length > 0);
  for (const f of failures) {
    console.error(`FAIL ${f.rel} [family=${f.family}]`);
    for (const err of f.errors) console.error(`  - ${err}`);
  }

  const countMismatches = [];
  for (const [family, expected] of Object.entries(EXPECTED_FAMILY_COUNTS)) {
    if (familyCounts[family] !== expected) {
      countMismatches.push(`${family}: expected ${expected}, got ${familyCounts[family]}`);
    }
  }
  if (familyCounts.unknown !== 0) {
    countMismatches.push(`unknown family count > 0: ${familyCounts.unknown}`);
  }
  for (const m of countMismatches) console.error(`FAIL family count: ${m}`);

  const totalExpected = Object.values(EXPECTED_FAMILY_COUNTS).reduce((a, b) => a + b, 0);
  console.log(`scanned ${results.length} sketches (expected ${totalExpected})`);
  console.log(`families: renderer=${familyCounts.renderer}, runtime=${familyCounts.runtime}, app-surface=${familyCounts["app-surface"]}, benchmark=${familyCounts.benchmark}, unknown=${familyCounts.unknown}`);
  console.log(`per-sketch contract failures: ${failures.length}`);
  console.log(`family count mismatches: ${countMismatches.length}`);

  if (failures.length === 0 && countMismatches.length === 0 && results.length === totalExpected) {
    console.log("OK real-sketch contract");
    process.exit(0);
  }
  process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
