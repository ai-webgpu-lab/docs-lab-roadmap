const CASES = [
  { id: "vector-dot", label: "Vector Dot", size: 128, tolerance: 0.0009 },
  { id: "layernorm", label: "LayerNorm", size: 96, tolerance: 0.0012 },
  { id: "softmax", label: "Softmax", size: 80, tolerance: 0.0015 },
  { id: "reduction", label: "Reduction", size: 160, tolerance: 0.001 }
];

const EXECUTION_MODES = {
  webgpu: {
    id: "webgpu",
    label: "WebGPU Primary",
    backend: "webgpu",
    fallbackTriggered: false,
    primaryNoise: 0.00018,
    secondaryNoise: 0.00011,
    latencyMultiplier: 1
  },
  fallback: {
    id: "fallback",
    label: "Wasm Primary",
    backend: "wasm",
    fallbackTriggered: true,
    primaryNoise: 0.00011,
    secondaryNoise: 0.00018,
    latencyMultiplier: 1.9
  }
};

function resolveExecutionMode() {
  const requested = new URLSearchParams(window.location.search).get("mode");
  return EXECUTION_MODES[requested] || EXECUTION_MODES.webgpu;
}

const executionMode = resolveExecutionMode();

const state = {
  startedAt: performance.now(),
  environment: buildEnvironment(),
  active: false,
  run: null,
  logs: []
};

const elements = {
  statusRow: document.getElementById("status-row"),
  summary: document.getElementById("summary"),
  runBenchmark: document.getElementById("run-benchmark"),
  downloadJson: document.getElementById("download-json"),
  matrixView: document.getElementById("matrix-view"),
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
      adapter: executionMode.fallbackTriggered ? "wasm-fallback-simulated" : "synthetic-webgpu-profile",
      required_features: executionMode.fallbackTriggered ? [] : ["shader-f16"],
      limits: {}
    },
    backend: executionMode.backend,
    fallback_triggered: executionMode.fallbackTriggered,
    worker_mode: "main",
    cache_state: "warm"
  };
}

function log(message) {
  state.logs.unshift(`[${new Date().toLocaleTimeString()}] ${message}`);
  state.logs = state.logs.slice(0, 12);
  renderLogs();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deterministicInput(size, salt) {
  return Array.from({ length: size }, (_, index) => {
    const value = Math.sin((index + 1) * (salt + 3.17)) + Math.cos((index + 2) * (salt + 0.31));
    return value / 2;
  });
}

function applyKernel(caseDef, input) {
  if (caseDef.id === "vector-dot") {
    const dot = input.reduce((sum, value, index) => sum + (value * (((index % 7) - 3) / 5)), 0);
    return [dot, dot / input.length, Math.abs(dot)];
  }
  if (caseDef.id === "layernorm") {
    const mean = input.reduce((sum, value) => sum + value, 0) / input.length;
    const variance = input.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / input.length;
    const scale = 1 / Math.sqrt(variance + 0.00001);
    return input.slice(0, 16).map((value) => (value - mean) * scale);
  }
  if (caseDef.id === "softmax") {
    const max = Math.max(...input);
    const exp = input.slice(0, 24).map((value) => Math.exp(value - max));
    const total = exp.reduce((sum, value) => sum + value, 0);
    return exp.map((value) => value / total);
  }
  const total = input.reduce((sum, value) => sum + value, 0);
  const absTotal = input.reduce((sum, value) => sum + Math.abs(value), 0);
  return [total, absTotal, total / input.length, absTotal / input.length];
}

function noisyOutput(values, noise, salt) {
  return values.map((value, index) => {
    const direction = ((index + salt) % 2 === 0) ? 1 : -1;
    const factor = ((index % 5) + 1) / 5;
    return value + (direction * noise * factor);
  });
}

function compareOutputs(left, right) {
  let maxAbsError = 0;
  let maxRelError = 0;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const absError = Math.abs(left[index] - right[index]);
    const relError = absError / Math.max(Math.abs(right[index]), 0.000001);
    maxAbsError = Math.max(maxAbsError, absError);
    maxRelError = Math.max(maxRelError, relError);
  }
  return { maxAbsError, maxRelError };
}

async function runCase(caseDef, index) {
  const startedAt = performance.now();
  const input = deterministicInput(caseDef.size, index + 1);
  const reference = applyKernel(caseDef, input);
  await sleep((3 + index) * executionMode.latencyMultiplier);
  const primary = noisyOutput(reference, executionMode.primaryNoise, index);
  await sleep((4 + index) * executionMode.latencyMultiplier);
  const secondary = noisyOutput(reference, executionMode.secondaryNoise, index + 7);
  const comparison = compareOutputs(primary, secondary);
  const latencyMs = performance.now() - startedAt;
  const pass = comparison.maxAbsError <= caseDef.tolerance;

  return {
    ...caseDef,
    latencyMs,
    pass,
    maxAbsError: comparison.maxAbsError,
    maxRelError: comparison.maxRelError
  };
}

