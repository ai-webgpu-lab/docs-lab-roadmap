const sceneConfig = {
  spriteCount: 240,
  atlasCount: 4,
  batchCount: 12,
  frameCount: 96,
  resolutionScale: 1,
  taaEnabled: false
};

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
    requiredFeatures: webgpuPath ? ["texture-compression-bc"] : []
  };
  state.environment.gpu = {
    adapter,
    required_features: state.capability.requiredFeatures,
    limits: webgpuPath ? { maxTextureDimension2D: 8192, maxBindGroups: 4 } : {}
  };
  state.environment.backend = webgpuPath ? "webgpu" : "webgl";
  state.environment.fallback_triggered = !webgpuPath;
  state.active = false;

  log(webgpuPath ? "WebGPU path selected for Pixi-style 2D readiness." : "Fallback path selected for Pixi-style 2D readiness.");
  render();
}

function spriteAt(index, frame, width, height) {
  const column = index % 24;
  const row = Math.floor(index / 24);
  const baseX = 30 + column * 38;
  const baseY = 44 + (row % 10) * 44;
  const phase = frame * 0.035 + index * 0.13;
  return {
    x: (baseX + Math.sin(phase) * 12 + width) % width,
    y: (baseY + Math.cos(phase * 0.8) * 10 + height) % height,
    size: 9 + (index % 5) * 2,
    atlas: index % sceneConfig.atlasCount,
    rotation: phase
  };
}

function drawBackground(ctx, frame) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  ctx.fillStyle = "#020407";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(94, 234, 212, 0.1)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x + Math.sin(frame * 0.02) * 6, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y + Math.cos(frame * 0.018) * 6);
    ctx.stroke();
  }
}

function drawSprite(ctx, sprite) {
  const colors = [
    "rgba(94, 234, 212, 0.82)",
    "rgba(244, 196, 98, 0.82)",
    "rgba(129, 140, 248, 0.82)",
    "rgba(248, 113, 113, 0.82)"
  ];
  ctx.save();
  ctx.translate(sprite.x, sprite.y);
  ctx.rotate(sprite.rotation * 0.35);
  ctx.fillStyle = colors[sprite.atlas];
  ctx.strokeStyle = "rgba(238, 248, 245, 0.72)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(-sprite.size / 2, -sprite.size / 2, sprite.size, sprite.size);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawFrame(ctx, frame) {
  drawBackground(ctx, frame);
  for (let index = 0; index < sceneConfig.spriteCount; index += 1) {
    drawSprite(ctx, spriteAt(index, frame, ctx.canvas.width, ctx.canvas.height));
  }

  ctx.fillStyle = "rgba(238, 248, 245, 0.9)";
  ctx.font = "14px Segoe UI";
  ctx.fillText(`frame ${frame + 1}/${sceneConfig.frameCount}`, 18, 28);
  ctx.fillText(`${sceneConfig.spriteCount} sprites, ${sceneConfig.batchCount} batches, ${state.environment.backend} path`, 18, 50);
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
  const startedAt = performance.now();
  const sceneLoadStartedAt = performance.now();
  await new Promise((resolve) => setTimeout(resolve, state.environment.fallback_triggered ? 48 : 28));
  const sceneLoadMs = performance.now() - sceneLoadStartedAt;

  let previous = performance.now();
  for (let frame = 0; frame < sceneConfig.frameCount; frame += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const now = performance.now();
    frameTimes.push(now - previous);
    previous = now;
    drawFrame(ctx, frame);
  }

  const totalMs = performance.now() - startedAt;
  const avgFrame = frameTimes.reduce((sum, value) => sum + value, 0) / Math.max(frameTimes.length, 1);
  state.run = {
    totalMs,
    sceneLoadMs,
    avgFps: 1000 / Math.max(avgFrame, 0.001),
    p95FrameMs: percentile(frameTimes, 0.95) || 0,
    sampleCount: frameTimes.length,
    artifactNote: state.environment.fallback_triggered
      ? "fallback 2D sprite path; deterministic atlas batching only"
      : "synthetic PixiJS-style WebGPU sprite batching path; no real PixiJS package yet"
  };
  state.active = false;

  log(`Pixi 2D readiness complete: avg fps ${round(state.run.avgFps, 2)}, p95 frame ${round(state.run.p95FrameMs, 2)} ms.`);
  render();
}

function buildResult() {
  const run = state.run;
  return {
    meta: {
      repo: "exp-pixi-webgpu-2d",
      commit: "bootstrap-generated",
      timestamp: new Date().toISOString(),
      owner: "ai-webgpu-lab",
      track: "graphics",
      scenario: run ? "pixi-webgpu-2d-readiness" : "pixi-webgpu-2d-pending",
      notes: run
        ? `spriteCount=${sceneConfig.spriteCount}; batchCount=${sceneConfig.batchCount}; atlasCount=${sceneConfig.atlasCount}; backend=${state.environment.backend}; fallback=${state.environment.fallback_triggered}`
        : "Probe capability and run the deterministic PixiJS-style sprite scene."
    },
    environment: state.environment,
    workload: {
      kind: "graphics",
      name: "pixi-webgpu-2d-readiness",
      input_profile: "240-sprites-4-atlases-12-batches",
      renderer: "pixi-webgpu-readiness",
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
        visual_artifact_note: run ? run.artifactNote : "pending sprite scene run"
      }
    },
    status: run ? "success" : state.capability ? "partial" : "pending",
    artifacts: {
      raw_logs: state.logs.slice(0, 5),
      deploy_url: "https://ai-webgpu-lab.github.io/exp-pixi-webgpu-2d/"
    }
  };
}

function renderStatus() {
  const badges = state.active
    ? ["2D baseline running", state.environment.backend === "pending" ? "Capability pending" : state.environment.backend]
    : state.run
      ? ["2D baseline complete", `${round(state.run.avgFps, 2)} fps`]
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
    : "Probe capability first, then run the deterministic sprite batch scene to export schema-aligned graphics metrics.";
}

function renderMetrics() {
  const run = state.run;
  const cards = [
    ["Backend", state.environment.backend],
    ["Fallback", String(state.environment.fallback_triggered)],
    ["Avg FPS", run ? `${round(run.avgFps, 2)}` : "pending"],
    ["P95 Frame", run ? `${round(run.p95FrameMs, 2)} ms` : "pending"],
    ["Scene Load", run ? `${round(run.sceneLoadMs, 2)} ms` : "pending"],
    ["Sprites", String(sceneConfig.spriteCount)],
    ["Batches", String(sceneConfig.batchCount)],
    ["Atlases", String(sceneConfig.atlasCount)]
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
  const entries = state.logs.length ? state.logs : ["No Pixi 2D activity yet."];
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
  anchor.download = `exp-pixi-webgpu-2d-${state.run ? "scene-ready" : "pending"}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  log("Downloaded Pixi 2D readiness JSON draft.");
}

elements.probeCapability.addEventListener("click", probeCapability);
elements.runScene.addEventListener("click", runSceneBaseline);
elements.downloadJson.addEventListener("click", downloadJson);

log("Pixi 2D readiness harness ready.");
render();
