const sceneConfig = {
  pointCount: 3072,
  layerCount: 3,
  aggregationBins: 64,
  frameCount: 84,
  resolutionScale: 1,
  taaEnabled: false
};

const attributeBufferMB = round((sceneConfig.pointCount * 4 * Float32Array.BYTES_PER_ELEMENT) / (1024 * 1024), 4);
const pointData = buildPointData(sceneConfig.pointCount);

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
    if (typeof window !== "undefined" && window.__aiWebGpuLabRealLumaBootstrapError) {
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

function buildPointData(pointCount) {
  const data = new Float32Array(pointCount * 4);
  for (let index = 0; index < pointCount; index += 1) {
    const cluster = index % 6;
    const ring = Math.floor(index / 6) % 48;
    const theta = index * 0.112 + cluster * 0.73;
    const radius = 0.18 + (ring / 48) * 0.72;
    data[index * 4] = Math.cos(theta) * radius;
    data[index * 4 + 1] = Math.sin(theta * 1.17) * radius * 0.72;
    data[index * 4 + 2] = 0.25 + ((index * 17) % 100) / 100;
    data[index * 4 + 3] = cluster;
  }
  return data;
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
  const adapter = webgpuPath ? "navigator.gpu available" : "webgl-fallback";

  state.capability = {
    hasWebGpu,
    adapter,
    requiredFeatures: webgpuPath ? ["timestamp-query"] : []
  };
  state.environment.gpu = {
    adapter,
    required_features: state.capability.requiredFeatures,
    limits: webgpuPath ? { maxBufferSize: 268435456, maxVertexAttributes: 16, maxBindGroups: 4 } : {}
  };
  state.environment.backend = webgpuPath ? "webgpu" : "webgl";
  state.environment.fallback_triggered = !webgpuPath;
  state.active = false;

  log(webgpuPath ? "WebGPU path selected for luma.gl-style visualization readiness." : "Fallback path selected for luma.gl-style visualization readiness.");
  render();
}

function simulateAttributeUpload(frame) {
  const startedAt = performance.now();
  let checksum = 0;
  for (let index = 0; index < pointData.length; index += 4) {
    checksum += pointData[index + 2] * Math.sin(frame * 0.011 + pointData[index + 3]);
  }
  return {
    durationMs: performance.now() - startedAt,
    checksum: round(checksum, 4)
  };
}

function drawBackground(ctx, frame) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  ctx.fillStyle = "#02040b";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(125, 211, 252, 0.1)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x + Math.sin(frame * 0.018) * 8, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y + Math.cos(frame * 0.017) * 8);
    ctx.stroke();
  }
}

function drawAggregationLayer(ctx, frame) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const columns = 8;
  const rows = 8;
  const cellWidth = width / columns;
  const cellHeight = height / rows;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const phase = Math.sin(frame * 0.04 + row * 0.8 + column * 0.55);
      const alpha = 0.04 + Math.max(0, phase) * 0.16;
      ctx.fillStyle = `rgba(240, 179, 90, ${round(alpha, 3)})`;
      ctx.fillRect(column * cellWidth, row * cellHeight, cellWidth, cellHeight);
    }
  }
}

