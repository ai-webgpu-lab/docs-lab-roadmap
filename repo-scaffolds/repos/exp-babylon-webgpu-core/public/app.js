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
    if (typeof window !== "undefined" && window.__aiWebGpuLabRealBabylonBootstrapError) {
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
  runScene: document.getElementById("run-scene"),
  downloadJson: document.getElementById("download-json"),
  canvas: document.getElementById("scene-canvas"),
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
    backend: "webgl",
    fallback_triggered: false,
    worker_mode: "main",
    cache_state: "warm"
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
  const limits = hasWebGpu ? { maxTextureDimension2D: 8192, maxBindGroups: 4 } : {};
  state.capability = {
    hasWebGpu,
    adapter: hasWebGpu ? "navigator.gpu available" : "webgl-fallback",
    requiredFeatures: hasWebGpu ? ["shader-f16"] : []
  };
  state.environment.gpu = {
    adapter: state.capability.adapter,
    required_features: state.capability.requiredFeatures,
    limits
  };
  state.environment.backend = hasWebGpu ? "webgpu" : "webgl";
  state.environment.fallback_triggered = !hasWebGpu;
  state.active = false;
  log(hasWebGpu ? "WebGPU capability detected for Babylon-style readiness." : "navigator.gpu unavailable. Babylon-style readiness will record fallback.");
  render();
}

function drawScene(ctx, frameIndex, angle) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#080b10";
  ctx.fillRect(0, 0, width, height);

  const horizon = height * 0.64;
  ctx.strokeStyle = "rgba(251, 113, 133, 0.18)";
  ctx.lineWidth = 1;
  for (let line = 0; line < 10; line += 1) {
    const y = horizon + line * 22;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  const meshes = [
    { x: -1.4, y: -0.1, radius: 0.5, color: "#fb7185" },
    { x: 0.05, y: -0.32, radius: 0.72, color: "#fda4af" },
    { x: 1.45, y: -0.06, radius: 0.46, color: "#fecdd3" }
  ];

  for (const mesh of meshes) {
    const spin = angle + mesh.x;
    const projectedX = width / 2 + (mesh.x * Math.cos(angle * 0.3) - Math.sin(spin) * 0.15) * 190;
    const projectedY = horizon + mesh.y * 130 + Math.cos(spin) * 18;
    const radiusX = mesh.radius * 120;
    const radiusY = mesh.radius * 76;

    const gradient = ctx.createRadialGradient(projectedX - 20, projectedY - 24, 8, projectedX, projectedY, radiusX);
    gradient.addColorStop(0, "#fff1f2");
    gradient.addColorStop(0.38, mesh.color);
    gradient.addColorStop(1, "rgba(76, 5, 25, 0.35)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(projectedX, projectedY, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255, 228, 230, 0.38)";
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(255, 228, 230, 0.92)";
  ctx.font = "14px Segoe UI";
  ctx.fillText(`frame ${frameIndex + 1}/90`, 18, 28);
  ctx.fillText(state.environment.backend === "webgpu" ? "babylon webgpu-style path" : "babylon fallback path", 18, 48);
}

async function runRealRendererBabylon(adapter) {
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
      Promise.resolve(adapter.loadScene({ meshCount: 3 })),
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
      meshCount: 3,
      materialCount: 3,
      submeshCount: 9,
      sampleCount: frameTimes.length,
      realAdapter: adapter
    };
  } finally {
    realCanvas.remove();
  }
}

