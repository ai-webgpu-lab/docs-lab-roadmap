const BENCHMARK_PROFILE = Object.freeze({
  rounds: 40,
  burnMs: 14,
  timerIntervalMs: 50
});

const state = {
  startedAt: performance.now(),
  environment: buildEnvironment(),
  run: {
    scenario: "idle",
    active: false,
    completed: false,
    totalMs: null,
    frameSamples: [],
    timerLagSamples: [],
    inputLagSamples: [],
    workerRttSamples: [],
    error: ""
  },
  visuals: {
    pulse: 0,
    previousFrameAt: 0
  },
  logs: []
};

const elements = {
  statusRow: document.getElementById("status-row"),
  summary: document.getElementById("summary"),
  runMain: document.getElementById("run-main"),
  runWorker: document.getElementById("run-worker"),
  downloadJson: document.getElementById("download-json"),
  reset: document.getElementById("reset"),
  probeInput: document.getElementById("probe-input"),
  metricGrid: document.getElementById("metric-grid"),
  metaGrid: document.getElementById("meta-grid"),
  logList: document.getElementById("log-list"),
  resultJson: document.getElementById("result-json"),
  canvas: document.getElementById("timeline-canvas")
};

let heartbeatTimer = 0;
let animationFrame = 0;
let benchmarkWorker = null;
let workerRequestId = 0;
const workerResolvers = new Map();

