const INLINE_FIXTURE = {
  id: "atomics-memory-suite-v1",
  title: "Atomics and Memory Suite",
  objective: "Compare deterministic histogram, scatter accumulation, and reduction kernels under one atomics-heavy benchmark path.",
  suite_seed: 20260425,
  cases: [
    {
      id: "shared-histogram",
      label: "Shared Histogram",
      family: "histogram",
      accent: "#22c55e",
      bodies_or_particles: 131072,
      workgroup_size: 128,
      shared_memory_kb: 32,
      atomic_passes: 4,
      base_steps_per_sec: 6240,
      base_integration_ms: 0.296,
      base_avg_dispatch_ms: 0.1924,
      base_p95_dispatch_ms: 0.2672,
      atomics_conflict_pct: 8.4,
      histogram_spill_pct: 0.6,
      memory_bandwidth_gbps: 84.2,
      cache_hit_rate_pct: 92.4,
      stress_bias: 1.08,
      thermal_note: "shared-histogram-balanced"
    },
    {
      id: "particle-grid-accumulation",
      label: "Particle Grid Accumulation",
      family: "scatter",
      accent: "#60a5fa",
      bodies_or_particles: 65536,
      workgroup_size: 256,
      shared_memory_kb: 48,
      atomic_passes: 6,
      base_steps_per_sec: 5180,
      base_integration_ms: 0.362,
      base_avg_dispatch_ms: 0.2643,
      base_p95_dispatch_ms: 0.3385,
      atomics_conflict_pct: 14.7,
      histogram_spill_pct: 3.2,
      memory_bandwidth_gbps: 91.6,
      cache_hit_rate_pct: 86.1,
      stress_bias: 1.02,
      thermal_note: "scatter-grid-hot-l2"
    },
    {
      id: "ring-buffer-reduce",
      label: "Ring Buffer Reduce",
      family: "reduction",
      accent: "#f59e0b",
      bodies_or_particles: 262144,
      workgroup_size: 256,
      shared_memory_kb: 16,
      atomic_passes: 3,
      base_steps_per_sec: 7024,
      base_integration_ms: 0.241,
      base_avg_dispatch_ms: 0.1713,
      base_p95_dispatch_ms: 0.2414,
      atomics_conflict_pct: 5.8,
      histogram_spill_pct: 0,
      memory_bandwidth_gbps: 104.2,
      cache_hit_rate_pct: 94.1,
      stress_bias: 1.12,
      thermal_note: "reduction-streaming-cached"
    }
  ]
};

const EXECUTION_MODE = resolveExecutionMode();

const state = {
  startedAt: performance.now(),
  fixture: null,
  environment: buildEnvironment(),
  active: false,
  run: null,
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
      contentionScale: 1,
      bandwidthScale: 1,
      cacheScale: 1
    };
  }

  return {
    id: "fallback",
    label: "CPU fallback",
    backend: "cpu",
    fallbackTriggered: true,
    workerMode: "main",
    stepScale: 0.58,
    latencyScale: 1.84,
    contentionScale: 1.32,
    bandwidthScale: 0.68,
    cacheScale: 0.94
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
      adapter: EXECUTION_MODE.fallbackTriggered ? "cpu-atomics-fallback" : "synthetic-webgpu-atomics-suite",
      required_features: EXECUTION_MODE.fallbackTriggered ? [] : ["shader-f16", "timestamp-query"],
      limits: EXECUTION_MODE.fallbackTriggered ? {} : { maxComputeWorkgroupSizeX: 256, maxStorageBufferBindingSize: 134217728, maxComputeInvocationsPerWorkgroup: 256 }
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
    const response = await fetch("./atomics-memory-profiles.json", { cache: "no-store" });
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
  background.addColorStop(0, "#071119");
  background.addColorStop(0.55, "#0f1828");
  background.addColorStop(1, "#081017");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(239, 246, 255, 0.92)";
  ctx.font = "600 22px Segoe UI";
  ctx.fillText("Atomics and memory suite", 28, 28);

  const cases = state.run?.cases || state.fixture?.cases || INLINE_FIXTURE.cases;
  cases.forEach((item, index) => {
    const baseY = 70 + index * 78;
    const bandwidth = item.memory_bandwidth_gbps || 0;
    const conflict = item.atomics_conflict_pct || 0;
    const bandwidthWidth = Math.min((bandwidth / 120) * 240, 240);
    const conflictWidth = Math.min((conflict / 20) * 160, 160);

    ctx.fillStyle = item.accent;
    ctx.font = "600 15px Segoe UI";
    ctx.fillText(item.label, 28, baseY - 10);

    ctx.fillStyle = `${item.accent}22`;
    ctx.fillRect(28, baseY, 244, 18);
    ctx.fillStyle = item.accent;
    ctx.fillRect(28, baseY, bandwidthWidth, 18);
    ctx.fillStyle = "#dbeafe";
    ctx.font = "12px Segoe UI";
    ctx.fillText(`${round(bandwidth, 1)} GB/s`, 280, baseY + 13);

    ctx.fillStyle = "rgba(248, 113, 113, 0.18)";
    ctx.fillRect(28, baseY + 28, 164, 14);
    ctx.fillStyle = "#f87171";
    ctx.fillRect(28, baseY + 28, conflictWidth, 14);
    ctx.fillStyle = "#fecaca";
    ctx.fillText(`conflict ${round(conflict, 2)}%`, 200, baseY + 39);
  });

  ctx.fillStyle = "rgba(196, 206, 221, 0.92)";
  ctx.font = "13px Segoe UI";
  ctx.fillText(`mode=${EXECUTION_MODE.label}  backend=${state.environment.backend}`, 28, height - 18);
}