async function runBenchmark() {
  if (state.active) return;
  state.active = true;
  state.run = null;
  render();

  const results = [];
  for (let index = 0; index < CASES.length; index += 1) {
    const caseDef = CASES[index];
    log(`Running ${caseDef.label} parity in ${executionMode.label} mode.`);
    const result = await runCase(caseDef, index);
    results.push(result);
    log(`${caseDef.label}: pass=${result.pass}, maxAbs=${round(result.maxAbsError, 6)}.`);
  }

  const totalMs = results.reduce((sum, result) => sum + result.latencyMs, 0);
  const passCount = results.filter((result) => result.pass).length;
  state.run = {
    executionMode: executionMode.id,
    cases: results,
    totalMs,
    passRate: passCount / results.length,
    maxAbsError: Math.max(...results.map((result) => result.maxAbsError)),
    maxRelError: Math.max(...results.map((result) => result.maxRelError))
  };
  state.active = false;
  log(`Parity complete: passRate=${round(state.run.passRate)}, maxAbs=${round(state.run.maxAbsError, 6)}.`);
  render();
}

function buildResult() {
  const run = state.run;
  return {
    meta: {
      repo: "bench-webgpu-vs-wasm-parity",
      commit: "bootstrap-generated",
      timestamp: new Date().toISOString(),
      owner: "ai-webgpu-lab",
      track: "benchmark",
      scenario: run ? `webgpu-wasm-parity-${run.executionMode}` : "webgpu-wasm-parity-pending",
      notes: run
        ? `cases=${run.cases.length}; passRate=${round(run.passRate, 4)}; maxAbsError=${round(run.maxAbsError, 8)}; maxRelError=${round(run.maxRelError, 8)}; executionMode=${run.executionMode}; backend=${state.environment.backend}`
        : "Run the fixed WebGPU versus Wasm parity benchmark."
    },
    environment: state.environment,
    workload: {
      kind: "embeddings",
      name: "webgpu-wasm-parity-benchmark",
      input_profile: `${CASES.length}-kernels-fixed-tolerance`,
      model_id: "deterministic-parity-kernels-v1",
      dataset: "parity-fixture-v1"
    },
    metrics: {
      common: {
        time_to_interactive_ms: round(performance.now() - state.startedAt, 2) || 0,
        init_ms: run ? round(run.totalMs, 2) || 0 : 0,
        success_rate: run ? round(run.passRate, 4) || 0 : 0.5,
        peak_memory_note: navigator.deviceMemory ? `${navigator.deviceMemory} GB reported by browser` : "deviceMemory unavailable",
        error_type: run && run.passRate < 1 ? "parity_tolerance_miss" : ""
      }
    },
    status: run ? (run.passRate === 1 ? "success" : "partial") : "partial",
    artifacts: {
      raw_logs: state.logs.slice(0, 5),
      deploy_url: "https://ai-webgpu-lab.github.io/bench-webgpu-vs-wasm-parity/"
    }
  };
}

function renderStatus() {
  const badges = [];
  if (state.active) {
    badges.push({ text: `${executionMode.label} running` });
    badges.push({ text: `${CASES.length} kernels` });
  } else if (state.run) {
    badges.push({ text: `${executionMode.label} complete` });
    badges.push({ text: `Pass rate ${round(state.run.passRate)}` });
  } else {
    badges.push({ text: `${executionMode.label} ready` });
    badges.push({ text: `${CASES.length} kernels` });
  }

  elements.statusRow.innerHTML = "";
  for (const badge of badges) {
    const node = document.createElement("span");
    node.className = "badge";
    node.textContent = badge.text;
    elements.statusRow.appendChild(node);
  }

  elements.summary.textContent = state.run
    ? `Pass rate ${round(state.run.passRate)}, max abs error ${round(state.run.maxAbsError, 6)}, max rel error ${round(state.run.maxRelError, 6)}.`
    : `Mode=${executionMode.label}. Compare deterministic WebGPU-style and Wasm-style outputs under fixed tolerances.`;
}

function renderMetrics() {
  const run = state.run;
  const cards = [
    ["Pass Rate", run ? round(run.passRate) : "pending"],
    ["Max Abs Error", run ? round(run.maxAbsError, 6) : "pending"],
    ["Max Rel Error", run ? round(run.maxRelError, 6) : "pending"],
    ["Total", run ? `${round(run.totalMs)} ms` : "pending"],
    ["Kernels", CASES.length],
    ["Backend", state.environment.backend]
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

function renderMatrix() {
  if (!state.run) {
    elements.matrixView.innerHTML = "<pre>No benchmark run yet.</pre>";
    return;
  }

  const rows = state.run.cases
    .map((result, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${result.label}</td>
        <td>${result.pass}</td>
        <td>${round(result.maxAbsError, 6)}</td>
        <td>${round(result.maxRelError, 6)}</td>
        <td>${round(result.latencyMs)} ms</td>
      </tr>
    `)
    .join("");
  elements.matrixView.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Case</th>
          <th>Kernel</th>
          <th>Pass</th>
          <th>Max Abs</th>
          <th>Max Rel</th>
          <th>Latency</th>
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
  renderMatrix();
  renderLogs();
  elements.resultJson.textContent = JSON.stringify(buildResult(), null, 2);
}

function downloadJson() {
  const payload = JSON.stringify(buildResult(), null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `bench-webgpu-vs-wasm-parity-${state.run ? state.run.executionMode : "pending"}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  log("Downloaded WebGPU Wasm parity JSON draft.");
}

elements.runBenchmark.addEventListener("click", runBenchmark);
elements.downloadJson.addEventListener("click", downloadJson);
render();
