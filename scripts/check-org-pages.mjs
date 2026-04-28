#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readCsv } from "./lib/csv.mjs";
import { finalizeGeneratedMarkdown, GENERATED_AT_PLACEHOLDER } from "./lib/generated-markdown.mjs";

const execFileAsync = promisify(execFile);

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

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

const REAL_MODE_SMOKE_TARGETS = [
  {
    repo: "bench-runtime-shootout",
    label: "Runtime adapter",
    query: "?mode=real-runtime",
    family: "runtime"
  },
  {
    repo: "exp-three-webgpu-core",
    label: "Renderer adapter",
    query: "?mode=real-three",
    family: "renderer"
  },
  {
    repo: "bench-renderer-shootout",
    label: "Benchmark adapter",
    query: "?mode=real-benchmark",
    family: "benchmark"
  },
  {
    repo: "app-blackhole-observatory",
    label: "App surface adapter",
    query: "?mode=real-surface",
    family: "app-surface"
  }
];

function parseArgs(argv) {
  const options = {
    org: "ai-webgpu-lab",
    inventory: path.join(REPO_ROOT, "docs/repo-inventory.csv"),
    output: path.join(REPO_ROOT, "docs/PAGES-STATUS.md"),
    stdout: false,
    failOnError: false,
    timeoutMs: 10000,
    concurrency: 6,
    realModeSmoke: true,
    fixture: ""
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--org") {
      options.org = argv[index + 1];
      index += 1;
    } else if (token === "--inventory") {
      options.inventory = path.resolve(argv[index + 1]);
      index += 1;
    } else if (token === "--output") {
      options.output = path.resolve(argv[index + 1]);
      index += 1;
    } else if (token === "--stdout") {
      options.stdout = true;
    } else if (token === "--fixture") {
      options.fixture = path.resolve(argv[index + 1]);
      index += 1;
    } else if (token === "--fail-on-error") {
      options.failOnError = true;
    } else if (token === "--timeout-ms") {
      options.timeoutMs = Number(argv[index + 1]);
      index += 1;
    } else if (token === "--concurrency") {
      options.concurrency = Number(argv[index + 1]);
      index += 1;
    } else if (token === "--no-real-mode-smoke") {
      options.realModeSmoke = false;
    } else if (token === "--help" || token === "-h") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive number");
  }
  if (!Number.isFinite(options.concurrency) || options.concurrency <= 0) {
    throw new Error("--concurrency must be a positive number");
  }
  return options;
}

function usage() {
  console.log(`Usage: node scripts/check-org-pages.mjs [options]

Checks GitHub Pages demo status for every repo in docs/repo-inventory.csv and
renders docs/PAGES-STATUS.md.

Options:
  --org <name>              GitHub org. Default: ai-webgpu-lab
  --inventory <file>        Inventory CSV. Default: docs/repo-inventory.csv
  --output <file>           Markdown output. Default: docs/PAGES-STATUS.md
  --stdout                  Print markdown instead of writing it
  --fixture <json>          Use offline fixture data instead of gh/fetch
  --fail-on-error           Exit non-zero when any repo or real-mode smoke fails
  --timeout-ms <number>     HTTP timeout. Default: 10000
  --concurrency <number>    Live repo check parallelism. Default: 6
  --no-real-mode-smoke      Skip representative real-mode URL checks
  -h, --help                Show help`);
}

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

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await mapper(items[current], current);
    }
  });
  await Promise.all(workers);
  return results;
}

async function ghJson(args) {
  const { stdout } = await execFileAsync("gh", args, {
    cwd: REPO_ROOT,
    maxBuffer: 16 * 1024 * 1024
  });
  return JSON.parse(stdout || "null");
}

async function optionalGhJson(args) {
  try {
    return await ghJson(args);
  } catch {
    return null;
  }
}

async function fetchStatus(url, timeoutMs) {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs)
    });
    return response.status;
  } catch {
    return 0;
  }
}

function decodeBase64Content(content) {
  if (!content) return "";
  return Buffer.from(String(content).replace(/\s+/g, ""), "base64").toString("utf8");
}

function pagesUrlForRepo(org, repo) {
  return `https://${org}.github.io/${repo}/`;
}

function indexKindFromHtml(indexHtml) {
  if (!indexHtml) return "no-public-index";
  if (indexHtml.includes("AI WebGPU Lab Baseline Probe")) return "generic-baseline-probe";
  const match = indexHtml.match(/<title>([^<]+)<\/title>/iu);
  return match ? `specific:${match[1].trim()}` : "specific:untitled";
}

function hasFile(publicFiles, fileName) {
  return publicFiles.includes(fileName);
}

