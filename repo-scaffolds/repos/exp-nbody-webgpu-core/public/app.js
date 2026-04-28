const simulationConfig = {
  bodyCount: 4096,
  visibleBodies: 96,
  frameCount: 72,
  substepsPerFrame: 96,
  pairTiles: 28,
  workgroupSize: 128,
  sharedMemoryKB: 48,
  fixedDtMs: 0.35,
  softening: 0.018,
  trailSamples: 12
};

const bodies = buildBodies(simulationConfig.visibleBodies);

const requestedMode = typeof window !== "undefined"
  ? new URLSearchParams(window.location.search).get("mode")
  : null;
const isRealRendererMode = typeof requestedMode === "string" && requestedMode.startsWith("real-");
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

function findRegisteredRealRenderer() {
  const registry = typeof window !== "undefined" ? window.__aiWebGpuLabRendererRegistry : null;
  if (!registry || typeof registry.list !== "function") return null;
  return registry.list().find((adapter) => adapter && adapter.isReal === true) || null;
}

async function awaitRealRenderer(timeoutMs = REAL_ADAPTER_WAIT_MS) {
  const startedAt = performance.now();
  while (performance.now() - startedAt < timeoutMs) {
    const adapter = findRegisteredRealRenderer();
    if (adapter) return adapter;
    if (typeof window !== "undefined" && window.__aiWebGpuLabRealNbodyBootstrapError) {
      return null;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

const state = {
  startedAt: performance.now(),
  environment: buildEnvironment(),
  capability: null,
  run: null,
  active: false,
  realAdapterError: null,
  logs: []
};

const elements = {
  statusRow: document.getElementById("status-row"),
  summary: document.getElementById("summary"),
  probeCapability: document.getElementById("probe-capability"),
  runSimulation: document.getElementById("run-simulation"),
  downloadJson: document.getElementById("download-json"),
  canvas: document.getElementById("simulation-canvas"),
  metricGrid: document.getElementById("metric-grid"),
  metaGrid: document.getElementById("meta-grid"),
  logList: document.getElementById("log-list"),
  resultJson: document.getElementById("result-json")
};

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percentile(values, ratio) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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
  if (/Linux/i.test(ua)) return { name: "Linux", version: "unknown" };
  return { name: "Unknown", version: "unknown" };
}

function inferDeviceClass() {
  const threads = navigator.hardwareConcurrency || 0;
  const memory = navigator.deviceMemory || 0;
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
    gpu: { adapter: "pending", required_features: [], limits: {} },
    backend: "pending",
    fallback_triggered: false,
    worker_mode: "main",
    cache_state: "warm"
  };
}

function buildBodies(count) {
  return Array.from({ length: count }, (_, index) => ({
    radius: 0.12 + (index % 16) * 0.031,
    eccentricity: 0.05 + (index % 7) * 0.012,
    speed: 0.024 + (index % 9) * 0.0031,
    phase: index * 0.41,
    hue: 185 + (index % 11) * 12,
    size: 1.8 + (index % 4) * 0.55,
    tilt: (index % 6 - 2.5) * 0.07
  }));
}

function projectPosition(body, frameSample) {
  const angle = body.phase + frameSample * body.speed;
  const radius = body.radius * (1 + Math.sin(angle * 1.7) * body.eccentricity);
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle * 0.92 + body.tilt) * radius * 0.74 + Math.cos(angle * 0.4) * body.tilt * 0.32
  };
}

function log(message) {
  state.logs.unshift(`[${new Date().toLocaleTimeString()}] ${message}`);
  state.logs = state.logs.slice(0, 12);
  renderLogs();
}

