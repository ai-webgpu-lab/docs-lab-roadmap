const FIXED_PROMPT = "Explain why browser AI benchmark comparisons need shared prompts, fixed output budgets, cache-state notes, and worker-mode visibility.";

const EXECUTION_MODES = {
  webgpu: {
    id: "webgpu",
    label: "WebGPU",
    backend: "webgpu",
    fallbackTriggered: false,
    initMultiplier: 1,
    prefillMultiplier: 1,
    decodeMultiplier: 1,
    workerMode: "mixed"
  },
  fallback: {
    id: "fallback",
    label: "Wasm Fallback",
    backend: "wasm",
    fallbackTriggered: true,
    initMultiplier: 1.8,
    prefillMultiplier: 2.1,
    decodeMultiplier: 2.35,
    workerMode: "main"
  }
};

function resolveExecutionMode() {
  const requested = new URLSearchParams(window.location.search).get("mode");
  return EXECUTION_MODES[requested] || EXECUTION_MODES.webgpu;
}

const executionMode = resolveExecutionMode();

const state = {
  startedAt: performance.now(),
  executionMode,
  environment: buildEnvironment(),
  profiles: null,
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
  const factor = Math.pow(10, digits);
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
    worker_mode: executionMode.workerMode,
    cache_state: "warm"
  };
}

function log(message) {
  state.logs.unshift(`[${new Date().toLocaleTimeString()}] ${message}`);
  state.logs = state.logs.slice(0, 12);
  renderLogs();
}

async function loadProfiles() {
  if (state.profiles) return state.profiles;
  const response = await fetch("./runtime-benchmark-profiles.json", { cache: "no-store" });
  state.profiles = await response.json();
  return state.profiles;
}

function tokenize(text) {
  return text.trim().split(/\s+/).filter(Boolean);
}

function deriveExecutionProfile(profile) {
  return {
    ...profile,
    initDelayMs: Math.round(profile.initDelayMs * executionMode.initMultiplier),
    prefillDelayMs: Math.round(profile.prefillDelayMs * executionMode.prefillMultiplier),
    decodeDelayMs: Math.round(profile.decodeDelayMs * executionMode.decodeMultiplier)
  };
}

async function simulateProfile(profile) {
  const promptTokens = tokenize(FIXED_PROMPT);
  const outputTokens = profile.outputTokens;

  const initStartedAt = performance.now();
  await new Promise((resolve) => setTimeout(resolve, profile.initDelayMs));
  const initMs = performance.now() - initStartedAt;

  const prefillStartedAt = performance.now();
  let consumed = 0;
  while (consumed < promptTokens.length) {
    consumed += profile.prefillChunk;
    await new Promise((resolve) => setTimeout(resolve, profile.prefillDelayMs));
  }
  const prefillMs = performance.now() - prefillStartedAt;

  const decodeStartedAt = performance.now();
  let emitted = 0;
  let ttftMs = 0;
  while (emitted < outputTokens) {
    await new Promise((resolve) => setTimeout(resolve, profile.decodeDelayMs));
    if (emitted === 0) ttftMs = performance.now() - decodeStartedAt;
    emitted += profile.decodeChunk;
  }
  const decodeMs = performance.now() - decodeStartedAt;

  return {
    profile,
    promptTokens: promptTokens.length,
    outputTokens,
    ttftMs,
    initMs,
    prefillTokPerSec: promptTokens.length / Math.max(prefillMs / 1000, 0.001),
    decodeTokPerSec: outputTokens / Math.max(decodeMs / 1000, 0.001),
    turnLatencyMs: initMs + prefillMs + decodeMs
  };
}

function profileScore(result) {
  return result.decodeTokPerSec - (result.ttftMs / 80);
}

async function runBenchmark() {
  if (state.active) return;
  state.active = true;
  render();
  const profiles = await loadProfiles();
  const results = [];

  for (const baseProfile of profiles) {
    const profile = deriveExecutionProfile(baseProfile);
    log(`Benchmarking ${baseProfile.label} in ${executionMode.label} mode.`);
    const result = await simulateProfile(profile);
    results.push(result);
    log(`${baseProfile.label} ${executionMode.label} complete: TTFT ${round(result.ttftMs, 2)} ms, decode ${round(result.decodeTokPerSec, 2)} tok/s.`);
  }

  results.sort((left, right) => profileScore(right) - profileScore(left));
  state.run = {
    executionMode: executionMode.id,
    fixedPromptTokens: tokenize(FIXED_PROMPT).length,
    profiles: results,
    winner: results[0]
  };
  state.active = false;
  render();
}

function matrixText() {
  if (!state.run) return "No benchmark run yet.";
  return state.run.profiles
    .map((result, index) => `${index + 1}. ${result.profile.label} | TTFT ${round(result.ttftMs, 2)} ms | Prefill ${round(result.prefillTokPerSec, 2)} tok/s | Decode ${round(result.decodeTokPerSec, 2)} tok/s | Turn ${round(result.turnLatencyMs, 2)} ms`)
    .join("\n");
}