function drawPathLayer(ctx, frame) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const centerX = width / 2;
  const centerY = height / 2;
  ctx.lineWidth = 2;
  for (let layer = 0; layer < sceneConfig.layerCount; layer += 1) {
    ctx.strokeStyle = layer === 0 ? "rgba(125, 211, 252, 0.52)" : layer === 1 ? "rgba(244, 114, 182, 0.38)" : "rgba(167, 243, 208, 0.34)";
    ctx.beginPath();
    for (let step = 0; step <= 72; step += 1) {
      const theta = (step / 72) * Math.PI * 2 + frame * 0.018 + layer * 0.9;
      const radius = 128 + layer * 48 + Math.sin(theta * 3 + frame * 0.02) * 18;
      const x = centerX + Math.cos(theta) * radius;
      const y = centerY + Math.sin(theta) * radius * 0.48;
      if (step === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function drawPointLayer(ctx, frame) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const centerX = width / 2;
  const centerY = height / 2;
  const colors = [
    "rgba(125, 211, 252, 0.8)",
    "rgba(244, 114, 182, 0.7)",
    "rgba(167, 243, 208, 0.72)",
    "rgba(253, 186, 116, 0.7)",
    "rgba(196, 181, 253, 0.68)",
    "rgba(250, 204, 21, 0.65)"
  ];

  for (let index = 0; index < sceneConfig.pointCount; index += 1) {
    const base = index * 4;
    const xNorm = pointData[base];
    const yNorm = pointData[base + 1];
    const weight = pointData[base + 2];
    const cluster = pointData[base + 3];
    const phase = frame * 0.021 + cluster * 0.37;
    const x = centerX + xNorm * width * 0.42 + Math.sin(phase + index * 0.01) * 8;
    const y = centerY + yNorm * height * 0.48 + Math.cos(phase * 0.8 + index * 0.008) * 6;
    const size = 1.5 + weight * 2.2;
    ctx.fillStyle = colors[cluster];
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
  }
}

function drawFrame(ctx, frame, uploadChecksum) {
  drawBackground(ctx, frame);
  drawAggregationLayer(ctx, frame);
  drawPathLayer(ctx, frame);
  drawPointLayer(ctx, frame);

  ctx.fillStyle = "rgba(237, 246, 255, 0.92)";
  ctx.font = "14px Segoe UI";
  ctx.fillText(`frame ${frame + 1}/${sceneConfig.frameCount}`, 18, 28);
  ctx.fillText(`${sceneConfig.pointCount} points, ${sceneConfig.layerCount} layers, ${sceneConfig.aggregationBins} bins`, 18, 50);
  ctx.fillText(`${attributeBufferMB} MB attributes, checksum ${uploadChecksum}`, 18, 72);
}

async function runRealRendererLuma(adapter) {
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

async function runSceneBaseline() {
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
        state.run = await runRealRendererLuma(adapter);
        state.active = false;
        log(`Real renderer '${adapter.id}' complete: avg fps ${round(state.run.avgFps, 2)}, p95 frame ${round(state.run.p95FrameMs, 2)} ms.`);
        render();
        return;
      } catch (error) {
        state.realAdapterError = error?.message || String(error);
        log(`Real renderer '${adapter.id}' failed: ${state.realAdapterError}; falling back to deterministic.`);
      }
    } else {
      const reason = (typeof window !== "undefined" && window.__aiWebGpuLabRealLumaBootstrapError) || "timed out waiting for adapter registration";
      state.realAdapterError = reason;
      log(`No real renderer adapter registered (${reason}); falling back to deterministic Luma-style scene baseline.`);
    }
  }
  const ctx = elements.canvas.getContext("2d");
  const frameTimes = [];
  const uploadTimes = [];
  const startedAt = performance.now();
  const sceneLoadStartedAt = performance.now();
  await new Promise((resolve) => setTimeout(resolve, state.environment.fallback_triggered ? 54 : 32));
  const sceneLoadMs = performance.now() - sceneLoadStartedAt;

  let previous = performance.now();
  let checksum = 0;
  for (let frame = 0; frame < sceneConfig.frameCount; frame += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const upload = simulateAttributeUpload(frame);
    uploadTimes.push(upload.durationMs);
    checksum = upload.checksum;
    const now = performance.now();
    frameTimes.push(now - previous);
    previous = now;
    drawFrame(ctx, frame, checksum);
  }

  const totalMs = performance.now() - startedAt;
  const avgFrame = frameTimes.reduce((sum, value) => sum + value, 0) / Math.max(frameTimes.length, 1);
  const avgUpload = uploadTimes.reduce((sum, value) => sum + value, 0) / Math.max(uploadTimes.length, 1);
  state.run = {
    totalMs,
    sceneLoadMs,
    avgFps: 1000 / Math.max(avgFrame, 0.001),
    p95FrameMs: percentile(frameTimes, 0.95) || 0,
    avgAttributeUploadMs: avgUpload,
    p95AttributeUploadMs: percentile(uploadTimes, 0.95) || 0,
    sampleCount: frameTimes.length,
    checksum,
    artifactNote: state.environment.fallback_triggered
      ? "fallback canvas visualization path; deterministic layer/aggregation fixture only"
      : "synthetic luma.gl-style WebGPU visualization path; no real luma.gl package yet",
    realAdapter: null
  };
  state.active = false;

  log(`Luma viz readiness complete: avg fps ${round(state.run.avgFps, 2)}, p95 frame ${round(state.run.p95FrameMs, 2)} ms.`);
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
    id: "deterministic-luma-style",
    label: "Deterministic Luma-style",
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
  return {
    meta: {
      repo: "exp-luma-webgpu-viz",
      commit: "bootstrap-generated",
      timestamp: new Date().toISOString(),
      owner: "ai-webgpu-lab",
      track: "graphics",
      scenario: run
        ? (run.realAdapter ? `luma-webgpu-viz-real-${run.realAdapter.id}` : "luma-webgpu-viz-readiness")
        : "luma-webgpu-viz-pending",
      notes: run
        ? `pointCount=${sceneConfig.pointCount}; layerCount=${sceneConfig.layerCount}; aggregationBins=${sceneConfig.aggregationBins}; attributeBufferMB=${attributeBufferMB}; avgAttributeUploadMs=${round(run.avgAttributeUploadMs, 4)}; backend=${state.environment.backend}; fallback=${state.environment.fallback_triggered}${run.realAdapter ? `; realAdapter=${run.realAdapter.id}` : (isRealRendererMode && state.realAdapterError ? `; realAdapter=fallback(${state.realAdapterError})` : "")}`
        : "Probe capability and run the deterministic luma.gl-style visualization scene."
    },
    environment: state.environment,
    workload: {
      kind: "graphics",
      name: "luma-webgpu-viz-readiness",
      input_profile: "3072-points-3-layers-64-bins",
      renderer: "luma-webgpu-viz-readiness",
      model_id: "luma-webgpu-viz-readiness",
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
        resolution_scale: sceneConfig.resolutionScale,
        ray_steps: 0,
        taa_enabled: sceneConfig.taaEnabled,
        visual_artifact_note: run ? run.artifactNote : "pending visualization scene run"
      }
    },
    status: run ? "success" : state.capability ? "partial" : "pending",
    artifacts: {
      raw_logs: state.logs.slice(0, 5),
      deploy_url: "https://ai-webgpu-lab.github.io/exp-luma-webgpu-viz/",
      renderer_adapter: describeRendererAdapter()
    }
  };
}