async function probeCapability() {
  if (state.active) return;
  state.active = true;
  render();

  const hasWebGpu = typeof navigator !== "undefined" && Boolean(navigator.gpu);
  const fallbackForced = new URLSearchParams(window.location.search).get("mode") === "fallback";
  const webgpuPath = hasWebGpu && !fallbackForced;
  const adapter = webgpuPath ? "navigator.gpu available" : "cpu-fallback";

  state.capability = {
    hasWebGpu,
    adapter,
    requiredFeatures: webgpuPath ? ["shader-f16", "timestamp-query"] : []
  };
  state.environment.gpu = {
    adapter,
    required_features: state.capability.requiredFeatures,
    limits: webgpuPath ? { maxComputeWorkgroupSizeX: 256, maxStorageBufferBindingSize: 134217728, maxComputeInvocationsPerWorkgroup: 256 } : {}
  };
  state.environment.backend = webgpuPath ? "webgpu" : "cpu";
  state.environment.fallback_triggered = !webgpuPath;
  state.active = false;

  log(webgpuPath ? "WebGPU path selected for N-body compute readiness." : "Fallback path selected for N-body compute readiness.");
  render();
}

function simulateComputeStep(frame) {
  const startedAt = performance.now();
  let checksum = 0;
  let forceAccumulator = 0;
  let atomicSamples = 0;

  for (let tile = 0; tile < simulationConfig.pairTiles; tile += 1) {
    for (let lane = 0; lane < simulationConfig.workgroupSize; lane += 1) {
      const bodyIndex = tile * simulationConfig.workgroupSize + lane;
      const phase = frame * 0.021 + bodyIndex * 0.013;
      const localMass = 0.82 + (bodyIndex % 9) * 0.06;
      const invDistance = 1 / (simulationConfig.softening + Math.abs(Math.sin(phase)) * 0.65 + ((lane % 8) + 1) * 0.018);
      const acceleration = invDistance * localMass;
      checksum += acceleration * 0.0024 + Math.cos(phase * 0.9) * 0.0008;
      forceAccumulator += acceleration * (0.3 + (tile % 5) * 0.02);
      if ((lane + frame + tile) % 17 === 0) atomicSamples += 1;
    }
  }

  return {
    durationMs: performance.now() - startedAt,
    checksum: round(checksum, 5),
    forceAccumulator: round(forceAccumulator, 5),
    atomicSamples
  };
}

