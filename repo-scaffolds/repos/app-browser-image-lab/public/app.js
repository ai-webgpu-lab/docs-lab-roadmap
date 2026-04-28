const requestedMode = typeof window !== "undefined"
  ? new URLSearchParams(window.location.search).get("mode")
  : null;
const isRealSurfaceMode = typeof requestedMode === "string" && requestedMode.startsWith("real-");
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

function findRegisteredRealSurface() {
  const registry = typeof window !== "undefined" ? window.__aiWebGpuLabAppSurfaceRegistry : null;
  if (!registry || typeof registry.list !== "function") return null;
  return registry.list().find((adapter) => adapter && adapter.isReal === true) || null;
}

async function awaitRealSurface(timeoutMs = REAL_ADAPTER_WAIT_MS) {
  const startedAt = performance.now();
  while (performance.now() - startedAt < timeoutMs) {
    const adapter = findRegisteredRealSurface();
    if (adapter) return adapter;
    if (typeof window !== "undefined" && window.__aiWebGpuLabRealImageLabBootstrapError) {
      return null;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

const state = {
  startedAt: performance.now(),
  environment: buildEnvironment(),
  fixture: null,
  active: false,
  run: null,
  realAdapterError: null,
  logs: []
};

const elements = {
  statusRow: document.getElementById("status-row"),
  summary: document.getElementById("summary"),
  runLab: document.getElementById("run-lab"),
  downloadJson: document.getElementById("download-json"),
  sourceCaption: document.getElementById("source-caption"),
  sourceMetadata: document.getElementById("source-metadata"),
  generationMetadata: document.getElementById("generation-metadata"),
  qaView: document.getElementById("qa-view"),
  metricGrid: document.getElementById("metric-grid"),
  metaGrid: document.getElementById("meta-grid"),
  fixtureView: document.getElementById("fixture-view"),
  logList: document.getElementById("log-list"),
  resultJson: document.getElementById("result-json"),
  canvas: document.getElementById("image-canvas")
};

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values) {
  if (!values.length) return 0;
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
      adapter: navigator.gpu ? "navigator.gpu available" : "browser-fixture-no-webgpu",
      required_features: navigator.gpu ? ["shader-f16"] : [],
      limits: navigator.gpu ? { maxTextureDimension2D: 8192, maxBindGroups: 4 } : {}
    },
    backend: "browser-fixture",
    fallback_triggered: false,
    worker_mode: "hybrid",
    cache_state: "warm"
  };
}

