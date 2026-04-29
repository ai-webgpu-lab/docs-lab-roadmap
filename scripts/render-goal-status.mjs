#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readCsv } from "./lib/csv.mjs";
import { finalizeGeneratedMarkdown, GENERATED_AT_PLACEHOLDER } from "./lib/generated-markdown.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

const P0_WORKLOAD_REPOS = new Set([
  "exp-embeddings-browser-throughput",
  "exp-llm-chat-runtime-shootout",
  "exp-stt-whisper-webgpu",
  "exp-rag-browser-pipeline",
  "bench-runtime-shootout",
  "bench-model-load-and-cache",
  "bench-worker-isolation-and-ui-jank"
]);

const P0_FOUNDATION_REPOS = new Set([
  ".github",
  "tpl-webgpu-vanilla",
  "tpl-webgpu-react",
  "shared-webgpu-capability",
  "shared-bench-schema",
  "docs-lab-roadmap"
]);

function usage() {
  console.log(`Usage: node scripts/render-goal-status.mjs [options]

Renders docs/GOAL-STATUS.md from the project inventory and generated status
dashboards.

Options:
  --inventory <file>             Inventory CSV. Default: docs/repo-inventory.csv
  --pages-status <file>          Pages status markdown. Default: docs/PAGES-STATUS.md
  --readme-status <file>         README status markdown. Default: docs/README-STATUS.md
  --workflow-status <file>       Workflow status markdown. Default: docs/WORKFLOW-STATUS.md
  --project-status <file>        Project status markdown. Default: docs/PROJECT-STATUS.md
  --integration-status <file>    Integration status markdown. Default: docs/INTEGRATION-STATUS.md
  --master-plan <file>           Master plan markdown. Default: docs/07-master-experiment-plan.md
  --output <file>                Markdown output. Default: docs/GOAL-STATUS.md
  --stdout                       Print markdown instead of writing it
  --fail-on-error                Exit non-zero when Phase 0-2 gates are blocked
  -h, --help                     Show help`);
}

function parseArgs(argv) {
  const options = {
    inventory: path.join(REPO_ROOT, "docs/repo-inventory.csv"),
    pagesStatus: path.join(REPO_ROOT, "docs/PAGES-STATUS.md"),
    readmeStatus: path.join(REPO_ROOT, "docs/README-STATUS.md"),
    workflowStatus: path.join(REPO_ROOT, "docs/WORKFLOW-STATUS.md"),
    projectStatus: path.join(REPO_ROOT, "docs/PROJECT-STATUS.md"),
    integrationStatus: path.join(REPO_ROOT, "docs/INTEGRATION-STATUS.md"),
    masterPlan: path.join(REPO_ROOT, "docs/07-master-experiment-plan.md"),
    output: path.join(REPO_ROOT, "docs/GOAL-STATUS.md"),
    stdout: false,
    failOnError: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--inventory") {
      options.inventory = path.resolve(argv[index + 1]);
      index += 1;
    } else if (token === "--pages-status") {
      options.pagesStatus = path.resolve(argv[index + 1]);
      index += 1;
    } else if (token === "--readme-status") {
      options.readmeStatus = path.resolve(argv[index + 1]);
      index += 1;
    } else if (token === "--workflow-status") {
      options.workflowStatus = path.resolve(argv[index + 1]);
      index += 1;
    } else if (token === "--project-status") {
      options.projectStatus = path.resolve(argv[index + 1]);
      index += 1;
    } else if (token === "--integration-status") {
      options.integrationStatus = path.resolve(argv[index + 1]);
      index += 1;
    } else if (token === "--master-plan") {
      options.masterPlan = path.resolve(argv[index + 1]);
      index += 1;
    } else if (token === "--output") {
      options.output = path.resolve(argv[index + 1]);
      index += 1;
    } else if (token === "--stdout") {
      options.stdout = true;
    } else if (token === "--fail-on-error") {
      options.failOnError = true;
    } else if (token === "--help" || token === "-h") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  return options;
}

async function readText(file) {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return "";
  }
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function ratio(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = text.match(new RegExp(`- ${escaped}:\\s+(\\d+)\\s*/\\s*(\\d+)`, "u"));
  return match ? { current: Number(match[1]), total: Number(match[2]) } : { current: 0, total: 0 };
}

function numberMetric(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = text.match(new RegExp(`- ${escaped}:\\s+(\\d+)`, "u"));
  return match ? Number(match[1]) : 0;
}

function isComplete(value) {
  return value.total > 0 && value.current === value.total;
}

