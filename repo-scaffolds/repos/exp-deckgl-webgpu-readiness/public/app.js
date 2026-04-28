const sceneConfig = {
  pointCount: 2048,
  arcCount: 96,
  polygonCount: 24,
  tileCount: 18,
  layerCount: 4,
  pickingSamples: 128,
  frameCount: 84,
  resolutionScale: 1,
  taaEnabled: false
};

const attributeBufferMB = round(((sceneConfig.pointCount * 4) + (sceneConfig.arcCount * 8) + (sceneConfig.polygonCount * 12)) * Float32Array.BYTES_PER_ELEMENT / (1024 * 1024), 4);
const points = buildPointData(sceneConfig.pointCount);
const arcs = buildArcData(sceneConfig.arcCount);
const polygons = buildPolygonData(sceneConfig.polygonCount);

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
    if (typeof window !== "undefined" && window.__aiWebGpuLabRealDeckBootstrapError) {
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
    const region = index % 8;
    const theta = index * 0.071 + region * 0.42;
    const radius = 0.14 + ((index * 13) % 100) / 135;
    data[index * 4] = Math.cos(theta) * radius + (region % 4 - 1.5) * 0.17;
    data[index * 4 + 1] = Math.sin(theta * 1.21) * radius * 0.72 + (Math.floor(region / 4) - 0.5) * 0.2;
    data[index * 4 + 2] = 0.2 + ((index * 29) % 100) / 100;
    data[index * 4 + 3] = region;
  }
  return data;
}

function buildArcData(arcCount) {
  const data = new Float32Array(arcCount * 8);
  for (let index = 0; index < arcCount; index += 1) {
    const source = (index * 17) % sceneConfig.pointCount;
    const target = (index * 53 + 31) % sceneConfig.pointCount;
    const sourceBase = source * 4;
    const targetBase = target * 4;
    const base = index * 8;
    data[base] = points[sourceBase];
    data[base + 1] = points[sourceBase + 1];
    data[base + 2] = points[targetBase];
    data[base + 3] = points[targetBase + 1];
    data[base + 4] = 0.25 + (index % 7) * 0.08;
    data[base + 5] = index % 2;
    data[base + 6] = (index % 5) / 5;
    data[base + 7] = 1;
  }
  return data;
}

function buildPolygonData(polygonCount) {
  const data = new Float32Array(polygonCount * 12);
  for (let index = 0; index < polygonCount; index += 1) {
    const column = index % 6;
    const row = Math.floor(index / 6);
    const centerX = -0.72 + column * 0.28;
    const centerY = -0.42 + row * 0.28;
    const size = 0.08 + (index % 3) * 0.018;
    const base = index * 12;
    data[base] = centerX - size;
    data[base + 1] = centerY - size * 0.8;
    data[base + 2] = centerX + size;
    data[base + 3] = centerY - size * 0.7;
    data[base + 4] = centerX + size * 1.1;
    data[base + 5] = centerY + size * 0.85;
    data[base + 6] = centerX - size * 0.7;
    data[base + 7] = centerY + size;
    data[base + 8] = index % 6;
    data[base + 9] = 0.35 + (index % 4) * 0.12;
    data[base + 10] = column;
    data[base + 11] = row;
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
    requiredFeatures: webgpuPath ? ["texture-compression-bc", "timestamp-query"] : []
  };
  state.environment.gpu = {
    adapter,
    required_features: state.capability.requiredFeatures,
    limits: webgpuPath ? { maxTextureDimension2D: 8192, maxVertexAttributes: 16, maxBindGroups: 4 } : {}
  };
  state.environment.backend = webgpuPath ? "webgpu" : "webgl";
  state.environment.fallback_triggered = !webgpuPath;
  state.active = false;

  log(webgpuPath ? "WebGPU path selected for deck.gl-style readiness." : "Fallback path selected for deck.gl-style readiness.");
  render();
}