function round(value, digits = 2) {
  if (!Number.isFinite(value)) {
    return null;
  }

  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

function average(values) {
  if (!values.length) {
    return null;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function percentile(values, ratio) {
  if (!values.length) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function parseBrowser() {
  const ua = navigator.userAgent;
  const candidates = [
    ["Edg/", "Edge"],
    ["Chrome/", "Chrome"],
    ["Firefox/", "Firefox"],
    ["Version/", "Safari"]
  ];

  for (const [needle, name] of candidates) {
    const marker = ua.indexOf(needle);
    if (marker >= 0) {
      return {
        name,
        version: ua.slice(marker + needle.length).split(/[\s)/;]/)[0] || "unknown"
      };
    }
  }

  return { name: "Unknown", version: "unknown" };
}

function parseOs() {
  const ua = navigator.userAgent;

  if (/Windows NT/i.test(ua)) {
    const match = ua.match(/Windows NT ([0-9.]+)/i);
    return { name: "Windows", version: match ? match[1] : "unknown" };
  }

  if (/Mac OS X/i.test(ua)) {
    const match = ua.match(/Mac OS X ([0-9_]+)/i);
    return { name: "macOS", version: match ? match[1].replace(/_/g, ".") : "unknown" };
  }

  if (/Android/i.test(ua)) {
    const match = ua.match(/Android ([0-9.]+)/i);
    return { name: "Android", version: match ? match[1] : "unknown" };
  }

  if (/(iPhone|iPad|CPU OS)/i.test(ua)) {
    const match = ua.match(/OS ([0-9_]+)/i);
    return { name: "iOS", version: match ? match[1].replace(/_/g, ".") : "unknown" };
  }

  if (/Linux/i.test(ua)) {
    return { name: "Linux", version: "unknown" };
  }

  return { name: "Unknown", version: "unknown" };
}

function inferDeviceClass() {
  const threads = navigator.hardwareConcurrency || 0;
  const memory = navigator.deviceMemory || 0;
  const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

  if (mobile) {
    return memory >= 6 && threads >= 8 ? "mobile-high" : "mobile-mid";
  }

  if (memory >= 16 && threads >= 12) {
    return "desktop-high";
  }

  if (memory >= 8 && threads >= 8) {
    return "desktop-mid";
  }

  if (threads >= 4) {
    return "laptop";
  }

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
      adapter: "not-applicable",
      required_features: [],
      limits: {}
    },
    backend: "mixed",
    fallback_triggered: false,
    worker_mode: "unknown",
    cache_state: "unknown"
  };
}

function log(message) {
  state.logs.unshift(`[${new Date().toLocaleTimeString()}] ${message}`);
  state.logs = state.logs.slice(0, 12);
  renderLogs();
}

function burnCpu(durationMs) {
  const startedAt = performance.now();
  let accumulator = 0;

  while (performance.now() - startedAt < durationMs) {
    accumulator += Math.sqrt(accumulator + 11.7) * Math.cos(accumulator + 0.5);
  }

  return accumulator;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resetRunState() {
  state.run = {
    scenario: "idle",
    active: false,
    completed: false,
    totalMs: null,
    frameSamples: [],
    timerLagSamples: [],
    inputLagSamples: [],
    workerRttSamples: [],
    error: ""
  };
  state.environment = buildEnvironment();
}

function ensureWorker() {
  if (benchmarkWorker) {
    return benchmarkWorker;
  }

  benchmarkWorker = new Worker("./jank-worker.js");
  benchmarkWorker.onmessage = (event) => {
    const { id, durationMs } = event.data || {};
    const resolver = workerResolvers.get(id);
    if (!resolver) {
      return;
    }

    workerResolvers.delete(id);
    resolver(durationMs);
  };

  return benchmarkWorker;
}

function workerBurn(durationMs) {
  const worker = ensureWorker();
  workerRequestId += 1;
  const id = workerRequestId;

  return new Promise((resolve) => {
    workerResolvers.set(id, resolve);
    worker.postMessage({
      type: "burn",
      id,
      durationMs
    });
  });
}

function renderStatus() {
  let summary = "Choose one scenario. Both modes use the same burn profile so you can compare how much responsiveness is preserved when the work moves off the main thread.";
  let badges = [
    { tone: "warn", text: "Idle" },
    { tone: "warn", text: "No benchmark run yet" }
  ];

  if (state.run.active) {
    summary = `Scenario ${state.run.scenario} is running with ${BENCHMARK_PROFILE.rounds} rounds x ${BENCHMARK_PROFILE.burnMs} ms burn.`;
    badges = [
      { tone: "success", text: state.run.scenario === "worker" ? "Worker active" : "Main thread active" },
      { tone: "warn", text: "Telemetry sampling" }
    ];
  } else if (state.run.completed) {
    summary = state.run.error
      ? `Last run failed: ${state.run.error}`
      : `Scenario ${state.run.scenario} completed. Compare frame/timer lag against the other mode before exporting a raw result.`;
    badges = [
      { tone: state.run.error ? "danger" : "success", text: state.run.error ? "Run failed" : "Run complete" },
      { tone: state.run.scenario === "worker" ? "success" : "warn", text: state.run.scenario }
    ];
  }

  elements.summary.textContent = summary;
  elements.statusRow.innerHTML = "";
  for (const badge of badges) {
    const node = document.createElement("span");
    node.className = `badge ${badge.tone}`;
    node.textContent = badge.text;
    elements.statusRow.appendChild(node);
  }
}

function renderMetrics() {
  const avgFrameMs = average(state.run.frameSamples);
  const avgFps = avgFrameMs ? 1000 / avgFrameMs : null;
  const p95Frame = percentile(state.run.frameSamples, 0.95);
  const p95TimerLag = percentile(state.run.timerLagSamples, 0.95);
  const p95InputLag = percentile(state.run.inputLagSamples, 0.95);
  const p95WorkerRtt = percentile(state.run.workerRttSamples, 0.95);

  const cards = [
    ["Scenario", state.run.scenario],
    ["Total", state.run.totalMs ? `${round(state.run.totalMs, 1)} ms` : "pending"],
    ["Avg FPS", avgFps ? `${round(avgFps, 1)} fps` : "pending"],
    ["P95 Frame", p95Frame ? `${round(p95Frame, 2)} ms` : "pending"],
    ["P95 Timer Lag", p95TimerLag ? `${round(p95TimerLag, 2)} ms` : "pending"],
    ["P95 Input Lag", p95InputLag ? `${round(p95InputLag, 2)} ms` : "optional"],
    ["Worker P95 RTT", p95WorkerRtt ? `${round(p95WorkerRtt, 2)} ms` : state.run.scenario === "worker" ? "pending" : "n/a"],
    ["Samples", `${state.run.frameSamples.length} frame / ${state.run.timerLagSamples.length} timer`]
  ];

  elements.metricGrid.innerHTML = "";
  for (const [label, value] of cards) {
    const card = document.createElement("article");
    card.className = "card";
    const labelNode = document.createElement("span");
    labelNode.className = "label";
    labelNode.textContent = label;
    const valueNode = document.createElement("div");
    valueNode.className = "value";
    valueNode.textContent = value;
    card.appendChild(labelNode);
    card.appendChild(valueNode);
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
    ["Backend", state.environment.backend],
    ["Worker Mode", state.environment.worker_mode]
  ];

  elements.metaGrid.innerHTML = "";
  for (const [label, value] of info) {
    const card = document.createElement("article");
    card.className = "card";
    const labelNode = document.createElement("span");
    labelNode.className = "label";
    labelNode.textContent = label;
    const valueNode = document.createElement("div");
    valueNode.className = "value";
    valueNode.textContent = value;
    card.appendChild(labelNode);
    card.appendChild(valueNode);
    elements.metaGrid.appendChild(card);
  }
}

function renderLogs() {
  elements.logList.innerHTML = "";

  if (!state.logs.length) {
    const li = document.createElement("li");
    li.textContent = "No benchmark activity yet.";
    elements.logList.appendChild(li);
    return;
  }

  for (const entry of state.logs) {
    const li = document.createElement("li");
    li.textContent = entry;
    elements.logList.appendChild(li);
  }
}

function buildResult() {
  const avgFrameMs = average(state.run.frameSamples);
  const avgFps = avgFrameMs ? 1000 / avgFrameMs : 0;
  const p95Frame = percentile(state.run.frameSamples, 0.95) || 0;
  const p95TimerLag = percentile(state.run.timerLagSamples, 0.95);
  const p95InputLag = percentile(state.run.inputLagSamples, 0.95);
  const p95WorkerRtt = percentile(state.run.workerRttSamples, 0.95);
  const notes = [
    `scenario=${state.run.scenario}`,
    `timerLagP95=${round(p95TimerLag || 0, 2)}`,
    `inputLagP95=${round(p95InputLag || 0, 2)}`,
    `workerRttP95=${round(p95WorkerRtt || 0, 2)}`,
    `rounds=${BENCHMARK_PROFILE.rounds}`,
    `burnMs=${BENCHMARK_PROFILE.burnMs}`
  ].join("; ");

  return {
    meta: {
      repo: "bench-worker-isolation-and-ui-jank",
      commit: "bootstrap-generated",
      timestamp: new Date().toISOString(),
      owner: "ai-webgpu-lab",
      track: "benchmark",
      scenario: `worker-isolation-${state.run.scenario}`,
      notes
    },
    environment: state.environment,
    workload: {
      kind: "graphics",
      name: "worker-isolation-jank-harness",
      input_profile: `${BENCHMARK_PROFILE.rounds}x${BENCHMARK_PROFILE.burnMs}ms-burn`
    },
    metrics: {
      common: {
        time_to_interactive_ms: round(performance.now() - state.startedAt, 2) || 0,
        init_ms: round(state.run.totalMs || 0, 2) || 0,
        success_rate: state.run.error ? 0 : state.run.completed ? 1 : 0.5,
        peak_memory_note: navigator.deviceMemory ? `${navigator.deviceMemory} GB reported by browser` : "deviceMemory unavailable",
        error_type: state.run.error || ""
      },
      graphics: {
        avg_fps: round(avgFps, 2) || 0,
        p95_frametime_ms: round(p95Frame, 2) || 0,
        scene_load_ms: round(state.run.totalMs || 0, 2) || 0,
        resolution_scale: 1,
        taa_enabled: false,
        visual_artifact_note: notes
      }
    },
    status: state.run.error ? "failed" : state.run.completed ? "success" : "partial",
    artifacts: {
      raw_logs: state.logs.slice(0, 5),
      deploy_url: "https://ai-webgpu-lab.github.io/bench-worker-isolation-and-ui-jank/"
    }
  };
}

function renderResult() {
  elements.resultJson.textContent = JSON.stringify(buildResult(), null, 2);
}

function drawTimeline() {
  const context = elements.canvas.getContext("2d");
  const { width, height } = elements.canvas;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#07111a";
  context.fillRect(0, 0, width, height);

  const avgFrameMs = average(state.run.frameSamples) || 16.67;
  const normalized = Math.min(1, avgFrameMs / 40);
  const barWidth = width * (0.18 + (state.visuals.pulse * 0.6));
  const barHeight = 48 + normalized * 120;
  const x = 40 + state.visuals.pulse * (width - barWidth - 80);
  const y = (height - barHeight) / 2;

  context.fillStyle = state.run.scenario === "worker" ? "#22d3ee" : "#f97316";
  context.fillRect(x, y, barWidth, barHeight);

  context.strokeStyle = "#7dd3fc";
  context.lineWidth = 2;
  context.beginPath();

  const recentSamples = state.run.frameSamples.slice(-80);
  recentSamples.forEach((sample, index) => {
    const pointX = 20 + ((width - 40) * index) / Math.max(1, recentSamples.length - 1);
    const pointY = height - 28 - Math.min(120, sample * 3.2);
    if (index === 0) {
      context.moveTo(pointX, pointY);
    } else {
      context.lineTo(pointX, pointY);
    }
  });

  context.stroke();
}

function animationLoop(timestamp) {
  if (state.visuals.previousFrameAt !== 0) {
    const delta = timestamp - state.visuals.previousFrameAt;
    if (state.run.active) {
      state.run.frameSamples.push(delta);
      state.run.frameSamples = state.run.frameSamples.slice(-200);
    }
  }

  state.visuals.previousFrameAt = timestamp;
  state.visuals.pulse = (Math.sin(timestamp * 0.002) + 1) / 2;
  drawTimeline();

  if (state.run.active && state.run.frameSamples.length % 18 === 0) {
    render();
  }

  animationFrame = requestAnimationFrame(animationLoop);
}

function scheduleHeartbeat() {
  const expected = performance.now() + BENCHMARK_PROFILE.timerIntervalMs;
  heartbeatTimer = setTimeout(() => {
    if (state.run.active) {
      state.run.timerLagSamples.push(Math.max(0, performance.now() - expected));
      state.run.timerLagSamples = state.run.timerLagSamples.slice(-200);
    }

    scheduleHeartbeat();
  }, BENCHMARK_PROFILE.timerIntervalMs);
}

function render() {
  renderStatus();
  renderMetrics();
  renderEnvironment();
  renderLogs();
  renderResult();
}

async function runScenario(mode) {
  if (state.run.active) {
    return;
  }

  resetRunState();
  state.run.scenario = mode;
  state.run.active = true;
  state.environment.worker_mode = mode === "worker" ? "worker" : "main";
  render();

  log(`Scenario ${mode} started.`);
  const startedAt = performance.now();

  try {
    if (mode === "main") {
      for (let roundIndex = 0; roundIndex < BENCHMARK_PROFILE.rounds; roundIndex += 1) {
        burnCpu(BENCHMARK_PROFILE.burnMs);
        await sleep(0);
      }
    } else {
      for (let roundIndex = 0; roundIndex < BENCHMARK_PROFILE.rounds; roundIndex += 1) {
        const requestStartedAt = performance.now();
        const workerDuration = await workerBurn(BENCHMARK_PROFILE.burnMs);
        state.run.workerRttSamples.push(performance.now() - requestStartedAt);
        state.run.workerRttSamples = state.run.workerRttSamples.slice(-200);

        if (roundIndex % 8 === 0) {
          log(`Worker progress ${roundIndex + 1}/${BENCHMARK_PROFILE.rounds}, burn=${round(workerDuration, 2)} ms.`);
          render();
        }
      }
    }
  } catch (error) {
    state.run.error = error instanceof Error ? error.message : String(error);
    log(`Scenario ${mode} failed: ${state.run.error}.`);
  } finally {
    state.run.totalMs = performance.now() - startedAt;
    state.run.active = false;
    state.run.completed = true;
    log(`Scenario ${mode} finished in ${round(state.run.totalMs, 1)} ms.`);
    render();
  }
}

function downloadJson() {
  const payload = JSON.stringify(buildResult(), null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `bench-worker-isolation-and-ui-jank-${state.run.scenario || "idle"}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  log("Downloaded worker isolation benchmark JSON draft.");
}

function resetHarness() {
  resetRunState();
  render();
  log("Worker isolation harness reset.");
}

elements.runMain.addEventListener("click", () => {
  runScenario("main");
});

elements.runWorker.addEventListener("click", () => {
  runScenario("worker");
});

elements.downloadJson.addEventListener("click", downloadJson);
elements.reset.addEventListener("click", resetHarness);
elements.probeInput.addEventListener("input", (event) => {
  if (!state.run.active) {
    return;
  }

  state.run.inputLagSamples.push(Math.max(0, performance.now() - event.timeStamp));
  state.run.inputLagSamples = state.run.inputLagSamples.slice(-200);
});

animationFrame = requestAnimationFrame(animationLoop);
scheduleHeartbeat();
log("Worker isolation harness ready.");
render();