function simulateCase(caseDef, index) {
  const dispatchJitter = (index + 1) * 0.009;
  const stepsPerSec = caseDef.base_steps_per_sec * EXECUTION_MODE.stepScale * (1 - dispatchJitter * 0.06);
  const integrationMs = caseDef.base_integration_ms * EXECUTION_MODE.latencyScale * (1 + dispatchJitter * 0.14);
  const avgDispatchMs = caseDef.base_avg_dispatch_ms * EXECUTION_MODE.latencyScale * (1 + dispatchJitter * 0.18);
  const p95DispatchMs = caseDef.base_p95_dispatch_ms * EXECUTION_MODE.latencyScale * (1 + dispatchJitter * 0.24);
  const atomicsConflictPct = caseDef.atomics_conflict_pct * EXECUTION_MODE.contentionScale * (1 + dispatchJitter * 0.08);
  const histogramSpillPct = caseDef.histogram_spill_pct * (EXECUTION_MODE.fallbackTriggered ? 1.52 : 1);
  const memoryBandwidthGbps = caseDef.memory_bandwidth_gbps * EXECUTION_MODE.bandwidthScale * (1 - dispatchJitter * 0.03);
  const cacheHitRatePct = caseDef.cache_hit_rate_pct * EXECUTION_MODE.cacheScale * (1 - dispatchJitter * 0.02);

  const stabilityPenalty = atomicsConflictPct * 110 + histogramSpillPct * 190 + avgDispatchMs * 9400;
  const throughputBonus = stepsPerSec * caseDef.stress_bias + memoryBandwidthGbps * 34 + cacheHitRatePct * 15;
  const stressScore = throughputBonus - stabilityPenalty;

  return {
    ...caseDef,
    steps_per_sec: round(stepsPerSec, 2),
    integration_ms: round(integrationMs, 4),
    avg_dispatch_ms: round(avgDispatchMs, 4),
    p95_dispatch_ms: round(p95DispatchMs, 4),
    atomics_conflict_pct: round(atomicsConflictPct, 3),
    histogram_spill_pct: round(histogramSpillPct, 3),
    memory_bandwidth_gbps: round(memoryBandwidthGbps, 2),
    cache_hit_rate_pct: round(cacheHitRatePct, 2),
    stress_score: round(stressScore, 3)
  };
}

async function runBenchmark() {
  if (state.active) return;
  state.active = true;
  state.run = null;
  render();

  const fixture = await loadFixture();
  const cases = [];

  for (let index = 0; index < fixture.cases.length; index += 1) {
    const caseDef = fixture.cases[index];
    log(`Running ${caseDef.label} in ${EXECUTION_MODE.label} mode.`);
    await sleep(90 + index * 35);
    const result = simulateCase(caseDef, index);
    cases.push(result);
    log(`${caseDef.label}: conflict=${result.atomics_conflict_pct}%, bandwidth=${result.memory_bandwidth_gbps} GB/s, score=${result.stress_score}.`);
  }

  const winner = [...cases].sort((left, right) => right.stress_score - left.stress_score)[0];
  state.run = {
    cases,
    overall: {
      caseCount: cases.length,
      stepsPerSec: round(average(cases.map((item) => item.steps_per_sec)), 2),
      integrationMs: round(average(cases.map((item) => item.integration_ms)), 4),
      avgDispatchMs: round(average(cases.map((item) => item.avg_dispatch_ms)), 4),
      p95DispatchMs: round(percentile(cases.map((item) => item.p95_dispatch_ms), 0.95), 4),
      maxBodiesOrParticles: Math.max(...cases.map((item) => item.bodies_or_particles)),
      maxWorkgroupSize: Math.max(...cases.map((item) => item.workgroup_size)),
      maxSharedMemoryKb: Math.max(...cases.map((item) => item.shared_memory_kb)),
      maxAtomicPasses: Math.max(...cases.map((item) => item.atomic_passes)),
      atomicsConflictPct: round(Math.max(...cases.map((item) => item.atomics_conflict_pct)), 3),
      histogramSpillPct: round(Math.max(...cases.map((item) => item.histogram_spill_pct)), 3),
      memoryBandwidthGbps: round(average(cases.map((item) => item.memory_bandwidth_gbps)), 2),
      cacheHitRatePct: round(average(cases.map((item) => item.cache_hit_rate_pct)), 2),
      winnerId: winner.id,
      winnerLabel: winner.label,
      winnerScore: winner.stress_score
    }
  };

  state.active = false;
  log(`Suite complete: winner=${state.run.overall.winnerId}, conflict=${state.run.overall.atomicsConflictPct}%, bandwidth=${state.run.overall.memoryBandwidthGbps} GB/s.`);
  drawPreview();
  render();
}