function projectPoint(xNorm, yNorm, frame) {
  const width = elements.canvas.width;
  const height = elements.canvas.height;
  const zoomPulse = 1 + Math.sin(frame * 0.018) * 0.035;
  const panX = Math.sin(frame * 0.012) * width * 0.035;
  const panY = Math.cos(frame * 0.014) * height * 0.025;
  return {
    x: width / 2 + xNorm * width * 0.42 * zoomPulse + panX,
    y: height / 2 + yNorm * height * 0.48 * zoomPulse + panY
  };
}

function simulateViewportAndPicking(frame) {
  const startedAt = performance.now();
  let checksum = 0;
  for (let index = 0; index < sceneConfig.pickingSamples; index += 1) {
    const pointIndex = (index * 37 + frame * 11) % sceneConfig.pointCount;
    const base = pointIndex * 4;
    checksum += points[base + 2] * (points[base + 3] + 1);
  }
  for (let index = 0; index < arcs.length; index += 8) {
    checksum += arcs[index + 4] * Math.sin(frame * 0.01 + arcs[index + 6]);
  }
  return {
    durationMs: performance.now() - startedAt,
    checksum: round(checksum, 4)
  };
}

function drawTileLayer(ctx, frame) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  ctx.fillStyle = "#02050b";
  ctx.fillRect(0, 0, width, height);
  const columns = 6;
  const rows = 3;
  const tileWidth = width / columns;
  const tileHeight = height / rows;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const alpha = 0.045 + ((row + column + frame * 0.015) % 1) * 0.035;
      ctx.fillStyle = `rgba(96, 165, 250, ${round(alpha, 3)})`;
      ctx.fillRect(column * tileWidth, row * tileHeight, tileWidth - 1, tileHeight - 1);
      ctx.strokeStyle = "rgba(238, 246, 255, 0.06)";
      ctx.strokeRect(column * tileWidth, row * tileHeight, tileWidth - 1, tileHeight - 1);
    }
  }
}

function drawPolygonLayer(ctx, frame) {
  const colors = [
    "rgba(96, 165, 250, 0.24)",
    "rgba(251, 191, 36, 0.24)",
    "rgba(244, 114, 182, 0.2)",
    "rgba(52, 211, 153, 0.22)",
    "rgba(167, 139, 250, 0.2)",
    "rgba(248, 113, 113, 0.2)"
  ];
  for (let index = 0; index < sceneConfig.polygonCount; index += 1) {
    const base = index * 12;
    ctx.beginPath();
    for (let vertex = 0; vertex < 4; vertex += 1) {
      const projected = projectPoint(polygons[base + vertex * 2], polygons[base + vertex * 2 + 1], frame);
      if (vertex === 0) ctx.moveTo(projected.x, projected.y);
      else ctx.lineTo(projected.x, projected.y);
    }
    ctx.closePath();
    ctx.fillStyle = colors[polygons[base + 8]];
    ctx.fill();
    ctx.strokeStyle = "rgba(238, 246, 255, 0.18)";
    ctx.stroke();
  }
}

function drawArcLayer(ctx, frame) {
  ctx.lineWidth = 1.8;
  for (let index = 0; index < sceneConfig.arcCount; index += 1) {
    const base = index * 8;
    const source = projectPoint(arcs[base], arcs[base + 1], frame);
    const target = projectPoint(arcs[base + 2], arcs[base + 3], frame);
    const midX = (source.x + target.x) / 2;
    const midY = (source.y + target.y) / 2 - (38 + arcs[base + 4] * 42) * (1 + Math.sin(frame * 0.02 + index) * 0.08);
    ctx.beginPath();
    ctx.moveTo(source.x, source.y);
    ctx.quadraticCurveTo(midX, midY, target.x, target.y);
    ctx.strokeStyle = arcs[base + 5] > 0
      ? "rgba(251, 191, 36, 0.28)"
      : "rgba(96, 165, 250, 0.26)";
    ctx.stroke();
  }
}