function summarizeAssets(families, publicFiles) {
  const missing = [];
  for (const family of families) {
    const sketch = FAMILY_DEST_FILE[family];
    const adapter = ADAPTER_DEST_FILE[family];
    if (sketch && !hasFile(publicFiles, sketch)) missing.push(sketch);
    if (adapter && !hasFile(publicFiles, adapter)) missing.push(adapter);
  }
  return {
    expected: families.flatMap((family) => [FAMILY_DEST_FILE[family], ADAPTER_DEST_FILE[family]].filter(Boolean)),
    missing,
    sketchCount: publicFiles.filter((file) => /^real-.*-sketch\.js$/u.test(file)).length,
    adapterCount: publicFiles.filter((file) => /adapter\.js$/u.test(file)).length
  };
}

function buildRecord(row, options, raw) {
  const families = familiesForRepo(row.repo, row.category);
  const publicFiles = raw.publicFiles || [];
  const assets = summarizeAssets(families, publicFiles);
  const pageOk = raw.pagesApi === "ok" && raw.buildType === "workflow";
  const workflowOk = raw.workflowFile === true;
  const deployOk = raw.latestStatus === "completed" && raw.latestConclusion === "success";
  const httpOk = Number(raw.httpCode) === 200;
  const publicOk = hasFile(publicFiles, "index.html") && hasFile(publicFiles, "app.js") && hasFile(publicFiles, ".nojekyll");
  const demoOk = !["generic-baseline-probe", "no-public-index"].includes(raw.indexKind);
  const realAssetsOk = assets.missing.length === 0;
  const healthy = pageOk && workflowOk && deployOk && httpOk && publicOk && demoOk && realAssetsOk;

  const gaps = [];
  if (!pageOk) gaps.push("pages");
  if (!workflowOk) gaps.push("workflow-file");
  if (!deployOk) gaps.push("latest-deploy");
  if (!httpOk) gaps.push(`http-${raw.httpCode || 0}`);
  if (!publicOk) gaps.push("public-files");
  if (!demoOk) gaps.push(raw.indexKind);
  if (!realAssetsOk) gaps.push(`missing:${assets.missing.join("+")}`);

  return {
    ...row,
    families,
    pagesUrl: raw.pagesUrl || pagesUrlForRepo(options.org, row.repo),
    pagesApi: raw.pagesApi,
    buildType: raw.buildType || "",
    sourceBranch: raw.sourceBranch || "",
    sourcePath: raw.sourcePath || "",
    workflowFile: raw.workflowFile === true,
    latestStatus: raw.latestStatus || "",
    latestConclusion: raw.latestConclusion || "",
    latestUpdated: raw.latestUpdated || "",
    httpCode: Number(raw.httpCode) || 0,
    publicFiles,
    indexKind: raw.indexKind,
    assets,
    healthy,
    gaps
  };
}

async function collectFixtureRecord(row, options, fixture) {
  const entry = fixture.repos?.[row.repo] || {};
  const pages = entry.pages || {};
  const run = entry.latestRun || {};
  const publicFiles = entry.publicFiles || [];
  const raw = {
    pagesApi: entry.pagesApi || (entry.pages ? "ok" : "missing"),
    pagesUrl: pages.html_url || entry.pagesUrl || pagesUrlForRepo(options.org, row.repo),
    buildType: pages.build_type || entry.buildType || "",
    sourceBranch: pages.source?.branch || entry.sourceBranch || "",
    sourcePath: pages.source?.path || entry.sourcePath || "",
    workflowFile: Boolean(entry.workflowFile),
    latestStatus: run.status || entry.latestStatus || "",
    latestConclusion: run.conclusion || entry.latestConclusion || "",
    latestUpdated: run.updatedAt || entry.latestUpdated || "",
    httpCode: Number(entry.httpCode) || 0,
    publicFiles,
    indexKind: indexKindFromHtml(entry.indexHtml || "")
  };
  return buildRecord(row, options, raw);
}