function countBy(rows, key) {
  const counts = new Map();
  for (const row of rows) {
    const value = row[key] || "(unset)";
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function hasAllRepos(rows, expected) {
  const names = new Set(rows.map((row) => row.repo));
  return [...expected].filter((repo) => !names.has(repo));
}

function formatRatio(value) {
  return `${value.current}/${value.total}`;
}

function icon(ok) {
  return ok ? "✅" : "⚠";
}

function phaseStatus(blocked, inProgress = false) {
  if (blocked) return "⚠ blocked";
  if (inProgress) return "🟡 in progress";
  return "✅ complete";
}

function renderPhaseRow(phase) {
  return `| ${phase.name} | ${phase.status} | ${phase.evidence} | ${phase.next} |`;
}

function renderMetricRow(name, value, target, ok) {
  return `| ${name} | ${value} | ${target} | ${icon(ok)} |`;
}

async function buildModel(options) {
  const inventory = await readCsv(options.inventory);
  const [pages, readmes, workflows, project, integration, masterPlan] = await Promise.all([
    readText(options.pagesStatus),
    readText(options.readmeStatus),
    readText(options.workflowStatus),
    readText(options.projectStatus),
    readText(options.integrationStatus),
    readText(options.masterPlan)
  ]);

  const metrics = {
    inventory: { current: inventory.length, total: 54 },
    p0: { current: inventory.filter((row) => row.priority_group === "P0").length, total: 13 },
    p1: { current: inventory.filter((row) => row.priority_group === "P1").length, total: 19 },
    p2: { current: inventory.filter((row) => row.priority_group === "P2").length, total: 22 },
    pagesHealthy: ratio(pages, "Healthy Pages"),
    pagesHttp: ratio(pages, "HTTP 200"),
    pagesDeploy: ratio(pages, "Latest deploy success"),
    specificDemo: ratio(pages, "Specific demo pages"),
    genericBaseline: numberMetric(pages, "Generic baseline pages"),
    realAssets: ratio(pages, "Real sketch/adapter coverage"),
    readmesHealthy: ratio(readmes, "Healthy READMEs"),
    workflowHealthy: ratio(workflows, "Healthy workflow gates"),
    requiredCi: ratio(workflows, "Required CI success"),
    operations: ratio(workflows, "Operations check latest success"),
    seededIssues: ratio(project, "Seeded issues found"),
    projectItems: ratio(project, "Seeded issues linked to Project"),
    projectFields: ratio(project, "Project field values current"),
    integrationInventory: numberMetric(integration, "Inventory"),
    adapterGaps: numberMetric(integration, "Adapter gaps"),
    sketchGaps: numberMetric(integration, "Sketch gaps"),
    scaffoldGaps: numberMetric(integration, "Scaffold gaps"),
    realSketchFiles: numberMetric(integration, "Total real-*-sketch.js files")
  };

  const missingP0Workloads = hasAllRepos(inventory, P0_WORKLOAD_REPOS);
  const missingP0Foundation = hasAllRepos(inventory, P0_FOUNDATION_REPOS);
  const p0BaselineDocumented = masterPlan.includes("위 9개 browser-visible P0 baseline 저장소") &&
    masterPlan.includes("deterministic `webgpu`/`fallback` pair");

  const runtimeRecommendationExists = await exists(path.join(REPO_ROOT, "docs/RUNTIME-RECOMMENDATIONS.md"));
  const benchmarkSummaryExists = await exists(path.join(REPO_ROOT, "docs/BENCHMARK-SUMMARY.md"));
  const reviewDecisionExists = await exists(path.join(REPO_ROOT, "docs/PROMOTE-CONTINUE-ARCHIVE.md"));
  const multiBrowserResultsExists = await exists(path.join(REPO_ROOT, "docs/MULTI-BROWSER-RESULTS.md"));

  const phase0Blocked = !isComplete(metrics.inventory) ||
    !isComplete(metrics.pagesHealthy) ||
    !isComplete(metrics.readmesHealthy) ||
    !isComplete(metrics.workflowHealthy) ||
    !isComplete(metrics.projectItems) ||
    !isComplete(metrics.projectFields);

  const phase1Blocked = missingP0Workloads.length > 0 ||
    missingP0Foundation.length > 0 ||
    !isComplete(metrics.p0) ||
    !p0BaselineDocumented ||
    !isComplete(metrics.specificDemo);

  const phase2Blocked = metrics.genericBaseline !== 0 ||
    !isComplete(metrics.realAssets) ||
    metrics.integrationInventory !== inventory.length ||
    metrics.adapterGaps !== 0 ||
    metrics.sketchGaps !== 0 ||
    metrics.scaffoldGaps !== 0;

  const phase3Items = [
    { name: "Runtime recommendation doc", complete: runtimeRecommendationExists, target: "docs/RUNTIME-RECOMMENDATIONS.md" },
    { name: "Benchmark summary v1", complete: benchmarkSummaryExists, target: "docs/BENCHMARK-SUMMARY.md" },
    { name: "Multi-browser/device results", complete: multiBrowserResultsExists, target: "docs/MULTI-BROWSER-RESULTS.md" },
    { name: "Promote / Continue / Archive decisions", complete: reviewDecisionExists, target: "docs/PROMOTE-CONTINUE-ARCHIVE.md" }
  ];

  return {
    inventory,
    metrics,
    categoryCounts: countBy(inventory, "category"),
    priorityCounts: countBy(inventory, "priority_group"),
    missingP0Workloads,
    missingP0Foundation,
    p0BaselineDocumented,
    phases: [
      {
        name: "Phase 0 — Organization Bootstrap",
        blocked: phase0Blocked,
        status: phaseStatus(phase0Blocked),
        evidence: `inventory ${formatRatio(metrics.inventory)}, Pages ${formatRatio(metrics.pagesHealthy)}, README ${formatRatio(metrics.readmesHealthy)}, workflows ${formatRatio(metrics.workflowHealthy)}, Project fields ${formatRatio(metrics.projectFields)}`,
        next: phase0Blocked ? "Fix blocked operating gate before more repo rollout." : "Keep weekly operations-check schedule green."
      },
      {
        name: "Phase 1 — P0 Baseline",
        blocked: phase1Blocked,
        status: phaseStatus(phase1Blocked),
        evidence: `P0 repos ${formatRatio(metrics.p0)}, P0 workloads ${P0_WORKLOAD_REPOS.size - missingP0Workloads.length}/${P0_WORKLOAD_REPOS.size}, documented capture baseline ${p0BaselineDocumented ? "yes" : "no"}`,
        next: phase1Blocked ? "Restore P0 workload/foundation coverage." : "Use P0 baselines as regression anchors for real measurements."
      },
      {
        name: "Phase 2 — P1 Expansion",
        blocked: phase2Blocked,
        status: phaseStatus(phase2Blocked),
        evidence: `specific demos ${formatRatio(metrics.specificDemo)}, real assets ${formatRatio(metrics.realAssets)}, adapter/sketch/scaffold gaps ${metrics.adapterGaps}/${metrics.sketchGaps}/${metrics.scaffoldGaps}`,
        next: phase2Blocked ? "Repair harness or adapter coverage gaps." : "Promote selected P1/P2 harnesses to measured workloads."
      },
      {
        name: "Phase 3 — Research Portfolio",
        blocked: false,
        status: phaseStatus(false, !phase3Items.every((item) => item.complete)),
        evidence: `${phase3Items.filter((item) => item.complete).length}/${phase3Items.length} decision/report artifacts present`,
        next: "Run real runtime/model/renderer measurements and publish recommendations."
      }
    ],
    phase3Items
  };
}

function renderReport(model) {
  const { metrics } = model;
  const blocking = model.phases.filter((phase) => phase.blocked);
  const lines = [
    "# Goal Status",
    "",
    `_Generated by \`scripts/render-goal-status.mjs\` on ${GENERATED_AT_PLACEHOLDER}._`,
    "",
    "This dashboard maps the project goal to operating evidence. Phase 0-2 are treated as gates; Phase 3 is the expected research backlog where measured runtime/model/renderer results become recommendation artifacts.",
    "",
    "## Summary",
    `- Inventory repos: ${metrics.inventory.current} / ${metrics.inventory.total}`,
    `- P0 repos: ${metrics.p0.current} / ${metrics.p0.total}`,
    `- P1 repos: ${metrics.p1.current} / ${metrics.p1.total}`,
    `- P2 repos: ${metrics.p2.current} / ${metrics.p2.total}`,
    `- Healthy Pages: ${formatRatio(metrics.pagesHealthy)}`,
    `- Healthy READMEs: ${formatRatio(metrics.readmesHealthy)}`,
    `- Healthy workflow gates: ${formatRatio(metrics.workflowHealthy)}`,
    `- Project fields current: ${formatRatio(metrics.projectFields)}`,
    `- Real sketch/adapter coverage: ${formatRatio(metrics.realAssets)}`,
    `- Blocking phase gates: ${blocking.length}`,
    "",
    "## Phase Gates",
    "| Phase | Status | Evidence | Next action |",
    "| --- | --- | --- | --- |",
    ...model.phases.map(renderPhaseRow),
    "",
    "## Operating Metrics",
    "| Metric | Current | Target | Gate |",
    "| --- | ---: | ---: | --- |",
    renderMetricRow("Inventory repos", metrics.inventory.current, metrics.inventory.total, isComplete(metrics.inventory)),
    renderMetricRow("Healthy Pages", formatRatio(metrics.pagesHealthy), "all repos", isComplete(metrics.pagesHealthy)),
    renderMetricRow("HTTP 200", formatRatio(metrics.pagesHttp), "all Pages repos", isComplete(metrics.pagesHttp)),
    renderMetricRow("Latest deploy success", formatRatio(metrics.pagesDeploy), "all repos", isComplete(metrics.pagesDeploy)),
    renderMetricRow("Specific demo pages", formatRatio(metrics.specificDemo), "all repos", isComplete(metrics.specificDemo)),
    renderMetricRow("Generic baseline pages", metrics.genericBaseline, "0", metrics.genericBaseline === 0),
    renderMetricRow("Healthy READMEs", formatRatio(metrics.readmesHealthy), "all repos", isComplete(metrics.readmesHealthy)),
    renderMetricRow("Healthy workflow gates", formatRatio(metrics.workflowHealthy), "all repos", isComplete(metrics.workflowHealthy)),
    renderMetricRow("Required CI success", formatRatio(metrics.requiredCi), "all required CI", isComplete(metrics.requiredCi)),
    renderMetricRow("Operations check latest success", formatRatio(metrics.operations), "1/1", isComplete(metrics.operations)),
    renderMetricRow("Seeded issues found", formatRatio(metrics.seededIssues), "30/30", isComplete(metrics.seededIssues)),
    renderMetricRow("Project items linked", formatRatio(metrics.projectItems), "30/30", isComplete(metrics.projectItems)),
    renderMetricRow("Project fields current", formatRatio(metrics.projectFields), "30/30", isComplete(metrics.projectFields)),
    renderMetricRow("Adapter gaps", metrics.adapterGaps, "0", metrics.adapterGaps === 0),
    renderMetricRow("Sketch gaps", metrics.sketchGaps, "0", metrics.sketchGaps === 0),
    renderMetricRow("Scaffold gaps", metrics.scaffoldGaps, "0", metrics.scaffoldGaps === 0),
    "",
    "## Portfolio Shape",
    "### By Priority",
    ...model.priorityCounts.map(([name, count]) => `- ${name}: ${count}`),
    "",
    "### By Category",
    ...model.categoryCounts.map(([name, count]) => `- ${name}: ${count}`),
    "",
    "## Research Execution Backlog",
    "| Artifact | Status | Target |",
    "| --- | --- | --- |",
    ...model.phase3Items.map((item) => `| ${item.name} | ${item.complete ? "✅ present" : "🟡 pending"} | \`${item.target}\` |`),
    "",
    "## Next Objective Queue",
    "1. Seed real runtime measurements in `bench-runtime-shootout` with cold/warm cache and deterministic baseline comparison.",
    "2. Add one browser AI workload measurement from `exp-embeddings-browser-throughput` or `exp-stt-whisper-webgpu`.",
    "3. Seed renderer measurements from `exp-three-webgpu-core` or `bench-renderer-shootout`.",
    "4. Convert measured results into `RUNTIME-RECOMMENDATIONS.md`, `BENCHMARK-SUMMARY.md`, and Promote / Continue / Archive decisions.",
    "",
    "## Inputs",
    "- `docs/repo-inventory.csv`",
    "- `docs/PAGES-STATUS.md`",
    "- `docs/README-STATUS.md`",
    "- `docs/WORKFLOW-STATUS.md`",
    "- `docs/PROJECT-STATUS.md`",
    "- `docs/INTEGRATION-STATUS.md`",
    "- `docs/07-master-experiment-plan.md`",
    ""
  ];

  if (blocking.length > 0) {
    lines.push("## Blocking Gaps", "");
    for (const phase of blocking) {
      lines.push(`- ${phase.name}: ${phase.next}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const model = await buildModel(options);
  const text = await finalizeGeneratedMarkdown({
    output: options.output,
    stdout: options.stdout,
    text: renderReport(model)
  });

  if (options.stdout) {
    process.stdout.write(`${text}\n`);
  } else {
    await fs.mkdir(path.dirname(options.output), { recursive: true });
    await fs.writeFile(options.output, `${text}\n`, "utf8");
    console.log(`goal status written to ${options.output}`);
    console.log(`- blocking phase gates: ${model.phases.filter((phase) => phase.blocked).length}`);
  }

  if (options.failOnError && model.phases.some((phase) => phase.blocked)) {
    console.error("Goal status check failed");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