async function runSceneBaseline() {
  if (state.active) return;
  if (!state.capability) {
    await probeCapability();
  }

  state.active = true;
  state.realAdapterError = null;
  render();

  if (isRealRendererMode) {
    log(`Mode=${requestedMode} requested; awaiting real renderer adapter registration.`);
    const adapter = await awaitRealRenderer();
    if (adapter) {
      try {
        state.run = await runRealRendererBabylon(adapter);
        state.active = false;
        log(`Real renderer '${adapter.id}' complete: avg fps ${round(state.run.avgFps, 2)}, p95 frame ${round(state.run.p95FrameMs, 2)} ms.`);
        render();
        return;
      } catch (error) {
        state.realAdapterError = error?.message || String(error);
        log(`Real renderer '${adapter.id}' failed: ${state.realAdapterError}; falling back to deterministic.`);
      }
    } else {
      const reason = (typeof window !== "undefined" && window.__aiWebGpuLabRealBabylonBootstrapError) || "timed out waiting for adapter registration";
      state.realAdapterError = reason;
      log(`No real renderer adapter registered (${reason}); falling back to deterministic Babylon-style scene baseline.`);
    }
  }

  const ctx = elements.canvas.getContext("2d");
  const frameTimes = [];
  const startedAt = performance.now();
  const sceneLoadStartedAt = performance.now();
  await new Promise((resolve) => setTimeout(resolve, state.environment.fallback_triggered ? 54 : 31));
  const sceneLoadMs = performance.now() - sceneLoadStartedAt;

  let previous = performance.now();
  for (let index = 0; index < 90; index += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const now = performance.now();
    frameTimes.push(now - previous);
    previous = now;
    drawScene(ctx, index, index * 0.045);
  }

  const totalMs = performance.now() - startedAt;
  const avgFrame = frameTimes.reduce((sum, value) => sum + value, 0) / Math.max(frameTimes.length, 1);
  state.run = {
    totalMs,
    sceneLoadMs,
    avgFps: 1000 / Math.max(avgFrame, 0.001),
    p95FrameMs: percentile(frameTimes, 0.95) || 0,
    frameTimes,
    meshCount: 3,
    materialCount: 3,
    submeshCount: 9,
    sampleCount: frameTimes.length,
    realAdapter: null
  };
  state.active = false;
  log(`Babylon scene readiness complete: avg fps ${round(state.run.avgFps, 2)}, p95 frame ${round(state.run.p95FrameMs, 2)} ms.`);
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
    id: "deterministic-babylon-style",
    label: "Deterministic Babylon-style",
    status: "deterministic",
    isReal: false,
    version: "1.0.0",
    capabilities: ["scene-load", "frame-pace", "fallback-record"],
    backendHint: "synthetic",
    message: "Renderer adapter registry unavailable; using inline deterministic mock."
  };
}

function buildResult() {
  const run = state.run;
  const isRealRun = Boolean(run && run.realAdapter);
  let realFallbackNote = "";
  if (isRealRendererMode && !isRealRun) {
    realFallbackNote = state.realAdapterError
      ? `; realAdapter=fallback(${state.realAdapterError})`
      : "; realAdapter=fallback(unavailable)";
  }
  return {
    meta: {
      repo: "exp-babylon-webgpu-core",
      commit: "bootstrap-generated",
      timestamp: new Date().toISOString(),
      owner: "ai-webgpu-lab",
      track: "graphics",
      scenario: run
        ? (isRealRun ? `babylon-webgpu-scene-real-${run.realAdapter.id}` : "babylon-webgpu-scene-readiness")
        : "babylon-webgpu-scene-pending",
      notes: run
        ? `meshCount=${run.meshCount}; materialCount=${run.materialCount}; submeshCount=${run.submeshCount}; samples=${run.sampleCount}; backend=${state.environment.backend}; fallback=${state.environment.fallback_triggered}${isRealRun ? `; realAdapter=${run.realAdapter.id}` : realFallbackNote}`
        : "Probe capability and run the deterministic Babylon-style scene baseline."
    },
    environment: state.environment,
    workload: {
      kind: "graphics",
      name: "babylon-scene-readiness",
      input_profile: "3-meshes-9-submeshes-orbit-camera",
      model_id: "babylon-webgpu-core-readiness",
      resolution: `${elements.canvas.width}x${elements.canvas.height}`
    },
    metrics: {
      common: {
        time_to_interactive_ms: round(performance.now() - state.startedAt, 2) || 0,
        init_ms: run ? round(run.sceneLoadMs, 2) || 0 : 0,
        success_rate: run ? 1 : state.capability ? 0.5 : 0,
        peak_memory_note: navigator.deviceMemory ? `${navigator.deviceMemory} GB reported by browser` : "deviceMemory unavailable",
        error_type: ""
      },
      graphics: {
        avg_fps: run ? round(run.avgFps, 2) || 0 : 0,
        p95_frametime_ms: run ? round(run.p95FrameMs, 2) || 0 : 0,
        scene_load_ms: run ? round(run.sceneLoadMs, 2) || 0 : 0,
        resolution_scale: 1,
        visual_artifact_note: run ? `synthetic Babylon-style scene; meshes=${run.meshCount}; submeshes=${run.submeshCount}` : "not run"
      }
    },
    status: run ? "success" : state.capability ? "partial" : "partial",
    artifacts: {
      raw_logs: state.logs.slice(0, 5),
      deploy_url: "https://ai-webgpu-lab.github.io/exp-babylon-webgpu-core/",
      renderer_adapter: describeRendererAdapter()
    }
  };
}