function buildResult() {
  const run = state.run;
  const winner = run ? run.winner : null;
  return {
    meta: {
      repo: "bench-runtime-shootout",
      commit: "bootstrap-generated",
      timestamp: new Date().toISOString(),
      owner: "ai-webgpu-lab",
      track: "benchmark",
      scenario: winner ? `runtime-benchmark-${winner.profile.id}-${executionMode.id}` : "runtime-benchmark-pending",
      notes: run
        ? `${run.profiles.map((result) => `${result.profile.id}:ttft=${round(result.ttftMs, 2)},decode=${round(result.decodeTokPerSec, 2)},turn=${round(result.turnLatencyMs, 2)}`).join("; ")}; executionMode=${executionMode.id}; backend=${executionMode.backend}`
        : "Run the fixed-scenario runtime benchmark."
    },
    environment: state.environment,
    workload: {
      kind: "llm-chat",
      name: "fixed-runtime-shootout",
      input_profile: run ? `prompt-${run.fixedPromptTokens}-output-${winner.outputTokens}` : "benchmark-pending",
      model_id: winner ? winner.profile.id : "pending",
      context_tokens: run ? run.fixedPromptTokens : 0,
      output_tokens: winner ? winner.outputTokens : 0
    },
    metrics: {
      common: {
        time_to_interactive_ms: round(performance.now() - state.startedAt, 2) || 0,
        init_ms: winner ? round(winner.initMs, 2) || 0 : 0,
        success_rate: winner ? 1 : 0.5,
        peak_memory_note: navigator.deviceMemory ? `${navigator.deviceMemory} GB reported by browser` : "deviceMemory unavailable",
        error_type: ""
      },
      llm: {
        ttft_ms: winner ? round(winner.ttftMs, 2) || 0 : 0,
        prefill_tok_per_sec: winner ? round(winner.prefillTokPerSec, 2) || 0 : 0,
        decode_tok_per_sec: winner ? round(winner.decodeTokPerSec, 2) || 0 : 0,
        turn_latency_ms: winner ? round(winner.turnLatencyMs, 2) || 0 : 0
      }
    },
    status: winner ? "success" : "partial",
    artifacts: {
      raw_logs: state.logs.slice(0, 5),
      deploy_url: "https://ai-webgpu-lab.github.io/bench-runtime-shootout/"
    }
  };
}

function renderStatus() {
  const badges = state.active
    ? [`${executionMode.label} benchmark running`, "Fixed prompt active"]
    : state.run
      ? [`Winner ${state.run.winner.profile.label}`, `${round(state.run.winner.decodeTokPerSec, 2)} tok/s`]
      : [`${executionMode.label} profiles ready`, "Awaiting run"];
  elements.statusRow.innerHTML = "";
  for (const text of badges) {
    const node = document.createElement("span");
    node.className = "badge";
    node.textContent = text;
    elements.statusRow.appendChild(node);
  }
  elements.summary.textContent = state.run
    ? `Winner: ${state.run.winner.profile.label} on ${executionMode.label}, TTFT ${round(state.run.winner.ttftMs, 2)} ms, decode ${round(state.run.winner.decodeTokPerSec, 2)} tok/s.`
    : `Run the full benchmark to compare all profiles under the same prompt, context, and output budget. Mode=${executionMode.label}.`;
}

function renderMetrics() {
  const winner = state.run ? state.run.winner : null;
  const cards = [
    ["Winner", winner ? winner.profile.label : "pending"],
    ["Execution", executionMode.label],
    ["Winner TTFT", winner ? `${round(winner.ttftMs, 2)} ms` : "pending"],
    ["Winner Prefill", winner ? `${round(winner.prefillTokPerSec, 2)} tok/s` : "pending"],
    ["Winner Decode", winner ? `${round(winner.decodeTokPerSec, 2)} tok/s` : "pending"],
    ["Profiles", state.run ? String(state.run.profiles.length) : "pending"]
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
    ["Backend", state.environment.backend],
    ["Execution Mode", executionMode.label],
    ["Worker Mode", state.environment.worker_mode]
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
  elements.matrixView.textContent = matrixText();
  elements.resultJson.textContent = JSON.stringify(buildResult(), null, 2);
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(buildResult(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `bench-runtime-shootout-${state.run ? `${state.run.winner.profile.id}-${executionMode.id}` : "pending"}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  log("Downloaded runtime benchmark JSON draft.");
}

elements.runBenchmark.addEventListener("click", runBenchmark);
elements.downloadJson.addEventListener("click", downloadJson);

(async function init() {
  await loadProfiles();
  log(`Fixed scenario runtime benchmark ready in ${executionMode.label} mode.`);
  render();
})();
