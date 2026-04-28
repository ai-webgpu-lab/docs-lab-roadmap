const PROFILES = [
  {
    id: "lcm-turbo",
    label: "LCM Turbo",
    stepScale: 0.67,
    denoiseScale: 0.62,
    decodeExtraMs: -8,
    safetyExtraMs: 4,
    successRate: 0.88,
    oomFailRate: 0.08,
    accent: "#60a5fa",
    workerMode: "worker",
    seedOffset: 0
  },
  {
    id: "balanced-karras",
    label: "Balanced Karras",
    stepScale: 0.88,
    denoiseScale: 0.84,
    decodeExtraMs: 0,
    safetyExtraMs: 0,
    successRate: 1,
    oomFailRate: 0.02,
    accent: "#f59e0b",
    workerMode: "worker",
    seedOffset: 19
  },
  {
    id: "detail-xl",
    label: "Detail XL",
    stepScale: 1.08,
    denoiseScale: 1.12,
    decodeExtraMs: 22,
    safetyExtraMs: 10,
    successRate: 0.96,
    oomFailRate: 0.04,
    accent: "#f472b6",
    workerMode: "worker",
    seedOffset: 37
  }
];

const EXECUTION_MODES = {
  webgpu: {
    id: "webgpu",
    label: "WebGPU",
    backend: "webgpu",
    fallbackTriggered: false,
    workerMode: "worker",
    stageMultiplier: 1,
    decodeOffsetMs: 0,
    safetyOffsetMs: 0,
    successPenalty: 0,
    failPenalty: 0
  },
  fallback: {
    id: "fallback",
    label: "CPU fallback",
    backend: "cpu",
    fallbackTriggered: true,
    workerMode: "main",
    stageMultiplier: 1.96,
    decodeOffsetMs: 18,
    safetyOffsetMs: 10,
    successPenalty: 0.18,
    failPenalty: 0.16
  }
};

function resolveExecutionMode() {
  const requested = new URLSearchParams(window.location.search).get("mode");
  return EXECUTION_MODES[requested] || EXECUTION_MODES.webgpu;
}

const executionMode = resolveExecutionMode();

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
    if (typeof window !== "undefined" && window.__aiWebGpuLabRealDiffusionBenchBootstrapError) {
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
  promptView: document.getElementById("prompt-view"),
  canvas: document.getElementById("image-canvas"),
  matrixView: document.getElementById("matrix-view"),
  metricGrid: document.getElementById("metric-grid"),
  metaGrid: document.getElementById("meta-grid"),
  fixtureView: document.getElementById("fixture-view"),
  logList: document.getElementById("log-list"),
  resultJson: document.getElementById("result-json")
};

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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
      adapter: executionMode.fallbackTriggered ? "cpu-diffusion-fallback" : "synthetic-webgpu-diffusion-profile",
      required_features: executionMode.fallbackTriggered ? [] : ["shader-f16"],
      limits: executionMode.fallbackTriggered ? {} : { maxStorageBuffersPerShaderStage: 8, maxTextureDimension2D: 8192 }
    },
    backend: executionMode.backend,
    fallback_triggered: executionMode.fallbackTriggered,
    worker_mode: executionMode.workerMode,
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
  const response = await fetch("./diffusion-benchmark-fixture.json", { cache: "no-store" });
  state.fixture = await response.json();
  renderFixture();
  return state.fixture;
}

