#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readCsv } from "./lib/csv.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

const errors = [];
const checks = [];

function record(name, ok, detail) {
  checks.push({ name, ok, detail });
  if (!ok) {
    errors.push(`${name}: ${detail}`);
  }
}

function sortedEqual(a, b) {
  const left = [...a].sort();
  const right = [...b].sort();
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

async function readJson(file) {
  const text = await fs.readFile(file, "utf8");
  return JSON.parse(text);
}

async function readText(file) {
  return fs.readFile(file, "utf8");
}

async function listFiles(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function checkDotgithub() {
  const fixturePath = path.join(REPO_ROOT, "repo-scaffolds/repos/.github/public/community-files-fixture.json");
  const fixture = await readJson(fixturePath);

  const issueDir = path.join(REPO_ROOT, ".github/ISSUE_TEMPLATE");
  const allIssueFiles = await listFiles(issueDir);
  const realForms = allIssueFiles.filter((file) => file !== "config.yml" && file.endsWith(".yml")).sort();

  record(
    ".github/issue_forms",
    sortedEqual(fixture.issue_forms, realForms),
    `fixture=[${[...fixture.issue_forms].sort().join(", ")}], real=[${realForms.join(", ")}]`
  );

  const realCommunityFiles = [
    ".github/pull_request_template.md",
    ".github/CODEOWNERS",
    ".github/ISSUE_TEMPLATE/config.yml"
  ];
  for (const relative of realCommunityFiles) {
    const full = path.join(REPO_ROOT, relative);
    let exists = false;
    try {
      await fs.access(full);
      exists = true;
    } catch (error) {
      exists = false;
    }
    record(
      `.github/file:${relative}`,
      exists && fixture.community_files.includes(relative),
      `exists=${exists}, listed=${fixture.community_files.includes(relative)}`
    );
  }
}

async function checkSharedBenchSchema() {
  const fixturePath = path.join(REPO_ROOT, "repo-scaffolds/repos/shared-bench-schema/public/schema-fixture.json");
  const fixture = await readJson(fixturePath);

  const schema = await readJson(path.join(REPO_ROOT, "schemas/ai-webgpu-lab-result.schema.json"));
  const realRoot = schema.required || [];
  const realMeta = schema.properties?.meta?.required || [];
  const realEnv = schema.properties?.environment?.required || [];
  const realGroups = Object.keys(schema.properties?.metrics?.properties || {});
  const realTrack = schema.properties?.meta?.properties?.track?.enum || [];
  const realStatus = schema.properties?.status?.enum || [];

  record("shared-bench-schema/root_required", sortedEqual(fixture.schema_root_required, realRoot),
    `fixture=[${[...fixture.schema_root_required].sort().join(", ")}], real=[${[...realRoot].sort().join(", ")}]`);
  record("shared-bench-schema/meta_required", sortedEqual(fixture.meta_required, realMeta),
    `fixture=[${[...fixture.meta_required].sort().join(", ")}], real=[${[...realMeta].sort().join(", ")}]`);
  record("shared-bench-schema/environment_required", sortedEqual(fixture.environment_required, realEnv),
    `fixture=[${[...fixture.environment_required].sort().join(", ")}], real=[${[...realEnv].sort().join(", ")}]`);
  record("shared-bench-schema/metric_groups", sortedEqual(fixture.metric_groups, realGroups),
    `fixture=[${[...fixture.metric_groups].sort().join(", ")}], real=[${[...realGroups].sort().join(", ")}]`);
  record("shared-bench-schema/track_enum", sortedEqual(fixture.track_enum, realTrack),
    `fixture=[${[...fixture.track_enum].sort().join(", ")}], real=[${[...realTrack].sort().join(", ")}]`);
  record("shared-bench-schema/status_enum", sortedEqual(fixture.status_enum, realStatus),
    `fixture=[${[...fixture.status_enum].sort().join(", ")}], real=[${[...realStatus].sort().join(", ")}]`);

  const templatePath = path.join(REPO_ROOT, "templates/RESULTS-template.md");
  const templateText = await readText(templatePath);
  for (const section of fixture.results_template_sections) {
    record(`shared-bench-schema/template_section:${section}`, templateText.includes(section),
      `template-includes=${templateText.includes(section)}`);
  }
}

async function checkSharedWebgpuCapability() {
  const fixturePath = path.join(REPO_ROOT, "repo-scaffolds/repos/shared-webgpu-capability/public/capability-fixture.json");
  const fixture = await readJson(fixturePath);
  const appPath = path.join(REPO_ROOT, "repo-scaffolds/repos/shared-webgpu-capability/public/app.js");
  const appText = await readText(appPath);

  for (const helper of fixture.exported_helpers) {
    const present = new RegExp(`\\b${helper}\\b`).test(appText);
    record(`shared-webgpu-capability/helper:${helper}`, present,
      `helper-defined-in-app=${present}`);
  }

  const limitMatches = [...appText.matchAll(/"(max[A-Za-z0-9]+)"/g)].map((m) => m[1]);
  for (const key of fixture.expected_limit_keys) {
    record(`shared-webgpu-capability/limit:${key}`, limitMatches.includes(key),
      `limit-listed-in-app=${limitMatches.includes(key)}`);
  }
}

async function checkSharedGithubActions() {
  const fixturePath = path.join(REPO_ROOT, "repo-scaffolds/repos/shared-github-actions/public/workflow-fixture.json");
  const fixture = await readJson(fixturePath);
  const bootstrapText = await readText(path.join(REPO_ROOT, "scripts/bootstrap-org-repos.sh"));

  for (const workflow of fixture.workflows) {
    const expectedPath = workflow.path;
    const present = bootstrapText.includes(expectedPath);
    record(`shared-github-actions/workflow:${workflow.name}`, present,
      `bootstrap-emits-${expectedPath}=${present}`);

    for (const input of workflow.inputs) {
      const inputPresent = new RegExp(`\\b${input}\\b`).test(bootstrapText);
      record(`shared-github-actions/input:${workflow.name}.${input}`, inputPresent,
        `bootstrap-mentions-${input}=${inputPresent}`);
    }
  }
}

async function checkDocsLabRoadmap() {
  const fixturePath = path.join(REPO_ROOT, "repo-scaffolds/repos/docs-lab-roadmap/public/docs-fixture.json");
  const fixture = await readJson(fixturePath);

  for (const file of fixture.doc_files) {
    const full = path.join(REPO_ROOT, file);
    let exists = false;
    try {
      await fs.access(full);
      exists = true;
    } catch (error) {
      exists = false;
    }
    record(`docs-lab-roadmap/doc:${file}`, exists, `exists=${exists}`);
  }
  for (const file of fixture.scripts) {
    const full = path.join(REPO_ROOT, file);
    let exists = false;
    try {
      await fs.access(full);
      exists = true;
    } catch (error) {
      exists = false;
    }
    record(`docs-lab-roadmap/script:${file}`, exists, `exists=${exists}`);
  }
  for (const file of fixture.templates) {
    const full = path.join(REPO_ROOT, file);
    let exists = false;
    try {
      await fs.access(full);
      exists = true;
    } catch (error) {
      exists = false;
    }
    record(`docs-lab-roadmap/template:${file}`, exists, `exists=${exists}`);
  }
  for (const file of fixture.schemas) {
    const full = path.join(REPO_ROOT, file);
    let exists = false;
    try {
      await fs.access(full);
      exists = true;
    } catch (error) {
      exists = false;
    }
    record(`docs-lab-roadmap/schema:${file}`, exists, `exists=${exists}`);
  }

  const inventoryRows = await readCsv(path.join(REPO_ROOT, "docs/repo-inventory.csv"));
  const realRepoCount = inventoryRows.length;
  let p0 = 0;
  let p1 = 0;
  let p2 = 0;
  const categories = new Set();
  for (const row of inventoryRows) {
    categories.add(row.category);
    const priority = row.priority_group;
    if (priority === "P0") p0 += 1;
    else if (priority === "P1") p1 += 1;
    else if (priority === "P2") p2 += 1;
  }

  record("docs-lab-roadmap/inventory_repo_count", fixture.inventory_repo_count === realRepoCount,
    `fixture=${fixture.inventory_repo_count}, real=${realRepoCount}`);
  record("docs-lab-roadmap/priority_p0_count", fixture.priority_p0_count === p0,
    `fixture=${fixture.priority_p0_count}, real=${p0}`);
  record("docs-lab-roadmap/priority_p1_count", fixture.priority_p1_count === p1,
    `fixture=${fixture.priority_p1_count}, real=${p1}`);
  record("docs-lab-roadmap/priority_p2_count", fixture.priority_p2_count === p2,
    `fixture=${fixture.priority_p2_count}, real=${p2}`);
  record("docs-lab-roadmap/category_count", fixture.category_count === categories.size,
    `fixture=${fixture.category_count}, real=${categories.size}`);
  record("docs-lab-roadmap/categories", sortedEqual(fixture.categories, [...categories]),
    `fixture=[${[...fixture.categories].sort().join(", ")}], real=[${[...categories].sort().join(", ")}]`);
}

async function main() {
  await checkDotgithub();
  await checkSharedBenchSchema();
  await checkSharedWebgpuCapability();
  await checkSharedGithubActions();
  await checkDocsLabRoadmap();

  const passed = checks.filter((check) => check.ok).length;
  const failed = checks.filter((check) => !check.ok).length;

  if (failed > 0) {
    console.error(`infra fixture validation failed: ${failed} drift(s) detected`);
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(`infra fixture validation passed: ${passed} checks across 5 infra harnesses`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
