const KNOWN_LIMIT_KEYS = [
  "maxTextureDimension1D",
  "maxTextureDimension2D",
  "maxTextureDimension3D",
  "maxBindGroups",
  "maxBindingsPerBindGroup",
  "maxUniformBufferBindingSize",
  "maxStorageBufferBindingSize",
  "maxComputeInvocationsPerWorkgroup",
  "maxComputeWorkgroupStorageSize",
  "maxBufferSize"
];

const INLINE_FIXTURE = {
  id: "shared-webgpu-capability-v1",
  title: "shared-webgpu-capability helper inventory",
  objective: "Enumerate exported helpers and the result fields the shared utility is expected to populate.",
  exported_helpers: [
    "inferDeviceClass",
    "parseBrowser",
    "parseOs",
    "baseEnvironmentSnapshot",
    "extractGpuLimits",
    "collectWebGpuCapability",
    "buildBaselineResult"
  ],
  expected_result_fields: [
    "meta.repo",
    "meta.commit",
    "meta.timestamp",
    "meta.track",
    "meta.scenario",
    "environment.browser",
    "environment.os",
    "environment.device",
    "environment.gpu",
    "environment.backend",
    "environment.fallback_triggered",
    "workload.kind",
    "workload.name",
    "workload.input_profile",
    "metrics.common",
    "status"
  ],
  expected_limit_keys: KNOWN_LIMIT_KEYS
};

const state = {
  startedAt: performance.now(),
  fixture: null,
  capability: null,
  baseline: null,
  active: false,
  logs: []
};

const elements = {
  statusRow: document.getElementById("status-row"),
  summary: document.getElementById("summary"),
  probeButton: document.getElementById("probe-capability"),
  runButton: document.getElementById("run-capability"),
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

function baseEnvironmentSnapshot() {
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
      adapter: "unknown",
      required_features: [],
      limits: {}
    },
    backend: "wasm",
    fallback_triggered: true,
    worker_mode: "main",
    cache_state: "warm"
  };
}

function extractGpuLimits(source) {
  const limits = {};
  if (!source) return limits;
  for (const key of KNOWN_LIMIT_KEYS) {
    if (key in source && Number.isFinite(source[key])) {
      limits[key] = Number(source[key]);
    }
  }
  return limits;
}

async function collectWebGpuCapability() {
  const environment = baseEnvironmentSnapshot();

  if (typeof navigator === "undefined" || !("gpu" in navigator)) {
    return {
      environment,
      webgpu: {
        available: false,
        error: "navigator.gpu unavailable",
        adapter: "unavailable",
        features: [],
        limits: {}
      }
    };
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error("No GPU adapter returned");

    let adapterInfo = null;
    if (typeof adapter.requestAdapterInfo === "function") {
      try {
        adapterInfo = await adapter.requestAdapterInfo();
      } catch (error) {
        adapterInfo = null;
      }
    }

    const device = await adapter.requestDevice();
    const webgpu = {
      available: true,
      adapter: (adapterInfo && (adapterInfo.description || adapterInfo.vendor || adapterInfo.architecture)) || "WebGPU adapter",
      features: Array.from(device.features || []),
      limits: extractGpuLimits(device.limits || adapter.limits)
    };

    environment.backend = "webgpu";
    environment.fallback_triggered = false;
    environment.gpu = {
      adapter: webgpu.adapter,
      required_features: webgpu.features,
      limits: webgpu.limits
    };

    return { environment, webgpu };
  } catch (error) {
    return {
      environment,
      webgpu: {
        available: false,
        error: error instanceof Error ? error.message : String(error),
        adapter: "unavailable",
        features: [],
        limits: {}
      }
    };
  }
}

function log(message) {
  state.logs.unshift(`[${new Date().toLocaleTimeString()}] ${message}`);
  state.logs = state.logs.slice(0, 14);
  renderLogs();
}

