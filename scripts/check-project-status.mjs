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
    projectTitle: "AI WebGPU Lab — Master",
    inventory: path.join(REPO_ROOT, "docs/repo-inventory.csv"),
    issues: path.join(REPO_ROOT, "issues/initial-draft-issues-30.csv"),
    output: path.join(REPO_ROOT, "docs/PROJECT-STATUS.md"),
    stdout: false,
    failOnError: false,
    requireSeededIssues: false,
    requireProjectItems: false,
    concurrency: 6,
    fixture: ""
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--org") {
      options.org = argv[index + 1];
      index += 1;
    } else if (token === "--project-title") {
      options.projectTitle = argv[index + 1];
      index += 1;
    } else if (token === "--inventory") {
      options.inventory = path.resolve(argv[index + 1]);
      index += 1;
    } else if (token === "--issues") {
      options.issues = path.resolve(argv[index + 1]);
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
    } else if (token === "--require-seeded-issues") {
      options.requireSeededIssues = true;
    } else if (token === "--require-project-items") {
      options.requireProjectItems = true;
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
  console.log(`Usage: node scripts/check-project-status.mjs [options]

Checks the seeded issue and GitHub Projects status for the organization and
renders docs/PROJECT-STATUS.md.

Options:
  --org <name>                 GitHub org. Default: ai-webgpu-lab
  --project-title <title>      Project title. Default: AI WebGPU Lab — Master
  --inventory <file>           Inventory CSV. Default: docs/repo-inventory.csv
  --issues <file>              Seed issue CSV. Default: issues/initial-draft-issues-30.csv
  --output <file>              Markdown output. Default: docs/PROJECT-STATUS.md
  --stdout                     Print markdown instead of writing it
  --fixture <json>             Use offline fixture data instead of gh
  --fail-on-error              Exit non-zero for project missing; combine with require flags for stricter gates
  --require-seeded-issues      Treat missing seeded issues as failures
  --require-project-items      Treat missing Project item links as failures
  --concurrency <number>       Live issue check parallelism. Default: 6
  -h, --help                   Show help`);
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

function keyForIssue(repo, title) {
  return `${repo}\u0000${title}`;
}

function projectFromList(projects, title) {
  return (projects?.projects || []).find((project) => project.title === title) || null;
}

function projectItemUrls(items) {
  const urls = new Set();
  for (const item of items?.items || []) {
    if (item.content?.url) urls.add(item.content.url);
    if (item.url) urls.add(item.url);
  }
  return urls;
}

async function collectFixture(options, issueRows, fixture) {
  const project = fixture.project || null;
  const issueMap = new Map();
  for (const [key, value] of Object.entries(fixture.issues || {})) {
    issueMap.set(key, value);
  }
  const itemUrls = new Set(fixture.projectItemUrls || []);
  const issues = issueRows.map((issue) => {
    const exactKey = keyForIssue(issue.repo, issue.title);
    const entry = issueMap.get(exactKey) || issueMap.get(issue.title) || null;
    const url = entry?.url || "";
    return {
      ...issue,
      found: Boolean(entry),
      url,
      state: entry?.state || "",
      projectLinked: Boolean(url && itemUrls.has(url))
    };
  });
  return { project, issues, itemUrls };
}

async function collectLiveProject(options) {
  const projectList = await optionalGhJson(["project", "list", "--owner", options.org, "--format", "json", "--limit", "100"]);
  const project = projectFromList(projectList, options.projectTitle);
  let itemUrls = new Set();
  if (project?.number) {
    const items = await optionalGhJson(["project", "item-list", String(project.number), "--owner", options.org, "--format", "json", "--limit", "1000"]);
    itemUrls = projectItemUrls(items || {});
  }
  return { project, itemUrls };
}

async function collectLiveIssue(options, issue, itemUrls) {
  const result = await optionalGhJson([
    "issue",
    "list",
    "--repo",
    `${options.org}/${issue.repo}`,
    "--state",
    "all",
    "--search",
    `in:title ${issue.title}`,
    "--limit",
    "100",
    "--json",
    "title,url,state,number"
  ]);
  const exact = Array.isArray(result) ? result.find((entry) => entry.title === issue.title) : null;
  return {
    ...issue,
    found: Boolean(exact),
    url: exact?.url || "",
    state: exact?.state || "",
    projectLinked: Boolean(exact?.url && itemUrls.has(exact.url))
  };
}

async function collectLive(options, issueRows) {
  const { project, itemUrls } = await collectLiveProject(options);
  const issues = await mapLimit(issueRows, options.concurrency, (issue) => collectLiveIssue(options, issue, itemUrls));
  return { project, issues, itemUrls };
}

function summarize(project, issues, itemUrls) {
  const found = issues.filter((issue) => issue.found).length;
  const linked = issues.filter((issue) => issue.projectLinked).length;
  const repos = new Set(issues.map((issue) => issue.repo));
  const reposWithIssues = new Set(issues.filter((issue) => issue.found).map((issue) => issue.repo));
  return {
    projectExists: Boolean(project),
    projectNumber: project?.number || "",
    projectItemCount: project?.items?.totalCount ?? itemUrls.size,
    totalIssues: issues.length,
    seededIssuesFound: found,
    missingIssues: issues.length - found,
    projectItemsLinked: linked,
    projectItemsMissing: issues.length - linked,
    seededRepos: repos.size,
    reposWithIssues: reposWithIssues.size
  };
}

function statusIcon(ok) {
  return ok ? "✅" : "⚠";
}

function escapeCell(value) {
  return String(value ?? "").replace(/\|/gu, "\\|").replace(/\n/gu, " ");
}

function renderReport(options, project, issues, itemUrls) {
  const summary = summarize(project, issues, itemUrls);
  const lines = [
    "# Project Status",
    "",
    `_Generated by \`scripts/check-project-status.mjs\` on ${GENERATED_AT_PLACEHOLDER}._`,
    "",
    "## Summary",
    `- Project title: ${options.projectTitle}`,
    `- Project exists: ${summary.projectExists ? `yes (#${summary.projectNumber})` : "no"}`,
    `- Project item count: ${summary.projectItemCount}`,
    `- Seeded issue definitions: ${summary.totalIssues}`,
    `- Seeded issues found: ${summary.seededIssuesFound} / ${summary.totalIssues}`,
    `- Seeded issues linked to Project: ${summary.projectItemsLinked} / ${summary.totalIssues}`,
    `- Seeded repos with issues: ${summary.reposWithIssues} / ${summary.seededRepos}`,
    "",
    "## Issue Status",
    "| Repo | Priority | Track | Type | Issue | Project item | URL |",
    "| --- | --- | --- | --- | --- | --- | --- |"
  ];

  for (const issue of issues) {
    const issueCell = `${statusIcon(issue.found)} ${issue.found ? issue.state || "found" : "missing"}`;
    const projectCell = `${statusIcon(issue.projectLinked)} ${issue.projectLinked ? "linked" : "missing"}`;
    lines.push(`| ${escapeCell(issue.repo)} | ${escapeCell(issue.priority)} | ${escapeCell(issue.track)} | ${escapeCell(issue.type)} | ${escapeCell(issueCell)} | ${escapeCell(projectCell)} | ${issue.url || "—"} |`);
  }

  lines.push("", "## Gaps");
  const gaps = [];
  if (!summary.projectExists) gaps.push(`- Project is missing: \`${options.projectTitle}\``);
  for (const issue of issues.filter((entry) => !entry.found)) {
    gaps.push(`- Missing issue in \`${issue.repo}\`: ${issue.title}`);
  }
  for (const issue of issues.filter((entry) => entry.found && !entry.projectLinked)) {
    gaps.push(`- Issue not linked to Project: ${issue.url}`);
  }
  if (gaps.length === 0) {
    lines.push("No Project or seeded issue gaps detected.");
  } else {
    lines.push(...gaps);
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

function shouldFail(options, summary) {
  if (!options.failOnError) return false;
  if (!summary.projectExists) return true;
  if (options.requireSeededIssues && summary.missingIssues > 0) return true;
  if (options.requireProjectItems && summary.projectItemsMissing > 0) return true;
  return false;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await readCsv(options.inventory); // Keep parity with other status scripts and fail if inventory is missing.
  const issueRows = await readCsv(options.issues);
  const fixture = options.fixture ? JSON.parse(await fs.readFile(options.fixture, "utf8")) : null;
  const { project, issues, itemUrls } = fixture
    ? await collectFixture(options, issueRows, fixture)
    : await collectLive(options, issueRows);
  await writeReport(options, renderReport(options, project, issues, itemUrls));
  const summary = summarize(project, issues, itemUrls);
  if (shouldFail(options, summary)) {
    console.error(`project status check failed: project_exists=${summary.projectExists}, missing_issues=${summary.missingIssues}, missing_items=${summary.projectItemsMissing}`);
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
}
