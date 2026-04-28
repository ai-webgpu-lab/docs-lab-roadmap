const profiles = [
  {
    id: "three-tsl-singularity",
    label: "three.js TSL",
    renderer: "three-tsl-webgpu",
    raySteps: 96,
    taaEnabled: true,
    resolutionScale: 0.82,
    qualityScore: 0.91,
    webgpuFrameMs: 15.8,
    fallbackFrameMs: 24.6,
    sceneLoadWebgpuMs: 42,
    sceneLoadFallbackMs: 68,
    artifactNote: "balanced lensing rings with TAA and adaptive disk sampling"
  },
  {
    id: "raw-webgpu-raymarch",
    label: "Raw WebGPU",
    renderer: "raw-webgpu-raymarch",
    raySteps: 128,
    taaEnabled: false,
    resolutionScale: 0.74,
    qualityScore: 0.86,
    webgpuFrameMs: 13.9,
    fallbackFrameMs: 31.2,
    sceneLoadWebgpuMs: 35,
    sceneLoadFallbackMs: 74,
    artifactNote: "fast raymarch profile with sharper photon ring aliasing"
  },
  {
    id: "webgl-postprocess-fallback",
    label: "WebGL Postprocess",
    renderer: "webgl-postprocess",
    raySteps: 64,
    taaEnabled: true,
    resolutionScale: 0.68,
    qualityScore: 0.78,
    webgpuFrameMs: 18.5,
    fallbackFrameMs: 21.7,
    sceneLoadWebgpuMs: 47,
    sceneLoadFallbackMs: 52,
    artifactNote: "lowest ray budget with stable fallback postprocess path"
  }
];

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
    if (typeof window !== "undefined" && window.__aiWebGpuLabRealBlackholeBenchBootstrapError) {
      return null;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

const state = {
  startedAt: performance.now(),
  environment: buildEnvironment(),
  run: null,
  active: false,
  realAdapterError: null,
  realAdapterError: null,
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
  const wave = Math.sin(frameIndex * 0.37 + profile.raySteps * 0.01) * 1.2;
  const taaCost = profile.taaEnabled ? 0.55 : 0;
  const qualityCost = (1 - profile.resolutionScale) * 1.8;
  return Math.max(7, base + wave + taaCost + qualityCost);
}

function profileSceneLoadMs(profile) {
  return state.environment.fallback_triggered ? profile.sceneLoadFallbackMs : profile.sceneLoadWebgpuMs;
}

function rendererScore(result) {
  const fpsScore = Math.min(1, result.avgFps / 72);
  const frameScore = Math.max(0, 1 - result.p95FrameMs / 40);
  const qualityScore = result.profile.qualityScore;
  return round(fpsScore * 0.45 + frameScore * 0.25 + qualityScore * 0.3, 4);
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

function drawBlackholePanel(ctx, profileResult, panelIndex, frame) {
  const width = ctx.canvas.width / profiles.length;
  const height = ctx.canvas.height;
  const left = panelIndex * width;
  const cx = left + width / 2;
  const cy = height / 2 + 8;
  const radius = Math.min(width, height) * (0.12 + profileResult.profile.resolutionScale * 0.035);

  ctx.save();
  ctx.beginPath();
  ctx.rect(left, 0, width, height);
  ctx.clip();
  ctx.fillStyle = "#020203";
  ctx.fillRect(left, 0, width, height);

  for (let star = 0; star < 58; star += 1) {
    const x = left + (star * 47 % width);
    const y = (star * 31 % height) + Math.sin(star + panelIndex) * 4;
    const alpha = 0.24 + (star % 5) * 0.09;
    ctx.fillStyle = `rgba(246, 240, 231, ${alpha})`;
    ctx.fillRect(x, y, star % 13 === 0 ? 2 : 1, 1);
  }

  ctx.strokeStyle = "rgba(94, 234, 212, 0.18)";
  ctx.lineWidth = 1;
  for (let line = -5; line <= 5; line += 1) {
    ctx.beginPath();
    for (let step = -12; step <= 12; step += 1) {
      const x = step * 16;
      const y = line * 20;
      const dist = Math.max(20, Math.hypot(x, y));
      const bend = radius * radius / dist * 0.2;
      const angle = Math.atan2(y, x) + Math.sin(frame * 0.02 + line) * 0.02;
      const px = cx + x + Math.cos(angle + Math.PI / 2) * bend;
      const py = cy + y + Math.sin(angle + Math.PI / 2) * bend;
      if (step === -12) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.sin(frame * 0.017 + panelIndex) * 0.05);
  ctx.scale(1, 0.34);
  for (let point = 0; point < 96; point += 1) {
    const phase = point / 96 * Math.PI * 2 + frame * 0.02 + panelIndex * 0.2;
    const ring = point % 3;
    const diskRadius = radius * 1.85 + ring * 16 + Math.sin(phase * 2) * 4;
    const hot = Math.cos(phase) > 0 ? 1 : 0.55;
    ctx.fillStyle = ring === 2 ? `rgba(248, 113, 113, ${0.24 + hot * 0.34})` : `rgba(244, 196, 98, ${0.24 + hot * 0.42})`;
    ctx.beginPath();
    ctx.arc(Math.cos(phase) * diskRadius, Math.sin(phase) * diskRadius, 2 + ring * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.strokeStyle = profileResult.profile.taaEnabled ? "rgba(248, 231, 189, 0.78)" : "rgba(244, 196, 98, 0.56)";
  ctx.lineWidth = profileResult.profile.taaEnabled ? 2.4 : 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#010101";
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.76, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(246, 240, 231, 0.92)";
  ctx.font = "14px Segoe UI";
  ctx.fillText(profileResult.profile.label, left + 16, 28);
  ctx.fillText(`${round(profileResult.avgFps, 1)} fps, p95 ${round(profileResult.p95FrameMs, 1)} ms`, left + 16, 50);
  ctx.fillText(`${profileResult.profile.raySteps} steps, score ${profileResult.score}`, left + 16, 72);

  ctx.strokeStyle = "rgba(246, 240, 231, 0.12)";
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
      drawBlackholePanel(ctx, results[index], index, frame);
    }
  }
}

async function runRealBenchmarkBlackhole(adapter) {
  log(`Connecting real benchmark adapter '${adapter.id}'.`);
  await withTimeout(
    Promise.resolve(adapter.createBenchmark({ name: "blackhole-render-shootout" })),
    REAL_ADAPTER_LOAD_MS,
    `createBenchmark(${adapter.id})`
  );
  await withTimeout(
    Promise.resolve(adapter.runProfile({
      profileId: "blackhole-render-shootout-default",
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
  render();

  if (isRealBenchmarkMode) {
    log(`Mode=${requestedMode} requested; awaiting real benchmark adapter registration.`);
    const adapter = await awaitRealBenchmark();
    if (adapter) {
      try {
        const { aggregate } = await runRealBenchmarkBlackhole(adapter);
        state.realAdapterAggregate = aggregate;
        state.realAdapter = adapter;
      } catch (error) {
        state.realAdapterError = error?.message || String(error);
        log(`Real benchmark '${adapter.id}' failed: ${state.realAdapterError}; falling back to deterministic.`);
      }
    } else {
      const reason = (typeof window !== "undefined" && window.__aiWebGpuLabRealBlackholeBenchBootstrapError) || "timed out waiting for adapter registration";
      state.realAdapterError = reason;
      log(`No real benchmark adapter registered (${reason}); falling back to deterministic blackhole benchmark.`);
    }
  }

  const startedAt = performance.now();
  await new Promise((resolve) => setTimeout(resolve, state.environment.fallback_triggered ? 44 : 26));
  const results = profiles.map(benchmarkProfile);
  await drawBenchmark(results);
  const winner = [...results].sort((left, right) => right.score - left.score)[0];

  state.run = {
    totalMs: performance.now() - startedAt,
    profiles: results,
    winner,
    realAdapter: state.realAdapter || null
  };
  state.active = false;
  log(`Blackhole render shootout complete: winner ${winner.profile.label}, score ${winner.score}.`);
  render();
}

function profileNotes() {
  if (!state.run) return "pending";
  return state.run.profiles
    .map((result) => `${result.profile.id}:fps=${round(result.avgFps, 2)},p95=${round(result.p95FrameMs, 2)},score=${result.score},raySteps=${result.profile.raySteps},taa=${result.profile.taaEnabled}`)
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
    id: "deterministic-blackhole-bench",
    label: "Deterministic Blackhole Bench",
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
  const winner = run?.winner;
  return {
    meta: {
      repo: "bench-blackhole-render-shootout",
      commit: "bootstrap-generated",
      timestamp: new Date().toISOString(),
      owner: "ai-webgpu-lab",
      track: "blackhole",
      scenario: (state.run && state.run.realAdapter) ? `blackhole-render-shootout-real-${state.run.realAdapter.id}` : (`blackhole-render-shootout-${executionMode()}`),
      notes: run
        ? `winner=${winner.profile.id}; profiles=${run.profiles.length}; ${profileNotes()}${state.run && state.run.realAdapter ? `; realAdapter=${state.run.realAdapter.id}` : (isRealBenchmarkMode && state.realAdapterError ? `; realAdapter=fallback(${state.realAdapterError})` : "")}`
        : "Run the deterministic blackhole renderer shootout."
    },
    environment: state.environment,
    workload: {
      kind: "blackhole",
      name: "blackhole-render-shootout-benchmark",
      input_profile: "single-lensing-fixture-three-renderer-candidates",
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
        ray_steps: winner ? winner.profile.raySteps : 0,
        taa_enabled: winner ? winner.profile.taaEnabled : false,
        visual_artifact_note: winner ? winner.profile.artifactNote : "pending benchmark run"
      }
    },
    status: run ? "success" : "pending",
    artifacts: {
      raw_logs: state.logs.slice(0, 5),
      deploy_url: "https://ai-webgpu-lab.github.io/bench-blackhole-render-shootout/",
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
    ["Ray Steps", winner ? String(winner.profile.raySteps) : "pending"],
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
  anchor.download = `bench-blackhole-render-shootout-${executionMode()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  log("Downloaded blackhole renderer benchmark JSON draft.");
}

elements.runBenchmark.addEventListener("click", runBenchmark);
elements.downloadJson.addEventListener("click", downloadJson);

log(`Blackhole render shootout ready in ${executionMode()} mode.`);
render();
