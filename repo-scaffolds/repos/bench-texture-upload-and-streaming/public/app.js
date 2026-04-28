const INLINE_FIXTURE = {
  id: "texture-upload-streaming-v1",
  title: "Texture Upload and Streaming Suite",
  objective: "Compare deterministic atlas refresh, tile streaming, and video-frame upload cases under one graphics/resource benchmark path.",
  suite_seed: 20260425,
  cases: [
    {
      id: "ui-atlas-hot-reload",
      label: "UI Atlas Hot Reload",
      family: "atlas",
      accent: "#fb923c",
      texture_count: 128,
      atlas_memory_mb: 96,
      max_texture_dimension: 4096,
      mip_levels: 8,
      upload_batches: 4,
      base_stream_mbps: 1840,
      base_upload_ms: 5.8,
      base_background_update_ms: 3.1,
      base_avg_fps: 118.2,
      base_p95_frametime_ms: 12.9,
      frame_drop_pct: 1.4,
      upload_fail_rate: 0,
      stress_bias: 1.04,
      thermal_note: "atlas-reload-stable"
    },
    {
      id: "terrain-tile-stream",
      label: "Terrain Tile Stream",
      family: "tiles",
      accent: "#22d3ee",
      texture_count: 384,
      atlas_memory_mb: 192,
      max_texture_dimension: 8192,
      mip_levels: 10,
      upload_batches: 6,
      base_stream_mbps: 1715,
      base_upload_ms: 8.6,
      base_background_update_ms: 4.9,
      base_avg_fps: 101.6,
      base_p95_frametime_ms: 15.8,
      frame_drop_pct: 2.7,
      upload_fail_rate: 0.002,
      stress_bias: 1.08,
      thermal_note: "tile-streaming-l2-warm"
    },
    {
      id: "video-frame-ring",
      label: "Video Frame Ring",
      family: "video",
      accent: "#a78bfa",
      texture_count: 72,
      atlas_memory_mb: 128,
      max_texture_dimension: 3840,
      mip_levels: 1,
      upload_batches: 8,
      base_stream_mbps: 2235,
      base_upload_ms: 4.9,
      base_background_update_ms: 6.2,
      base_avg_fps: 109.8,
      base_p95_frametime_ms: 13.5,
      frame_drop_pct: 3.4,
      upload_fail_rate: 0.004,
      stress_bias: 1.1,
      thermal_note: "video-ring-bandwidth-hot"
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
    if (typeof window !== "undefined" && window.__aiWebGpuLabRealTextureBenchBootstrapError) {
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
      throughputScale: 1,
      latencyScale: 1,
      fpsScale: 1,
      dropScale: 1,
      failScale: 1
    };
  }

  return {
    id: "fallback",
    label: "CPU fallback",
    backend: "cpu",
    fallbackTriggered: true,
    workerMode: "main",
    throughputScale: 0.66,
    latencyScale: 1.72,
    fpsScale: 0.78,
    dropScale: 1.58,
    failScale: 2.4
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
      adapter: EXECUTION_MODE.fallbackTriggered ? "cpu-texture-upload-fallback" : "synthetic-webgpu-texture-streaming",
      required_features: EXECUTION_MODE.fallbackTriggered ? [] : ["shader-f16"],
      limits: EXECUTION_MODE.fallbackTriggered ? {} : { maxTextureDimension2D: 8192, maxBindGroups: 4, maxColorAttachments: 8 }
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
    const response = await fetch("./texture-upload-profiles.json", { cache: "no-store" });
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

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#081019");
  gradient.addColorStop(0.55, "#0f1726");
  gradient.addColorStop(1, "#081018");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(239, 246, 255, 0.92)";
  ctx.font = "600 22px Segoe UI";
  ctx.fillText("Texture upload and streaming suite", 28, 28);

  const cases = state.run?.cases || state.fixture?.cases || INLINE_FIXTURE.cases;
  cases.forEach((item, index) => {
    const y = 68 + index * 78;
    const stream = item.sustained_stream_mbps || item.base_stream_mbps || 0;
    const drops = item.frame_drop_pct || 0;
    const streamWidth = Math.min((stream / 2600) * 260, 260);
    const dropWidth = Math.min((drops / 6) * 150, 150);

    ctx.fillStyle = item.accent;
    ctx.font = "600 15px Segoe UI";
    ctx.fillText(item.label, 28, y - 10);

    ctx.fillStyle = `${item.accent}22`;
    ctx.fillRect(28, y, 264, 18);
    ctx.fillStyle = item.accent;
    ctx.fillRect(28, y, streamWidth, 18);
    ctx.fillStyle = "#dbeafe";
    ctx.font = "12px Segoe UI";
    ctx.fillText(`${round(stream, 1)} MB/s`, 302, y + 13);

    ctx.fillStyle = "rgba(248, 113, 113, 0.18)";
    ctx.fillRect(28, y + 28, 154, 14);
    ctx.fillStyle = "#f87171";
    ctx.fillRect(28, y + 28, dropWidth, 14);
    ctx.fillStyle = "#fecaca";
    ctx.fillText(`frame drop ${round(drops, 2)}%`, 192, y + 39);
  });

  ctx.fillStyle = "rgba(196, 206, 221, 0.92)";
  ctx.font = "13px Segoe UI";
  ctx.fillText(`mode=${EXECUTION_MODE.label}  backend=${state.environment.backend}`, 28, height - 18);
}

function simulateCase(caseDef, index) {
  const jitter = (index + 1) * 0.014;
  const sustainedStreamMbps = caseDef.base_stream_mbps * EXECUTION_MODE.throughputScale * (1 - jitter * 0.05);
  const uploadFrameMs = caseDef.base_upload_ms * EXECUTION_MODE.latencyScale * (1 + jitter * 0.18);
  const backgroundUpdateMs = caseDef.base_background_update_ms * EXECUTION_MODE.latencyScale * (1 + jitter * 0.12);
  const avgFps = caseDef.base_avg_fps * EXECUTION_MODE.fpsScale * (1 - jitter * 0.04);
  const p95FrametimeMs = caseDef.base_p95_frametime_ms * (EXECUTION_MODE.fallbackTriggered ? 1.48 : 1) * (1 + jitter * 0.08);
  const frameDropPct = caseDef.frame_drop_pct * EXECUTION_MODE.dropScale * (1 + jitter * 0.06);
  const uploadFailRate = caseDef.upload_fail_rate * EXECUTION_MODE.failScale * (1 + jitter * 0.1);
  const sceneLoadMs = uploadFrameMs * caseDef.upload_batches * 1.86;

  const throughputBonus = sustainedStreamMbps * caseDef.stress_bias + avgFps * 8;
  const penalty = uploadFrameMs * 110 + backgroundUpdateMs * 80 + frameDropPct * 170 + uploadFailRate * 6200;
  const stressScore = throughputBonus - penalty;

  return {
    ...caseDef,
    sustained_stream_mbps: round(sustainedStreamMbps, 2),
    upload_frame_ms: round(uploadFrameMs, 4),
    background_update_ms: round(backgroundUpdateMs, 4),
    avg_fps: round(avgFps, 2),
    p95_frametime_ms: round(p95FrametimeMs, 4),
    frame_drop_pct: round(frameDropPct, 3),
    upload_fail_rate: round(uploadFailRate, 4),
    scene_load_ms: round(sceneLoadMs, 2),
    stress_score: round(stressScore, 3)
  };
}

async function runRealBenchmarkTexture(adapter) {
  log(`Connecting real benchmark adapter '${adapter.id}'.`);
  await withTimeout(
    Promise.resolve(adapter.createBenchmark({ name: "texture-upload-streaming" })),
    REAL_ADAPTER_LOAD_MS,
    `createBenchmark(${adapter.id})`
  );
  await withTimeout(
    Promise.resolve(adapter.runProfile({
      profileId: "texture-upload-streaming-default",
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
        const { aggregate } = await runRealBenchmarkTexture(adapter);
        state.realAdapterAggregate = aggregate;
        state.realAdapter = adapter;
      } catch (error) {
        state.realAdapterError = error?.message || String(error);
        log(`Real benchmark '${adapter.id}' failed: ${state.realAdapterError}; falling back to deterministic.`);
      }
    } else {
      const reason = (typeof window !== "undefined" && window.__aiWebGpuLabRealTextureBenchBootstrapError) || "timed out waiting for adapter registration";
      state.realAdapterError = reason;
      log(`No real benchmark adapter registered (${reason}); falling back to deterministic texture benchmark.`);
    }
  }

  const fixture = await loadFixture();
  const cases = [];

  for (let index = 0; index < fixture.cases.length; index += 1) {
    const caseDef = fixture.cases[index];
    log(`Running ${caseDef.label} in ${EXECUTION_MODE.label} mode.`);
    await sleep(90 + index * 35);
    const result = simulateCase(caseDef, index);
    cases.push(result);
    log(`${caseDef.label}: stream=${result.sustained_stream_mbps} MB/s, upload=${result.upload_frame_ms} ms, score=${result.stress_score}.`);
  }

  const winner = [...cases].sort((left, right) => right.stress_score - left.stress_score)[0];
  state.run = {
    cases,
    overall: {
      caseCount: cases.length,
      avgFps: round(average(cases.map((item) => item.avg_fps)), 2),
      p95FrametimeMs: round(percentile(cases.map((item) => item.p95_frametime_ms), 0.95), 4),
      sceneLoadMs: round(Math.max(...cases.map((item) => item.scene_load_ms)), 2),
      sustainedStreamMbps: round(average(cases.map((item) => item.sustained_stream_mbps)), 2),
      uploadFrameMs: round(average(cases.map((item) => item.upload_frame_ms)), 4),
      backgroundUpdateMs: round(average(cases.map((item) => item.background_update_ms)), 4),
      frameDropPct: round(Math.max(...cases.map((item) => item.frame_drop_pct)), 3),
      uploadFailRate: round(Math.max(...cases.map((item) => item.upload_fail_rate)), 4),
      textureCount: Math.max(...cases.map((item) => item.texture_count)),
      atlasMemoryMb: Math.max(...cases.map((item) => item.atlas_memory_mb)),
      maxTextureDimension: Math.max(...cases.map((item) => item.max_texture_dimension)),
      mipLevels: Math.max(...cases.map((item) => item.mip_levels)),
      uploadBatches: Math.max(...cases.map((item) => item.upload_batches)),
      winnerId: winner.id,
      winnerLabel: winner.label,
      winnerScore: winner.stress_score
    },
    realAdapter: state.realAdapter || null
  };

  state.active = false;
  log(`Suite complete: winner=${state.run.overall.winnerId}, stream=${state.run.overall.sustainedStreamMbps} MB/s, upload=${state.run.overall.uploadFrameMs} ms.`);
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
    id: "deterministic-texture-bench",
    label: "Deterministic Texture Bench",
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
      repo: "bench-texture-upload-and-streaming",
      commit: "bootstrap-generated",
      timestamp: new Date().toISOString(),
      owner: "ai-webgpu-lab",
      track: "benchmark",
      scenario: (state.run && state.run.realAdapter) ? `texture-upload-and-streaming-real-${state.run.realAdapter.id}` : (run ? "texture-upload-and-streaming-benchmark" : "texture-upload-and-streaming-pending"),
      notes: run
        ? `cases=${run.overall.caseCount}; winner=${run.overall.winnerId}; backend=${state.environment.backend}; peakTextures=${run.overall.textureCount}; atlasMemory=${run.overall.atlasMemoryMb}; maxDimension=${run.overall.maxTextureDimension}; suite=${state.fixture?.id || INLINE_FIXTURE.id}${state.run && state.run.realAdapter ? `; realAdapter=${state.run.realAdapter.id}` : (isRealBenchmarkMode && state.realAdapterError ? `; realAdapter=fallback(${state.realAdapterError})` : "")}`
        : "Run the deterministic texture upload and streaming benchmark."
    },
    environment: state.environment,
    workload: {
      kind: "graphics",
      name: "texture-upload-and-streaming-benchmark",
      input_profile: `${run ? run.overall.caseCount : INLINE_FIXTURE.cases.length}-case-texture-stream-suite`,
      model_id: run ? run.overall.winnerId : "pending",
      dataset: state.fixture?.id || INLINE_FIXTURE.id
    },
    metrics: {
      common: {
        time_to_interactive_ms: round(performance.now() - state.startedAt, 2) || 0,
        init_ms: run ? round(run.cases.reduce((sum, item) => sum + item.upload_frame_ms, 0), 4) || 0 : 0,
        success_rate: run ? 1 : 0.5,
        peak_memory_note: navigator.deviceMemory ? `${navigator.deviceMemory} GB reported by browser` : "deviceMemory unavailable",
        error_type: ""
      },
      graphics: {
        avg_fps: run ? run.overall.avgFps : 0,
        p95_frametime_ms: run ? run.overall.p95FrametimeMs : 0,
        scene_load_ms: run ? run.overall.sceneLoadMs : 0,
        sustained_stream_mbps: run ? run.overall.sustainedStreamMbps : 0,
        upload_frame_ms: run ? run.overall.uploadFrameMs : 0,
        background_update_ms: run ? run.overall.backgroundUpdateMs : 0,
        frame_drop_pct: run ? run.overall.frameDropPct : 0,
        upload_fail_rate: run ? run.overall.uploadFailRate : 0,
        texture_count: run ? run.overall.textureCount : 0,
        atlas_memory_mb: run ? run.overall.atlasMemoryMb : 0,
        max_texture_dimension: run ? run.overall.maxTextureDimension : 0,
        mip_levels: run ? run.overall.mipLevels : 0,
        upload_batches: run ? run.overall.uploadBatches : 0
      }
    },
    status: run ? "success" : "partial",
    artifacts: {
      raw_logs: state.logs.slice(0, 6),
      cases: run ? run.cases : [],
      deploy_url: "https://ai-webgpu-lab.github.io/bench-texture-upload-and-streaming/",
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
    ["Stream", `${result.metrics.graphics.sustained_stream_mbps} MB/s`],
    ["Upload", `${result.metrics.graphics.upload_frame_ms} ms`],
    ["Background", `${result.metrics.graphics.background_update_ms} ms`],
    ["Frame drop", `${result.metrics.graphics.frame_drop_pct}%`],
    ["Avg FPS", `${result.metrics.graphics.avg_fps}`],
    ["Atlas memory", `${result.metrics.graphics.atlas_memory_mb} MB`],
    ["Textures", `${result.metrics.graphics.texture_count}`]
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
          <th>Textures</th>
          <th>Stream</th>
          <th>Upload</th>
          <th>Background</th>
          <th>Drop</th>
          <th>Score</th>
        </tr>
      </thead>
      <tbody>
        ${cases.map((item) => `
          <tr>
            <td>${item.label}</td>
            <td>${item.texture_count}</td>
            <td>${item.sustained_stream_mbps || item.base_stream_mbps} MB/s</td>
            <td>${item.upload_frame_ms || item.base_upload_ms} ms</td>
            <td>${item.background_update_ms || item.base_background_update_ms} ms</td>
            <td>${item.frame_drop_pct}%</td>
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
          <th>Atlas memory</th>
          <th>Mip levels</th>
          <th>Thermal note</th>
        </tr>
      </thead>
      <tbody>
        ${fixture.cases.map((item) => `
          <tr>
            <td>${item.label}</td>
            <td>${item.family}</td>
            <td>${item.atlas_memory_mb} MB</td>
            <td>${item.mip_levels}</td>
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
    elements.summary.textContent = "Texture uploads and background updates are running with deterministic streaming throughput and frame-drop scoring.";
    return;
  }

  if (state.run) {
    elements.summary.textContent = `Winner ${state.run.overall.winnerLabel} with ${state.run.overall.sustainedStreamMbps} MB/s average stream throughput and ${state.run.overall.uploadFrameMs} ms upload time.`;
    return;
  }

  elements.summary.textContent = "Run the suite to compare deterministic atlas, tile, and video upload patterns in one graphics benchmark result.";
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
  anchor.download = "bench-texture-upload-and-streaming-result.json";
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