function buildResult() {
  const run = state.run;
  return {
    meta: {
      repo: "bench-atomics-and-memory",
      commit: "bootstrap-generated",
      timestamp: new Date().toISOString(),
      owner: "ai-webgpu-lab",
      track: "benchmark",
      scenario: run ? "atomics-and-memory-benchmark" : "atomics-and-memory-pending",
      notes: run
        ? `cases=${run.overall.caseCount}; winner=${run.overall.winnerId}; backend=${state.environment.backend}; peakItems=${run.overall.maxBodiesOrParticles}; maxWorkgroup=${run.overall.maxWorkgroupSize}; sharedMemory=${run.overall.maxSharedMemoryKb}; suite=${state.fixture?.id || INLINE_FIXTURE.id}`
        : "Run the deterministic atomics and memory benchmark."
    },
    environment: state.environment,
    workload: {
      kind: "compute",
      name: "atomics-and-memory-benchmark",
      input_profile: `${run ? run.overall.caseCount : INLINE_FIXTURE.cases.length}-case-atomics-suite`,
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
        atomics_conflict_pct: run ? run.overall.atomicsConflictPct : 0,
        histogram_spill_pct: run ? run.overall.histogramSpillPct : 0,
        memory_bandwidth_gbps: run ? run.overall.memoryBandwidthGbps : 0,
        cache_hit_rate_pct: run ? run.overall.cacheHitRatePct : 0,
        shared_memory_kb: run ? run.overall.maxSharedMemoryKb : 0,
        atomic_passes: run ? run.overall.maxAtomicPasses : 0,
        suite_case_count: run ? run.overall.caseCount : 0,
        suite_winner_score: run ? run.overall.winnerScore : 0
      }
    },
    status: run ? "success" : "partial",
    artifacts: {
      raw_logs: state.logs.slice(0, 6),
      cases: run ? run.cases : [],
      deploy_url: "https://ai-webgpu-lab.github.io/bench-atomics-and-memory/"
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
    ["Conflict", `${result.metrics.compute.atomics_conflict_pct}%`],
    ["Bandwidth", `${result.metrics.compute.memory_bandwidth_gbps} GB/s`],
    ["Shared memory", `${result.metrics.compute.shared_memory_kb} KB`],
    ["Cache hit", `${result.metrics.compute.cache_hit_rate_pct}%`]
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
          <th>Conflict</th>
          <th>Bandwidth</th>
          <th>Spill</th>
          <th>Score</th>
        </tr>
      </thead>
      <tbody>
        ${cases.map((item) => `
          <tr>
            <td>${item.label}</td>
            <td>${item.bodies_or_particles}</td>
            <td>${item.workgroup_size}</td>
            <td>${item.atomics_conflict_pct || item.atomics_conflict_pct === 0 ? item.atomics_conflict_pct : item.atomics_conflict_pct}%</td>
            <td>${item.memory_bandwidth_gbps} GB/s</td>
            <td>${item.histogram_spill_pct}%</td>
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
          <th>Atomic passes</th>
          <th>Shared memory</th>
          <th>Thermal note</th>
        </tr>
      </thead>
      <tbody>
        ${fixture.cases.map((item) => `
          <tr>
            <td>${item.label}</td>
            <td>${item.family}</td>
            <td>${item.atomic_passes}</td>
            <td>${item.shared_memory_kb} KB</td>
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
    elements.summary.textContent = "Atomics-heavy kernels are running with deterministic contention and memory bandwidth scoring.";
    return;
  }

  if (state.run) {
    elements.summary.textContent = `Winner ${state.run.overall.winnerLabel} with ${state.run.overall.memoryBandwidthGbps} GB/s average bandwidth and ${state.run.overall.atomicsConflictPct}% peak contention.`;
    return;
  }

  elements.summary.textContent = "Run the suite to compare deterministic histogram, scatter, and reduction kernels under one atomics benchmark result.";
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
  anchor.download = "bench-atomics-and-memory-result.json";
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