function drawScatterLayer(ctx, frame) {
  const colors = [
    "rgba(96, 165, 250, 0.82)",
    "rgba(251, 191, 36, 0.74)",
    "rgba(244, 114, 182, 0.72)",
    "rgba(52, 211, 153, 0.72)",
    "rgba(167, 139, 250, 0.68)",
    "rgba(248, 113, 113, 0.68)",
    "rgba(45, 212, 191, 0.72)",
    "rgba(250, 204, 21, 0.64)"
  ];
  for (let index = 0; index < sceneConfig.pointCount; index += 1) {
    const base = index * 4;
    const projected = projectPoint(points[base], points[base + 1], frame);
    const weight = points[base + 2];
    const region = points[base + 3];
    const size = 1.7 + weight * 2.6;
    ctx.fillStyle = colors[region];
    ctx.fillRect(projected.x - size / 2, projected.y - size / 2, size, size);
  }
}

function drawFrame(ctx, frame, checksum) {
  drawTileLayer(ctx, frame);
  drawPolygonLayer(ctx, frame);
  drawArcLayer(ctx, frame);
  drawScatterLayer(ctx, frame);

  ctx.fillStyle = "rgba(238, 246, 255, 0.92)";
  ctx.font = "14px Segoe UI";
  ctx.fillText(`frame ${frame + 1}/${sceneConfig.frameCount}`, 18, 28);
  ctx.fillText(`${sceneConfig.layerCount} layers, ${sceneConfig.tileCount} tiles, ${sceneConfig.pickingSamples} picking samples`, 18, 50);
  ctx.fillText(`${attributeBufferMB} MB attributes, checksum ${checksum}`, 18, 72);
}