function renderStatus() {
  const badges = state.active
    ? ["Scene running", state.environment.backend === "pending" ? "Capability pending" : state.environment.backend]
    : state.run
      ? ["Scene complete", `${round(state.run.avgFps, 2)} fps`]
      : state.capability
        ? ["Capability probed", state.environment.backend]
        : ["Awaiting probe", "No baseline run"];
  elements.statusRow.innerHTML = "";
  for (const text of badges) {
    const node = document.createElement("span");
    node.className = "badge";
    node.textContent = text;
    elements.statusRow.appendChild(node);
  }
  elements.summary.textContent = state.run
    ? `Scene load ${round(state.run.sceneLoadMs, 2)} ms, p95 frame ${round(state.run.p95FrameMs, 2)} ms, ${state.run.submeshCount} submeshes.`
    : "Probe capability first, then run the Babylon-style scene baseline to record init and frame pacing metrics.";
}

function renderCards(container, items) {
  container.innerHTML = "";
  for (const [label, value] of items) {
    const card = document.createElement("div");
    card.className = "card";
    const labelNode = document.createElement("span");
    labelNode.className = "label";
    labelNode.textContent = label;
    const valueNode = document.createElement("span");
    valueNode.className = "value";
    valueNode.textContent = value;
    card.append(labelNode, valueNode);
    container.appendChild(card);
  }
}

function renderMetrics() {
  const run = state.run;
  renderCards(elements.metricGrid, [
    ["Avg FPS", run ? String(round(run.avgFps, 2)) : "pending"],
    ["P95 Frame", run ? `${round(run.p95FrameMs, 2)} ms` : "pending"],
    ["Scene Load", run ? `${round(run.sceneLoadMs, 2)} ms` : "pending"],
    ["Meshes", run ? String(run.meshCount) : "3"],
    ["Submeshes", run ? String(run.submeshCount) : "9"],
    ["Backend", state.environment.backend]
  ]);
}

function renderEnvironment() {
  renderCards(elements.metaGrid, [
    ["Browser", `${state.environment.browser.name} ${state.environment.browser.version}`],
    ["OS", `${state.environment.os.name} ${state.environment.os.version}`],
    ["Device", state.environment.device.class],
    ["GPU", state.environment.gpu.adapter],
    ["Fallback", String(state.environment.fallback_triggered)],
    ["Cache", state.environment.cache_state]
  ]);
}

function renderLogs() {
  elements.logList.innerHTML = "";
  const logs = state.logs.length ? state.logs : ["Babylon scene readiness harness ready."];
  for (const message of logs) {
    const item = document.createElement("li");
    item.textContent = message;
    elements.logList.appendChild(item);
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
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(buildResult(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `exp-babylon-webgpu-core-${state.run ? "scene-ready" : "pending"}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  log("Downloaded Babylon scene readiness JSON draft.");
}

elements.probeCapability.addEventListener("click", () => {
  probeCapability().catch((error) => {
    state.active = false;
    log(`Capability probe failed: ${error instanceof Error ? error.message : String(error)}`);
    render();
  });
});
elements.runScene.addEventListener("click", () => {
  runSceneBaseline().catch((error) => {
    state.active = false;
    log(`Scene run failed: ${error instanceof Error ? error.message : String(error)}`);
    render();
  });
});
elements.downloadJson.addEventListener("click", downloadJson);

render();
log("Babylon scene readiness harness ready.");
