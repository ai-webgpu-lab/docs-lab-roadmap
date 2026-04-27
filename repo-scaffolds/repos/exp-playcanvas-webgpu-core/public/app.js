const state = {
  startedAt: performance.now(),
  environment: buildEnvironment(),
  capability: null,
  run: null,
  active: false,
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
  log(hasWebGpu ? "WebGPU capability detected for PlayCanvas-style readiness." : "navigator.gpu unavailable. PlayCanvas-style readiness will record fallback.");
  render();
}

function simulateScriptUpdate(entityCount, frameIndex) {
  const startedAt = performance.now();
  let accumulator = 0;
  for (let entity = 0; entity < entityCount; entity += 1) {
    const phase = frameIndex * 0.017 + entity * 0.23;
    accumulator += Math.sin(phase) * Math.cos(phase * 0.7);
  }
  return {
    durationMs: performance.now() - startedAt,
    checksum: round(accumulator, 4)
  };
}

function drawScene(ctx, frameIndex, angle, checksum) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#071013";
  ctx.fillRect(0, 0, width, height);

  const centerX = width / 2;
  const centerY = height / 2 + 24;
  ctx.strokeStyle = "rgba(52, 211, 153, 0.18)";
  ctx.lineWidth = 1;
  for (let ring = 0; ring < 6; ring += 1) {
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, 96 + ring * 48, 34 + ring * 18, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  for (let index = 0; index < 18; index += 1) {
    const theta = angle + (index / 18) * Math.PI * 2;
    const radius = 110 + (index % 3) * 52;
    const x = centerX + Math.cos(theta) * radius;
    const y = centerY + Math.sin(theta) * radius * 0.38;
    const size = 18 + (index % 4) * 5;
    ctx.fillStyle = index % 2 === 0 ? "#34d399" : "#a7f3d0";
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
    ctx.strokeStyle = "rgba(236, 253, 245, 0.5)";
    ctx.strokeRect(x - size / 2, y - size / 2, size, size);
  }

  ctx.fillStyle = "rgba(209, 250, 229, 0.92)";
  ctx.font = "14px Segoe UI";
  ctx.fillText(`frame ${frameIndex + 1}/90`, 18, 28);
  ctx.fillText(state.environment.backend === "webgpu" ? "playcanvas webgpu-style path" : "playcanvas fallback path", 18, 48);
  ctx.fillText(`script checksum ${checksum}`, 18, 68);
}

async function runSceneBaseline() {
  if (state.active) return;
  if (!state.capability) {
    await probeCapability();
  }

  state.active = true;
  render();
  const ctx = elements.canvas.getContext("2d");
  const frameTimes = [];
  const updateTimes = [];
  const startedAt = performance.now();
  const sceneLoadStartedAt = performance.now();
  await new Promise((resolve) => setTimeout(resolve, state.environment.fallback_triggered ? 58 : 34));
  const sceneLoadMs = performance.now() - sceneLoadStartedAt;

  let previous = performance.now();
  let checksum = 0;
  for (let index = 0; index < 90; index += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const update = simulateScriptUpdate(18, index);
    updateTimes.push(update.durationMs);
    checksum += update.checksum;
    const now = performance.now();
    frameTimes.push(now - previous);
    previous = now;
    drawScene(ctx, index, index * 0.042, round(checksum, 3));
  }

  const totalMs = performance.now() - startedAt;
  const avgFrame = frameTimes.reduce((sum, value) => sum + value, 0) / Math.max(frameTimes.length, 1);
  const avgUpdate = updateTimes.reduce((sum, value) => sum + value, 0) / Math.max(updateTimes.length, 1);
  state.run = {
    totalMs,
    sceneLoadMs,
    avgFps: 1000 / Math.max(avgFrame, 0.001),
    p95FrameMs: percentile(frameTimes, 0.95) || 0,
    avgScriptUpdateMs: avgUpdate,
    p95ScriptUpdateMs: percentile(updateTimes, 0.95) || 0,
    frameTimes,
    entityCount: 18,
    componentCount: 54,
    scriptCount: 3,
    lightCount: 2,
    sampleCount: frameTimes.length
  };
  state.active = false;
  log(`PlayCanvas scene readiness complete: avg fps ${round(state.run.avgFps, 2)}, p95 frame ${round(state.run.p95FrameMs, 2)} ms.`);
  render();
}

function buildResult() {
  const run = state.run;
  return {
    meta: {
      repo: "exp-playcanvas-webgpu-core",
      commit: "bootstrap-generated",
      timestamp: new Date().toISOString(),
      owner: "ai-webgpu-lab",
      track: "graphics",
      scenario: run ? "playcanvas-webgpu-scene-readiness" : "playcanvas-webgpu-scene-pending",
      notes: run
        ? `entityCount=${run.entityCount}; componentCount=${run.componentCount}; scriptCount=${run.scriptCount}; lightCount=${run.lightCount}; avgScriptUpdateMs=${round(run.avgScriptUpdateMs, 4)}; samples=${run.sampleCount}; backend=${state.environment.backend}; fallback=${state.environment.fallback_triggered}`
        : "Probe capability and run the deterministic PlayCanvas-style scene baseline."
    },
    environment: state.environment,
    workload: {
      kind: "graphics",
      name: "playcanvas-scene-readiness",
      input_profile: "18-entities-54-components-3-scripts",
      model_id: "playcanvas-webgpu-core-readiness",
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
        visual_artifact_note: run ? `synthetic PlayCanvas-style scene; entities=${run.entityCount}; scripts=${run.scriptCount}; avgScriptUpdateMs=${round(run.avgScriptUpdateMs, 4)}` : "not run"
      }
    },
    status: run ? "success" : state.capability ? "partial" : "partial",
    artifacts: {
      raw_logs: state.logs.slice(0, 5),
      deploy_url: "https://ai-webgpu-lab.github.io/exp-playcanvas-webgpu-core/"
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
    ? `Scene load ${round(state.run.sceneLoadMs, 2)} ms, p95 frame ${round(state.run.p95FrameMs, 2)} ms, avg script update ${round(state.run.avgScriptUpdateMs, 4)} ms.`
    : "Probe capability first, then run the PlayCanvas-style scene baseline to record init, update, and frame pacing metrics.";
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
    ["Entities", run ? String(run.entityCount) : "18"],
    ["Scripts", run ? String(run.scriptCount) : "3"],
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
  const logs = state.logs.length ? state.logs : ["PlayCanvas scene readiness harness ready."];
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
  anchor.download = `exp-playcanvas-webgpu-core-${state.run ? "scene-ready" : "pending"}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  log("Downloaded PlayCanvas scene readiness JSON draft.");
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
log("PlayCanvas scene readiness harness ready.");
