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

async function* walk(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
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

function extractRepoName(filePath) {
  const match = filePath.match(/repo-scaffolds\/(?:repos|p0)\/([^/]+)\/public\/real-/);
  return match ? match[1] : path.basename(path.dirname(path.dirname(filePath)));
}

function extractMatch(text, pattern) {
  const match = text.match(pattern);
  return match ? match[1] : null;
}

function extractAllMatches(text, pattern) {
  const matches = [];
  let match;
  const regex = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
  while ((match = regex.exec(text)) !== null) {
    matches.push(match[1]);
  }
  return matches;
}

function summarizeSketch(filePath, source) {
  const filename = path.basename(filePath);
  const repo = extractRepoName(filePath);
  const family = FAMILY_BY_FILENAME[filename] || "unknown";

  const buildFunction = extractMatch(source, /export function (build[A-Z]\w*)/);
  const connectFunction = extractMatch(source, /export (?:async function|function) (connect[A-Z]\w*)/);
  const loadFunction = extractMatch(source, /export (?:async function|function) (load[A-Z]\w*)/);

  const idPrefix = extractMatch(source, /const id = `([^${"`"}]+)/);
  const labelTemplate = extractMatch(source, /label:\s*`([^${"`"}]*)`/);

  const backendHint = extractMatch(source, /backendHint:\s*"([^"]+)"/);
  const benchmarkType = extractMatch(source, /benchmarkType:\s*"([^"]+)"/);
  const surfaceType = extractMatch(source, /surfaceType:\s*"([^"]+)"/);

  const capabilitiesRaw = extractMatch(source, /capabilities:\s*\[([^\]]*)\]/);
  const capabilities = capabilitiesRaw
    ? capabilitiesRaw.split(",").map((entry) => entry.trim().replace(/^["']|["']$/g, "")).filter(Boolean)
    : [];

  const versionConstants = {};
  const versionMatches = extractAllMatches(source, /const (DEFAULT_[A-Z_]+_VERSION) = "([^"]+)"/);
  // Re-scan with name+value extraction since extractAllMatches only captures one group
  const versionRegex = /const (DEFAULT_[A-Z_]+_VERSION) = "([^"]+)"/g;
  let versionMatch;
  while ((versionMatch = versionRegex.exec(source)) !== null) {
    versionConstants[versionMatch[1]] = versionMatch[2];
  }

  const cdnTargets = [];
  const cdnRegex = /https:\/\/esm\.sh\/([^${"`"}\s)]+)/g;
  let cdnMatch;
  while ((cdnMatch = cdnRegex.exec(source)) !== null) {
    cdnTargets.push(cdnMatch[1].replace(/@\$\{version\}/g, "@<version>"));
  }
  const uniqueCdns = Array.from(new Set(cdnTargets));

  const queryGate = extractMatch(source, /params\.get\("mode"\) === "([^"]+)"/);
  const isReal = /isReal:\s*true/.test(source);

  return {
    repo,
    family,
    filePath: path.relative(REPO_ROOT, filePath),
    buildFunction,
    connectFunction,
    loadFunction,
    idPrefix,
    labelTemplate,
    backendHint,
    benchmarkType,
    surfaceType,
    capabilities,
    versionConstants,
    cdnTargets: uniqueCdns,
    queryGate,
    isReal
  };
}

function renderTableRow(record) {
  const repoCell = `\`${record.repo}\``;
  const familyCell = record.family;
  const idCell = record.idPrefix ? `\`${record.idPrefix}…\`` : "—";
  const backendCell = record.backendHint || record.benchmarkType || record.surfaceType || "—";
  const capabilitiesCell = record.capabilities.length ? record.capabilities.slice(0, 3).join(", ") + (record.capabilities.length > 3 ? ", …" : "") : "—";
  const cdnCell = record.cdnTargets.length ? record.cdnTargets.slice(0, 2).join(" + ") + (record.cdnTargets.length > 2 ? ", …" : "") : "raw browser API";
  const queryCell = record.queryGate ? `\`?mode=${record.queryGate}\`` : "—";
  return `| ${repoCell} | ${familyCell} | ${idCell} | ${backendCell} | ${capabilitiesCell} | ${cdnCell} | ${queryCell} |`;
}

