#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

async function lastTouchedForFile(absPath) {
  const rel = path.relative(REPO_ROOT, absPath);
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["log", "-1", "--format=%h %ad", "--date=short", "--", rel],
      { cwd: REPO_ROOT, maxBuffer: 1024 * 1024 }
    );
    const trimmed = stdout.trim();
    if (!trimmed) return null;
    const [hash, date] = trimmed.split(/\s+/);
    return { hash, date };
  } catch {
    return null;
  }
}

function pickLatest(entries) {
  const valid = entries.filter(Boolean);
  if (valid.length === 0) return null;
  valid.sort((a, b) => b.date.localeCompare(a.date));
  return valid[0];
}

const FAMILY_DEST_FILE = {
  renderer: "real-renderer-sketch.js",
  runtime: "real-runtime-sketch.js",
  "app-surface": "real-surface-sketch.js",
  benchmark: "real-benchmark-sketch.js"
};

const ADAPTER_DEST_FILE = {
  renderer: "renderer-adapter.js",
  runtime: "runtime-adapter.js",
  "app-surface": "app-surface-adapter.js",
  benchmark: "benchmark-adapter.js"
};

const FAMILY_FIRST_MOVERS = {
  runtime: "bench-runtime-shootout",
  renderer: "exp-three-webgpu-core",
  "app-surface": "app-blackhole-observatory",
  benchmark: "bench-renderer-shootout"
};

function familiesForRepo(repo, category) {
  const skip = new Set([
    ".github",
    "tpl-webgpu-vanilla",
    "tpl-webgpu-react",
    "shared-webgpu-capability",
    "shared-bench-schema",
    "shared-github-actions",
    "docs-lab-roadmap"
  ]);
  if (skip.has(repo)) return [];
  switch (category) {
    case "graphics":
    case "blackhole":
      return ["renderer"];
    case "ml":
    case "llm":
    case "audio":
    case "multimodal":
    case "agent":
      return ["runtime"];
    case "app":
      return ["app-surface"];
    case "benchmark": {
      const rendererBench = new Set([
        "bench-blackhole-render-shootout",
        "bench-renderer-shootout",
        "bench-compute-stress-suite",
        "bench-atomics-and-memory",
        "bench-texture-upload-and-streaming"
      ]);
      return rendererBench.has(repo) ? ["benchmark", "renderer"] : ["benchmark", "runtime"];
    }
    default:
      return [];
  }
}

async function readInventory() {
  const csv = await fs.readFile(path.join(REPO_ROOT, "docs/repo-inventory.csv"), "utf8");
  const cleaned = csv.replace(/^﻿/, "");
  const lines = cleaned.split(/\r?\n/).filter((line) => line.length);
  const headers = lines.shift().split(",");
  return lines.map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(headers.map((header, index) => [header.trim(), (cells[index] || "").trim()]));
  });
}

async function fileExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch (error) {
    return false;
  }
}

async function detectScaffoldRoot(repo) {
  const candidates = [
    path.join(REPO_ROOT, "repo-scaffolds/p0", repo),
    path.join(REPO_ROOT, "repo-scaffolds/repos", repo)
  ];
  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate;
  }
  return null;
}

async function describeRepo(repo, category) {
  const families = familiesForRepo(repo, category);
  const scaffold = await detectScaffoldRoot(repo);
  const publicDir = scaffold ? path.join(scaffold, "public") : null;
  const adapterFiles = [];
  const sketchFiles = [];
  const fixtureFiles = [];

  const sketchTouches = [];
  if (publicDir && await fileExists(publicDir)) {
    const entries = await fs.readdir(publicDir);
    for (const entry of entries) {
      if (/-adapter\.js$/.test(entry)) adapterFiles.push(entry);
      else if (/^real-.*-sketch\.js$/.test(entry)) {
        sketchFiles.push(entry);
        sketchTouches.push(await lastTouchedForFile(path.join(publicDir, entry)));
      }
      else if (/-fixture\.json$/.test(entry) || /-fixture\.svg$/.test(entry) || /-profiles\.json$/.test(entry)) fixtureFiles.push(entry);
    }
  }

  const expected = families.map((family) => ({
    family,
    adapter: ADAPTER_DEST_FILE[family],
    sketch: FAMILY_DEST_FILE[family]
  }));

  const adapterMissing = expected.filter((entry) => !adapterFiles.includes(entry.adapter)).map((entry) => entry.family);
  const sketchMissing = expected.filter((entry) => !sketchFiles.includes(entry.sketch)).map((entry) => entry.family);
  const firstMover = families.filter((family) => FAMILY_FIRST_MOVERS[family] === repo);

  return {
    repo,
    category,
    families,
    scaffolded: Boolean(scaffold),
    adapterFiles,
    sketchFiles,
    fixtureFiles,
    adapterMissing,
    sketchMissing,
    firstMover,
    sketchLastTouched: pickLatest(sketchTouches)
  };
}