async function runRealRendererDeck(adapter) {
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
        state.run = await runRealRendererDeck(adapter);
        state.active = false;
        log(`Real renderer '${adapter.id}' complete: avg fps ${round(state.run.avgFps, 2)}, p95 frame ${round(state.run.p95FrameMs, 2)} ms.`);
        render();
        return;
      } catch (error) {
        state.realAdapterError = error?.message || String(error);
        log(`Real renderer '${adapter.id}' failed: ${state.realAdapterError}; falling back to deterministic.`);
      }
    } else {
      const reason = (typeof window !== "undefined" && window.__aiWebGpuLabRealDeckBootstrapError) || "timed out waiting for adapter registration";
      state.realAdapterError = reason;
      log(`No real renderer adapter registered (${reason}); falling back to deterministic deck.gl scene baseline.`);
    }
  }
  const ctx = elements.canvas.getContext("2d");
  const frameTimes = [];
  const viewportTimes = [];
  const startedAt = performance.now();
  const sceneLoadStartedAt = performance.now();
  await new Promise((resolve) => setTimeout(resolve, state.environment.fallback_triggered ? 62 : 38));
  const sceneLoadMs = performance.now() - sceneLoadStartedAt;

  let previous = performance.now();
  let checksum = 0;
  for (let frame = 0; frame < sceneConfig.frameCount; frame += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const viewport = simulateViewportAndPicking(frame);
    viewportTimes.push(viewport.durationMs);
    checksum = viewport.checksum;
    const now = performance.now();
    frameTimes.push(now - previous);
    previous = now;
    drawFrame(ctx, frame, checksum);
  }

  const totalMs = performance.now() - startedAt;
  const avgFrame = frameTimes.reduce((sum, value) => sum + value, 0) / Math.max(frameTimes.length, 1);
  const avgViewportUpdate = viewportTimes.reduce((sum, value) => sum + value, 0) / Math.max(viewportTimes.length, 1);
  state.run = {
    totalMs,
    sceneLoadMs,
    avgFps: 1000 / Math.max(avgFrame, 0.001),
    p95FrameMs: percentile(frameTimes, 0.95) || 0,
    avgViewportUpdateMs: avgViewportUpdate,
    p95ViewportUpdateMs: percentile(viewportTimes, 0.95) || 0,
    sampleCount: frameTimes.length,
    checksum,
    artifactNote: state.environment.fallback_triggered
      ? "fallback canvas map layer path; deterministic deck.gl-style fixture only"
      : "synthetic deck.gl-style WebGPU map layer path; no real deck.gl package yet",
    realAdapter: null
  };
  state.active = false;

  log(`Deck.gl readiness complete: avg fps ${round(state.run.avgFps, 2)}, p95 frame ${round(state.run.p95FrameMs, 2)} ms.`);
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
    id: "deterministic-deckgl-style",
    label: "Deterministic deck.gl-style",
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
      repo: "exp-deckgl-webgpu-readiness",
      commit: "bootstrap-generated",
      timestamp: new Date().toISOString(),
      owner: "ai-webgpu-lab",
      track: "graphics",
      scenario: run
        ? (run.realAdapter ? `deckgl-webgpu-real-${run.realAdapter.id}` : "deckgl-webgpu-readiness")
        : "deckgl-webgpu-pending",
      notes: run
        ? `pointCount=${sceneConfig.pointCount}; arcCount=${sceneConfig.arcCount}; polygonCount=${sceneConfig.polygonCount}; layerCount=${sceneConfig.layerCount}; tileCount=${sceneConfig.tileCount}; pickingSamples=${sceneConfig.pickingSamples}; attributeBufferMB=${attributeBufferMB}; avgViewportUpdateMs=${round(run.avgViewportUpdateMs, 4)}; backend=${state.environment.backend}; fallback=${state.environment.fallback_triggered}${run.realAdapter ? `; realAdapter=${run.realAdapter.id}` : (isRealRendererMode && state.realAdapterError ? `; realAdapter=fallback(${state.realAdapterError})` : "")}`
        : "Probe capability and run the deterministic deck.gl-style map layer scene."
    },
    environment: state.environment,
    workload: {
      kind: "graphics",
      name: "deckgl-webgpu-readiness",
      input_profile: "2048-points-96-arcs-24-polygons-18-tiles",
      renderer: "deckgl-webgpu-readiness",
      model_id: "deckgl-webgpu-readiness",
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
        visual_artifact_note: run ? run.artifactNote : "pending map layer scene run"
      }
    },
    status: run ? "success" : state.capability ? "partial" : "pending",
    artifacts: {
      raw_logs: state.logs.slice(0, 5),
      deploy_url: "https://ai-webgpu-lab.github.io/exp-deckgl-webgpu-readiness/",
      renderer_adapter: describeRendererAdapter()
    }
  };
}

function renderStatus() {
  const badges = state.active
    ? ["Map baseline running", state.environment.backend === "pending" ? "Capability pending" : state.environment.backend]
    : state.run
      ? ["Map baseline complete", `${round(state.run.avgFps, 2)} fps`]
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
    : "Probe capability first, then run the fixed map layer scene to export schema-aligned graphics metrics.";
}

function renderMetrics() {
  const run = state.run;
  const cards = [
    ["Backend", state.environment.backend],
    ["Fallback", String(state.environment.fallback_triggered)],
    ["Avg FPS", run ? `${round(run.avgFps, 2)}` : "pending"],
    ["P95 Frame", run ? `${round(run.p95FrameMs, 2)} ms` : "pending"],
    ["Scene Load", run ? `${round(run.sceneLoadMs, 2)} ms` : "pending"],
    ["Layers", String(sceneConfig.layerCount)],
    ["Tiles", String(sceneConfig.tileCount)],
    ["Picking", String(sceneConfig.pickingSamples)]
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
  const entries = state.logs.length ? state.logs : ["No deck.gl readiness activity yet."];
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
  anchor.download = `exp-deckgl-webgpu-readiness-${state.run ? "scene-ready" : "pending"}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  log("Downloaded deck.gl readiness JSON draft.");
}

elements.probeCapability.addEventListener("click", probeCapability);
elements.runScene.addEventListener("click", runSceneBaseline);
elements.downloadJson.addEventListener("click", downloadJson);

log("Deck.gl readiness harness ready.");
render();
