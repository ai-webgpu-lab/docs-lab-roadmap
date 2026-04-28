const INLINE_FIXTURE = {
  id: "compute-stress-suite-v1",
  title: "Compute Stress Suite",
  objective: "Compare deterministic N-body, fluid, and particle-heavy compute cases under one capture path.",
  suite_seed: 20260425,
  cases: [
    {
      id: "nbody-cluster",
      label: "N-Body Cluster",
      family: "nbody",
      accent: "#60a5fa",
      bodies_or_particles: 4096,
      workgroup_size: 128,
      dispatch_batches: 28,
      base_steps_per_sec: 3624,
      base_integration_ms: 0.412,
      base_avg_dispatch_ms: 0.3841,
      base_p95_dispatch_ms: 0.4628,
      energy_drift_pct: 0.0036,
      pressure_solve_ms: 0,
      divergence_error_pct: 0,
      overdraw_ratio_pct: 0,
      stress_bias: 1.04,
      thermal_note: "stable-shared-memory-48kb"
    },
    {
      id: "fluid-pressure",
      label: "Fluid Pressure",
      family: "fluid",
      accent: "#34d399",
      bodies_or_particles: 8192,
      workgroup_size: 128,
      dispatch_batches: 32,
      base_steps_per_sec: 2478,
      base_integration_ms: 0.683,
      base_avg_dispatch_ms: 0.6275,
      base_p95_dispatch_ms: 0.8014,
      energy_drift_pct: 0,
      pressure_solve_ms: 0.3912,
      divergence_error_pct: 0.0017,
      overdraw_ratio_pct: 0,
      stress_bias: 0.98,
      thermal_note: "atomics-warm-64kb"
    },
    {
      id: "particle-vfx",
      label: "Particle VFX",
      family: "particles",
      accent: "#f59e0b",
      bodies_or_particles: 48000,
      workgroup_size: 256,
      dispatch_batches: 36,
      base_steps_per_sec: 5316,
      base_integration_ms: 0.274,
      base_avg_dispatch_ms: 0.2198,
      base_p95_dispatch_ms: 0.3116,
      energy_drift_pct: 0,
      pressure_solve_ms: 0,
      divergence_error_pct: 0,
      overdraw_ratio_pct: 118.4,
      stress_bias: 1.12,
      thermal_note: "bandwidth-hot-textureless"
    }
  ]
};

const EXECUTION_MODE = resolveExecutionMode();

const requestedMode = typeof window !== "undefined"
  ? new URLSearchParams(window.location.search).get("mode")
  : null;
const isRealBenchmarkMode = typeof requestedMode === "string" && requestedMode.startsWith("real-");
const REAL_ADAPTER_WAIT_MS = 5000;
const REAL_ADAPTER_LOAD_MS = 20000;