function renderStatus() {
  const badges = state.active
    ? ["Viz baseline running", state.environment.backend === "pending" ? "Capability pending" : state.environment.backend]
    : state.run
      ? ["Viz baseline complete", `${round(state.run.avgFps, 2)} fps`]
      : state.capability
        ? ["Capability captured", state.environment.backend]
        : ["Awaiting probe", "No baseline run"];
  elements.statusRow.innerHTML = "";
  for (const text of badges) {
    const node = document.createElement("span");
    node.className = "badge";
    node.textContent = text;
    elements.statusRow.appendChild(node);
  }
  elements.summary.textContent = state.run
    ? `Last run: ${round(state.run.avgFps, 2)} fps average, p95 frame ${round(state.run.p95FrameMs, 2)} ms, scene load ${round(state.run.sceneLoadMs, 2)} ms.`
    : "Probe capability first, then run the fixed visualization scene to export schema-aligned graphics metrics.";
}

function renderMetrics() {
  const run = state.run;
  const cards = [
    ["Backend", state.environment.backend],
    ["Fallback", String(state.environment.fallback_triggered)],
    ["Avg FPS", run ? `${round(run.avgFps, 2)}` : "pending"],
    ["P95 Frame", run ? `${round(run.p95FrameMs, 2)} ms` : "pending"],
    ["Scene Load", run ? `${round(run.sceneLoadMs, 2)} ms` : "pending"],
    ["Points", String(sceneConfig.pointCount)],
    ["Layers", String(sceneConfig.layerCount)],
    ["Attribute MB", String(attributeBufferMB)]
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
  const info = [
    ["Browser", `${state.environment.browser.name} ${state.environment.browser.version}`],
    ["OS", `${state.environment.os.name} ${state.environment.os.version}`],
    ["Device", state.environment.device.class],
    ["CPU", state.environment.device.cpu],
    ["Memory", state.environment.device.memory_gb ? `${state.environment.device.memory_gb} GB` : "unknown"],
    ["Adapter", state.environment.gpu.adapter],
    ["Backend", state.environment.backend]
  ];
  elements.metaGrid.innerHTML = "";
  for (const [label, value] of info) {
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `<span class="label">${label}</span><div class="value">${value}</div>`;
    elements.metaGrid.appendChild(card);
  }
}

function renderLogs() {
  elements.logList.innerHTML = "";
  const entries = state.logs.length ? state.logs : ["No Luma viz activity yet."];
  for (const entry of entries) {
    const li = document.createElement("li");
    li.textContent = entry;
    elements.logList.appendChild(li);
  }
}

function render() {
  renderStatus();
  renderMetrics();
  renderEnvironment();
  renderLogs();
  elements.resultJson.textContent = JSON.stringify(buildResult(), null, 2);
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(buildResult(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `exp-luma-webgpu-viz-${state.run ? "scene-ready" : "pending"}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  log("Downloaded Luma viz readiness JSON draft.");
}

elements.probeCapability.addEventListener("click", probeCapability);
elements.runScene.addEventListener("click", runSceneBaseline);
elements.downloadJson.addEventListener("click", downloadJson);

log("Luma viz readiness harness ready.");
render();
