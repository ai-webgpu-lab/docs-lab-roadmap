const INLINE_FIXTURE = {
  id: "docs-lab-roadmap-v1",
  title: "docs-lab-roadmap inventory snapshot",
  objective: "Snapshot the docs/scripts/templates surface so the org's roadmap repository stays consistent with bootstrap automation.",
  doc_files: [
    "docs/00-master-summary.md",
    "docs/01-org-repo-map.md",
    "docs/02-graphics-and-blackhole-track.md",
    "docs/03-ml-llm-track.md",
    "docs/04-github-projects-design.md",
    "docs/05-templates-and-results.md",
    "docs/06-six-week-execution-plan.md",
    "docs/07-master-experiment-plan.md",
    "docs/08-bootstrap-and-execution-runbook.md"
  ],
  scripts: [
    "scripts/bootstrap-org-repos.sh",
    "scripts/seed-org-issues.sh",
    "scripts/sync-org-labels.sh",
    "scripts/sync-org-repo-topics.sh",
    "scripts/validate-lab-planning.sh",
    "scripts/capture-p0-baseline-results.mjs",
    "scripts/render-results-summary.mjs"
  ],
  templates: ["templates/RESULTS-template.md", "templates/example-result.json"],
  schemas: ["schemas/ai-webgpu-lab-result.schema.json"],
  inventory_repo_count: 54,
  priority_p0_count: 13,
  priority_p1_count: 19,
  priority_p2_count: 22,
  category_count: 13,
  categories: ["org", "template", "shared", "docs", "graphics", "blackhole", "ml", "llm", "audio", "multimodal", "agent", "benchmark", "app"]
};

const state = {
  startedAt: performance.now(),
  fixture: null,
  audit: null,
  active: false,
  logs: []
};

const elements = {
  statusRow: document.getElementById("status-row"),
  summary: document.getElementById("summary"),
  runButton: document.getElementById("run-baseline"),
  downloadJson: document.getElementById("download-json"),
  matrixView: document.getElementById("matrix-view"),
  metricGrid: document.getElementById("metric-grid"),
  metaGrid: document.getElementById("meta-grid"),
  fixtureView: document.getElementById("fixture-view"),
  logList: document.getElementById("log-list"),
  resultJson: document.getElementById("result-json")
};

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function parseBrowser() {
  const ua = navigator.userAgent || "";
  for (const [needle, name] of [["Edg/", "Edge"], ["Chrome/", "Chrome"], ["Firefox/", "Firefox"], ["Version/", "Safari"]]) {
    const marker = ua.indexOf(needle);
    if (marker >= 0) return { name, version: ua.slice(marker + needle.length).split(/[\s)/;]/)[0] || "unknown" };
  }
  return { name: "Unknown", version: "unknown" };
}

function parseOs() {
  const ua = navigator.userAgent || "";
  if (/Windows NT/i.test(ua)) return { name: "Windows", version: (ua.match(/Windows NT ([0-9.]+)/i) || [])[1] || "unknown" };
  if (/Mac OS X/i.test(ua)) return { name: "macOS", version: ((ua.match(/Mac OS X ([0-9_]+)/i) || [])[1] || "unknown").replace(/_/g, ".") };
  if (/Android/i.test(ua)) return { name: "Android", version: (ua.match(/Android ([0-9.]+)/i) || [])[1] || "unknown" };
  if (/(iPhone|iPad|CPU OS)/i.test(ua)) return { name: "iOS", version: ((ua.match(/OS ([0-9_]+)/i) || [])[1] || "unknown").replace(/_/g, ".") };
  if (/Linux/i.test(ua)) return { name: "Linux", version: "unknown" };
  return { name: "Unknown", version: "unknown" };
}

function inferDeviceClass() {
  const threads = navigator.hardwareConcurrency || 0;
  const memory = navigator.deviceMemory || 0;
  const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || "");
  if (mobile) return memory >= 6 && threads >= 8 ? "mobile-high" : "mobile-mid";
  if (memory >= 16 && threads >= 12) return "desktop-high";
  if (memory >= 8 && threads >= 8) return "desktop-mid";
  if (threads >= 4) return "laptop";
  return "unknown";
}