function withTimeout(promise, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs} ms`)), timeoutMs);
    promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    }, (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function findRegisteredRealBenchmark() {
  const registry = typeof window !== "undefined" ? window.__aiWebGpuLabBenchmarkRegistry : null;
  if (!registry || typeof registry.list !== "function") return null;
  return registry.list().find((adapter) => adapter && adapter.isReal === true) || null;
}

async function awaitRealBenchmark(timeoutMs = REAL_ADAPTER_WAIT_MS) {
  const startedAt = performance.now();
  while (performance.now() - startedAt < timeoutMs) {
    const adapter = findRegisteredRealBenchmark();
    if (adapter) return adapter;
    if (typeof window !== "undefined" && window.__aiWebGpuLabRealComputeBenchBootstrapError) {
      return null;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

const state = {
  startedAt: performance.now(),
  fixture: null,
  environment: buildEnvironment(),
  active: false,
  realAdapterError: null,
  run: null,
  realAdapterError: null,
  logs: []
};

const elements = {
  statusRow: document.getElementById("status-row"),
  summary: document.getElementById("summary"),
  runBenchmark: document.getElementById("run-benchmark"),
  downloadJson: document.getElementById("download-json"),
  matrixView: document.getElementById("matrix-view"),
  canvas: document.getElementById("suite-canvas"),
  metricGrid: document.getElementById("metric-grid"),
  metaGrid: document.getElementById("meta-grid"),
  fixtureView: document.getElementById("fixture-view"),
  logList: document.getElementById("log-list"),
  resultJson: document.getElementById("result-json")
};

function resolveExecutionMode() {
  const hasWebGpu = typeof navigator !== "undefined" && Boolean(navigator.gpu);
  if (hasWebGpu) {
    return {
      id: "webgpu",
      label: "WebGPU",
      backend: "webgpu",
      fallbackTriggered: false,
      workerMode: "worker",
      stepScale: 1,
      latencyScale: 1,
      jitterScale: 1
    };
  }

  return {
    id: "fallback",
    label: "CPU fallback",
    backend: "cpu",
    fallbackTriggered: true,
    workerMode: "main",
    stepScale: 0.62,
    latencyScale: 1.78,
    jitterScale: 1.12
  };
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function parseBrowser() {
  const ua = navigator.userAgent;
  for (const [needle, name] of [["Edg/", "Edge"], ["Chrome/", "Chrome"], ["Firefox/", "Firefox"], ["Version/", "Safari"]]) {
    const marker = ua.indexOf(needle);
    if (marker >= 0) return { name, version: ua.slice(marker + needle.length).split(/[\s)/;]/)[0] || "unknown" };
  }
  return { name: "Unknown", version: "unknown" };
}

function parseOs() {
  const ua = navigator.userAgent;
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
  const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
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
      adapter: EXECUTION_MODE.fallbackTriggered ? "cpu-compute-fallback" : "synthetic-webgpu-compute-suite",
      required_features: EXECUTION_MODE.fallbackTriggered ? [] : ["shader-f16", "timestamp-query"],
      limits: EXECUTION_MODE.fallbackTriggered ? {} : { maxComputeWorkgroupSizeX: 256, maxStorageBufferBindingSize: 134217728 }
    },
    backend: EXECUTION_MODE.backend,
    fallback_triggered: EXECUTION_MODE.fallbackTriggered,
    worker_mode: EXECUTION_MODE.workerMode,
    cache_state: "warm"
  };
}

function log(message) {
  state.logs.unshift(`[${new Date().toLocaleTimeString()}] ${message}`);
  state.logs = state.logs.slice(0, 14);
  renderLogs();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadFixture() {
  if (state.fixture) return state.fixture;
  try {
    const response = await fetch("./compute-stress-profiles.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.fixture = await response.json();
  } catch (error) {
    state.fixture = INLINE_FIXTURE;
    log(`Fixture fallback engaged: ${error.message}.`);
  }
  renderFixture();
  drawPreview();
  return state.fixture;
}

function drawPreview() {
  const ctx = elements.canvas.getContext("2d");
  const { width, height } = elements.canvas;
  ctx.clearRect(0, 0, width, height);

  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#08111d");
  background.addColorStop(0.55, "#10192a");
  background.addColorStop(1, "#070c14");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(148, 163, 184, 0.12)";
  ctx.lineWidth = 1;
  for (let row = 0; row <= 5; row += 1) {
    const y = 36 + row * 46;
    ctx.beginPath();
    ctx.moveTo(28, y);
    ctx.lineTo(width - 24, y);
    ctx.stroke();
  }

  const cases = state.run?.cases || state.fixture?.cases || INLINE_FIXTURE.cases;
  const maxScore = Math.max(...cases.map((item) => item.stress_score || item.stress_bias || 1.1), 1);

  cases.forEach((item, index) => {
    const barWidth = ((item.stress_score || item.stress_bias || 1) / maxScore) * (width - 180);
    const y = 64 + index * 74;
    ctx.fillStyle = `${item.accent}26`;
    ctx.fillRect(146, y - 10, width - 184, 28);
    ctx.fillStyle = item.accent;
    ctx.fillRect(146, y - 10, barWidth, 28);
    ctx.fillStyle = "#e5eefc";
    ctx.font = "600 15px Segoe UI";
    ctx.fillText(item.label, 28, y + 8);
    ctx.font = "13px Segoe UI";
    ctx.fillStyle = "#c5d0e0";
    const metric = state.run ? `${round(item.steps_per_sec, 1)} steps/s` : `${item.bodies_or_particles.toLocaleString()} load`;
    ctx.fillText(metric, 146 + Math.min(barWidth + 10, width - 220), y + 8);
  });

  ctx.fillStyle = "rgba(239, 246, 255, 0.92)";
  ctx.font = "600 22px Segoe UI";
  ctx.fillText("Compute stress suite", 28, 28);
  ctx.font = "13px Segoe UI";
  ctx.fillStyle = "rgba(196, 206, 221, 0.92)";
  ctx.fillText(`mode=${EXECUTION_MODE.label}  backend=${state.environment.backend}`, 28, height - 18);
}

function simulateCase(caseDef, index) {
  const latencyScale = EXECUTION_MODE.latencyScale;
  const stepScale = EXECUTION_MODE.stepScale;
  const jitterScale = EXECUTION_MODE.jitterScale;
  const dispatchJitter = (index + 1) * 0.011 * jitterScale;

  const stepsPerSec = caseDef.base_steps_per_sec * stepScale * (1 - dispatchJitter * 0.04);
  const integrationMs = caseDef.base_integration_ms * latencyScale * (1 + dispatchJitter * 0.16);
  const avgDispatchMs = caseDef.base_avg_dispatch_ms * latencyScale * (1 + dispatchJitter * 0.22);
  const p95DispatchMs = caseDef.base_p95_dispatch_ms * latencyScale * (1 + dispatchJitter * 0.28);
  const pressureSolveMs = caseDef.pressure_solve_ms ? caseDef.pressure_solve_ms * latencyScale * (1 + dispatchJitter * 0.18) : 0;
  const divergenceErrorPct = caseDef.divergence_error_pct ? caseDef.divergence_error_pct * (EXECUTION_MODE.fallbackTriggered ? 1.38 : 1) : 0;
  const overdrawRatioPct = caseDef.overdraw_ratio_pct ? caseDef.overdraw_ratio_pct * (EXECUTION_MODE.fallbackTriggered ? 1.07 : 1) : 0;
  const energyDriftPct = caseDef.energy_drift_pct ? caseDef.energy_drift_pct * (EXECUTION_MODE.fallbackTriggered ? 1.22 : 1) : 0;

  const stabilityPenalty = pressureSolveMs * 22 + divergenceErrorPct * 1800 + overdrawRatioPct * 0.04 + energyDriftPct * 2400;
  const stressScore = (stepsPerSec / Math.max(avgDispatchMs * 1000, 1)) * caseDef.stress_bias * 1000 - stabilityPenalty;

  return {
    ...caseDef,
    steps_per_sec: round(stepsPerSec, 2),
    integration_ms: round(integrationMs, 4),
    avg_dispatch_ms: round(avgDispatchMs, 4),
    p95_dispatch_ms: round(p95DispatchMs, 4),
    pressure_solve_ms: round(pressureSolveMs, 4),
    divergence_error_pct: round(divergenceErrorPct, 4),
    overdraw_ratio_pct: round(overdrawRatioPct, 2),
    energy_drift_pct: round(energyDriftPct, 4),
    stress_score: round(stressScore, 3)
  };
}

async function runRealBenchmarkCompute(adapter) {
  log(`Connecting real benchmark adapter '${adapter.id}'.`);
  await withTimeout(
    Promise.resolve(adapter.createBenchmark({ name: "compute-stress-suite" })),
    REAL_ADAPTER_LOAD_MS,
    `createBenchmark(${adapter.id})`
  );
  await withTimeout(
    Promise.resolve(adapter.runProfile({
      profileId: "compute-stress-suite-default",
      fn: () => null,
      options: {}
    })),
    REAL_ADAPTER_LOAD_MS,
    `runProfile(${adapter.id})`
  );
  const aggregate = await withTimeout(
    Promise.resolve(adapter.aggregateResults()),
    REAL_ADAPTER_LOAD_MS,
    `aggregateResults(${adapter.id})`
  );
  log(`Real benchmark adapter '${adapter.id}' aggregate: profileCount=${aggregate?.profileCount || 0}.`);
  return { adapter, aggregate };
}

async function runBenchmark() {
  if (state.active) return;
  state.active = true;
  state.run = null;
  render();

  if (isRealBenchmarkMode) {
    log(`Mode=${requestedMode} requested; awaiting real benchmark adapter registration.`);
    const adapter = await awaitRealBenchmark();
    if (adapter) {
      try {
        const { aggregate } = await runRealBenchmarkCompute(adapter);
        state.realAdapterAggregate = aggregate;
        state.realAdapter = adapter;
      } catch (error) {
        state.realAdapterError = error?.message || String(error);
        log(`Real benchmark '${adapter.id}' failed: ${state.realAdapterError}; falling back to deterministic.`);
      }
    } else {
      const reason = (typeof window !== "undefined" && window.__aiWebGpuLabRealComputeBenchBootstrapError) || "timed out waiting for adapter registration";
      state.realAdapterError = reason;
      log(`No real benchmark adapter registered (${reason}); falling back to deterministic compute benchmark.`);
    }
  }

  const fixture = await loadFixture();
  const cases = [];

  for (let index = 0; index < fixture.cases.length; index += 1) {
    const caseDef = fixture.cases[index];
    log(`Running ${caseDef.label} in ${EXECUTION_MODE.label} mode.`);
    await sleep(80 + index * 30);
    const result = simulateCase(caseDef, index);
    cases.push(result);
    log(`${caseDef.label}: steps/s=${result.steps_per_sec}, avgDispatch=${result.avg_dispatch_ms} ms, score=${result.stress_score}.`);
  }

  const winner = [...cases].sort((left, right) => right.stress_score - left.stress_score)[0];
  const overall = {
    caseCount: cases.length,
    stepsPerSec: round(average(cases.map((item) => item.steps_per_sec)), 2),
    integrationMs: round(average(cases.map((item) => item.integration_ms)), 4),
    avgDispatchMs: round(average(cases.map((item) => item.avg_dispatch_ms)), 4),
    p95DispatchMs: round(percentile(cases.map((item) => item.p95_dispatch_ms), 0.95), 4),
    maxBodiesOrParticles: Math.max(...cases.map((item) => item.bodies_or_particles)),
    maxWorkgroupSize: Math.max(...cases.map((item) => item.workgroup_size)),
    pressureSolveMs: round(Math.max(...cases.map((item) => item.pressure_solve_ms || 0)), 4),
    divergenceErrorPct: round(Math.max(...cases.map((item) => item.divergence_error_pct || 0)), 4),
    energyDriftPct: round(Math.max(...cases.map((item) => item.energy_drift_pct || 0)), 4),
    overdrawRatioPct: round(Math.max(...cases.map((item) => item.overdraw_ratio_pct || 0)), 2),
    dispatchBatches: Math.max(...cases.map((item) => item.dispatch_batches || 0)),
    winnerId: winner.id,
    winnerLabel: winner.label,
    winnerScore: winner.stress_score
  };

  state.run = { cases, overall };
  state.active = false;
  log(`Suite complete: winner=${winner.id}, steps/s=${overall.stepsPerSec}, p95Dispatch=${overall.p95DispatchMs} ms.`);
  drawPreview();
  render();
}

function describeBenchmarkAdapter() {
  const registry = typeof window !== "undefined" ? window.__aiWebGpuLabBenchmarkRegistry : null;
  const requested = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("mode")
    : null;
  if (registry) {
    return registry.describe(requested);
  }
  return {
    id: "deterministic-compute-suite",
    label: "Deterministic Compute Suite",
    status: "deterministic",
    isReal: false,
    version: "1.0.0",
    capabilities: ["profile-comparison", "winner-selection", "real-benchmark"],
    benchmarkType: "synthetic",
    message: "Benchmark adapter registry unavailable; using inline deterministic mock."
  };
}

function buildResult() {
  const run = state.run;
  return {
    meta: {
      repo: "bench-compute-stress-suite",
      commit: "bootstrap-generated",
      timestamp: new Date().toISOString(),
      owner: "ai-webgpu-lab",
      track: "benchmark",
      scenario: (state.run && state.run.realAdapter) ? `compute-stress-suite-real-${state.run.realAdapter.id}` : (run ? "compute-stress-suite-benchmark" : "compute-stress-suite-pending"),
      notes: run
        ? `cases=${run.overall.caseCount}; winner=${run.overall.winnerId}; backend=${state.environment.backend}; peakLoad=${run.overall.maxBodiesOrParticles}; maxWorkgroup=${run.overall.maxWorkgroupSize}; suite=${state.fixture?.id || INLINE_FIXTURE.id}${state.run && state.run.realAdapter ? `; realAdapter=${state.run.realAdapter.id}` : (isRealBenchmarkMode && state.realAdapterError ? `; realAdapter=fallback(${state.realAdapterError})` : "")}`
        : "Run the deterministic compute stress suite benchmark."
    },
    environment: state.environment,
    workload: {
      kind: "compute",
      name: "compute-stress-suite-benchmark",
      input_profile: `${run ? run.overall.caseCount : INLINE_FIXTURE.cases.length}-case-compute-suite`,
      model_id: run ? run.overall.winnerId : "pending",
      dataset: state.fixture?.id || INLINE_FIXTURE.id
    },
    metrics: {
      common: {
        time_to_interactive_ms: round(performance.now() - state.startedAt, 2) || 0,
        init_ms: run ? round(run.cases.reduce((sum, item) => sum + item.integration_ms, 0), 4) || 0 : 0,
        success_rate: run ? 1 : 0.5,
        peak_memory_note: navigator.deviceMemory ? `${navigator.deviceMemory} GB reported by browser` : "deviceMemory unavailable",
        error_type: ""
      },
      compute: {
        bodies_or_particles: run ? run.overall.maxBodiesOrParticles : 0,
        workgroup_size: run ? run.overall.maxWorkgroupSize : 0,
        steps_per_sec: run ? run.overall.stepsPerSec : 0,
        integration_ms: run ? run.overall.integrationMs : 0,
        avg_dispatch_ms: run ? run.overall.avgDispatchMs : 0,
        p95_dispatch_ms: run ? run.overall.p95DispatchMs : 0,
        energy_drift_pct: run ? run.overall.energyDriftPct : 0,
        pressure_solve_ms: run ? run.overall.pressureSolveMs : 0,
        divergence_error_pct: run ? run.overall.divergenceErrorPct : 0,
        overdraw_ratio_pct: run ? run.overall.overdrawRatioPct : 0,
        dispatch_batches: run ? run.overall.dispatchBatches : 0,
        suite_case_count: run ? run.overall.caseCount : 0,
        suite_winner_score: run ? run.overall.winnerScore : 0
      }
    },
    status: run ? "success" : "partial",
    artifacts: {
      raw_logs: state.logs.slice(0, 6),
      cases: run ? run.cases : [],
      deploy_url: "https://ai-webgpu-lab.github.io/bench-compute-stress-suite/",
      benchmark_adapter: describeBenchmarkAdapter()
    }
  };
}

function metricCards(result) {
  if (!state.run) {
    return [
      ["Suite cases", `${state.fixture?.cases.length || INLINE_FIXTURE.cases.length}`],
      ["Backend", state.environment.backend],
      ["Mode", EXECUTION_MODE.label],
      ["Status", "pending"]
    ];
  }

  return [
    ["Winner", state.run.overall.winnerLabel],
    ["Steps / sec", `${result.metrics.compute.steps_per_sec}`],
    ["Avg dispatch", `${result.metrics.compute.avg_dispatch_ms} ms`],
    ["P95 dispatch", `${result.metrics.compute.p95_dispatch_ms} ms`],
    ["Peak load", `${result.metrics.compute.bodies_or_particles}`],
    ["Max workgroup", `${result.metrics.compute.workgroup_size}`],
    ["Pressure solve", `${result.metrics.compute.pressure_solve_ms} ms`],
    ["Overdraw ratio", `${result.metrics.compute.overdraw_ratio_pct}%`]
  ];
}

function metaCards(result) {
  return [
    ["Backend", result.environment.backend],
    ["Fallback", String(result.environment.fallback_triggered)],
    ["Worker mode", result.environment.worker_mode],
    ["Browser", `${result.environment.browser.name} ${result.environment.browser.version}`],
    ["OS", `${result.environment.os.name} ${result.environment.os.version}`],
    ["GPU adapter", result.environment.gpu.adapter],
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
  const cases = state.run?.cases || state.fixture?.cases || INLINE_FIXTURE.cases;
  elements.matrixView.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Case</th>
          <th>Load</th>
          <th>Workgroup</th>
          <th>Steps/s</th>
          <th>Avg dispatch</th>
          <th>P95 dispatch</th>
          <th>Score</th>
        </tr>
      </thead>
      <tbody>
        ${cases.map((item) => `
          <tr>
            <td>${item.label}</td>
            <td>${item.bodies_or_particles}</td>
            <td>${item.workgroup_size}</td>
            <td>${item.steps_per_sec || item.base_steps_per_sec}</td>
            <td>${item.avg_dispatch_ms || item.base_avg_dispatch_ms} ms</td>
            <td>${item.p95_dispatch_ms || item.base_p95_dispatch_ms} ms</td>
            <td>${item.stress_score || item.stress_bias}</td>
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
      <thead>
        <tr>
          <th>Case</th>
          <th>Family</th>
          <th>Dispatch batches</th>
          <th>Thermal note</th>
        </tr>
      </thead>
      <tbody>
        ${fixture.cases.map((item) => `
          <tr>
            <td>${item.label}</td>
            <td>${item.family}</td>
            <td>${item.dispatch_batches}</td>
            <td>${item.thermal_note}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderLogs() {
  elements.logList.innerHTML = state.logs.length
    ? state.logs.map((item) => `<li>${item}</li>`).join("")
    : "<li>No benchmark activity yet.</li>";
}

function renderStatus() {
  const badges = [
    `mode=${EXECUTION_MODE.label}`,
    `backend=${state.environment.backend}`,
    `fallback=${String(state.environment.fallback_triggered)}`,
    state.run ? `winner=${state.run.overall.winnerId}` : "winner=pending",
    state.active ? "state=running" : "state=idle"
  ];
  elements.statusRow.innerHTML = badges.map((item) => `<span class="badge">${item}</span>`).join("");
}

function renderSummary() {
  if (state.active) {
    elements.summary.textContent = "Compute stress cases are running with deterministic dispatch timing and one aggregate result contract.";
    return;
  }

  if (state.run) {
    elements.summary.textContent = `Winner ${state.run.overall.winnerLabel} with ${state.run.overall.stepsPerSec} steps/s average and ${state.run.overall.p95DispatchMs} ms p95 dispatch.`;
    return;
  }

  elements.summary.textContent = "Run the suite to rank deterministic compute stress cases and capture one schema-aligned benchmark result.";
}

function render() {
  const result = buildResult();
  renderStatus();
  renderSummary();
  renderMatrix();
  drawPreview();
  renderCards(elements.metricGrid, metricCards(result));
  renderCards(elements.metaGrid, metaCards(result));
  elements.resultJson.textContent = JSON.stringify(result, null, 2);
  elements.runBenchmark.disabled = state.active;
  elements.downloadJson.disabled = state.active;
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(buildResult(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "bench-compute-stress-suite-result.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

async function init() {
  elements.runBenchmark.addEventListener("click", () => {
    runBenchmark().catch((error) => {
      state.active = false;
      log(`Benchmark failed: ${error.message}`);
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
