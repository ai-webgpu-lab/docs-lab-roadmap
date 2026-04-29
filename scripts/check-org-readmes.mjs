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

function parseArgs(argv) {
  const options = {
    org: "ai-webgpu-lab",
    inventory: path.join(REPO_ROOT, "docs/repo-inventory.csv"),
    output: path.join(REPO_ROOT, "docs/README-STATUS.md"),
    stdout: false,
    failOnError: false,
    concurrency: 8,
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
    } else if (token === "--concurrency") {
      options.concurrency = Number(argv[index + 1]);
      index += 1;
    } else if (token === "--help" || token === "-h") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (!Number.isFinite(options.concurrency) || options.concurrency <= 0) {
    throw new Error("--concurrency must be a positive number");
  }
  return options;
}

function usage() {
  console.log(`Usage: node scripts/check-org-readmes.mjs [options]

Checks generated README drift across the ai-webgpu-lab organization and renders
docs/README-STATUS.md.

Options:
  --org <name>              GitHub org. Default: ai-webgpu-lab
  --inventory <file>        Inventory CSV. Default: docs/repo-inventory.csv
  --output <file>           Markdown output. Default: docs/README-STATUS.md
  --stdout                  Print markdown instead of writing it
  --fixture <json>          Use offline fixture data instead of gh
  --fail-on-error           Exit non-zero when any README gate fails
  --concurrency <number>    Live repo check parallelism. Default: 8
  -h, --help                Show help`);
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

function decodeBase64Content(content) {
  if (!content) return "";
  return Buffer.from(String(content).replace(/\s+/g, ""), "base64").toString("utf8");
}

function pagesUrlForRepo(org, repo) {
  return `https://${org}.github.io/${repo}/`;
}

function expectedReadmeChecks(row, options) {
  if (row.repo === ".github") {
    return [
      { id: "root-dashboard", pattern: "## 조직 상태 대시보드" },
      { id: "root-operations-badge", pattern: "actions/workflows/operations-check.yml/badge.svg?branch=main" },
      { id: "root-pages-status", pattern: "docs-lab-roadmap/docs/PAGES-STATUS.md" },
      { id: "root-workflow-status", pattern: "docs-lab-roadmap/docs/WORKFLOW-STATUS.md" },
      { id: "root-integration-status", pattern: "docs-lab-roadmap/docs/INTEGRATION-STATUS.md" },
      { id: "root-sketch-metrics", pattern: "docs-lab-roadmap/docs/SKETCH-METRICS.md" }
    ];
  }

  if (row.repo === "docs-lab-roadmap") {
    return [
      { id: "pages-status-doc", pattern: "docs/PAGES-STATUS.md" },
      { id: "readme-status-doc", pattern: "docs/README-STATUS.md" },
      { id: "workflow-status-doc", pattern: "docs/WORKFLOW-STATUS.md" },
      { id: "project-status-doc", pattern: "docs/PROJECT-STATUS.md" },
      { id: "pages-check-command", pattern: "scripts/check-org-pages.mjs" }
    ];
  }

  return [
    { id: "dashboard-section", pattern: "## 조직 상태 대시보드" },
    { id: "pages-status-link", pattern: "docs-lab-roadmap/docs/PAGES-STATUS.md" },
    { id: "integration-status-link", pattern: "docs-lab-roadmap/docs/INTEGRATION-STATUS.md" },
    { id: "sketch-metrics-link", pattern: "docs-lab-roadmap/docs/SKETCH-METRICS.md" },
    { id: "live-demo-url", pattern: pagesUrlForRepo(options.org, row.repo) }
  ];
}

function expectedProfileChecks(row) {
  if (row.repo !== ".github") return [];
  return [
    { id: "profile-live-status", pattern: "## Live Status" },
    { id: "profile-operations-badge", pattern: "actions/workflows/operations-check.yml/badge.svg?branch=main" },
    { id: "profile-pages-status", pattern: "docs-lab-roadmap/docs/PAGES-STATUS.md" },
    { id: "profile-workflow-status", pattern: "docs-lab-roadmap/docs/WORKFLOW-STATUS.md" },
    { id: "profile-integration-status", pattern: "docs-lab-roadmap/docs/INTEGRATION-STATUS.md" },
    { id: "profile-sketch-metrics", pattern: "docs-lab-roadmap/docs/SKETCH-METRICS.md" }
  ];
}

function evaluateChecks(text, checks) {
  const missing = [];
  for (const check of checks) {
    if (!text.includes(check.pattern)) {
      missing.push(check.id);
    }
  }
  return missing;
}

function buildRecord(row, options, raw) {
  const readmeChecks = expectedReadmeChecks(row, options);
  const profileChecks = expectedProfileChecks(row);
  const readmeMissing = raw.readme ? evaluateChecks(raw.readme, readmeChecks) : readmeChecks.map((check) => check.id);
  const profileMissing = raw.profileReadme ? evaluateChecks(raw.profileReadme, profileChecks) : profileChecks.map((check) => check.id);
  const healthy = Boolean(raw.readme) && readmeMissing.length === 0 && profileMissing.length === 0;
  return {
    ...row,
    readmeFound: Boolean(raw.readme),
    profileFound: profileChecks.length === 0 ? true : Boolean(raw.profileReadme),
    readmeChecks: readmeChecks.length,
    profileChecks: profileChecks.length,
    readmeMissing,
    profileMissing,
    healthy
  };
}

async function collectFixtureRecord(row, options, fixture) {
  const entry = fixture.repos?.[row.repo] || {};
  return buildRecord(row, options, {
    readme: entry.readme || "",
    profileReadme: entry.profileReadme || ""
  });
}

async function collectLiveRecord(row, options) {
  const fullRepo = `${options.org}/${row.repo}`;
  const [readmeEntry, profileEntry] = await Promise.all([
    optionalGhJson(["api", `/repos/${fullRepo}/contents/README.md`]),
    row.repo === ".github"
      ? optionalGhJson(["api", `/repos/${fullRepo}/contents/profile/README.md`])
      : Promise.resolve(null)
  ]);
  return buildRecord(row, options, {
    readme: decodeBase64Content(readmeEntry?.content || ""),
    profileReadme: decodeBase64Content(profileEntry?.content || "")
  });
}

async function collectRecords(inventory, options, fixture) {
  if (fixture) {
    return Promise.all(inventory.map((row) => collectFixtureRecord(row, options, fixture)));
  }
  return mapLimit(inventory, options.concurrency, (row) => collectLiveRecord(row, options));
}

function summarize(records) {
  const healthy = records.filter((record) => record.healthy).length;
  const readmeFound = records.filter((record) => record.readmeFound).length;
  const profileHealthy = records.filter((record) => record.profileChecks === 0 || (record.profileFound && record.profileMissing.length === 0)).length;
  return {
    total: records.length,
    healthy,
    unhealthy: records.length - healthy,
    readmeFound,
    profileHealthy
  };
}

function statusIcon(ok) {
  return ok ? "✅" : "⚠";
}

function escapeCell(value) {
  return String(value ?? "").replace(/\|/gu, "\\|").replace(/\n/gu, " ");
}

function renderReport(records) {
  const summary = summarize(records);
  const lines = [
    "# README Status",
    "",
    `_Generated by \`scripts/check-org-readmes.mjs\` on ${GENERATED_AT_PLACEHOLDER}._`,
    "",
    "## Summary",
    `- Inventory repos: ${summary.total}`,
    `- Healthy READMEs: ${summary.healthy} / ${summary.total}`,
    `- Root README present: ${summary.readmeFound} / ${summary.total}`,
    `- Organization profile gate: ${summary.profileHealthy} / ${summary.total}`,
    "",
    "## Repo Status",
    "| Repo | Category | Priority | README | Profile | Missing gates |",
    "| --- | --- | --- | --- | --- | --- |"
  ];

  for (const record of records) {
    const readmeCell = `${statusIcon(record.readmeFound && record.readmeMissing.length === 0)} ${record.readmeFound ? `${record.readmeChecks - record.readmeMissing.length}/${record.readmeChecks}` : "missing"}`;
    const profileCell = record.profileChecks === 0
      ? "—"
      : `${statusIcon(record.profileFound && record.profileMissing.length === 0)} ${record.profileFound ? `${record.profileChecks - record.profileMissing.length}/${record.profileChecks}` : "missing"}`;
    const missing = [...record.readmeMissing, ...record.profileMissing].length
      ? [...record.readmeMissing, ...record.profileMissing].join(", ")
      : "—";
    lines.push(`| ${escapeCell(record.repo)} | ${escapeCell(record.category)} | ${escapeCell(record.priority_group)} | ${escapeCell(readmeCell)} | ${escapeCell(profileCell)} | ${escapeCell(missing)} |`);
  }

  lines.push("", "## Gaps");
  const gaps = records.filter((record) => !record.healthy);
  if (gaps.length === 0) {
    lines.push("No README drift detected.");
  } else {
    for (const record of gaps) {
      lines.push(`- \`${record.repo}\`: ${[...record.readmeMissing, ...record.profileMissing].join(", ") || "README missing"}`);
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
  await writeReport(options, renderReport(records));
  const summary = summarize(records);
  if (options.failOnError && summary.unhealthy > 0) {
    console.error(`README status check failed: unhealthy=${summary.unhealthy}`);
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
}
