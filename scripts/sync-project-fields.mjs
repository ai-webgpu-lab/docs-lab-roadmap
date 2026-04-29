#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readCsv } from "./lib/csv.mjs";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

const FIELD_DEFINITIONS = [
  { name: "Status", type: "single_select", options: ["Todo", "In Progress", "Done"] },
  { name: "Priority", type: "single_select", options: ["P0", "P1", "P2", "P3"] },
  { name: "Track", type: "single_select", options: ["Agent", "Audio", "Benchmark", "Blackhole", "Docs", "Graphics", "Infra", "Integration", "LLM", "ML", "Multimodal"] },
  { name: "Category", type: "single_select", options: ["benchmark", "docs", "experiment", "infra", "integration"] },
  { name: "Seed Type", type: "single_select", options: ["benchmark", "docs", "experiment", "infra", "integration"] },
  { name: "Seed Repo", type: "text" }
];

function parseArgs(argv) {
  const options = {
    org: "ai-webgpu-lab",
    projectTitle: "AI WebGPU Lab — Master",
    inventory: path.join(REPO_ROOT, "docs/repo-inventory.csv"),
    issues: path.join(REPO_ROOT, "issues/initial-draft-issues-30.csv"),
    dryRun: false,
    concurrency: 4
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
    } else if (token === "--dry-run") {
      options.dryRun = true;
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
  console.log(`Usage: node scripts/sync-project-fields.mjs [options]

Fills Projects v2 field values for seeded issues from issues/initial-draft-issues-30.csv.
Reserved GitHub fields are avoided by using Seed Type and Seed Repo.

Options:
  --org <name>                 GitHub org. Default: ai-webgpu-lab
  --project-title <title>      Project title. Default: AI WebGPU Lab — Master
  --inventory <file>           Inventory CSV. Default: docs/repo-inventory.csv
  --issues <file>              Seed issue CSV. Default: issues/initial-draft-issues-30.csv
  --dry-run                    Print planned edits without mutating GitHub
  --concurrency <number>       item-edit parallelism. Default: 4
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

async function gh(args) {
  if (process.env.AI_WEBGPU_LAB_VERBOSE === "1") {
    console.log(`+ gh ${args.join(" ")}`);
  }
  const { stdout } = await execFileAsync("gh", args, {
    cwd: REPO_ROOT,
    maxBuffer: 16 * 1024 * 1024
  });
  return stdout;
}

function projectFromList(projects, title) {
  return (projects?.projects || []).find((project) => project.title === title) || null;
}

function fieldMap(fields) {
  const map = new Map();
  for (const field of fields?.fields || []) {
    map.set(field.name, field);
  }
  return map;
}

async function ensureField(projectNumber, options, fieldsByName, definition) {
  const current = fieldsByName.get(definition.name);
  if (current) return current;
  if (options.dryRun) {
    console.log(`dry-run create field: ${definition.name}`);
    return {
      id: `dry-run-${definition.name}`,
      name: definition.name,
      type: definition.type === "single_select" ? "ProjectV2SingleSelectField" : "ProjectV2Field",
      options: (definition.options || []).map((name) => ({ id: `dry-run-${definition.name}-${name}`, name }))
    };
  }

  const args = [
    "project",
    "field-create",
    String(projectNumber),
    "--owner",
    options.org,
    "--name",
    definition.name,
    "--data-type",
    definition.type === "single_select" ? "SINGLE_SELECT" : "TEXT",
    "--format",
    "json"
  ];
  if (definition.type === "single_select") {
    args.push("--single-select-options", definition.options.join(","));
  }
  await gh(args);
  const refreshed = fieldMap(await ghJson(["project", "field-list", String(projectNumber), "--owner", options.org, "--format", "json", "--limit", "100"]));
  const created = refreshed.get(definition.name);
  if (!created) throw new Error(`Failed to create Project field: ${definition.name}`);
  return created;
}

function optionId(field, optionName) {
  const option = (field.options || []).find((entry) => entry.name === optionName);
  if (!option) {
    throw new Error(`Project field "${field.name}" is missing option "${optionName}"`);
  }
  return option.id;
}

async function projectItems(projectId) {
  const items = new Map();
  let after = null;
  do {
    const args = [
      "api",
      "graphql",
      "-F",
      `project=${projectId}`,
      "-f",
      "query=query($project: ID!, $after: String) { node(id: $project) { ... on ProjectV2 { items(first: 100, after: $after) { pageInfo { hasNextPage endCursor } nodes { id content { ... on Issue { title url repository { nameWithOwner } } } fieldValues(first: 50) { nodes { __typename ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2SingleSelectField { name } } } ... on ProjectV2ItemFieldTextValue { text field { ... on ProjectV2Field { name } } } } } } } } } }"
    ];
    if (after) args.splice(4, 0, "-F", `after=${after}`);
    const result = await ghJson(args);
    const connection = result?.data?.node?.items || {};
    for (const item of connection.nodes || []) {
      const url = item.content?.url;
      if (!url) continue;
      const fields = {};
      for (const value of item.fieldValues?.nodes || []) {
        if (value.__typename === "ProjectV2ItemFieldSingleSelectValue" && value.field?.name) {
          fields[value.field.name] = value.name || "";
        } else if (value.__typename === "ProjectV2ItemFieldTextValue" && value.field?.name) {
          fields[value.field.name] = value.text || "";
        }
      }
      items.set(url, { id: item.id, title: item.content?.title || "", fields });
    }
    after = connection.pageInfo?.hasNextPage ? connection.pageInfo.endCursor : null;
  } while (after);
  return items;
}

async function issueUrl(options, issue) {
  const result = await ghJson([
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
    "title,url"
  ]);
  return (Array.isArray(result) ? result.find((entry) => entry.title === issue.title) : null)?.url || "";
}

function expectedFields(issue) {
  return {
    Status: "Todo",
    Priority: issue.priority,
    Track: issue.track,
    Category: issue.type,
    "Seed Type": issue.type,
    "Seed Repo": issue.repo
  };
}

async function editField({ options, projectId, itemId, field, value }) {
  if (options.dryRun) {
    console.log(`dry-run set: item=${itemId} field=${field.name} value=${value}`);
    return;
  }
  const args = ["project", "item-edit", "--id", itemId, "--project-id", projectId, "--field-id", field.id];
  if (field.type === "ProjectV2SingleSelectField") {
    args.push("--single-select-option-id", optionId(field, value));
  } else {
    args.push("--text", value);
  }
  await gh(args);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await readCsv(options.inventory); // Fail early if the inventory path is wrong.
  const issueRows = await readCsv(options.issues);

  const project = projectFromList(await ghJson(["project", "list", "--owner", options.org, "--format", "json", "--limit", "100"]), options.projectTitle);
  if (!project?.number) throw new Error(`Project not found: ${options.projectTitle}`);
  const projectView = await ghJson(["project", "view", String(project.number), "--owner", options.org, "--format", "json"]);
  const projectId = projectView.id;

  let fieldsByName = fieldMap(await ghJson(["project", "field-list", String(project.number), "--owner", options.org, "--format", "json", "--limit", "100"]));
  for (const definition of FIELD_DEFINITIONS) {
    const field = await ensureField(project.number, options, fieldsByName, definition);
    fieldsByName.set(definition.name, field);
    if (!options.dryRun) {
      fieldsByName = fieldMap(await ghJson(["project", "field-list", String(project.number), "--owner", options.org, "--format", "json", "--limit", "100"]));
    }
  }

  const items = await projectItems(projectId);
  const issueUrls = await mapLimit(issueRows, options.concurrency, async (issue) => ({
    issue,
    url: await issueUrl(options, issue)
  }));
  const edits = [];

  for (const { issue, url } of issueUrls) {
    const item = items.get(url);
    if (!url || !item) {
      throw new Error(`Seed issue is not linked to Project: ${issue.repo} :: ${issue.title}`);
    }
    for (const [fieldName, value] of Object.entries(expectedFields(issue))) {
      if (item.fields[fieldName] === value) continue;
      const field = fieldsByName.get(fieldName);
      if (!field) throw new Error(`Project field not found: ${fieldName}`);
      edits.push({ options, projectId, itemId: item.id, field, value });
    }
  }

  await mapLimit(edits, options.concurrency, editField);
  console.log(`project field sync complete: project=#${project.number}, issues=${issueRows.length}, edits=${edits.length}, dry_run=${options.dryRun}`);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
}