function buildEnvironment() {
  return {
    browser: parseBrowser(),
    os: parseOs(),
    device: {
      name: navigator.platform || "unknown",
      class: inferDeviceClass(),
      cpu: navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} threads` : "unknown",
      memory_gb: navigator.deviceMemory || undefined,
      power_mode: "unknown"
    },
    gpu: {
      adapter: "n/a (docs inventory)",
      required_features: [],
      limits: {}
    },
    backend: typeof navigator !== "undefined" && navigator.gpu ? "webgpu" : "wasm",
    fallback_triggered: !(typeof navigator !== "undefined" && navigator.gpu),
    worker_mode: "main",
    cache_state: "warm"
  };
}

function log(message) {
  state.logs.unshift(`[${new Date().toLocaleTimeString()}] ${message}`);
  state.logs = state.logs.slice(0, 14);
  renderLogs();
}

async function loadFixture() {
  if (state.fixture) return state.fixture;
  try {
    const response = await fetch("./docs-fixture.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.fixture = await response.json();
  } catch (error) {
    state.fixture = INLINE_FIXTURE;
    log(`Fixture fallback engaged: ${error.message}.`);
  }
  renderFixture();
  return state.fixture;
}

async function runAudit() {
  if (state.active) return;
  state.active = true;
  state.audit = null;
  render();

  const fixture = await loadFixture();
  log("Snapshotting docs-lab-roadmap inventory.");

  const docCount = fixture.doc_files.length;
  const scriptCount = fixture.scripts.length;
  const templateCount = fixture.templates.length;
  const schemaCount = fixture.schemas.length;
  const totalAssets = docCount + scriptCount + templateCount + schemaCount;
  const inventoryRepoCount = fixture.inventory_repo_count;
  const priorityP0Count = fixture.priority_p0_count;
  const priorityP1Count = fixture.priority_p1_count;
  const priorityP2Count = fixture.priority_p2_count;
  const categoryCount = fixture.categories.length;
  const auditScore = round(40 + docCount * 4 + scriptCount * 3 + templateCount * 5 + schemaCount * 6 + categoryCount * 2, 2);

  state.audit = {
    docCount,
    scriptCount,
    templateCount,
    schemaCount,
    totalAssets,
    inventoryRepoCount,
    priorityP0Count,
    priorityP1Count,
    priorityP2Count,
    categoryCount,
    auditScore,
    notes: `docs=${docCount}; scripts=${scriptCount}; templates=${templateCount}; repos=${inventoryRepoCount}; P0=${priorityP0Count}; P1=${priorityP1Count}; P2=${priorityP2Count}`
  };

  state.active = false;
  log(`Inventory snapshot ready: assets=${totalAssets}, repos=${inventoryRepoCount}, score=${auditScore}.`);
  render();
}

function buildResult() {
  const audit = state.audit;
  const environment = buildEnvironment();
  return {
    meta: {
      repo: "docs-lab-roadmap",
      commit: "bootstrap-generated",
      timestamp: new Date().toISOString(),
      owner: "ai-webgpu-lab",
      track: "docs",
      scenario: audit ? "docs-lab-roadmap-baseline" : "docs-lab-roadmap-pending",
      notes: audit ? audit.notes : "Run the docs-lab-roadmap inventory baseline."
    },
    environment,
    workload: {
      kind: "docs",
      name: "docs-lab-roadmap-baseline",
      input_profile: "docs-script-template-surface",
      model_id: audit ? `assets-${audit.totalAssets}` : "pending",
      dataset: state.fixture?.id || INLINE_FIXTURE.id
    },
    metrics: {
      common: {
        time_to_interactive_ms: round(performance.now() - state.startedAt, 2) || 0,
        init_ms: audit ? round(audit.totalAssets * 0.3, 2) : 0,
        success_rate: audit ? 1 : 0,
        peak_memory_note: "n/a (docs inventory)",
        error_type: ""
      },
      infra: {
        doc_count: audit ? audit.docCount : 0,
        script_count: audit ? audit.scriptCount : 0,
        template_count: audit ? audit.templateCount : 0,
        schema_count: audit ? audit.schemaCount : 0,
        total_asset_count: audit ? audit.totalAssets : 0,
        inventory_repo_count: audit ? audit.inventoryRepoCount : 0,
        priority_p0_count: audit ? audit.priorityP0Count : 0,
        priority_p1_count: audit ? audit.priorityP1Count : 0,
        priority_p2_count: audit ? audit.priorityP2Count : 0,
        category_count: audit ? audit.categoryCount : 0,
        baseline_readiness_score: audit ? audit.auditScore : 0
      }
    },
    status: audit ? "success" : "partial",
    artifacts: {
      raw_logs: state.logs.slice(0, 6),
      deploy_url: "https://ai-webgpu-lab.github.io/docs-lab-roadmap/"
    }
  };
}

function metricCards(result) {
  if (!state.audit) {
    return [["Docs", `${state.fixture?.doc_files?.length || INLINE_FIXTURE.doc_files.length}`], ["Status", "pending"]];
  }
  return [
    ["Inventory score", `${result.metrics.infra.baseline_readiness_score}`],
    ["Docs", `${result.metrics.infra.doc_count}`],
    ["Scripts", `${result.metrics.infra.script_count}`],
    ["Templates", `${result.metrics.infra.template_count}`],
    ["Schemas", `${result.metrics.infra.schema_count}`],
    ["Repos", `${result.metrics.infra.inventory_repo_count}`],
    ["P0 / P1 / P2", `${result.metrics.infra.priority_p0_count} / ${result.metrics.infra.priority_p1_count} / ${result.metrics.infra.priority_p2_count}`],
    ["Categories", `${result.metrics.infra.category_count}`]
  ];
}

function metaCards(result) {
  return [
    ["Backend", result.environment.backend],
    ["Fallback", String(result.environment.fallback_triggered)],
    ["Browser", `${result.environment.browser.name} ${result.environment.browser.version}`],
    ["OS", `${result.environment.os.name} ${result.environment.os.version}`],
    ["Device class", result.environment.device.class],
    ["Dataset", result.workload.dataset],
    ["Scenario", result.meta.scenario]
  ];
}

function renderCards(container, entries) {
  container.innerHTML = entries.map(([label, value]) => `
    <div class="card">
      <span class="label">${label}</span>
      <span class="value">${value}</span>
    </div>
  `).join("");
}

function renderMatrix() {
  const fixture = state.fixture || INLINE_FIXTURE;
  elements.matrixView.innerHTML = `
    <table>
      <thead><tr><th>Group</th><th>Count</th><th>Sample</th></tr></thead>
      <tbody>
        <tr><td>Docs</td><td>${fixture.doc_files.length}</td><td>${fixture.doc_files.slice(0, 2).join(", ")}${fixture.doc_files.length > 2 ? ", ..." : ""}</td></tr>
        <tr><td>Scripts</td><td>${fixture.scripts.length}</td><td>${fixture.scripts.slice(0, 2).join(", ")}${fixture.scripts.length > 2 ? ", ..." : ""}</td></tr>
        <tr><td>Templates</td><td>${fixture.templates.length}</td><td>${fixture.templates.join(", ")}</td></tr>
        <tr><td>Schemas</td><td>${fixture.schemas.length}</td><td>${fixture.schemas.join(", ")}</td></tr>
        <tr><td>Repos / categories</td><td>${fixture.inventory_repo_count} / ${fixture.categories.length}</td><td>${fixture.categories.slice(0, 4).join(", ")}, ...</td></tr>
      </tbody>
    </table>
  `;
}

function renderFixture() {
  const fixture = state.fixture || INLINE_FIXTURE;
  elements.fixtureView.innerHTML = `
    <table>
      <thead><tr><th>Field</th><th>Value</th></tr></thead>
      <tbody>
        <tr><td>Fixture id</td><td>${fixture.id}</td></tr>
        <tr><td>Total assets</td><td>${fixture.doc_files.length + fixture.scripts.length + fixture.templates.length + fixture.schemas.length}</td></tr>
        <tr><td>Inventory repos</td><td>${fixture.inventory_repo_count}</td></tr>
        <tr><td>P0 / P1 / P2</td><td>${fixture.priority_p0_count} / ${fixture.priority_p1_count} / ${fixture.priority_p2_count}</td></tr>
        <tr><td>Categories</td><td>${fixture.categories.join(", ")}</td></tr>
      </tbody>
    </table>
  `;
}

function renderLogs() {
  elements.logList.innerHTML = state.logs.length
    ? state.logs.map((item) => `<li>${item}</li>`).join("")
    : "<li>No inventory activity yet.</li>";
}

function renderStatus() {
  const env = buildEnvironment();
  const badges = [
    `track=docs`,
    `backend=${env.backend}`,
    `fallback=${String(env.fallback_triggered)}`,
    state.audit ? `score=${state.audit.auditScore}` : "score=pending",
    state.active ? "state=running" : "state=idle"
  ];
  elements.statusRow.innerHTML = badges.map((item) => `<span class="badge">${item}</span>`).join("");
}

function renderSummary() {
  if (state.active) {
    elements.summary.textContent = "Snapshotting docs/scripts/templates and assembling the docs roadmap baseline result.";
    return;
  }
  if (state.audit) {
    elements.summary.textContent = `Inventory ready with score ${state.audit.auditScore} (assets=${state.audit.totalAssets}, repos=${state.audit.inventoryRepoCount}).`;
    return;
  }
  elements.summary.textContent = "Run the inventory probe to capture the current docs surface and repo counts.";
}

function render() {
  const result = buildResult();
  renderStatus();
  renderSummary();
  renderMatrix();
  renderCards(elements.metricGrid, metricCards(result));
  renderCards(elements.metaGrid, metaCards(result));
  elements.resultJson.textContent = JSON.stringify(result, null, 2);
  elements.runButton.disabled = state.active;
  elements.downloadJson.disabled = state.active;
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(buildResult(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "docs-lab-roadmap-result.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

async function init() {
  elements.runButton.addEventListener("click", () => {
    runAudit().catch((error) => {
      state.active = false;
      log(`Inventory failed: ${error.message}`);
      render();
    });
  });
  elements.downloadJson.addEventListener("click", downloadJson);

  await loadFixture();
  renderLogs();
  render();
}

init().catch((error) => {
  log(`Init failed: ${error.message}`);
  render();
});