function log(message) {
  state.logs.unshift(`[${new Date().toLocaleTimeString()}] ${message}`);
  state.logs = state.logs.slice(0, 16);
  renderLogs();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadFixture() {
  if (state.fixture) return state.fixture;
  const response = await fetch("./browser-image-fixture.json", { cache: "no-store" });
  state.fixture = await response.json();
  renderSource();
  renderFixture();
  renderGenerationPanel();
  return state.fixture;
}

function drawPlaceholder() {
  const ctx = elements.canvas.getContext("2d");
  const { width, height } = elements.canvas;
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#111827");
  gradient.addColorStop(0.52, "#12263a");
  gradient.addColorStop(1, "#29182f");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(226, 232, 240, 0.08)";
  ctx.lineWidth = 1;
  for (let row = 0; row < 12; row += 1) {
    const y = (height / 11) * row;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(226, 232, 240, 0.9)";
  ctx.font = "600 30px Segoe UI";
  ctx.fillText("Image preview pending", 34, 58);
  ctx.font = "18px Segoe UI";
  ctx.fillStyle = "rgba(191, 208, 226, 0.9)";
  ctx.fillText("Run the lab to render the deterministic prompt-to-image canvas.", 34, 92);
}

function createRng(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function drawGeneratedPreview(generation) {
  const ctx = elements.canvas.getContext("2d");
  const { width, height } = elements.canvas;
  const rng = createRng(generation.seed);

  const sky = ctx.createLinearGradient(0, 0, width, height);
  sky.addColorStop(0, generation.palette[0]);
  sky.addColorStop(0.55, generation.palette[1]);
  sky.addColorStop(1, "#0b1020");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  for (let index = 0; index < 44; index += 1) {
    const x = rng() * width;
    const y = rng() * height * 0.4;
    const alpha = 0.15 + rng() * 0.38;
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, 1 + rng() * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  const floor = ctx.createLinearGradient(0, height * 0.58, 0, height);
  floor.addColorStop(0, "rgba(15, 23, 42, 0.06)");
  floor.addColorStop(1, "rgba(15, 23, 42, 0.94)");
  ctx.fillStyle = floor;
  ctx.fillRect(0, height * 0.56, width, height * 0.44);

  const glow = ctx.createRadialGradient(width * 0.35, height * 0.35, 20, width * 0.35, height * 0.35, 240);
  glow.addColorStop(0, "rgba(245, 158, 11, 0.42)");
  glow.addColorStop(1, "rgba(245, 158, 11, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = generation.palette[2];
  ctx.fillRect(220, 290, 220, 120);
  ctx.fillStyle = "rgba(255,255,255,0.26)";
  ctx.fillRect(242, 308, 182, 16);

  ctx.fillStyle = generation.palette[1];
  ctx.beginPath();
  ctx.arc(528, 304, 46, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(226, 232, 240, 0.84)";
  ctx.fillRect(568, 250, 16, 124);
  ctx.fillRect(582, 250, 120, 14);

  ctx.fillStyle = generation.palette[3];
  ctx.beginPath();
  ctx.moveTo(78, 334);
  ctx.lineTo(186, 236);
  ctx.lineTo(296, 334);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(226, 232, 240, 0.88)";
  ctx.font = "600 28px Segoe UI";
  ctx.fillText("Deterministic image preview", 38, 60);
  ctx.font = "18px Segoe UI";
  ctx.fillStyle = "rgba(203, 213, 225, 0.9)";
  ctx.fillText(`seed=${generation.seed} | ${generation.scheduler} | ${generation.width}x${generation.height}`, 38, 92);
}

async function runVision(fixture) {
  const answers = [];
  log(`Scene preprocessed with ${fixture.scene.patchCount} patches.`);
  await sleep(40);

  for (const task of fixture.vision.tasks) {
    await sleep(Math.max(Math.round(task.firstTokenMs / 3), 12));
    log(`Vision first token ready for ${task.id} at ${round(fixture.vision.preprocessMs + task.firstTokenMs, 2)} ms.`);
    await sleep(Math.max(Math.round((task.answerTotalMs - task.firstTokenMs) / 3), 16));
    answers.push({
      id: task.id,
      question: task.question,
      answer: task.answer,
      focusRegion: task.focusRegion,
      imageToFirstTokenMs: round(fixture.vision.preprocessMs + task.firstTokenMs, 2),
      answerTotalMs: round(fixture.vision.preprocessMs + task.answerTotalMs, 2),
      correct: true
    });
    log(`Vision answer stored for ${task.focusRegion}.`);
  }

  return {
    patchCount: fixture.scene.patchCount,
    imageId: fixture.scene.id,
    imagePreprocessMs: round(fixture.vision.preprocessMs, 2),
    imageToFirstTokenMs: round(average(answers.map((item) => item.imageToFirstTokenMs)), 2),
    answerTotalMs: round(average(answers.map((item) => item.answerTotalMs)), 2),
    accuracyTaskScore: 1,
    caption: fixture.scene.caption,
    answers
  };
}

async function runGeneration(fixture) {
  for (const stage of fixture.generation.previewStages) {
    await sleep(Math.max(Math.round(stage.delayMs / 2), 20));
    log(`${stage.label}: ${stage.message}`);
  }

  drawGeneratedPreview(fixture.generation);

  return {
    prompt: fixture.generation.prompt,
    negativePrompt: fixture.generation.negativePrompt,
    seed: fixture.generation.seed,
    scheduler: fixture.generation.scheduler,
    steps: fixture.generation.steps,
    guidanceScale: fixture.generation.guidanceScale,
    secPerImage: fixture.generation.secPerImage,
    stepsPerSec: fixture.generation.stepsPerSec,
    resolutionSuccessRate: fixture.generation.resolutionSuccessRate,
    oomOrFailRate: fixture.generation.oomOrFailRate,
    safetyLabel: fixture.generation.safetyLabel,
    width: fixture.generation.width,
    height: fixture.generation.height
  };
}

async function runRealSurfaceImageLab(adapter) {
  log(`Connecting real app-surface adapter '${adapter.id}'.`);
  const fixture = await loadFixture();

  const dataset = await withTimeout(
    Promise.resolve(adapter.loadDataset({ promptId: fixture.generation.seed })),
    REAL_ADAPTER_LOAD_MS,
    `loadDataset(${adapter.id})`
  );
  const renderInfo = await withTimeout(
    Promise.resolve(adapter.renderSurface({ canvas: elements.canvas, frameIndex: 0 })),
    REAL_ADAPTER_LOAD_MS,
    `renderSurface(${adapter.id})`
  );

  const vision = await runVision(fixture);
  const generation = await runGeneration(fixture);

  await withTimeout(
    Promise.resolve(adapter.recordTelemetry({
      kind: "image-lab-run",
      promptId: fixture.generation.seed,
      answerTotalMs: vision.answerTotalMs,
      secPerImage: generation.secPerImage
    })),
    REAL_ADAPTER_LOAD_MS,
    `recordTelemetry(${adapter.id})`
  );
  log(`Real adapter '${adapter.id}' rendered prompt ${dataset?.preset?.id || fixture.generation.seed} (frame ${renderInfo?.frameIndex ?? 0}).`);
  return { vision, generation, realAdapter: adapter, realDataset: dataset, realRenderInfo: renderInfo };
}

async function runLab() {
  if (state.active) return;
  state.active = true;
  state.run = null;
  state.realAdapterError = null;
  render();

  if (isRealSurfaceMode) {
    log(`Mode=${requestedMode} requested; awaiting real app-surface adapter registration.`);
    const adapter = await awaitRealSurface();
    if (adapter) {
      try {
        state.run = await runRealSurfaceImageLab(adapter);
        state.active = false;
        log(`Real app-surface '${adapter.id}' complete.`);
        render();
        return;
      } catch (error) {
        state.realAdapterError = error?.message || String(error);
        log(`Real surface '${adapter.id}' failed: ${state.realAdapterError}; falling back to deterministic.`);
      }
    } else {
      const reason = (typeof window !== "undefined" && window.__aiWebGpuLabRealImageLabBootstrapError) || "timed out waiting for adapter registration";
      state.realAdapterError = reason;
      log(`No real app-surface adapter registered (${reason}); falling back to deterministic image lab demo.`);
    }
  }

  const fixture = await loadFixture();
  log("Image lab run started.");
  const vision = await runVision(fixture);
  const generation = await runGeneration(fixture);

  state.run = { vision, generation, realAdapter: null };
  state.active = false;
  log(`Image lab complete: answer_total_ms ${vision.answerTotalMs}, sec_per_image ${generation.secPerImage}.`);
  render();
}

function describeAppSurfaceAdapter() {
  const registry = typeof window !== "undefined" ? window.__aiWebGpuLabAppSurfaceRegistry : null;
  const requested = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("mode")
    : null;
  if (registry) {
    return registry.describe(requested);
  }
  return {
    id: "deterministic-image-lab",
    label: "Deterministic Image Lab",
    status: "deterministic",
    isReal: false,
    version: "1.0.0",
    capabilities: ["preset-replay", "renderer-scorecard", "telemetry-record"],
    surfaceType: "synthetic",
    message: "App surface adapter registry unavailable; using inline deterministic mock."
  };
}

function buildResult() {
  const run = state.run;
  return {
    meta: {
      repo: "app-browser-image-lab",
      commit: "bootstrap-generated",
      timestamp: new Date().toISOString(),
      owner: "ai-webgpu-lab",
      track: "integration",
      scenario: run
        ? (run.realAdapter ? `browser-image-lab-real-${run.realAdapter.id}` : "browser-image-lab-demo")
        : "browser-image-lab-pending",
      notes: run
        ? `image=${run.vision.imageId}; vision_answers=${run.vision.answers.length}; diffusion_seed=${run.generation.seed}; scheduler=${run.generation.scheduler}${run.realAdapter ? `; realAdapter=${run.realAdapter.id}` : (isRealSurfaceMode && state.realAdapterError ? `; realAdapter=fallback(${state.realAdapterError})` : "")}`
        : "Run the browser image lab demo."
    },
    environment: state.environment,
    workload: {
      kind: "image-app",
      name: "browser-image-lab-demo",
      input_profile: run ? `${run.vision.imageId}-${run.generation.width}x${run.generation.height}` : "image-lab-pending",
      model_id: run ? "deterministic-browser-image-app-v1" : "pending",
      dataset: run ? "browser-image-fixture-v1" : "pending"
    },
    metrics: {
      common: {
        time_to_interactive_ms: round(performance.now() - state.startedAt, 2) || 0,
        init_ms: run ? round(run.vision.imagePreprocessMs, 2) || 0 : 0,
        success_rate: run ? 1 : 0.5,
        peak_memory_note: navigator.deviceMemory ? `${navigator.deviceMemory} GB reported by browser` : "deviceMemory unavailable",
        error_type: ""
      },
      vlm: {
        image_preprocess_ms: run ? round(run.vision.imagePreprocessMs, 2) || 0 : 0,
        image_to_first_token_ms: run ? round(run.vision.imageToFirstTokenMs, 2) || 0 : 0,
        answer_total_ms: run ? round(run.vision.answerTotalMs, 2) || 0 : 0,
        accuracy_task_score: run ? round(run.vision.accuracyTaskScore, 2) || 0 : 0
      },
      diffusion: {
        sec_per_image: run ? round(run.generation.secPerImage, 3) || 0 : 0,
        steps_per_sec: run ? round(run.generation.stepsPerSec, 2) || 0 : 0,
        resolution_success_rate: run ? round(run.generation.resolutionSuccessRate, 2) || 0 : 0,
        oom_or_fail_rate: run ? round(run.generation.oomOrFailRate, 2) || 0 : 0
      }
    },
    status: run ? "success" : "partial",
    artifacts: {
      raw_logs: state.logs.slice(0, 8),
      deploy_url: "https://ai-webgpu-lab.github.io/app-browser-image-lab/",
      app_surface_adapter: describeAppSurfaceAdapter()
    }
  };
}

function renderStatus() {
  const badges = state.active
    ? ["Vision running", "Diffusion preview decoding"]
    : state.run
      ? [`${state.run.vision.answers.length} answers`, `${state.run.generation.secPerImage}s/image`]
      : ["Image lab ready", "Awaiting run"];

  elements.statusRow.innerHTML = "";
  for (const text of badges) {
    const node = document.createElement("span");
    node.className = "badge";
    node.textContent = text;
    elements.statusRow.appendChild(node);
  }

  elements.summary.textContent = state.active
    ? "Deterministic scene inspection and preview generation are running."
    : state.run
      ? `Integrated image run complete. answer_total_ms ${state.run.vision.answerTotalMs}, sec_per_image ${state.run.generation.secPerImage}, accuracy ${state.run.vision.accuracyTaskScore}.`
      : "Run the image lab to combine scene understanding, image-question answering, and generated preview export in one deterministic app surface.";
}

function renderSource() {
  const fixture = state.fixture;
  if (!fixture) {
    elements.sourceCaption.textContent = "Loading source metadata...";
    elements.sourceMetadata.innerHTML = "";
    return;
  }

  elements.sourceCaption.textContent = fixture.scene.caption;
  const rows = [
    ["Image ID", fixture.scene.id],
    ["Resolution", `${fixture.scene.width} x ${fixture.scene.height}`],
    ["Patch Count", String(fixture.scene.patchCount)],
    ["Focus Regions", fixture.scene.focusRegions.join(", ")]
  ];
  elements.sourceMetadata.innerHTML = rows.map(([label, value]) => `<li><strong>${label}</strong><br><span class="muted">${value}</span></li>`).join("");
}

function renderGenerationPanel() {
  const fixture = state.fixture;
  if (!fixture) {
    elements.generationMetadata.innerHTML = "";
    drawPlaceholder();
    return;
  }

  const generation = state.run ? state.run.generation : fixture.generation;
  const rows = [
    ["Prompt", generation.prompt],
    ["Scheduler", generation.scheduler],
    ["Seed", String(generation.seed)],
    ["Output", `${generation.width} x ${generation.height}`],
    ["Safety", generation.safetyLabel]
  ];
  elements.generationMetadata.innerHTML = rows.map(([label, value]) => `<li><strong>${label}</strong><br><span class="muted">${value}</span></li>`).join("");

  if (!state.run) drawPlaceholder();
}

function renderQuestions() {
  if (!state.fixture) {
    elements.qaView.innerHTML = "<li>Loading questions...</li>";
    return;
  }

  const answers = state.run ? state.run.vision.answers : state.fixture.vision.tasks.map((task) => ({
    question: task.question,
    answer: "pending",
    focusRegion: task.focusRegion,
    imageToFirstTokenMs: null,
    answerTotalMs: null
  }));

  elements.qaView.innerHTML = answers.map((item) => {
    const firstToken = item.imageToFirstTokenMs == null ? "pending" : `${item.imageToFirstTokenMs} ms`;
    const total = item.answerTotalMs == null ? "pending" : `${item.answerTotalMs} ms`;
    return `<li><strong>${item.question}</strong><br><span class="muted">Focus: ${item.focusRegion}</span><br><span class="muted">Answer: ${item.answer}</span><br><span class="muted">first_token=${firstToken} | total=${total}</span></li>`;
  }).join("");
}

function renderFixture() {
  if (!state.fixture) {
    elements.fixtureView.textContent = "Loading fixture summary...";
    return;
  }
  elements.fixtureView.textContent = JSON.stringify({
    scene: state.fixture.scene,
    vision: {
      preprocessMs: state.fixture.vision.preprocessMs,
      tasks: state.fixture.vision.tasks.map((task) => ({
        id: task.id,
        focusRegion: task.focusRegion,
        firstTokenMs: task.firstTokenMs,
        answerTotalMs: task.answerTotalMs
      }))
    },
    generation: {
      seed: state.fixture.generation.seed,
      scheduler: state.fixture.generation.scheduler,
      steps: state.fixture.generation.steps,
      secPerImage: state.fixture.generation.secPerImage
    }
  }, null, 2);
}

function renderMetrics() {
  const run = state.run;
  const cards = [
    ["Image Preprocess", run ? `${run.vision.imagePreprocessMs} ms` : "pending"],
    ["Vision First Token", run ? `${run.vision.imageToFirstTokenMs} ms` : "pending"],
    ["Vision Total", run ? `${run.vision.answerTotalMs} ms` : "pending"],
    ["Accuracy", run ? String(run.vision.accuracyTaskScore) : "pending"],
    ["Sec / Image", run ? `${run.generation.secPerImage} s` : "pending"],
    ["Steps / Sec", run ? String(run.generation.stepsPerSec) : "pending"],
    ["Resolution Success", run ? String(run.generation.resolutionSuccessRate) : "pending"],
    ["OOM / Fail", run ? String(run.generation.oomOrFailRate) : "pending"]
  ];

  elements.metricGrid.innerHTML = cards
    .map(([label, value]) => `<article class="metric-card"><span>${label}</span><strong>${value}</strong></article>`)
    .join("");
}

function renderMeta() {
  const run = state.run;
  const cards = [
    ["Backend", state.environment.backend],
    ["Worker Mode", state.environment.worker_mode],
    ["GPU Adapter", state.environment.gpu.adapter],
    ["Browser", `${state.environment.browser.name} ${state.environment.browser.version}`],
    ["Scene", state.fixture ? state.fixture.scene.id : "pending"],
    ["Prompt Seed", run ? String(run.generation.seed) : state.fixture ? String(state.fixture.generation.seed) : "pending"],
    ["Scheduler", run ? run.generation.scheduler : state.fixture ? state.fixture.generation.scheduler : "pending"],
    ["Safety", run ? run.generation.safetyLabel : state.fixture ? state.fixture.generation.safetyLabel : "pending"]
  ];

  elements.metaGrid.innerHTML = cards
    .map(([label, value]) => `<article class="meta-card"><span>${label}</span><strong>${value}</strong></article>`)
    .join("");
}

function renderLogs() {
  elements.logList.textContent = state.logs.length ? state.logs.join("\n") : "No events yet.";
}

function renderResultJson() {
  elements.resultJson.textContent = JSON.stringify(buildResult(), null, 2);
}

function render() {
  renderStatus();
  renderSource();
  renderGenerationPanel();
  renderQuestions();
  renderMetrics();
  renderMeta();
  renderLogs();
  renderResultJson();
  elements.downloadJson.disabled = !state.run;
}

function downloadResult() {
  if (!state.run) return;
  const blob = new Blob([`${JSON.stringify(buildResult(), null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `app-browser-image-lab-${state.run ? "demo" : "pending"}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

elements.runLab.addEventListener("click", () => {
  runLab().catch((error) => {
    state.active = false;
    log(`Run failed: ${error.message}`);
    render();
  });
});
elements.downloadJson.addEventListener("click", downloadResult);

loadFixture().then(render).catch((error) => {
  log(`Fixture load failed: ${error.message}`);
  render();
});
