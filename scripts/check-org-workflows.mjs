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
const EXPECTED_WORKFLOW_ACTIONS = [
  { id: "configure-pages-v6", pattern: "actions/configure-pages@v6" },
  { id: "upload-pages-artifact-v5", pattern: "actions/upload-pages-artifact@v5" },
  { id: "deploy-pages-v5", pattern: "actions/deploy-pages@v5" }
];
const WORKFLOW_FILES = {
  deploy: "deploy-pages.yml",
  ci: "ci.yml",
  operations: "operations-check.yml"
};

function parseArgs(argv) {
  const options = {
    org: "ai-webgpu-lab",
    inventory: path.join(REPO_ROOT, "docs/repo-inventory.csv"),
    output: path.join(REPO_ROOT, "docs/WORKFLOW-STATUS.md"),
    stdout: false,
    failOnError: false,
    concurrency: 6,
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
  console.log(`Usage: node scripts/check-org-workflows.mjs [options]

Checks deploy workflow status for every inventory repo and renders
docs/WORKFLOW-STATUS.md.

Options:
  --org <name>              GitHub org. Default: ai-webgpu-lab
  --inventory <file>        Inventory CSV. Default: docs/repo-inventory.csv
  --output <file>           Markdown output. Default: docs/WORKFLOW-STATUS.md
  --stdout                  Print markdown instead of writing it
  --fixture <json>          Use offline fixture data instead of gh
  --fail-on-error           Exit non-zero when any workflow gate fails
  --concurrency <number>    Live repo check parallelism. Default: 6
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

function latestRunByWorkflow(runs, workflowName) {
  return runs.find((run) => run.workflowName === workflowName) || null;
}

function latestCompletedRunByWorkflow(runs, workflowName) {
  return runs.find((run) => run.workflowName === workflowName && run.status === "completed") || null;
}

function firstRun(runs) {
  return Array.isArray(runs) && runs.length > 0 ? runs[0] : null;
}

function firstCompletedRun(runs) {
  return Array.isArray(runs) ? runs.find((run) => run.status === "completed") || null : null;
}

function isSuccess(run) {
  return run?.status === "completed" && run?.conclusion === "success";
}

function decodeBase64Content(content) {
  if (!content) return "";
  return Buffer.from(String(content).replace(/\s+/g, ""), "base64").toString("utf8");
}

function missingWorkflowActionVersions(content, workflowOk) {
  if (!workflowOk) return EXPECTED_WORKFLOW_ACTIONS.map((check) => check.id);
  return EXPECTED_WORKFLOW_ACTIONS
    .filter((check) => !content.includes(check.pattern))
    .map((check) => check.id);
}

function buildRecord(row, raw) {
  const deployOk = isSuccess(raw.deployRun);
  const ciRequired = row.repo === "docs-lab-roadmap";
  const ciOk = ciRequired ? isSuccess(raw.ciRun) : true;
  const workflowOk = raw.deployWorkflowFile === true;
  const workflowVersionMissing = missingWorkflowActionVersions(raw.deployWorkflowContent || "", workflowOk);
  const workflowVersionOk = workflowOk && workflowVersionMissing.length === 0;
  const healthy = workflowOk && workflowVersionOk && deployOk && ciOk;
  const gaps = [];
  if (!workflowOk) gaps.push("missing-deploy-pages.yml");
  if (!workflowVersionOk) gaps.push(...workflowVersionMissing);
  if (!deployOk) gaps.push("deploy-not-success");
  if (!ciOk) gaps.push("ci-not-success");
  return {
    ...row,
    url: raw.url || "",
    defaultBranch: raw.defaultBranch || "",
    pushedAt: raw.pushedAt || "",
    deployWorkflowFile: workflowOk,
    workflowVersionOk,
    workflowVersionMissing,
    latestRun: raw.latestRun || null,
    deployRun: raw.deployRun || null,
    ciRun: raw.ciRun || null,
    operationsRun: raw.operationsRun || null,
    healthy,
    gaps
  };
}

async function collectFixtureRecord(row, fixture) {
  const entry = fixture.repos?.[row.repo] || {};
  const runs = Array.isArray(entry.runs) ? entry.runs : [];
  const deployRuns = Array.isArray(entry.deployRuns)
    ? entry.deployRuns
    : runs.filter((run) => run.workflowName === "Deploy GitHub Pages Demo");
  const ciRuns = Array.isArray(entry.ciRuns)
    ? entry.ciRuns
    : runs.filter((run) => run.workflowName === "CI");
  const operationsRuns = Array.isArray(entry.operationsRuns)
    ? entry.operationsRuns
    : runs.filter((run) => run.workflowName === "Operations Status Check");
  return buildRecord(row, {
    url: entry.url || "",
    defaultBranch: entry.defaultBranch || "main",
    pushedAt: entry.pushedAt || "",
    deployWorkflowFile: Boolean(entry.deployWorkflowFile),
    deployWorkflowContent: entry.deployWorkflowContent || entry.workflowContent || "",
    latestRun: entry.latestRun || firstRun(runs) || firstRun(deployRuns) || firstRun(ciRuns) || firstRun(operationsRuns),
    deployRun: entry.deployRun || firstRun(deployRuns) || latestRunByWorkflow(runs, "Deploy GitHub Pages Demo"),
    ciRun: entry.ciRun || firstRun(ciRuns) || latestRunByWorkflow(runs, "CI"),
    operationsRun: entry.operationsRun || firstCompletedRun(operationsRuns) || latestCompletedRunByWorkflow(runs, "Operations Status Check")
  });
}

async function collectLiveRecord(row, options) {
  const fullRepo = `${options.org}/${row.repo}`;
  const ciRequired = row.repo === "docs-lab-roadmap";
  const [repoInfo, deployWorkflow, latestRuns, deployRuns, ciRuns, operationsRuns] = await Promise.all([
    optionalGhJson(["repo", "view", fullRepo, "--json", "url,defaultBranchRef,pushedAt"]),
    optionalGhJson(["api", `/repos/${fullRepo}/contents/.github/workflows/deploy-pages.yml`]),
    optionalGhJson(["run", "list", "-R", fullRepo, "--limit", "1", "--json", "workflowName,status,conclusion,headSha,displayTitle,createdAt,url"]),
    optionalGhJson(["run", "list", "-R", fullRepo, "-w", WORKFLOW_FILES.deploy, "--limit", "1", "--json", "workflowName,status,conclusion,headSha,displayTitle,createdAt,url"]),
    ciRequired
      ? optionalGhJson(["run", "list", "-R", fullRepo, "-w", WORKFLOW_FILES.ci, "--limit", "1", "--json", "workflowName,status,conclusion,headSha,displayTitle,createdAt,url"])
      : Promise.resolve([]),
    ciRequired
      ? optionalGhJson(["run", "list", "-R", fullRepo, "-w", WORKFLOW_FILES.operations, "--limit", "10", "--json", "workflowName,status,conclusion,headSha,displayTitle,createdAt,url"])
      : Promise.resolve([])
  ]);
  return buildRecord(row, {
    url: repoInfo?.url || "",
    defaultBranch: repoInfo?.defaultBranchRef?.name || "",
    pushedAt: repoInfo?.pushedAt || "",
    deployWorkflowFile: Boolean(deployWorkflow),
    deployWorkflowContent: decodeBase64Content(deployWorkflow?.content || ""),
    latestRun: firstRun(latestRuns),
    deployRun: firstRun(deployRuns),
    ciRun: firstRun(ciRuns),
    operationsRun: firstCompletedRun(operationsRuns)
  });
}

async function collectRecords(inventory, options, fixture) {
  if (fixture) {
    return Promise.all(inventory.map((row) => collectFixtureRecord(row, fixture)));
  }
  return mapLimit(inventory, options.concurrency, (row) => collectLiveRecord(row, options));
}

function summarize(records) {
  const healthy = records.filter((record) => record.healthy).length;
  const deployWorkflowFiles = records.filter((record) => record.deployWorkflowFile).length;
  const workflowVersionCurrent = records.filter((record) => record.workflowVersionOk).length;
  const deploySuccess = records.filter((record) => isSuccess(record.deployRun)).length;
  const ciRecords = records.filter((record) => record.repo === "docs-lab-roadmap");
  const ciSuccess = ciRecords.filter((record) => isSuccess(record.ciRun)).length;
  const operationsRecords = records.filter((record) => record.repo === "docs-lab-roadmap");
  const operationsSuccess = operationsRecords.filter((record) => isSuccess(record.operationsRun)).length;
  return {
    total: records.length,
    healthy,
    unhealthy: records.length - healthy,
    deployWorkflowFiles,
    workflowVersionCurrent,
    deploySuccess,
    ciTotal: ciRecords.length,
    ciSuccess,
    operationsTotal: operationsRecords.length,
    operationsSuccess
  };
}

function statusIcon(ok) {
  return ok ? "✅" : "⚠";
}

function runLabel(run) {
  if (!run) return "missing";
  return `${run.workflowName || "workflow"} ${run.status || "unknown"}/${run.conclusion || "pending"}`;
}

function escapeCell(value) {
  return String(value ?? "").replace(/\|/gu, "\\|").replace(/\n/gu, " ");
}

function renderReport(records) {
  const summary = summarize(records);
  const lines = [
    "# Workflow Status",
    "",
    `_Generated by \`scripts/check-org-workflows.mjs\` on ${GENERATED_AT_PLACEHOLDER}._`,
    "",
    "## Summary",
    `- Inventory repos: ${summary.total}`,
    `- Healthy workflow gates: ${summary.healthy} / ${summary.total}`,
    `- deploy-pages.yml present: ${summary.deployWorkflowFiles} / ${summary.total}`,
    `- Pages action versions current: ${summary.workflowVersionCurrent} / ${summary.total}`,
    `- Latest Pages deploy success: ${summary.deploySuccess} / ${summary.total}`,
    `- Required CI success: ${summary.ciSuccess} / ${summary.ciTotal}`,
    `- Operations check latest success: ${summary.operationsSuccess} / ${summary.operationsTotal} (informational)`,
    "",
    "Operations check is reported as an informational self-check and is not included in the healthy workflow gate.",
    "",
    "## Repo Status",
    "| Repo | Category | Priority | Deploy workflow | Pages actions | Latest deploy | Latest run | Required CI | Operations check (info) |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |"
  ];

  for (const record of records) {
    const deployWorkflowCell = `${statusIcon(record.deployWorkflowFile)} ${record.deployWorkflowFile ? "present" : "missing"}`;
    const versionCell = `${statusIcon(record.workflowVersionOk)} ${record.workflowVersionOk ? "current" : record.workflowVersionMissing.join(", ") || "missing"}`;
    const deployCell = `${statusIcon(isSuccess(record.deployRun))} ${runLabel(record.deployRun)}`;
    const latestCell = record.latestRun ? `${record.latestRun.workflowName}: ${record.latestRun.conclusion || record.latestRun.status}` : "missing";
    const ciCell = record.repo === "docs-lab-roadmap"
      ? `${statusIcon(isSuccess(record.ciRun))} ${runLabel(record.ciRun)}`
      : "—";
    const operationsCell = record.repo === "docs-lab-roadmap"
      ? `${statusIcon(isSuccess(record.operationsRun))} ${runLabel(record.operationsRun)}`
      : "—";
    lines.push(`| ${escapeCell(record.repo)} | ${escapeCell(record.category)} | ${escapeCell(record.priority_group)} | ${escapeCell(deployWorkflowCell)} | ${escapeCell(versionCell)} | ${escapeCell(deployCell)} | ${escapeCell(latestCell)} | ${escapeCell(ciCell)} | ${escapeCell(operationsCell)} |`);
  }

  lines.push("", "## Gaps");
  const gaps = records.filter((record) => !record.healthy);
  if (gaps.length === 0) {
    lines.push("No workflow gaps detected.");
  } else {
    for (const record of gaps) {
      lines.push(`- \`${record.repo}\`: ${record.gaps.join(", ")}`);
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
    console.error(`workflow status check failed: unhealthy=${summary.unhealthy}`);
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
}
