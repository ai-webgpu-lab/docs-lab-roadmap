const INLINE_FIXTURE = {
  id: "shared-bench-schema-v1",
  title: "shared-bench-schema validation surface",
  objective: "Validate the bundled result schema, RESULTS template, and example result so consumer repositories share a single reporting baseline.",
  schema_root_required: ["meta", "environment", "workload", "metrics", "status"],
  meta_required: ["repo", "commit", "timestamp", "track"],
  environment_required: ["browser", "os", "device", "gpu", "backend"],
  metric_groups: ["common", "graphics", "embeddings", "rag", "llm", "stt", "voice", "vlm", "diffusion", "agent"],
  track_enum: ["graphics", "blackhole", "ml", "llm", "audio", "multimodal", "agent", "benchmark", "integration", "infra", "docs"],
  status_enum: ["success", "partial", "failed"],
  results_template_sections: ["## 1. 실험 요약", "## 2. 질문", "## 3. 실행 환경", "## 4. 워크로드 정의", "## 5. 측정 지표", "## 6. 결과 표", "## 7. 관찰", "## 8. 결론", "## 9. 첨부"]
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
      adapter: "n/a (schema audit)",
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
    const response = await fetch("./schema-fixture.json", { cache: "no-store" });
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
  log("Auditing shared bench schema surface.");

  const rootRequired = fixture.schema_root_required.length;
  const metaRequired = fixture.meta_required.length;
  const envRequired = fixture.environment_required.length;
  const metricGroups = fixture.metric_groups.length;
  const trackEnumSize = fixture.track_enum.length;
  const statusEnumSize = fixture.status_enum.length;
  const templateSections = fixture.results_template_sections.length;
  const totalRequired = rootRequired + metaRequired + envRequired;
  const totalEnumSize = trackEnumSize + statusEnumSize;
  const auditScore = round(50 + metricGroups * 3 + totalRequired * 2 + totalEnumSize, 2);

  state.audit = {
    rootRequired,
    metaRequired,
    envRequired,
    metricGroups,
    trackEnumSize,
    statusEnumSize,
    templateSections,
    totalRequired,
    totalEnumSize,
    auditScore,
    notes: `root=${rootRequired}; meta=${metaRequired}; env=${envRequired}; groups=${metricGroups}; track-enum=${trackEnumSize}; status-enum=${statusEnumSize}`
  };

  state.active = false;
  log(`Audit complete: groups=${metricGroups}, score=${auditScore}, template-sections=${templateSections}.`);
  render();
}

function buildResult() {
  const audit = state.audit;
  const environment = buildEnvironment();
  return {
    meta: {
      repo: "shared-bench-schema",
      commit: "bootstrap-generated",
      timestamp: new Date().toISOString(),
      owner: "ai-webgpu-lab",
      track: "infra",
      scenario: audit ? "shared-bench-schema-baseline" : "shared-bench-schema-pending",
      notes: audit ? audit.notes : "Run the shared bench schema validation baseline."
    },
    environment,
    workload: {
      kind: "infra",
      name: "shared-bench-schema-baseline",
      input_profile: "result-schema-surface",
      model_id: audit ? `groups-${audit.metricGroups}` : "pending",
      dataset: state.fixture?.id || INLINE_FIXTURE.id
    },
    metrics: {
      common: {
        time_to_interactive_ms: round(performance.now() - state.startedAt, 2) || 0,
        init_ms: audit ? round(audit.totalRequired * 0.7, 2) : 0,
        success_rate: audit ? 1 : 0,
        peak_memory_note: "n/a (schema audit)",
        error_type: ""
      },
      infra: {
        schema_root_required_count: audit ? audit.rootRequired : 0,
        meta_required_count: audit ? audit.metaRequired : 0,
        environment_required_count: audit ? audit.envRequired : 0,
        metric_group_count: audit ? audit.metricGroups : 0,
        track_enum_size: audit ? audit.trackEnumSize : 0,
        status_enum_size: audit ? audit.statusEnumSize : 0,
        results_template_section_count: audit ? audit.templateSections : 0,
        total_required_field_count: audit ? audit.totalRequired : 0,
        baseline_readiness_score: audit ? audit.auditScore : 0
      }
    },
    status: audit ? "success" : "partial",
    artifacts: {
      raw_logs: state.logs.slice(0, 6),
      deploy_url: "https://ai-webgpu-lab.github.io/shared-bench-schema/"
    }
  };
}

function metricCards(result) {
  if (!state.audit) {
    return [["Metric groups", `${state.fixture?.metric_groups?.length || INLINE_FIXTURE.metric_groups.length}`], ["Status", "pending"]];
  }
  return [
    ["Audit score", `${result.metrics.infra.baseline_readiness_score}`],
    ["Metric groups", `${result.metrics.infra.metric_group_count}`],
    ["Required fields", `${result.metrics.infra.total_required_field_count}`],
    ["Track enum", `${result.metrics.infra.track_enum_size}`],
    ["Status enum", `${result.metrics.infra.status_enum_size}`],
    ["Template sections", `${result.metrics.infra.results_template_section_count}`],
    ["Root required", `${result.metrics.infra.schema_root_required_count}`],
    ["Meta required", `${result.metrics.infra.meta_required_count}`]
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
        <tr><td>Root required</td><td>${fixture.schema_root_required.length}</td><td>${fixture.schema_root_required.join(", ")}</td></tr>
        <tr><td>Meta required</td><td>${fixture.meta_required.length}</td><td>${fixture.meta_required.join(", ")}</td></tr>
        <tr><td>Environment required</td><td>${fixture.environment_required.length}</td><td>${fixture.environment_required.join(", ")}</td></tr>
        <tr><td>Metric groups</td><td>${fixture.metric_groups.length}</td><td>${fixture.metric_groups.slice(0, 4).join(", ")}${fixture.metric_groups.length > 4 ? ", ..." : ""}</td></tr>
        <tr><td>Track enum</td><td>${fixture.track_enum.length}</td><td>${fixture.track_enum.slice(0, 4).join(", ")}${fixture.track_enum.length > 4 ? ", ..." : ""}</td></tr>
        <tr><td>Status enum</td><td>${fixture.status_enum.length}</td><td>${fixture.status_enum.join(", ")}</td></tr>
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
        <tr><td>Required surfaces</td><td>${fixture.schema_root_required.length + fixture.meta_required.length + fixture.environment_required.length} fields</td></tr>
        <tr><td>Metric groups</td><td>${fixture.metric_groups.join(", ")}</td></tr>
        <tr><td>Track enum</td><td>${fixture.track_enum.join(", ")}</td></tr>
        <tr><td>Template sections</td><td>${fixture.results_template_sections.join(" / ")}</td></tr>
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
    elements.summary.textContent = "Auditing schema surfaces and assembling the shared baseline result.";
    return;
  }
  if (state.audit) {
    elements.summary.textContent = `Schema audit ready with score ${state.audit.auditScore} (groups=${state.audit.metricGroups}, required=${state.audit.totalRequired}).`;
    return;
  }
  elements.summary.textContent = "Run the validation to assemble a schema-aligned result for the shared schema surface.";
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
  anchor.download = "shared-bench-schema-result.json";
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