function createRng(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function drawPlaceholder() {
  const ctx = elements.canvas.getContext("2d");
  const { width, height } = elements.canvas;
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#07111d");
  gradient.addColorStop(0.5, "#101828");
  gradient.addColorStop(1, "#04070d");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "rgba(244, 247, 251, 0.9)";
  ctx.font = "600 24px Segoe UI";
  ctx.fillText("Diffusion benchmark preview", 32, 54);
  ctx.font = "16px Segoe UI";
  ctx.fillStyle = "rgba(188, 200, 217, 0.92)";
  ctx.fillText("Run the deterministic browser diffusion shootout.", 32, 84);
}

function drawGeneratedImage(seed, accent, label) {
  const ctx = elements.canvas.getContext("2d");
  const { width, height } = elements.canvas;
  const rng = createRng(seed);

  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#08111d");
  sky.addColorStop(0.35, "#13213a");
  sky.addColorStop(0.7, "#2b1c42");
  sky.addColorStop(1, "#090d17");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  for (let star = 0; star < 84; star += 1) {
    const x = rng() * width;
    const y = rng() * height * 0.52;
    const alpha = 0.24 + rng() * 0.56;
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.fillRect(x, y, 1.1 + rng() * 1.6, 1.1 + rng() * 1.6);
  }

  for (let band = 0; band < 4; band += 1) {
    ctx.beginPath();
    ctx.moveTo(-20, 96 + band * 26);
    for (let x = 0; x <= width + 40; x += 40) {
      const y = 92 + band * 34 + Math.sin(x * 0.011 + band * 1.1) * (20 + band * 4) + rng() * 8;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width + 40, height * 0.5);
    ctx.lineTo(-20, height * 0.5);
    ctx.closePath();
    ctx.fillStyle = `${accent}${band === 0 ? "26" : band === 1 ? "20" : "16"}`;
    ctx.fill();
  }

  function drawMountain(baseY, amplitude, color, offset) {
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(0, baseY);
    for (let x = 0; x <= width; x += 28) {
      const y = baseY - Math.abs(Math.sin((x + offset) * 0.008) * amplitude) - rng() * amplitude * 0.35;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  drawMountain(height * 0.64, 62, "#101a2a", 0);
  drawMountain(height * 0.72, 48, "#162235", 90);
  drawMountain(height * 0.82, 36, "#0c1320", 180);

  const lake = ctx.createLinearGradient(0, height * 0.68, 0, height);
  lake.addColorStop(0, "rgba(30,64,175,0.32)");
  lake.addColorStop(1, "rgba(3,7,18,0.9)");
  ctx.fillStyle = lake;
  ctx.fillRect(0, height * 0.68, width, height * 0.32);

  ctx.fillStyle = "#111827";
  ctx.fillRect(width * 0.58, height * 0.48, 96, 72);
  ctx.fillRect(width * 0.615, height * 0.42, 26, 64);
  ctx.beginPath();
  ctx.moveTo(width * 0.55, height * 0.48);
  ctx.lineTo(width * 0.63, height * 0.36);
  ctx.lineTo(width * 0.71, height * 0.48);
  ctx.closePath();
  ctx.fillStyle = "#1f2937";
  ctx.fill();

  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.strokeRect(20, 20, width - 40, height - 40);
  ctx.fillStyle = "rgba(244,247,251,0.92)";
  ctx.font = "600 16px Segoe UI";
  ctx.fillText(label, 28, height - 28);
}

function scoreProfile(result) {
  return (
    result.resolutionSuccessRate * 100
    - result.oomOrFailRate * 100
    - result.secPerImage * 12
    + result.stepsPerSec * 0.6
  );
}

async function runProfile(profile, fixture) {
  log(`Running ${profile.label} (${executionMode.label}).`);

  let denoiseMs = 0;
  const stepBudget = Math.max(8, Math.round(fixture.steps * profile.stepScale));
  for (let index = 0; index < fixture.denoiseWindows.length; index += 1) {
    const windowMs = fixture.latentMsPerWindow[index] * profile.denoiseScale * executionMode.stageMultiplier;
    await sleep(windowMs);
    denoiseMs += windowMs;
  }

  const decodeMs = Math.max(16, (fixture.decodeMs + profile.decodeExtraMs + executionMode.decodeOffsetMs) * executionMode.stageMultiplier);
  await sleep(decodeMs);

  const safetyMs = Math.max(8, (fixture.safetyMs + profile.safetyExtraMs + executionMode.safetyOffsetMs) * executionMode.stageMultiplier);
  await sleep(safetyMs);

  const totalMs = denoiseMs + decodeMs + safetyMs;
  return {
    profile: {
      ...profile,
      workerMode: executionMode.fallbackTriggered ? "main" : profile.workerMode
    },
    prompt: fixture.prompt,
    negativePrompt: fixture.negativePrompt,
    scheduler: fixture.scheduler,
    promptTag: fixture.promptTag,
    seed: fixture.seed + profile.seedOffset,
    width: fixture.width,
    height: fixture.height,
    steps: stepBudget,
    previewFrames: fixture.previewFrames,
    denoiseMs,
    decodeMs,
    safetyMs,
    totalMs,
    secPerImage: totalMs / 1000,
    stepsPerSec: stepBudget / Math.max(denoiseMs / 1000, 0.001),
    resolutionSuccessRate: clamp(profile.successRate - executionMode.successPenalty, 0, 1),
    oomOrFailRate: clamp(profile.oomFailRate + executionMode.failPenalty, 0, 1)
  };
}

async function runRealBenchmarkDiffusion(adapter) {
  log(`Connecting real benchmark adapter '${adapter.id}'.`);
  await withTimeout(
    Promise.resolve(adapter.createBenchmark({ name: "diffusion-browser-shootout" })),
    REAL_ADAPTER_LOAD_MS,
    `createBenchmark(${adapter.id})`
  );
  await withTimeout(
    Promise.resolve(adapter.runProfile({
      profileId: "diffusion-browser-shootout-default",
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
        const { aggregate } = await runRealBenchmarkDiffusion(adapter);
        state.realAdapterAggregate = aggregate;
        state.realAdapter = adapter;
      } catch (error) {
        state.realAdapterError = error?.message || String(error);
        log(`Real benchmark '${adapter.id}' failed: ${state.realAdapterError}; falling back to deterministic.`);
      }
    } else {
      const reason = (typeof window !== "undefined" && window.__aiWebGpuLabRealDiffusionBenchBootstrapError) || "timed out waiting for adapter registration";
      state.realAdapterError = reason;
      log(`No real benchmark adapter registered (${reason}); falling back to deterministic diffusion benchmark.`);
    }
  }

  const fixture = await loadFixture();
  log(`Prompt tag ${fixture.promptTag} loaded with ${fixture.steps} base denoise steps.`);

  const results = [];
  for (const profile of PROFILES) {
    const result = await runProfile(profile, fixture);
    results.push(result);
    log(`${profile.label}: sec/image=${round(result.secPerImage, 3)}, steps/s=${round(result.stepsPerSec, 2)}, success=${round(result.resolutionSuccessRate, 2)}.`);
  }

  results.sort((left, right) => scoreProfile(right) - scoreProfile(left));
  state.run = {
    executionMode: executionMode.id,
    winner: results[0],
    profiles: results,
    realAdapter: state.realAdapter || null
  };
  state.environment.worker_mode = results[0].profile.workerMode;
  drawGeneratedImage(results[0].seed, results[0].profile.accent, `${results[0].profile.label} / seed ${results[0].seed}`);
  state.active = false;
  log(`Winner: ${results[0].profile.label} (${executionMode.label}).`);
  render();
}

function buildPromptText() {
  if (!state.fixture) return "Loading diffusion fixture.";
  const winner = state.run ? state.run.winner : null;
  return [
    `prompt: ${state.fixture.prompt}`,
    `negative_prompt: ${state.fixture.negativePrompt}`,
    `scheduler: ${state.fixture.scheduler}`,
    `resolution: ${state.fixture.width}x${state.fixture.height}`,
    `seed: ${state.fixture.seed}`,
    `steps: ${state.fixture.steps}`,
    `preview_frames: ${state.fixture.previewFrames}`,
    winner ? `winner: ${winner.profile.label}` : "winner: pending",
    winner ? `sec_per_image: ${round(winner.secPerImage, 3)}` : "sec_per_image: pending",
    winner ? `steps_per_sec: ${round(winner.stepsPerSec, 2)}` : "steps_per_sec: pending"
  ].join("\n");
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
    id: "deterministic-diffusion-bench",
    label: "Deterministic Diffusion Shootout",
    status: "deterministic",
    isReal: false,
    version: "1.0.0",
    capabilities: ["profile-comparison", "winner-selection", "real-benchmark"],
    benchmarkType: "synthetic",
    message: "Benchmark adapter registry unavailable; using inline deterministic mock."
  };
}

function buildResult() {
  const winner = state.run ? state.run.winner : null;
  return {
    meta: {
      repo: "bench-diffusion-browser-shootout",
      commit: "bootstrap-generated",
      timestamp: new Date().toISOString(),
      owner: "ai-webgpu-lab",
      track: "benchmark",
      scenario: (state.run && state.run.realAdapter) ? `diffusion-browser-shootout-real-${state.run.realAdapter.id}` : (winner ? `diffusion-browser-shootout-${state.run.executionMode}` : "diffusion-browser-shootout-pending"),
      notes: winner
        ? `winner=${winner.profile.id}; promptTag=${winner.promptTag}; scheduler=${winner.scheduler}; resolution=${winner.width}x${winner.height}; seed=${winner.seed}; steps=${winner.steps}; previews=${winner.previewFrames}; backend=${state.environment.backend}; fallback=${state.environment.fallback_triggered}${state.run && state.run.realAdapter ? `; realAdapter=${state.run.realAdapter.id}` : (isRealBenchmarkMode && state.realAdapterError ? `; realAdapter=fallback(${state.realAdapterError})` : "")}`
        : "Run the fixed browser diffusion benchmark."
    },
    environment: state.environment,
    workload: {
      kind: "diffusion",
      name: "diffusion-browser-shootout-benchmark",
      input_profile: state.fixture ? `${state.fixture.width}x${state.fixture.height}-${state.fixture.steps}-steps-${PROFILES.length}-profiles` : "fixture-pending",
      model_id: winner ? winner.profile.id : "pending",
      dataset: "diffusion-benchmark-fixture-v1"
    },
    metrics: {
      common: {
        time_to_interactive_ms: round(performance.now() - state.startedAt, 2) || 0,
        init_ms: winner ? round(winner.totalMs, 2) || 0 : 0,
        success_rate: winner ? 1 : 0.5,
        peak_memory_note: navigator.deviceMemory ? `${navigator.deviceMemory} GB reported by browser` : "deviceMemory unavailable",
        error_type: ""
      },
      diffusion: {
        sec_per_image: winner ? round(winner.secPerImage, 3) || 0 : 0,
        steps_per_sec: winner ? round(winner.stepsPerSec, 2) || 0 : 0,
        resolution_success_rate: winner ? round(winner.resolutionSuccessRate, 2) || 0 : 0,
        oom_or_fail_rate: winner ? round(winner.oomOrFailRate, 2) || 0 : 0
      }
    },
    status: winner ? "success" : "partial",
    artifacts: {
      raw_logs: state.logs.slice(0, 6),
      deploy_url: "https://ai-webgpu-lab.github.io/bench-diffusion-browser-shootout/",
      benchmark_adapter: describeBenchmarkAdapter()
    }
  };
}

function renderCards(container, items) {
  container.innerHTML = "";
  for (const [label, value] of items) {
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `<span class="label">${label}</span><div class="value">${value}</div>`;
    container.appendChild(card);
  }
}

function renderStatus() {
  const badges = state.active
    ? ["Benchmark running", executionMode.label]
    : state.run
      ? [`Winner ${state.run.winner.profile.label}`, executionMode.label]
      : ["Fixture ready", executionMode.label];

  elements.statusRow.innerHTML = "";
  for (const text of badges) {
    const node = document.createElement("span");
    node.className = "badge";
    node.textContent = text;
    elements.statusRow.appendChild(node);
  }

  elements.summary.textContent = state.run
    ? `Last run: ${round(state.run.winner.secPerImage, 3)} sec/image, ${round(state.run.winner.stepsPerSec, 2)} steps/s, resolution success ${round(state.run.winner.resolutionSuccessRate, 2)}, fail rate ${round(state.run.winner.oomOrFailRate, 2)}.`
    : "Run the browser diffusion shootout to compare fixed diffusion profiles on one deterministic prompt fixture.";
}

function renderMetrics() {
  renderCards(elements.metricGrid, [
    ["Resolution", state.fixture ? `${state.fixture.width}x${state.fixture.height}` : "pending"],
    ["Base Steps", state.fixture ? String(state.fixture.steps) : "pending"],
    ["Winner", state.run ? state.run.winner.profile.label : "pending"],
    ["Sec/Image", state.run ? `${round(state.run.winner.secPerImage, 3)} s` : "pending"],
    ["Steps/Sec", state.run ? `${round(state.run.winner.stepsPerSec, 2)}` : "pending"],
    ["Resolution OK", state.run ? `${round(state.run.winner.resolutionSuccessRate, 2)}` : "pending"],
    ["OOM/Fail", state.run ? `${round(state.run.winner.oomOrFailRate, 2)}` : "pending"]
  ]);
}

function renderEnvironment() {
  renderCards(elements.metaGrid, [
    ["Browser", `${state.environment.browser.name} ${state.environment.browser.version}`],
    ["OS", `${state.environment.os.name} ${state.environment.os.version}`],
    ["Device", state.environment.device.class],
    ["CPU", state.environment.device.cpu],
    ["Memory", state.environment.device.memory_gb ? `${state.environment.device.memory_gb} GB` : "unknown"],
    ["Backend", state.environment.backend],
    ["Fallback", String(state.environment.fallback_triggered)],
    ["Worker", state.environment.worker_mode],
    ["Scheduler", state.fixture ? state.fixture.scheduler : "pending"]
  ]);
}

function renderFixture() {
  if (!state.fixture) {
    elements.fixtureView.textContent = "Loading fixture...";
    return;
  }
  const payload = {
    promptTag: state.fixture.promptTag,
    resolution: `${state.fixture.width}x${state.fixture.height}`,
    steps: state.fixture.steps,
    previewFrames: state.fixture.previewFrames,
    profiles: PROFILES.map((profile) => ({
      id: profile.id,
      label: profile.label,
      stepScale: profile.stepScale,
      denoiseScale: profile.denoiseScale
    }))
  };
  elements.fixtureView.textContent = JSON.stringify(payload, null, 2);
}

function renderMatrix() {
  if (!state.run) {
    elements.matrixView.innerHTML = "<pre>No benchmark run yet.</pre>";
    return;
  }
  const rows = state.run.profiles
    .map((result, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${result.profile.label}</td>
        <td>${result.steps}</td>
        <td>${round(result.secPerImage, 3)} s</td>
        <td>${round(result.stepsPerSec, 2)}</td>
        <td>${round(result.resolutionSuccessRate, 2)}</td>
        <td>${round(result.oomOrFailRate, 2)}</td>
      </tr>
    `)
    .join("");
  elements.matrixView.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Rank</th>
          <th>Profile</th>
          <th>Steps</th>
          <th>Sec/Image</th>
          <th>Steps/Sec</th>
          <th>Resolution OK</th>
          <th>OOM/Fail</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderLogs() {
  elements.logList.innerHTML = "";
  const entries = state.logs.length ? state.logs : ["No diffusion activity yet."];
  for (const entry of entries) {
    const item = document.createElement("li");
    item.textContent = entry;
    elements.logList.appendChild(item);
  }
}

function render() {
  renderStatus();
  renderMetrics();
  renderEnvironment();
  renderFixture();
  renderMatrix();
  renderLogs();
  elements.promptView.textContent = buildPromptText();
  elements.resultJson.textContent = JSON.stringify(buildResult(), null, 2);
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(buildResult(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `bench-diffusion-browser-shootout-${state.run ? state.run.executionMode : "pending"}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  log("Downloaded diffusion benchmark JSON draft.");
}

elements.runBenchmark.addEventListener("click", () => {
  runBenchmark().catch((error) => {
    state.active = false;
    log(`Diffusion benchmark failed: ${error instanceof Error ? error.message : String(error)}`);
    render();
  });
});

elements.downloadJson.addEventListener("click", downloadJson);

(async function init() {
  await loadFixture();
  drawPlaceholder();
  log("Browser diffusion benchmark ready.");
  render();
})().catch((error) => {
  log(`Initialization failed: ${error instanceof Error ? error.message : String(error)}`);
  render();
});
