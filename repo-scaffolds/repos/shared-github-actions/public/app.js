const INLINE_FIXTURE = {
  id: "shared-github-actions-v1",
  title: "shared-github-actions reusable workflow inventory",
  objective: "Catalog the reusable workflows shipped from the shared CI repository so consumer repositories can wire them with confidence.",
  workflows: [
    {
      name: "reusable-results-guard",
      path: ".github/workflows/reusable-results-guard.yml",
      trigger: "workflow_call",
      inputs: ["repo_root"],
      purpose: "Validate that consumer repositories produce a non-template RESULTS.md and at least one raw JSON file."
    },
    {
      name: "reusable-pages-smoke",
      path: ".github/workflows/reusable-pages-smoke.yml",
      trigger: "workflow_call",
      inputs: ["url", "expected_title", "fallback_query"],
      purpose: "Smoke check the deployed Pages baseline plus an optional fallback query string."
    }
  ],
  consumer_examples: [
    { scenario: "results-guard", repos: ["exp-llm-chat-runtime-shootout", "bench-runtime-shootout", "app-private-rag-lab"] },
    { scenario: "pages-smoke", repos: ["exp-llm-chat-runtime-shootout", "bench-blackhole-render-shootout", "app-blackhole-observatory"] }
  ]
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
      adapter: "n/a (workflow audit)",
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
    const response = await fetch("./workflow-fixture.json", { cache: "no-store" });
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
  log("Auditing reusable workflow inventory.");

  const workflowCount = fixture.workflows.length;
  const totalInputs = fixture.workflows.reduce((sum, workflow) => sum + workflow.inputs.length, 0);
  const consumerScenarioCount = fixture.consumer_examples.length;
  const uniqueConsumerRepos = Array.from(new Set(fixture.consumer_examples.flatMap((entry) => entry.repos))).length;
  const callTriggers = fixture.workflows.filter((workflow) => workflow.trigger === "workflow_call").length;
  const auditScore = round(45 + workflowCount * 18 + totalInputs * 4 + consumerScenarioCount * 6 + uniqueConsumerRepos * 2, 2);

  state.audit = {
    workflowCount,
    totalInputs,
    consumerScenarioCount,
    uniqueConsumerRepos,
    callTriggers,
    auditScore,
    notes: `workflows=${workflowCount}; inputs=${totalInputs}; consumer-scenarios=${consumerScenarioCount}; unique-consumers=${uniqueConsumerRepos}`
  };

  state.active = false;
  log(`Audit complete: workflows=${workflowCount}, inputs=${totalInputs}, score=${auditScore}.`);
  render();
}

function buildResult() {
  const audit = state.audit;
  const environment = buildEnvironment();
  return {
    meta: {
      repo: "shared-github-actions",
      commit: "bootstrap-generated",
      timestamp: new Date().toISOString(),
      owner: "ai-webgpu-lab",
      track: "infra",
      scenario: audit ? "shared-github-actions-baseline" : "shared-github-actions-pending",
      notes: audit ? audit.notes : "Run the reusable workflow inventory baseline."
    },
    environment,
    workload: {
      kind: "infra",
      name: "shared-github-actions-baseline",
      input_profile: "reusable-workflow-surface",
      model_id: audit ? `workflows-${audit.workflowCount}` : "pending",
      dataset: state.fixture?.id || INLINE_FIXTURE.id
    },
    metrics: {
      common: {
        time_to_interactive_ms: round(performance.now() - state.startedAt, 2) || 0,
        init_ms: audit ? round(audit.workflowCount * 1.5, 2) : 0,
        success_rate: audit ? 1 : 0,
        peak_memory_note: "n/a (workflow audit)",
        error_type: ""
      },
      infra: {
        workflow_count: audit ? audit.workflowCount : 0,
        workflow_input_count: audit ? audit.totalInputs : 0,
        consumer_scenario_count: audit ? audit.consumerScenarioCount : 0,
        unique_consumer_repo_count: audit ? audit.uniqueConsumerRepos : 0,
        workflow_call_trigger_count: audit ? audit.callTriggers : 0,
        baseline_readiness_score: audit ? audit.auditScore : 0
      }
    },
    status: audit ? "success" : "partial",
    artifacts: {
      raw_logs: state.logs.slice(0, 6),
      deploy_url: "https://ai-webgpu-lab.github.io/shared-github-actions/"
    }
  };
}

function metricCards(result) {
  if (!state.audit) {
    return [["Workflows", `${state.fixture?.workflows?.length || INLINE_FIXTURE.workflows.length}`], ["Status", "pending"]];
  }
  return [
    ["Audit score", `${result.metrics.infra.baseline_readiness_score}`],
    ["Workflows", `${result.metrics.infra.workflow_count}`],
    ["Inputs", `${result.metrics.infra.workflow_input_count}`],
    ["Consumer scenarios", `${result.metrics.infra.consumer_scenario_count}`],
    ["Unique consumers", `${result.metrics.infra.unique_consumer_repo_count}`],
    ["Call triggers", `${result.metrics.infra.workflow_call_trigger_count}`]
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
      <thead><tr><th>Workflow</th><th>Trigger</th><th>Inputs</th><th>Purpose</th></tr></thead>
      <tbody>
        ${fixture.workflows.map((workflow) => `
          <tr>
            <td>${workflow.name}</td>
            <td>${workflow.trigger}</td>
            <td>${workflow.inputs.length} (${workflow.inputs.join(", ") || "none"})</td>
            <td>${workflow.purpose}</td>
          </tr>
        `).join("")}
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
        <tr><td>Workflows</td><td>${fixture.workflows.map((workflow) => workflow.name).join(", ")}</td></tr>
        <tr><td>Total inputs</td><td>${fixture.workflows.reduce((sum, workflow) => sum + workflow.inputs.length, 0)}</td></tr>
        <tr><td>Consumer scenarios</td><td>${fixture.consumer_examples.map((entry) => entry.scenario).join(", ")}</td></tr>
        <tr><td>Unique consumer repos</td><td>${Array.from(new Set(fixture.consumer_examples.flatMap((entry) => entry.repos))).length}</td></tr>
      </tbody>
    </table>
  `;
}

function renderLogs() {
  elements.logList.innerHTML = state.logs.length
    ? state.logs.map((item) => `<li>${item}</li>`).join("")
    : "<li>No audit activity yet.</li>";
}

function renderStatus() {
  const env = buildEnvironment();
  const badges = [
    `track=infra`,
    `backend=${env.backend}`,
    `fallback=${String(env.fallback_triggered)}`,
    state.audit ? `score=${state.audit.auditScore}` : "score=pending",
    state.active ? "state=running" : "state=idle"
  ];
  elements.statusRow.innerHTML = badges.map((item) => `<span class="badge">${item}</span>`).join("");
}

function renderSummary() {
  if (state.active) {
    elements.summary.textContent = "Auditing reusable workflows and assembling the shared CI baseline result.";
    return;
  }
  if (state.audit) {
    elements.summary.textContent = `Workflow inventory ready with score ${state.audit.auditScore} (workflows=${state.audit.workflowCount}, inputs=${state.audit.totalInputs}).`;
    return;
  }
  elements.summary.textContent = "Run the inventory to confirm the reusable workflow surface and consumer wiring.";
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
  anchor.download = "shared-github-actions-result.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

async function init() {
  elements.runButton.addEventListener("click", () => {
    runAudit().catch((error) => {
      state.active = false;
      log(`Audit failed: ${error.message}`);
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