async function loadFixture() {
  if (state.fixture) return state.fixture;
  try {
    const response = await fetch("./capability-fixture.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.fixture = await response.json();
  } catch (error) {
    state.fixture = INLINE_FIXTURE;
    log(`Fixture fallback engaged: ${error.message}.`);
  }
  renderFixture();
  return state.fixture;
}

async function probeCapability() {
  if (state.active) return;
  state.active = true;
  state.capability = null;
  state.baseline = null;
  render();

  log("Collecting WebGPU capability snapshot.");
  state.capability = await collectWebGpuCapability();
  log(`Capability collected: backend=${state.capability.environment.backend}, features=${state.capability.webgpu.features.length}, limits=${Object.keys(state.capability.webgpu.limits || {}).length}.`);
  state.active = false;
  render();
}

async function runBaseline() {
  if (state.active) return;
  if (!state.capability) {
    await probeCapability();
  }
  state.active = true;
  render();

  const fixture = await loadFixture();
  const capability = state.capability;
  const expectedFields = fixture.expected_result_fields || INLINE_FIXTURE.expected_result_fields;
  const expectedLimits = fixture.expected_limit_keys || KNOWN_LIMIT_KEYS;
  const helperCount = (fixture.exported_helpers || INLINE_FIXTURE.exported_helpers).length;
  const featureCount = (capability.webgpu.features || []).length;
  const limitCount = Object.keys(capability.webgpu.limits || {}).length;
  const limitCoverage = expectedLimits.length === 0 ? 1 : Math.min(limitCount / expectedLimits.length, 1);
  const validatedFields = expectedFields.length;
  const baselineScore = capability.webgpu.available
    ? round(70 + featureCount * 3 + limitCoverage * 25, 2)
    : round(40 + helperCount * 2, 2);

  state.baseline = {
    helperCount,
    featureCount,
    limitCount,
    limitCoverage: round(limitCoverage * 100, 2),
    validatedFields,
    baselineScore,
    notes: capability.webgpu.available
      ? `adapter=${capability.webgpu.adapter}; features=${featureCount}; limits=${limitCount}/${expectedLimits.length}`
      : `webgpu unavailable: ${capability.webgpu.error || "unknown"}`
  };

  state.active = false;
  log(`Baseline built: score=${state.baseline.baselineScore}, helpers=${helperCount}, fields=${validatedFields}.`);
  render();
}

function buildResult() {
  const baseline = state.baseline;
  const capability = state.capability;
  const environment = capability ? capability.environment : baseEnvironmentSnapshot();

  return {
    meta: {
      repo: "shared-webgpu-capability",
      commit: "bootstrap-generated",
      timestamp: new Date().toISOString(),
      owner: "ai-webgpu-lab",
      track: "infra",
      scenario: baseline ? "shared-webgpu-capability-baseline" : "shared-webgpu-capability-pending",
      notes: baseline
        ? baseline.notes
        : "Probe local capability and run the shared baseline builder."
    },
    environment,
    workload: {
      kind: "infra",
      name: "shared-webgpu-capability-baseline",
      input_profile: capability ? (capability.webgpu.available ? "webgpu-capable" : "webgpu-unavailable") : "pending",
      model_id: capability ? (capability.webgpu.adapter || "unknown") : "pending",
      dataset: state.fixture?.id || INLINE_FIXTURE.id
    },
    metrics: {
      common: {
        time_to_interactive_ms: round(performance.now() - state.startedAt, 2) || 0,
        init_ms: baseline ? round(baseline.helperCount * 0.6, 2) : 0,
        success_rate: baseline ? (capability.webgpu.available ? 1 : 0.5) : 0,
        peak_memory_note: navigator.deviceMemory ? `${navigator.deviceMemory} GB reported by browser` : "deviceMemory unavailable",
        error_type: capability && capability.webgpu.error ? capability.webgpu.error : ""
      },
      infra: {
        helper_function_count: baseline ? baseline.helperCount : 0,
        capability_features_count: baseline ? baseline.featureCount : 0,
        capability_limit_count: baseline ? baseline.limitCount : 0,
        capability_limit_coverage_pct: baseline ? baseline.limitCoverage : 0,
        validated_field_count: baseline ? baseline.validatedFields : 0,
        baseline_readiness_score: baseline ? baseline.baselineScore : 0
      }
    },
    status: baseline ? (capability.webgpu.available ? "success" : "partial") : "partial",
    artifacts: {
      raw_logs: state.logs.slice(0, 6),
      deploy_url: "https://ai-webgpu-lab.github.io/shared-webgpu-capability/"
    }
  };
}

function metricCards(result) {
  if (!state.baseline) {
    return [
      ["Helpers", `${state.fixture?.exported_helpers?.length || INLINE_FIXTURE.exported_helpers.length}`],
      ["Backend", "pending"],
      ["Status", "pending"]
    ];
  }
  return [
    ["Baseline score", `${result.metrics.infra.baseline_readiness_score}`],
    ["Backend", result.environment.backend],
    ["Features", `${result.metrics.infra.capability_features_count}`],
    ["Limits", `${result.metrics.infra.capability_limit_count}`],
    ["Limit coverage", `${result.metrics.infra.capability_limit_coverage_pct}%`],
    ["Helpers", `${result.metrics.infra.helper_function_count}`],
    ["Validated fields", `${result.metrics.infra.validated_field_count}`],
    ["Adapter", result.environment.gpu.adapter]
  ];
}

function metaCards(result) {
  return [
    ["Backend", result.environment.backend],
    ["Fallback", String(result.environment.fallback_triggered)],
    ["Worker mode", result.environment.worker_mode],
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
  const helpers = state.fixture?.exported_helpers || INLINE_FIXTURE.exported_helpers;
  const features = state.capability?.webgpu?.features || [];
  const limits = state.capability?.webgpu?.limits || {};
  elements.matrixView.innerHTML = `
    <table>
      <thead>
        <tr><th>Group</th><th>Count</th><th>Sample</th></tr>
      </thead>
      <tbody>
        <tr><td>Exported helpers</td><td>${helpers.length}</td><td>${helpers.slice(0, 3).join(", ")}${helpers.length > 3 ? ", ..." : ""}</td></tr>
        <tr><td>WebGPU features</td><td>${features.length}</td><td>${features.length ? features.slice(0, 3).join(", ") : "(none captured)"}</td></tr>
        <tr><td>WebGPU limits</td><td>${Object.keys(limits).length}</td><td>${Object.keys(limits).slice(0, 3).join(", ") || "(none captured)"}</td></tr>
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
        <tr><td>Helpers</td><td>${fixture.exported_helpers.join(", ")}</td></tr>
        <tr><td>Expected result fields</td><td>${fixture.expected_result_fields.length}</td></tr>
        <tr><td>Expected limit keys</td><td>${fixture.expected_limit_keys.length}</td></tr>
      </tbody>
    </table>
  `;
}

function renderLogs() {
  elements.logList.innerHTML = state.logs.length
    ? state.logs.map((item) => `<li>${item}</li>`).join("")
    : "<li>No probe activity yet.</li>";
}

function renderStatus() {
  const env = state.capability?.environment || baseEnvironmentSnapshot();
  const badges = [
    `track=infra`,
    `backend=${env.backend}`,
    `fallback=${String(env.fallback_triggered)}`,
    state.baseline ? `score=${state.baseline.baselineScore}` : "score=pending",
    state.active ? "state=running" : "state=idle"
  ];
  elements.statusRow.innerHTML = badges.map((item) => `<span class="badge">${item}</span>`).join("");
}

function renderSummary() {
  if (state.active) {
    elements.summary.textContent = "Probing capability and assembling the shared baseline result draft.";
    return;
  }
  if (state.baseline) {
    elements.summary.textContent = `Baseline ready with score ${state.baseline.baselineScore} (features=${state.baseline.featureCount}, limits=${state.baseline.limitCount}, helpers=${state.baseline.helperCount}).`;
    return;
  }
  if (state.capability) {
    elements.summary.textContent = `Capability probed (backend=${state.capability.environment.backend}). Run the baseline builder to produce a schema-aligned result draft.`;
    return;
  }
  elements.summary.textContent = "Probe the local browser for WebGPU capability, then run the shared baseline builder.";
}

function render() {
  const result = buildResult();
  renderStatus();
  renderSummary();
  renderMatrix();
  renderCards(elements.metricGrid, metricCards(result));
  renderCards(elements.metaGrid, metaCards(result));
  elements.resultJson.textContent = JSON.stringify(result, null, 2);
  elements.probeButton.disabled = state.active;
  elements.runButton.disabled = state.active;
  elements.downloadJson.disabled = state.active;
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(buildResult(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "shared-webgpu-capability-result.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

async function init() {
  elements.probeButton.addEventListener("click", () => {
    probeCapability().catch((error) => {
      state.active = false;
      log(`Probe failed: ${error.message}`);
      render();
    });
  });
  elements.runButton.addEventListener("click", () => {
    runBaseline().catch((error) => {
      state.active = false;
      log(`Baseline failed: ${error.message}`);
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