async function collectLiveRecord(row, options) {
  const fullRepo = `${options.org}/${row.repo}`;
  const [
    pages,
    workflowFile,
    runs,
    publicEntries,
    indexEntry
  ] = await Promise.all([
    optionalGhJson(["api", `/repos/${fullRepo}/pages`]),
    optionalGhJson(["api", `/repos/${fullRepo}/contents/.github/workflows/deploy-pages.yml`]),
    optionalGhJson(["run", "list", "-R", fullRepo, "-w", "deploy-pages.yml", "--limit", "1", "--json", "status,conclusion,updatedAt"]),
    optionalGhJson(["api", `/repos/${fullRepo}/contents/public`]),
    optionalGhJson(["api", `/repos/${fullRepo}/contents/public/index.html`])
  ]);

  const pagesUrl = pages?.html_url || pagesUrlForRepo(options.org, row.repo);
  const publicFiles = Array.isArray(publicEntries)
    ? publicEntries.map((entry) => entry.name).filter(Boolean)
    : [];
  const indexHtml = decodeBase64Content(indexEntry?.content || "");
  const latest = Array.isArray(runs) && runs.length ? runs[0] : {};
  const raw = {
    pagesApi: pages ? "ok" : "missing",
    pagesUrl,
    buildType: pages?.build_type || "",
    sourceBranch: pages?.source?.branch || "",
    sourcePath: pages?.source?.path || "",
    workflowFile: Boolean(workflowFile),
    latestStatus: latest.status || "",
    latestConclusion: latest.conclusion || "",
    latestUpdated: latest.updatedAt || "",
    httpCode: await fetchStatus(pagesUrl, options.timeoutMs),
    publicFiles,
    indexKind: indexKindFromHtml(indexHtml)
  };
  return buildRecord(row, options, raw);
}

async function collectRecords(inventory, options, fixture) {
  if (fixture) {
    return Promise.all(inventory.map((row) => collectFixtureRecord(row, options, fixture)));
  }
  return mapLimit(inventory, options.concurrency, (row) => collectLiveRecord(row, options));
}

function realModeUrl(record, query) {
  const url = new URL(record.pagesUrl);
  url.search = query;
  return url.toString();
}

async function collectFixtureRealMode(recordByRepo, target, fixture) {
  const record = recordByRepo.get(target.repo);
  const entry = fixture.realModes?.[`${target.repo}${target.query}`] || {};
  return buildRealModeResult(record, target, Number(entry.httpCode) || 0);
}

async function collectLiveRealMode(recordByRepo, target, options) {
  const record = recordByRepo.get(target.repo);
  if (!record) return buildRealModeResult(record, target, 0);
  return buildRealModeResult(record, target, await fetchStatus(realModeUrl(record, target.query), options.timeoutMs));
}

function buildRealModeResult(record, target, httpCode) {
  const requiredFiles = [FAMILY_DEST_FILE[target.family], ADAPTER_DEST_FILE[target.family]].filter(Boolean);
  const missingFiles = record
    ? requiredFiles.filter((file) => !hasFile(record.publicFiles, file))
    : requiredFiles;
  return {
    ...target,
    url: record ? realModeUrl(record, target.query) : "",
    httpCode,
    missingFiles,
    passed: Number(httpCode) === 200 && missingFiles.length === 0
  };
}

async function collectRealModeResults(records, options, fixture) {
  if (!options.realModeSmoke) return [];
  const recordByRepo = new Map(records.map((record) => [record.repo, record]));
  if (fixture) {
    return Promise.all(REAL_MODE_SMOKE_TARGETS.map((target) => collectFixtureRealMode(recordByRepo, target, fixture)));
  }
  return mapLimit(REAL_MODE_SMOKE_TARGETS, Math.min(options.concurrency, REAL_MODE_SMOKE_TARGETS.length), (target) =>
    collectLiveRealMode(recordByRepo, target, options)
  );
}

function statusIcon(ok) {
  return ok ? "✅" : "⚠";
}

function escapeCell(value) {
  return String(value ?? "")
    .replace(/\|/gu, "\\|")
    .replace(/\n/gu, " ");
}

function summarize(records, realModes) {
  const healthy = records.filter((record) => record.healthy).length;
  const httpOk = records.filter((record) => record.httpCode === 200).length;
  const deployOk = records.filter((record) => record.latestStatus === "completed" && record.latestConclusion === "success").length;
  const specific = records.filter((record) => record.indexKind.startsWith("specific:")).length;
  const generic = records.filter((record) => record.indexKind === "generic-baseline-probe").length;
  const realAssetRepos = records.filter((record) => record.families.length > 0);
  const realAssetOk = realAssetRepos.filter((record) => record.assets.missing.length === 0).length;
  const realModeOk = realModes.filter((result) => result.passed).length;
  return {
    total: records.length,
    healthy,
    unhealthy: records.length - healthy,
    httpOk,
    deployOk,
    specific,
    generic,
    realAssetTotal: realAssetRepos.length,
    realAssetOk,
    realModeTotal: realModes.length,
    realModeOk
  };
}