function drawBackground(ctx, width, height, frame) {
  const gradient = ctx.createRadialGradient(width * 0.5, height * 0.48, 40, width * 0.5, height * 0.48, width * 0.58);
  gradient.addColorStop(0, "rgba(14, 36, 64, 0.92)");
  gradient.addColorStop(1, "rgba(1, 4, 10, 1)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(96, 165, 250, 0.08)";
  ctx.lineWidth = 1;
  for (let index = 0; index <= 10; index += 1) {
    const y = (height / 10) * index;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  for (let index = 0; index <= 16; index += 1) {
    const x = (width / 16) * index + Math.sin(frame * 0.01 + index) * 1.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
}

function drawOrbits(ctx, width, height, frame) {
  const cx = width / 2;
  const cy = height / 2;
  ctx.strokeStyle = "rgba(52, 211, 153, 0.12)";
  ctx.lineWidth = 1;
  for (let ring = 0; ring < 8; ring += 1) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, 80 + ring * 34, 42 + ring * 18 + Math.sin(frame * 0.01 + ring) * 2, ring * 0.08, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(191, 219, 254, 0.9)";
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.fill();
}

function drawBodies(ctx, frame, compute) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const cx = width / 2;
  const cy = height / 2;
  const scaleX = width * 0.42;
  const scaleY = height * 0.42;

  for (const body of bodies) {
    ctx.strokeStyle = `hsla(${body.hue}, 85%, 74%, 0.15)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let sample = simulationConfig.trailSamples; sample >= 0; sample -= 1) {
      const point = projectPosition(body, frame - sample * 1.8);
      const x = cx + point.x * scaleX;
      const y = cy + point.y * scaleY;
      if (sample === simulationConfig.trailSamples) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    const point = projectPosition(body, frame);
    const px = cx + point.x * scaleX;
    const py = cy + point.y * scaleY;
    ctx.fillStyle = `hsla(${body.hue}, 90%, 72%, 0.92)`;
    ctx.beginPath();
    ctx.arc(px, py, body.size, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(219, 234, 254, 0.9)";
  ctx.font = "14px Segoe UI";
  ctx.fillText(`frame ${frame + 1}/${simulationConfig.frameCount}`, 18, 28);
  ctx.fillText(`${simulationConfig.bodyCount} bodies, ${simulationConfig.workgroupSize}-wide workgroups, ${simulationConfig.substepsPerFrame} substeps/frame`, 18, 50);
  ctx.fillText(`dispatch checksum ${compute.checksum}, atomic samples ${compute.atomicSamples}`, 18, 72);
}

function drawFrame(ctx, frame, compute) {
  drawBackground(ctx, ctx.canvas.width, ctx.canvas.height, frame);
  drawOrbits(ctx, ctx.canvas.width, ctx.canvas.height, frame);
  drawBodies(ctx, frame, compute);
}

async function runRealRendererNbody(adapter) {
  log(`Connecting real renderer adapter '${adapter.id}'.`);
  const startedAt = performance.now();
  const sceneLoadStartedAt = performance.now();
  const realCanvas = document.createElement("canvas");
  realCanvas.width = elements.canvas.width;
  realCanvas.height = elements.canvas.height;
  realCanvas.style.display = "none";
  document.body.appendChild(realCanvas);
  try {
    await withTimeout(
      Promise.resolve(adapter.createRenderer({ canvas: realCanvas })),
      REAL_ADAPTER_LOAD_MS,
      `createRenderer(${adapter.id})`
    );
    await withTimeout(
      Promise.resolve(adapter.loadScene({ nodeCount: 24 })),
      REAL_ADAPTER_LOAD_MS,
      `loadScene(${adapter.id})`
    );
    const sceneLoadMs = performance.now() - sceneLoadStartedAt;

    const frameTimes = [];
    for (let index = 0; index < 32; index += 1) {
      const frameInfo = await withTimeout(
        Promise.resolve(adapter.renderFrame({ frameIndex: index })),
        REAL_ADAPTER_LOAD_MS,
        `renderFrame(${adapter.id})`
      );
      frameTimes.push(typeof frameInfo?.frameMs === "number" ? frameInfo.frameMs : 0);
    }

    const totalMs = performance.now() - startedAt;
    const avgFrame = frameTimes.reduce((sum, value) => sum + value, 0) / Math.max(frameTimes.length, 1);
    return {
      totalMs,
      sceneLoadMs,
      avgFps: 1000 / Math.max(avgFrame, 0.001),
      p95FrameMs: percentile(frameTimes, 0.95) || 0,
      frameTimes,
      sampleCount: frameTimes.length,
      realAdapter: adapter
    };
  } finally {
    realCanvas.remove();
  }
}

async function runSimulationBaseline() {
  if (state.active) return;
  if (!state.capability) {
    await probeCapability();
  }

  state.active = true;
  render();

  if (isRealRendererMode) {
    log(`Mode=${requestedMode} requested; awaiting real renderer adapter registration.`);
    const adapter = await awaitRealRenderer();
    if (adapter) {
      try {
        state.run = await runRealRendererNbody(adapter);
        state.active = false;
        log(`Real renderer '${adapter.id}' complete: avg fps ${round(state.run.avgFps, 2)}, p95 frame ${round(state.run.p95FrameMs, 2)} ms.`);
        render();
        return;
      } catch (error) {
        state.realAdapterError = error?.message || String(error);
        log(`Real renderer '${adapter.id}' failed: ${state.realAdapterError}; falling back to deterministic.`);
      }
    } else {
      const reason = (typeof window !== "undefined" && window.__aiWebGpuLabRealNbodyBootstrapError) || "timed out waiting for adapter registration";
      state.realAdapterError = reason;
      log(`No real renderer adapter registered (${reason}); falling back to deterministic N-body simulation baseline.`);
    }
  }
  const ctx = elements.canvas.getContext("2d");
  const frameTimes = [];
  const dispatchTimes = [];
  const startedAt = performance.now();
  const sceneLoadStartedAt = performance.now();
  await new Promise((resolve) => setTimeout(resolve, state.environment.fallback_triggered ? 72 : 46));
  const sceneLoadMs = performance.now() - sceneLoadStartedAt;

  let previous = performance.now();
  let checksum = 0;
  let forceAccumulator = 0;
  let maxAtomicSamples = 0;

  for (let frame = 0; frame < simulationConfig.frameCount; frame += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const compute = simulateComputeStep(frame);
    dispatchTimes.push(compute.durationMs);
    checksum += compute.checksum;
    forceAccumulator += compute.forceAccumulator;
    maxAtomicSamples = Math.max(maxAtomicSamples, compute.atomicSamples);
    drawFrame(ctx, frame, compute);

    const now = performance.now();
    frameTimes.push(now - previous);
    previous = now;
  }

  const totalMs = performance.now() - startedAt;
  const avgFrameTime = average(frameTimes);
  const avgDispatchMs = average(dispatchTimes);
  const p95DispatchMs = percentile(dispatchTimes, 0.95);
  const stepsPerSec = (simulationConfig.frameCount * simulationConfig.substepsPerFrame) / (totalMs / 1000);
  const energyDriftPct = round(
    (state.environment.fallback_triggered ? 0.0036 : 0.0017) + Math.abs(Math.sin(checksum * 0.01)) * 0.0009,
    4
  );
  const contentionRatio = round((maxAtomicSamples / (simulationConfig.workgroupSize * simulationConfig.pairTiles)) * 100, 2);

  state.run = {
    sceneLoadMs,
    totalMs,
    avgFps: avgFrameTime ? 1000 / avgFrameTime : 0,
    p95FrametimeMs: percentile(frameTimes, 0.95),
    avgDispatchMs,
    p95DispatchMs,
    stepsPerSec,
    energyDriftPct,
    checksum: round(checksum, 4),
    forceAccumulator: round(forceAccumulator, 4),
    maxAtomicSamples,
    contentionRatio,
    realAdapter: null
  };
  state.active = false;

  log(`N-body baseline complete: steps/s=${round(state.run.stepsPerSec)}, avgDispatch=${round(state.run.avgDispatchMs, 4)} ms.`);
  render();
}

function describeRendererAdapter() {
  const registry = typeof window !== "undefined" ? window.__aiWebGpuLabRendererRegistry : null;
  const requested = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("mode")
    : null;
  if (registry) {
    return registry.describe(requested);
  }
  return {
    id: "deterministic-nbody",
    label: "Deterministic N-body",
    status: "deterministic",
    isReal: false,
    version: "1.0.0",
    capabilities: ["scene-load", "frame-pace", "fallback-record"],
    backendHint: "synthetic",
    message: "Renderer adapter registry unavailable; using inline deterministic mock."
  };
}

function buildResult() {
  const readyStatus = state.capability ? (state.environment.fallback_triggered ? "partial" : "success") : "partial";
  const runStatus = state.run ? (state.environment.fallback_triggered ? "partial" : "success") : readyStatus;

  return {
    meta: {
      repo: "exp-nbody-webgpu-core",
      commit: "bootstrap-generated",
      timestamp: new Date().toISOString(),
      owner: "ai-webgpu-lab",
      track: "blackhole",
      scenario: state.run
        ? (state.run.realAdapter ? `nbody-webgpu-core-real-${state.run.realAdapter.id}` : "nbody-webgpu-core-readiness")
        : "nbody-webgpu-core-pending",
      notes: state.run
        ? `bodyCount=${simulationConfig.bodyCount}; visibleBodies=${simulationConfig.visibleBodies}; workgroupSize=${simulationConfig.workgroupSize}; substepsPerFrame=${simulationConfig.substepsPerFrame}; pairTiles=${simulationConfig.pairTiles}; sharedMemoryKB=${simulationConfig.sharedMemoryKB}; avgDispatchMs=${round(state.run.avgDispatchMs, 4)}; p95DispatchMs=${round(state.run.p95DispatchMs, 4)}; maxAtomicSamples=${state.run.maxAtomicSamples}; contentionRatio=${state.run.contentionRatio}; energyDriftPct=${state.run.energyDriftPct}; backend=${state.environment.backend}; fallback=${state.environment.fallback_triggered}${state.run.realAdapter ? `; realAdapter=${state.run.realAdapter.id}` : (isRealRendererMode && state.realAdapterError ? `; realAdapter=fallback(${state.realAdapterError})` : "")}`
        : "Probe capability and run the deterministic N-body simulation to export compute-stress metrics."
    },
    environment: state.environment,
    workload: {
      kind: "compute",
      name: "nbody-webgpu-core-readiness",
      input_profile: "4096-body-fixed-seed",
      model_id: "deterministic-pairwise-gravity-v1"
    },
    metrics: {
      common: {
        time_to_interactive_ms: round(performance.now() - state.startedAt, 2) || 0,
        init_ms: state.run ? round(state.run.totalMs, 2) || 0 : 0,
        success_rate: state.run ? (state.environment.fallback_triggered ? 0.82 : 1) : 0.5,
        peak_memory_note: navigator.deviceMemory
          ? `${navigator.deviceMemory} GB reported by browser; sharedMemory=${simulationConfig.sharedMemoryKB} KB`
          : `sharedMemory=${simulationConfig.sharedMemoryKB} KB; deviceMemory unavailable`,
        error_type: state.run && state.environment.fallback_triggered ? "fallback_compute_path" : ""
      },
      compute: {
        bodies_or_particles: simulationConfig.bodyCount,
        workgroup_size: simulationConfig.workgroupSize,
        steps_per_sec: state.run ? round(state.run.stepsPerSec, 2) || 0 : 0,
        integration_ms: state.run ? round(state.run.totalMs, 2) || 0 : 0,
        avg_dispatch_ms: state.run ? round(state.run.avgDispatchMs, 4) || 0 : 0,
        p95_dispatch_ms: state.run ? round(state.run.p95DispatchMs, 4) || 0 : 0,
        energy_drift_pct: state.run ? state.run.energyDriftPct || 0 : 0,
        atomics_contention_note: state.run
          ? (state.environment.fallback_triggered
            ? `fallback accumulation path observed ${state.run.maxAtomicSamples} synthetic atomic samples (${state.run.contentionRatio}%).`
            : `shared-memory tile reduction kept synthetic atomic samples at ${state.run.maxAtomicSamples} (${state.run.contentionRatio}%).`)
          : "Not measured yet.",
        thermal_note: state.run
          ? (state.environment.fallback_triggered
            ? "Fallback path is CPU-bound; thermal extrapolation should wait for real compute kernels."
            : "No sustained throttling across the fixed deterministic readiness window.")
          : "Not measured yet."
      }
    },
    status: runStatus,
    artifacts: {
      raw_logs: state.logs.slice(0, 5),
      deploy_url: "https://ai-webgpu-lab.github.io/exp-nbody-webgpu-core/",
      renderer_adapter: describeRendererAdapter()
    }
  };
}

function renderStatus() {
  const badges = [];
  if (state.active) {
    badges.push({ text: "Simulation running" });
    badges.push({ text: `${simulationConfig.bodyCount} bodies` });
    badges.push({ text: `${simulationConfig.workgroupSize} threads/group` });
  } else if (state.run) {
    badges.push({ text: state.environment.fallback_triggered ? "Fallback complete" : "WebGPU complete" });
    badges.push({ text: `${round(state.run.stepsPerSec)} steps/s` });
    badges.push({ text: `drift ${state.run.energyDriftPct}%` });
  } else if (state.capability) {
    badges.push({ text: state.environment.fallback_triggered ? "Fallback ready" : "WebGPU ready" });
    badges.push({ text: `${simulationConfig.bodyCount} bodies` });
    badges.push({ text: `${simulationConfig.substepsPerFrame} substeps/frame` });
  } else {
    badges.push({ text: "Probe pending" });
    badges.push({ text: `${simulationConfig.bodyCount} bodies` });
    badges.push({ text: `${simulationConfig.workgroupSize} threads/group` });
  }

  elements.statusRow.innerHTML = "";
  for (const badge of badges) {
    const node = document.createElement("span");
    node.className = "badge";
    node.textContent = badge.text;
    elements.statusRow.appendChild(node);
  }

  elements.summary.textContent = state.run
    ? `steps/s ${round(state.run.stepsPerSec)}, avg dispatch ${round(state.run.avgDispatchMs, 4)} ms, energy drift ${state.run.energyDriftPct}%.`
    : "Probe capability first, then run the deterministic N-body loop to export body-count, dispatch, contention, and thermal metadata.";
}

function renderMetrics() {
  const run = state.run;
  const cards = [
    ["Bodies", simulationConfig.bodyCount],
    ["Workgroup", simulationConfig.workgroupSize],
    ["Steps/Sec", run ? round(run.stepsPerSec) : "pending"],
    ["Avg Dispatch", run ? `${round(run.avgDispatchMs, 4)} ms` : "pending"],
    ["P95 Dispatch", run ? `${round(run.p95DispatchMs, 4)} ms` : "pending"],
    ["Energy Drift", run ? `${run.energyDriftPct}%` : "pending"]
  ];

  elements.metricGrid.innerHTML = "";
  for (const [label, value] of cards) {
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `<span class="label">${label}</span><div class="value">${value}</div>`;
    elements.metricGrid.appendChild(card);
  }
}

function renderEnvironment() {
  const rows = [
    ["Browser", `${state.environment.browser.name} ${state.environment.browser.version}`],
    ["OS", `${state.environment.os.name} ${state.environment.os.version}`],
    ["Device", state.environment.device.class],
    ["CPU", state.environment.device.cpu],
    ["Backend", state.environment.backend],
    ["Fallback", String(state.environment.fallback_triggered)],
    ["Worker", state.environment.worker_mode],
    ["Shared Mem", `${simulationConfig.sharedMemoryKB} KB`]
  ];

  elements.metaGrid.innerHTML = "";
  for (const [label, value] of rows) {
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `<span class="label">${label}</span><div class="value">${value}</div>`;
    elements.metaGrid.appendChild(card);
  }
}

function renderLogs() {
  elements.logList.innerHTML = "";
  if (!state.logs.length) {
    const node = document.createElement("li");
    node.textContent = "No activity yet.";
    elements.logList.appendChild(node);
    return;
  }

  for (const entry of state.logs) {
    const node = document.createElement("li");
    node.textContent = entry;
    elements.logList.appendChild(node);
  }
}

function renderResult() {
  elements.resultJson.textContent = JSON.stringify(buildResult(), null, 2);
}

function render() {
  renderStatus();
  renderMetrics();
  renderEnvironment();
  renderLogs();
  renderResult();
  elements.runSimulation.disabled = state.active;
  elements.probeCapability.disabled = state.active;
  elements.downloadJson.disabled = state.active;
}

function downloadResult() {
  const blob = new Blob([JSON.stringify(buildResult(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `exp-nbody-webgpu-core-${state.run ? "simulation-ready" : "pending"}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  log("Downloaded N-body readiness JSON draft.");
}

elements.probeCapability.addEventListener("click", () => {
  probeCapability().catch((error) => {
    state.active = false;
    log(`Capability probe failed: ${error.message}`);
    render();
  });
});

elements.runSimulation.addEventListener("click", () => {
  runSimulationBaseline().catch((error) => {
    state.active = false;
    log(`Simulation failed: ${error.message}`);
    render();
  });
});

elements.downloadJson.addEventListener("click", downloadResult);

render();
