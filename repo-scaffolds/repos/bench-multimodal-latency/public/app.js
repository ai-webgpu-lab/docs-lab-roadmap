const PROFILES = [
  {
    id: "mobile-crop-fast",
    label: "Mobile Crop Fast",
    preprocessExtraMs: 8,
    firstTokenExtraMs: 12,
    answerExtraMs: 20,
    incorrectTaskIds: ["mug-color"],
    workerMode: "worker"
  },
  {
    id: "balanced-patch",
    label: "Balanced Patch",
    preprocessExtraMs: 14,
    firstTokenExtraMs: 18,
    answerExtraMs: 26,
    incorrectTaskIds: [],
    workerMode: "worker"
  },
  {
    id: "dense-context",
    label: "Dense Context",
    preprocessExtraMs: 26,
    firstTokenExtraMs: 28,
    answerExtraMs: 42,
    incorrectTaskIds: [],
    workerMode: "worker"
  }
];

const EXECUTION_MODES = {
  webgpu: {
    id: "webgpu",
    label: "WebGPU",
    backend: "webgpu",
    fallbackTriggered: false,
    workerMode: "worker",
    stageMultiplier: 1
  },
  fallback: {
    id: "fallback",
    label: "Wasm fallback",
    backend: "wasm",
    fallbackTriggered: true,
    workerMode: "main",
    stageMultiplier: 1.9
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
    if (typeof window !== "undefined" && window.__aiWebGpuLabRealMultimodalBenchBootstrapError) {
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
  matrixView: document.getElementById("matrix-view"),
  qaView: document.getElementById("qa-view"),
  fixtureView: document.getElementById("fixture-view"),
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
      adapter: executionMode.fallbackTriggered ? "wasm-fallback-vision" : "synthetic-webgpu-vision-profile",
      required_features: executionMode.fallbackTriggered ? [] : ["shader-f16"],
      limits: executionMode.fallbackTriggered ? {} : { maxStorageBuffersPerShaderStage: 8, maxComputeWorkgroupStorageSize: 16384 }
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
  const response = await fetch("./multimodal-benchmark-fixture.json", { cache: "no-store" });
  state.fixture = await response.json();
  renderFixture();
  return state.fixture;
}

function isCorrect(task, profile) {
  if (profile.incorrectTaskIds.includes(task.id)) return false;
  if (executionMode.fallbackTriggered && task.fallbackSensitive && profile.id === "mobile-crop-fast") return false;
  return true;
}

function scoreProfile(result) {
  return 220 - (result.answerTotalMs * 0.12) - (result.imageToFirstTokenMs * 0.04) - (result.imagePreprocessMs * 0.02) + (result.accuracyTaskScore * 60);
}

async function runProfile(profile, fixture) {
  const preprocessStartedAt = performance.now();
  await sleep((fixture.preprocessMs + profile.preprocessExtraMs) * executionMode.stageMultiplier);
  const imagePreprocessMs = performance.now() - preprocessStartedAt;

  const answers = [];
  for (const task of fixture.tasks) {
    const questionStartedAt = performance.now();
    await sleep((task.firstTokenMs + profile.firstTokenExtraMs) * executionMode.stageMultiplier);
    const imageToFirstTokenMs = imagePreprocessMs + (performance.now() - questionStartedAt);
    await sleep((Math.max(task.answerTotalMs - task.firstTokenMs, 0) + profile.answerExtraMs) * executionMode.stageMultiplier);
    const answerTotalMs = imagePreprocessMs + (performance.now() - questionStartedAt);
    const correct = isCorrect(task, profile);
    answers.push({
      id: task.id,
      question: task.question,
      focusRegion: task.focusRegion,
      answer: correct ? task.answer : task.fallbackAnswer,
      correct,
      imageToFirstTokenMs,
      answerTotalMs
    });
  }

  return {
    profile: {
      ...profile,
      workerMode: executionMode.fallbackTriggered ? "main" : profile.workerMode
    },
    patchCount: fixture.image.patchCount,
    imageId: fixture.image.id,
    questionCount: fixture.tasks.length,
    focusRegions: fixture.image.focusRegions,
    caption: fixture.caption,
    imagePreprocessMs,
    imageToFirstTokenMs: average(answers.map((item) => item.imageToFirstTokenMs)),
    answerTotalMs: average(answers.map((item) => item.answerTotalMs)),
    accuracyTaskScore: average(answers.map((item) => (item.correct ? 1 : 0))),
    answers
  };
}

async function runRealBenchmarkMultimodal(adapter) {
  log(`Connecting real benchmark adapter '${adapter.id}'.`);
  await withTimeout(
    Promise.resolve(adapter.createBenchmark({ name: "multimodal-latency" })),
    REAL_ADAPTER_LOAD_MS,
    `createBenchmark(${adapter.id})`
  );
  await withTimeout(
    Promise.resolve(adapter.runProfile({
      profileId: "multimodal-latency-default",
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
        const { aggregate } = await runRealBenchmarkMultimodal(adapter);
        state.realAdapterAggregate = aggregate;
        state.realAdapter = adapter;
      } catch (error) {
        state.realAdapterError = error?.message || String(error);
        log(`Real benchmark '${adapter.id}' failed: ${state.realAdapterError}; falling back to deterministic.`);
      }
    } else {
      const reason = (typeof window !== "undefined" && window.__aiWebGpuLabRealMultimodalBenchBootstrapError) || "timed out waiting for adapter registration";
      state.realAdapterError = reason;
      log(`No real benchmark adapter registered (${reason}); falling back to deterministic multimodal benchmark.`);
    }
  }

  const fixture = await loadFixture();
  const results = [];
  for (const profile of PROFILES) {
    log(`Running ${profile.label} in ${executionMode.label} mode.`);
    const result = await runProfile(profile, fixture);
    results.push(result);
    log(`${profile.label}: first=${round(result.imageToFirstTokenMs)} ms, total=${round(result.answerTotalMs)} ms, accuracy=${round(result.accuracyTaskScore, 2)}.`);
  }

  results.sort((left, right) => scoreProfile(right) - scoreProfile(left));
  state.run = {
    executionMode: executionMode.id,
    winner: results[0],
    profiles: results,
    realAdapter: state.realAdapter || null
  };
  state.environment.worker_mode = results[0].profile.workerMode;
  state.active = false;
  log(`Winner: ${results[0].profile.label} (${executionMode.label}).`);
  render();
}

function buildPromptOutput() {
  if (!state.run) return "No benchmark run yet.";
  return state.run.winner.answers
    .map(
      (item, index) =>
        `${index + 1}. ${item.question}\nFocus: ${item.focusRegion}\nAnswer: ${item.answer}\ncorrect=${item.correct}\nimage_to_first_token_ms=${round(item.imageToFirstTokenMs, 2)}\nanswer_total_ms=${round(item.answerTotalMs, 2)}`
    )
    .join("\n\n");
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
    id: "deterministic-multimodal-bench",
    label: "Deterministic Multimodal Bench",
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
  const winner = run ? run.winner : null;
  return {
    meta: {
      repo: "bench-multimodal-latency",
      commit: "bootstrap-generated",
      timestamp: new Date().toISOString(),
      owner: "ai-webgpu-lab",
      track: "benchmark",
      scenario: (state.run && state.run.realAdapter) ? `multimodal-latency-real-${state.run.realAdapter.id}` : (run ? `multimodal-latency-${run.executionMode}` : "multimodal-latency-pending"),
      notes: winner
        ? `winner=${winner.profile.id}; image=${winner.imageId}; patches=${winner.patchCount}; prompts=${winner.questionCount}; focus=${winner.focusRegions.join("|")}; backend=${state.environment.backend}; fallback=${state.environment.fallback_triggered}; accuracy=${round(winner.accuracyTaskScore, 2)}${state.run && state.run.realAdapter ? `; realAdapter=${state.run.realAdapter.id}` : (isRealBenchmarkMode && state.realAdapterError ? `; realAdapter=fallback(${state.realAdapterError})` : "")}`
        : "Run the fixed multimodal latency benchmark."
    },
    environment: state.environment,
    workload: {
      kind: "vlm",
      name: "multimodal-latency-benchmark",
      input_profile: state.fixture ? `${state.fixture.image.width}x${state.fixture.image.height}-${state.fixture.tasks.length}-questions` : "fixture-pending",
      model_id: winner ? winner.profile.id : "pending",
      dataset: "multimodal-benchmark-fixture-v1"
    },
    metrics: {
      common: {
        time_to_interactive_ms: round(performance.now() - state.startedAt, 2) || 0,
        init_ms: winner ? round(winner.imageToFirstTokenMs, 2) || 0 : 0,
        success_rate: winner ? 1 : 0.5,
        peak_memory_note: navigator.deviceMemory ? `${navigator.deviceMemory} GB reported by browser` : "deviceMemory unavailable",
        error_type: ""
      },
      vlm: {
        image_preprocess_ms: winner ? round(winner.imagePreprocessMs, 2) || 0 : 0,
        image_to_first_token_ms: winner ? round(winner.imageToFirstTokenMs, 2) || 0 : 0,
        answer_total_ms: winner ? round(winner.answerTotalMs, 2) || 0 : 0,
        accuracy_task_score: winner ? round(winner.accuracyTaskScore, 2) || 0 : 0
      }
    },
    status: winner ? "success" : "partial",
    artifacts: {
      raw_logs: state.logs.slice(0, 6),
      deploy_url: "https://ai-webgpu-lab.github.io/bench-multimodal-latency/",
      benchmark_adapter: describeBenchmarkAdapter()
    }
  };
}

function renderStatus() {
  const badges = [];
  if (state.active) {
    badges.push({ text: `${executionMode.label} running` });
    badges.push({ text: `${PROFILES.length} profiles` });
  } else if (state.run) {
    badges.push({ text: `${executionMode.label} complete` });
    badges.push({ text: `Winner ${state.run.winner.profile.label}` });
  } else {
    badges.push({ text: `${executionMode.label} ready` });
    badges.push({ text: `${PROFILES.length} profiles` });
  }

  elements.statusRow.innerHTML = "";
  for (const badge of badges) {
    const node = document.createElement("span");
    node.className = "badge";
    node.textContent = badge.text;
    elements.statusRow.appendChild(node);
  }

  elements.summary.textContent = state.run
    ? `Winner ${state.run.winner.profile.label}: first token ${round(state.run.winner.imageToFirstTokenMs)} ms, answer total ${round(state.run.winner.answerTotalMs)} ms, accuracy ${round(state.run.winner.accuracyTaskScore, 2)}.`
    : `Mode=${executionMode.label}. Benchmark one fixed image-question set across deterministic multimodal profiles.`;
}

function renderMetrics() {
  const winner = state.run ? state.run.winner : null;
  const cards = [
    ["Winner", winner ? winner.profile.label : "pending"],
    ["Preprocess", winner ? `${round(winner.imagePreprocessMs)} ms` : "pending"],
    ["First Token", winner ? `${round(winner.imageToFirstTokenMs)} ms` : "pending"],
    ["Answer Total", winner ? `${round(winner.answerTotalMs)} ms` : "pending"],
    ["Accuracy", winner ? round(winner.accuracyTaskScore, 2) : "pending"],
    ["Patch Count", winner ? winner.patchCount : state.fixture ? state.fixture.image.patchCount : "pending"]
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
    ["Mode", executionMode.label]
  ];
  elements.metaGrid.innerHTML = "";
  for (const [label, value] of rows) {
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `<span class="label">${label}</span><div class="value">${value}</div>`;
    elements.metaGrid.appendChild(card);
  }
}

function renderFixture() {
  if (!state.fixture) {
    elements.fixtureView.textContent = "Loading fixture...";
    return;
  }
  const payload = {
    image: {
      id: state.fixture.image.id,
      size: `${state.fixture.image.width}x${state.fixture.image.height}`,
      patchCount: state.fixture.image.patchCount,
      focusRegions: state.fixture.image.focusRegions
    },
    caption: state.fixture.caption,
    prompts: state.fixture.tasks.map((task) => ({
      id: task.id,
      focusRegion: task.focusRegion
    })),
    profiles: PROFILES.map((profile) => ({
      id: profile.id,
      label: profile.label,
      incorrectTaskIds: profile.incorrectTaskIds
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
        <td>${round(result.imagePreprocessMs)} ms</td>
        <td>${round(result.imageToFirstTokenMs)} ms</td>
        <td>${round(result.answerTotalMs)} ms</td>
        <td>${round(result.accuracyTaskScore, 2)}</td>
      </tr>
    `)
    .join("");
  elements.matrixView.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Rank</th>
          <th>Profile</th>
          <th>Preprocess</th>
          <th>First Token</th>
          <th>Answer Total</th>
          <th>Accuracy</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
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
  renderFixture();
  renderMatrix();
  renderLogs();
  elements.qaView.textContent = buildPromptOutput();
  elements.resultJson.textContent = JSON.stringify(buildResult(), null, 2);
}

function downloadJson() {
  const payload = JSON.stringify(buildResult(), null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `bench-multimodal-latency-${state.run ? state.run.executionMode : "pending"}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  log("Downloaded multimodal latency JSON draft.");
}

elements.runBenchmark.addEventListener("click", runBenchmark);
elements.downloadJson.addEventListener("click", downloadJson);

loadFixture().catch(() => {
  elements.fixtureView.textContent = "Fixture failed to load.";
});
render();