async function main() {
  const args = process.argv.slice(2);
  const options = { output: path.join(REPO_ROOT, "docs/SKETCH-METRICS.md"), stdout: false };
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === "--output") {
      options.output = args[index + 1];
      index += 1;
    } else if (token === "--stdout") {
      options.stdout = true;
    } else if (token === "--help" || token === "-h") {
      console.log("Usage: node scripts/render-sketch-metrics.mjs [--output <md>] [--stdout]");
      process.exit(0);
    }
  }

  const sketches = [];
  for await (const filePath of walk(path.join(REPO_ROOT, "repo-scaffolds"))) {
    const source = await fs.readFile(filePath, "utf8");
    sketches.push(summarizeSketch(filePath, source));
  }

  // Skip the canonical templates under shared/real-sketches/ when reporting
  // so the dashboard reflects only repo-attached sketches.
  const repoSketches = sketches.filter((sketch) => !sketch.filePath.includes("shared/real-sketches/"));

  const familyCounts = { renderer: 0, runtime: 0, "app-surface": 0, benchmark: 0, unknown: 0 };
  const cdnCounts = new Map();
  const backendCounts = new Map();
  for (const sketch of repoSketches) {
    if (familyCounts[sketch.family] !== undefined) familyCounts[sketch.family] += 1;
    else familyCounts.unknown += 1;
    for (const cdn of sketch.cdnTargets) {
      cdnCounts.set(cdn, (cdnCounts.get(cdn) || 0) + 1);
    }
    const backend = sketch.backendHint || sketch.benchmarkType || sketch.surfaceType || "(unspecified)";
    backendCounts.set(backend, (backendCounts.get(backend) || 0) + 1);
  }

  const lines = [
    "# Sketch Metrics",
    "",
    `_Generated by \`scripts/render-sketch-metrics.mjs\` on ${new Date().toISOString()}._`,
    "",
    "## Counts",
    "",
    `- Total real-*-sketch.js files (repo-attached): ${repoSketches.length}`,
    `- Renderer: ${familyCounts.renderer}`,
    `- Runtime: ${familyCounts.runtime}`,
    `- App-surface: ${familyCounts["app-surface"]}`,
    `- Benchmark: ${familyCounts.benchmark}`,
    `- Unknown family: ${familyCounts.unknown}`,
    `- Distinct CDN targets: ${cdnCounts.size}`,
    `- Distinct backend hints / benchmark types / surface types: ${backendCounts.size}`,
    "",
    "## CDN distribution",
    ""
  ];
  for (const [cdn, count] of [...cdnCounts.entries()].sort((left, right) => right[1] - left[1])) {
    lines.push(`- \`${cdn}\` × ${count}`);
  }
  lines.push("", "## Backend / type distribution", "");
  for (const [backend, count] of [...backendCounts.entries()].sort((left, right) => right[1] - left[1])) {
    lines.push(`- ${backend} × ${count}`);
  }
  lines.push("", "## Per-sketch table", "");
  lines.push("| Repo | Family | Adapter id prefix | Backend / type | Capabilities (top 3) | CDN | Query gate |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const sketch of repoSketches.sort((left, right) => left.family.localeCompare(right.family) || left.repo.localeCompare(right.repo))) {
    lines.push(renderTableRow(sketch));
  }
  lines.push("");

  const text = lines.join("\n");

  if (options.stdout) {
    process.stdout.write(`${text}\n`);
  } else {
    await fs.mkdir(path.dirname(options.output), { recursive: true });
    await fs.writeFile(options.output, `${text}\n`, "utf8");
    console.log(`sketch metrics written to ${options.output}`);
    console.log(`- repo-attached sketches: ${repoSketches.length}`);
    console.log(`- families: renderer=${familyCounts.renderer}, runtime=${familyCounts.runtime}, app-surface=${familyCounts["app-surface"]}, benchmark=${familyCounts.benchmark}`);
    console.log(`- distinct cdns: ${cdnCounts.size}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
