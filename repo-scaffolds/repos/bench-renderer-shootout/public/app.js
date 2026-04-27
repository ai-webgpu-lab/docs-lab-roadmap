const profiles = [
  {
    id: "three-webgpu-core",
    label: "three.js",
    renderer: "three-webgpu",
    drawCalls: 84,
    materials: 12,
    taaEnabled: true,
    resolutionScale: 0.9,
    qualityScore: 0.88,
    webgpuFrameMs: 14.6,
    fallbackFrameMs: 22.8,
    sceneLoadWebgpuMs: 38,
    sceneLoadFallbackMs: 61,
    artifactNote: "balanced scene graph path with strong material reuse"
  },
  {
    id: "babylon-webgpu-core",
    label: "Babylon.js",
    renderer: "babylon-webgpu",
    drawCalls: 78,
    materials: 14,
    taaEnabled: true,
    resolutionScale: 0.88,
    qualityScore: 0.9,
    webgpuFrameMs: 15.4,
    fallbackFrameMs: 21.9,
    sceneLoadWebgpuMs: 44,
    sceneLoadFallbackMs: 58,
    artifactNote: "stable PBR-heavy path with slightly higher initialization cost"
  },
  {
    id: "playcanvas-webgpu-core",
    label: "PlayCanvas",
    renderer: "playcanvas-webgpu",
    drawCalls: 72,
    materials: 10,
    taaEnabled: false,
    resolutionScale: 0.86,
    qualityScore: 0.83,
    webgpuFrameMs: 13.8,
    fallbackFrameMs: 23.7,
    sceneLoadWebgpuMs: 34,
    sceneLoadFallbackMs: 55,
    artifactNote: "fast scene update path with simpler postprocess profile"
  },
  {
    id: "raw-webgpu-vanilla",
    label: "Raw WebGPU",
    renderer: "raw-webgpu",
    drawCalls: 44,
    materials: 6,
    taaEnabled: false,
    resolutionScale: 0.8,
    qualityScore: 0.79,
    webgpuFrameMs: 12.1,
    fallbackFrameMs: 27.8,
    sceneLoadWebgpuMs: 26,
    sceneLoadFallbackMs: 66,
    artifactNote: "lowest abstraction overhead with reduced material and tooling coverage"
  }
];

const state = {
  startedAt: performance.now(),
  environment: buildEnvironment(),
  run: null,
  active: false,
  logs: []
};

const elements = {
  statusRow: document.getElementById("status-row"),
  summary: document.getElementById("summary"),
  runBenchmark: document.getElementById("run-benchmark"),
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

function executionMode() {
  return new URLSearchParams(window.location.search).get("mode") === "fallback" ? "fallback" : "webgpu";
}

function buildEnvironment() {
  const mode = executionMode();
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
      adapter: mode === "webgpu" ? "navigator.gpu readiness path" : "webgl-fallback",
      required_features: mode === "webgpu" ? ["shader-f16", "timestamp-query"] : [],
      limits: mode === "webgpu" ? { maxTextureDimension2D: 8192, maxBindGroups: 4 } : {}
    },
    backend: mode === "webgpu" ? "webgpu" : "webgl",
    fallback_triggered: mode === "fallback",
    worker_mode: "main",
    cache_state: "warm"
  };
}

function log(message) {
  state.logs.unshift(`[${new Date().toLocaleTimeString()}] ${message}`);
  state.logs = state.logs.slice(0, 12);
  renderLogs();
}

function profileFrameMs(profile, frameIndex) {
  const base = state.environment.fallback_triggered ? profile.fallbackFrameMs : profile.webgpuFrameMs;
  const wave = Math.sin(frameIndex * 0.33 + profile.drawCalls * 0.07) * 1.15;
  const materialCost = profile.materials * 0.045;
  const taaCost = profile.taaEnabled ? 0.7 : 0;
  const resolutionCost = (1 - profile.resolutionScale) * 2.2;
  return Math.max(7, base + wave + materialCost + taaCost + resolutionCost);
}

function profileSceneLoadMs(profile) {
  return state.environment.fallback_triggered ? profile.sceneLoadFallbackMs : profile.sceneLoadWebgpuMs;
}

function rendererScore(result) {
  const fpsScore = Math.min(1, result.avgFps / 75);
  const frameScore = Math.max(0, 1 - result.p95FrameMs / 36);
  const initScore = Math.max(0, 1 - result.sceneLoadMs / 90);
  const qualityScore = result.profile.qualityScore;
  return round(fpsScore * 0.38 + frameScore * 0.22 + initScore * 0.15 + qualityScore * 0.25, 4);
}