function renderReport(records, realModes) {
  const summary = summarize(records, realModes);
  const lines = [
    "# GitHub Pages Demo Status",
    "",
    `_Generated by \`scripts/check-org-pages.mjs\` on ${GENERATED_AT_PLACEHOLDER}._`,
    "",
    "## Summary",
    `- Inventory repos: ${summary.total}`,
    `- Healthy Pages: ${summary.healthy} / ${summary.total}`,
    `- HTTP 200: ${summary.httpOk} / ${summary.total}`,
    `- Latest deploy success: ${summary.deployOk} / ${summary.total}`,
    `- Specific demo pages: ${summary.specific} / ${summary.total}`,
    `- Generic baseline pages: ${summary.generic} / ${summary.total}`,
    `- Real sketch/adapter coverage: ${summary.realAssetOk} / ${summary.realAssetTotal}`,
    `- Representative real-mode smoke: ${summary.realModeOk} / ${summary.realModeTotal}`,
    "",
    "## Repo Status",
    "| Repo | Category | Priority | Pages | Deploy | HTTP | Demo | Real assets | URL |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |"
  ];

  for (const record of records) {
    const pagesCell = `${statusIcon(record.pagesApi === "ok" && record.buildType === "workflow")} ${record.buildType || record.pagesApi}`;
    const deployCell = `${statusIcon(record.latestStatus === "completed" && record.latestConclusion === "success")} ${record.latestConclusion || record.latestStatus || "missing"}`;
    const httpCell = `${statusIcon(record.httpCode === 200)} ${record.httpCode}`;
    const demoCell = `${statusIcon(record.indexKind.startsWith("specific:"))} ${record.indexKind.replace(/^specific:/u, "")}`;
    const realAssetsCell = record.families.length === 0
      ? "—"
      : record.assets.missing.length === 0
        ? `✅ sketches=${record.assets.sketchCount}, adapters=${record.assets.adapterCount}`
        : `⚠ missing ${record.assets.missing.join(", ")}`;
    lines.push(`| ${escapeCell(record.repo)} | ${escapeCell(record.category)} | ${escapeCell(record.priority_group)} | ${escapeCell(pagesCell)} | ${escapeCell(deployCell)} | ${escapeCell(httpCell)} | ${escapeCell(demoCell)} | ${escapeCell(realAssetsCell)} | ${record.pagesUrl} |`);
  }

  lines.push(
    "",
    "## Real Mode Smoke",
    "Representative smoke checks verify that the query URL returns HTTP 200 and the matching real sketch/adapter files are present in the remote `public/` tree.",
    "",
    "| Repo | Mode | HTTP | Asset gate | URL |",
    "| --- | --- | --- | --- | --- |"
  );
  for (const result of realModes) {
    const httpCell = `${statusIcon(result.httpCode === 200)} ${result.httpCode}`;
    const assetCell = result.missingFiles.length === 0 ? "✅ present" : `⚠ missing ${result.missingFiles.join(", ")}`;
    lines.push(`| ${escapeCell(result.repo)} | ${escapeCell(`${result.label} ${result.query}`)} | ${escapeCell(httpCell)} | ${escapeCell(assetCell)} | ${result.url} |`);
  }

  const gaps = records.filter((record) => !record.healthy);
  lines.push("", "## Gaps");
  if (gaps.length === 0 && realModes.every((result) => result.passed)) {
    lines.push("No blocking gaps detected.");
  } else {
    for (const record of gaps) {
      lines.push(`- \`${record.repo}\`: ${record.gaps.join(", ")}`);
    }
    for (const result of realModes.filter((entry) => !entry.passed)) {
      const detail = result.missingFiles.length ? `missing ${result.missingFiles.join(", ")}` : `HTTP ${result.httpCode}`;
      lines.push(`- \`${result.repo}${result.query}\`: ${detail}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

async function writeReport(options, text) {
  const finalized = await finalizeGeneratedMarkdown({
    output: options.stdout ? "" : options.output,
    text,
    stdout: options.stdout
  });
  if (options.stdout) {
    process.stdout.write(finalized);
    return;
  }
  await fs.mkdir(path.dirname(options.output), { recursive: true });
  await fs.writeFile(options.output, finalized, "utf8");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const inventory = await readCsv(options.inventory);
  const fixture = options.fixture ? JSON.parse(await fs.readFile(options.fixture, "utf8")) : null;
  const records = await collectRecords(inventory, options, fixture);
  const realModes = await collectRealModeResults(records, options, fixture);
  const report = renderReport(records, realModes);
  await writeReport(options, report);

  const summary = summarize(records, realModes);
  if (options.failOnError && (summary.unhealthy > 0 || summary.realModeOk !== summary.realModeTotal)) {
    console.error(`pages status check failed: unhealthy=${summary.unhealthy}, real_mode_failed=${summary.realModeTotal - summary.realModeOk}`);
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
}