function renderTableRow(record) {
  const familyCell = record.families.length ? record.families.join(", ") : "—";
  const scaffoldCell = record.scaffolded ? "✅" : "—";
  const adapterCell = record.families.length
    ? (record.adapterMissing.length === 0 ? `✅ (${record.families.length})` : `⚠ missing ${record.adapterMissing.join(", ")}`)
    : "—";
  const sketchCell = record.families.length
    ? (record.sketchMissing.length === 0 ? `✅ (${record.sketchFiles.length})` : `⚠ missing ${record.sketchMissing.join(", ")}`)
    : "—";
  const fixtureCell = record.fixtureFiles.length ? `✅ (${record.fixtureFiles.length})` : "—";
  const lastTouchedCell = record.sketchLastTouched
    ? `\`${record.sketchLastTouched.hash}\`@${record.sketchLastTouched.date}`
    : "—";
  const firstMoverCell = record.firstMover.length ? `**${record.firstMover.join(", ")}**` : "";
  return `| ${record.repo} | ${record.category} | ${familyCell} | ${scaffoldCell} | ${adapterCell} | ${sketchCell} | ${fixtureCell} | ${lastTouchedCell} | ${firstMoverCell} |`;
}

async function main() {
  const args = process.argv.slice(2);
  const options = { output: path.join(REPO_ROOT, "docs/INTEGRATION-STATUS.md"), stdout: false };
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === "--output") {
      options.output = args[index + 1];
      index += 1;
    } else if (token === "--stdout") {
      options.stdout = true;
    } else if (token === "--help" || token === "-h") {
      console.log("Usage: node scripts/render-integration-status.mjs [--output <md>] [--stdout]");
      process.exit(0);
    }
  }

  const inventory = await readInventory();
  const records = [];
  for (const row of inventory) {
    records.push(await describeRepo(row.repo, row.category));
  }

  const familyCounts = { runtime: 0, renderer: 0, "app-surface": 0, benchmark: 0 };
  let totalSketches = 0;
  let totalAdapters = 0;
  let scaffoldGap = 0;
  let adapterGap = 0;
  let sketchGap = 0;
  for (const record of records) {
    for (const family of record.families) familyCounts[family] += 1;
    totalSketches += record.sketchFiles.length;
    totalAdapters += record.adapterFiles.length;
    if (record.families.length && !record.scaffolded) scaffoldGap += 1;
    adapterGap += record.adapterMissing.length;
    sketchGap += record.sketchMissing.length;
  }

  const lines = [
    "# Integration Status",
    "",
    `_Generated by \`scripts/render-integration-status.mjs\` on ${new Date().toISOString()}._`,
    "",
    "## Counts",
    "",
    `- Inventory: ${records.length}`,
    `- Repos with at least one adapter family: ${records.filter((record) => record.families.length).length}`,
    `- Repos without any adapter family: ${records.filter((record) => record.families.length === 0).length}`,
    `- Total adapter files: ${totalAdapters}`,
    `- Total real-*-sketch.js files: ${totalSketches}`,
    `- Per-family membership: runtime=${familyCounts.runtime}, renderer=${familyCounts.renderer}, app-surface=${familyCounts["app-surface"]}, benchmark=${familyCounts.benchmark}`,
    `- Scaffold gaps: ${scaffoldGap}`,
    `- Adapter gaps: ${adapterGap}`,
    `- Sketch gaps: ${sketchGap}`,
    "",
    "## Per-repo coverage",
    "",
    "| Repo | Category | Family | Scaffold | Adapter | Sketch | Fixtures | Last touched | First mover |",
    "|---|---|---|---|---|---|---|---|---|"
  ];
  for (const record of records) {
    lines.push(renderTableRow(record));
  }
  lines.push("");
  lines.push("## First movers");
  lines.push("");
  for (const [family, repo] of Object.entries(FAMILY_FIRST_MOVERS)) {
    lines.push(`- ${family} → \`${repo}\``);
  }
  lines.push("");

  const text = lines.join("\n");

  if (options.stdout) {
    process.stdout.write(`${text}\n`);
  } else {
    await fs.mkdir(path.dirname(options.output), { recursive: true });
    await fs.writeFile(options.output, `${text}\n`, "utf8");
    console.log(`integration status written to ${options.output}`);
    console.log(`- inventory: ${records.length}`);
    console.log(`- adapter gaps: ${adapterGap}`);
    console.log(`- sketch gaps: ${sketchGap}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