function benchmarkProfile(profile) {
  const frameTimes = [];
  for (let frame = 0; frame < 72; frame += 1) {
    frameTimes.push(profileFrameMs(profile, frame));
  }
  const avgFrame = frameTimes.reduce((sum, value) => sum + value, 0) / frameTimes.length;
  const avgFps = 1000 / avgFrame;
  const p95FrameMs = percentile(frameTimes, 0.95) || 0;
  const sceneLoadMs = profileSceneLoadMs(profile);
  const result = {
    profile,
    avgFps,
    p95FrameMs,
    sceneLoadMs,
    frameTimes,
    score: 0
  };
  result.score = rendererScore(result);
  return result;
}

function drawRendererPanel(ctx, profileResult, panelIndex, frame) {
  const width = ctx.canvas.width / profiles.length;
  const height = ctx.canvas.height;
  const left = panelIndex * width;
  const floor = height * 0.74;
  const cx = left + width / 2;
  const phase = frame * 0.025 + panelIndex * 0.7;

  ctx.save();
  ctx.beginPath();
  ctx.rect(left, 0, width, height);
  ctx.clip();
  ctx.fillStyle = "#03060a";
  ctx.fillRect(left, 0, width, height);

  const gradient = ctx.createLinearGradient(left, 0, left + width, height);
  gradient.addColorStop(0, "rgba(94, 234, 212, 0.1)");
  gradient.addColorStop(0.52, "rgba(244, 196, 98, 0.08)");
  gradient.addColorStop(1, "rgba(148, 163, 184, 0.08)");
  ctx.fillStyle = gradient;
  ctx.fillRect(left, 0, width, height);

  ctx.strokeStyle = "rgba(238, 248, 245, 0.14)";
  ctx.lineWidth = 1;
  for (let row = 0; row < 9; row += 1) {
    const y = floor + row * 18;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(left + width, y + Math.sin(phase + row) * 4);
    ctx.stroke();
  }
  for (let col = 0; col < 8; col += 1) {
    const x = left + col * width / 7;
    ctx.beginPath();
    ctx.moveTo(cx, floor - 40);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  const cubeSize = 46 + profileResult.profile.resolutionScale * 22;
  const orbit = Math.sin(phase) * 18;
  const y = floor - 118 + Math.cos(phase) * 8;
  ctx.save();
  ctx.translate(cx + orbit, y);
  ctx.rotate(phase * 0.8);
  ctx.fillStyle = profileResult.profile.taaEnabled ? "rgba(94, 234, 212, 0.72)" : "rgba(244, 196, 98, 0.72)";
  ctx.strokeStyle = "rgba(238, 248, 245, 0.85)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.rect(-cubeSize / 2, -cubeSize / 2, cubeSize, cubeSize);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  for (let index = 0; index < 9; index += 1) {
    const angle = index / 9 * Math.PI * 2 + phase;
    const radius = 56 + index * 4;
    const x = cx + Math.cos(angle) * radius;
    const py = floor - 106 + Math.sin(angle) * radius * 0.32;
    ctx.fillStyle = index % 2 ? "rgba(244, 196, 98, 0.7)" : "rgba(94, 234, 212, 0.7)";
    ctx.beginPath();
    ctx.arc(x, py, 4 + (index % 3), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(238, 248, 245, 0.92)";
  ctx.font = "14px Segoe UI";
  ctx.fillText(profileResult.profile.label, left + 14, 28);
  ctx.fillText(`${round(profileResult.avgFps, 1)} fps, p95 ${round(profileResult.p95FrameMs, 1)} ms`, left + 14, 50);
  ctx.fillText(`${profileResult.profile.drawCalls} draws, score ${profileResult.score}`, left + 14, 72);

  ctx.strokeStyle = "rgba(238, 248, 245, 0.12)";
  ctx.beginPath();
  ctx.moveTo(left + width - 1, 0);
  ctx.lineTo(left + width - 1, height);
  ctx.stroke();
  ctx.restore();
}

async function drawBenchmark(results) {
  const ctx = elements.canvas.getContext("2d");
  for (let frame = 0; frame < 54; frame += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
    for (let index = 0; index < results.length; index += 1) {
      drawRendererPanel(ctx, results[index], index, frame);
    }
  }
}

async function runBenchmark() {
  if (state.active) return;
  state.active = true;
  render();

  const startedAt = performance.now();
  await new Promise((resolve) => setTimeout(resolve, state.environment.fallback_triggered ? 42 : 24));
  const results = profiles.map(benchmarkProfile);
  await drawBenchmark(results);
  const winner = [...results].sort((left, right) => right.score - left.score)[0];

  state.run = {
    totalMs: performance.now() - startedAt,
    profiles: results,
    winner
  };
  state.active = false;
  log(`Renderer shootout complete: winner ${winner.profile.label}, score ${winner.score}.`);
  render();
}

function profileNotes() {
  if (!state.run) return "pending";
  return state.run.profiles
    .map((result) => `${result.profile.id}:fps=${round(result.avgFps, 2)},p95=${round(result.p95FrameMs, 2)},score=${result.score},draws=${result.profile.drawCalls},materials=${result.profile.materials},taa=${result.profile.taaEnabled}`)
    .join(" | ");
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
    id: "deterministic-renderer-shootout",
    label: "Deterministic Renderer Shootout",
    status: "deterministic",
    isReal: false,
    version: "1.0.0",
    capabilities: ["profile-comparison", "winner-selection", "fallback-pair"],
    benchmarkType: "synthetic",
    message: "Benchmark adapter registry unavailable; using inline deterministic mock."
  };
}

function buildResult() {
  const run = state.run;
  const winner = run?.winner;
  return {
    meta: {
      repo: "bench-renderer-shootout",
      commit: "bootstrap-generated",
      timestamp: new Date().toISOString(),
      owner: "ai-webgpu-lab",
      track: "graphics",
      scenario: `renderer-shootout-${executionMode()}`,
      notes: run
        ? `winner=${winner.profile.id}; profiles=${run.profiles.length}; ${profileNotes()}`
        : "Run the deterministic renderer shootout."
    },
    environment: state.environment,
    workload: {
      kind: "graphics",
      name: "renderer-shootout-benchmark",
      input_profile: "single-scene-four-renderer-candidates",
      renderer: winner ? winner.profile.renderer : "pending",
      model_id: winner ? winner.profile.id : "pending",
      resolution: `${elements.canvas.width}x${elements.canvas.height}`
    },
    metrics: {
      common: {
        time_to_interactive_ms: round(performance.now() - state.startedAt, 2) || 0,
        init_ms: winner ? round(winner.sceneLoadMs, 2) || 0 : 0,
        success_rate: run ? 1 : 0,
        peak_memory_note: navigator.deviceMemory ? `${navigator.deviceMemory} GB reported by browser` : "deviceMemory unavailable",
        error_type: ""
      },
      graphics: {
        avg_fps: winner ? round(winner.avgFps, 2) || 0 : 0,
        p95_frametime_ms: winner ? round(winner.p95FrameMs, 2) || 0 : 0,
        scene_load_ms: winner ? round(winner.sceneLoadMs, 2) || 0 : 0,
        resolution_scale: winner ? winner.profile.resolutionScale : 0,
        taa_enabled: winner ? winner.profile.taaEnabled : false,
        visual_artifact_note: winner ? winner.profile.artifactNote : "pending benchmark run"
      }
    },
    status: run ? "success" : "pending",
    artifacts: {
      raw_logs: state.logs.slice(0, 5),
      deploy_url: "https://ai-webgpu-lab.github.io/bench-renderer-shootout/",
      benchmark_adapter: describeBenchmarkAdapter()
    }
  };
}

function renderStatus() {
  const badges = state.active
    ? ["Benchmark running", state.environment.backend]
    : state.run
      ? ["Benchmark complete", `winner ${state.run.winner.profile.label}`]
      : ["Awaiting benchmark", state.environment.backend];
  elements.statusRow.innerHTML = "";
  for (const text of badges) {
    const node = document.createElement("span");
    node.className = "badge";
    node.textContent = text;
    elements.statusRow.appendChild(node);
  }
  elements.summary.textContent = state.run
    ? `Winner: ${state.run.winner.profile.label}, ${round(state.run.winner.avgFps, 2)} fps, p95 ${round(state.run.winner.p95FrameMs, 2)} ms, score ${state.run.winner.score}.`
    : "Run the benchmark to compare renderer profiles under the selected execution mode.";
}

function renderMetrics() {
  const winner = state.run?.winner;
  const cards = [
    ["Backend", state.environment.backend],
    ["Fallback", String(state.environment.fallback_triggered)],
    ["Winner", winner ? winner.profile.label : "pending"],
    ["Avg FPS", winner ? `${round(winner.avgFps, 2)}` : "pending"],
    ["P95 Frame", winner ? `${round(winner.p95FrameMs, 2)} ms` : "pending"],
    ["Scene Load", winner ? `${round(winner.sceneLoadMs, 2)} ms` : "pending"],
    ["Draw Calls", winner ? String(winner.profile.drawCalls) : "pending"],
    ["Score", winner ? String(winner.score) : "pending"]
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
  const entries = state.logs.length ? state.logs : ["No benchmark activity yet."];
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
  anchor.download = `bench-renderer-shootout-${executionMode()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  log("Downloaded renderer benchmark JSON draft.");
}

elements.runBenchmark.addEventListener("click", runBenchmark);
elements.downloadJson.addEventListener("click", downloadJson);

log(`Renderer shootout ready in ${executionMode()} mode.`);
render();
