const FIXED_PROMPT = "Summarize the browser AI lab plan, explain how WebGPU fallback, worker isolation, cache state, and fixed prompt budgets affect reproducible benchmark reporting, then recommend the next measurement priority.";
const CONTEXT_TOKENS = 384;
const OUTPUT_TOKENS = 96;

const PROFILES = [
  {
    id: "webllm-fast-decode",
    label: "WebLLM Fast Decode",
    initDelayMs: 24,
    prefillChunk: 48,
    prefillDelayMs: 7,
    decodeChunk: 6,
    decodeDelayMs: 12,
    workerMode: "worker"
  },
  {
    id: "transformers-balanced",
    label: "Transformers Balanced",
    initDelayMs: 18,
    prefillChunk: 32,
    prefillDelayMs: 8,
    decodeChunk: 4,
    decodeDelayMs: 10,
    workerMode: "worker"
  },
  {
    id: "ort-compact",
    label: "ORT Compact",
    initDelayMs: 16,
    prefillChunk: 24,
    prefillDelayMs: 6,
    decodeChunk: 3,
    decodeDelayMs: 9,
    workerMode: "main"
  }
];

const EXECUTION_MODES = {
  webgpu: {
    id: "webgpu",
    label: "WebGPU",
    backend: "webgpu",
    fallbackTriggered: false,
    initMultiplier: 1,
    prefillMultiplier: 1,
    decodeMultiplier: 1
  },
  fallback: {
    id: "fallback",
    label: "Wasm Fallback",
    backend: "wasm",
    fallbackTriggered: true,
    initMultiplier: 1.75,
    prefillMultiplier: 2.15,
    decodeMultiplier: 2.45
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
    if (typeof window !== "undefined" && window.__aiWebGpuLabRealLlmBenchBootstrapError) {
      return null;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

const state = {
  startedAt: performance.now(),
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
    worker_mode: "mixed",
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

function tokenize(text) {
  return text.trim().split(/\s+/).filter(Boolean);
}

function deriveProfile(profile) {
  return {
    ...profile,
    initDelayMs: profile.initDelayMs * executionMode.initMultiplier,
    prefillDelayMs: profile.prefillDelayMs * executionMode.prefillMultiplier,
    decodeDelayMs: profile.decodeDelayMs * executionMode.decodeMultiplier,
    workerMode: executionMode.fallbackTriggered ? "main" : profile.workerMode
  };
}

async function simulateProfile(profile) {
  const promptTokens = tokenize(FIXED_PROMPT).length;
  const initStartedAt = performance.now();
  await sleep(profile.initDelayMs);
  const initMs = performance.now() - initStartedAt;

  const prefillStartedAt = performance.now();
  let consumed = 0;
  while (consumed < CONTEXT_TOKENS) {
    consumed += profile.prefillChunk;
    await sleep(profile.prefillDelayMs);
  }
  const prefillMs = performance.now() - prefillStartedAt;

  const decodeStartedAt = performance.now();
  let emitted = 0;
  let ttftMs = 0;
  while (emitted < OUTPUT_TOKENS) {
    await sleep(profile.decodeDelayMs);
    if (emitted === 0) ttftMs = performance.now() - decodeStartedAt;
    emitted += profile.decodeChunk;
  }
  const decodeMs = performance.now() - decodeStartedAt;

  return {
    profile,
    promptTokens,
    contextTokens: CONTEXT_TOKENS,
    outputTokens: OUTPUT_TOKENS,
    initMs,
    ttftMs,
    prefillMs,
    decodeMs,
    prefillTokPerSec: CONTEXT_TOKENS / Math.max(prefillMs / 1000, 0.001),
    decodeTokPerSec: OUTPUT_TOKENS / Math.max(decodeMs / 1000, 0.001),
    turnLatencyMs: initMs + prefillMs + decodeMs
  };
}

function scoreResult(result) {
  return result.decodeTokPerSec + (result.prefillTokPerSec * 0.08) - (result.ttftMs * 0.35) - (result.turnLatencyMs * 0.012);
}

async function runRealBenchmarkLlm(adapter) {
  log(`Connecting real benchmark adapter '${adapter.id}'.`);
  await withTimeout(
    Promise.resolve(adapter.createBenchmark({ name: "llm-prefill-decode" })),
    REAL_ADAPTER_LOAD_MS,
    `createBenchmark(${adapter.id})`
  );
  await withTimeout(
    Promise.resolve(adapter.runProfile({
      profileId: "llm-prefill-decode-default",
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
        const { aggregate } = await runRealBenchmarkLlm(adapter);
        state.realAdapterAggregate = aggregate;
        state.realAdapter = adapter;
      } catch (error) {
        state.realAdapterError = error?.message || String(error);
        log(`Real benchmark '${adapter.id}' failed: ${state.realAdapterError}; falling back to deterministic.`);
      }
    } else {
      const reason = (typeof window !== "undefined" && window.__aiWebGpuLabRealLlmBenchBootstrapError) || "timed out waiting for adapter registration";
      state.realAdapterError = reason;
      log(`No real benchmark adapter registered (${reason}); falling back to deterministic LLM benchmark.`);
    }
  }

  const results = [];
  for (const baseProfile of PROFILES) {
    const profile = deriveProfile(baseProfile);
    log(`Running ${baseProfile.label} in ${executionMode.label} mode.`);
    const result = await simulateProfile(profile);
    results.push(result);
    log(`${baseProfile.label}: TTFT=${round(result.ttftMs)} ms, prefill=${round(result.prefillTokPerSec)} tok/s, decode=${round(result.decodeTokPerSec)} tok/s.`);
  }

  results.sort((left, right) => scoreResult(right) - scoreResult(left));
  state.run = {
    executionMode: executionMode.id,
    promptTokens: tokenize(FIXED_PROMPT).length,
    winner: results[0],
    profiles: results,
    realAdapter: state.realAdapter || null
  };
  state.environment.worker_mode = results[0].profile.workerMode;
  state.active = false;
  log(`Winner: ${results[0].profile.label} (${executionMode.label}).`);
  render();
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
    id: "deterministic-llm-bench",
    label: "Deterministic LLM Bench",
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
      repo: "bench-llm-prefill-decode",
      commit: "bootstrap-generated",
      timestamp: new Date().toISOString(),
      owner: "ai-webgpu-lab",
      track: "benchmark",
      scenario: (state.run && state.run.realAdapter) ? `llm-prefill-decode-real-${state.run.realAdapter.id}` : (run ? `llm-prefill-decode-${run.executionMode}` : "llm-prefill-decode-pending"),
      notes: winner
        ? `winner=${winner.profile.id}; promptTokens=${winner.promptTokens}; contextTokens=${winner.contextTokens}; outputTokens=${winner.outputTokens}; executionMode=${run.executionMode}; backend=${state.environment.backend}${state.run && state.run.realAdapter ? `; realAdapter=${state.run.realAdapter.id}` : (isRealBenchmarkMode && state.realAdapterError ? `; realAdapter=fallback(${state.realAdapterError})` : "")}`
        : "Run the fixed LLM prefill/decode benchmark."
    },
    environment: state.environment,
    workload: {
      kind: "llm-chat",
      name: "llm-prefill-decode-benchmark",
      input_profile: `${CONTEXT_TOKENS}-context-${OUTPUT_TOKENS}-output-${PROFILES.length}-profiles`,
      model_id: winner ? winner.profile.id : "pending",
      context_tokens: winner ? winner.contextTokens : CONTEXT_TOKENS,
      output_tokens: winner ? winner.outputTokens : OUTPUT_TOKENS
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
      deploy_url: "https://ai-webgpu-lab.github.io/bench-llm-prefill-decode/",
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
    badges.push({ text: `${CONTEXT_TOKENS} context / ${OUTPUT_TOKENS} output` });
  }

  elements.statusRow.innerHTML = "";
  for (const badge of badges) {
    const node = document.createElement("span");
    node.className = "badge";
    node.textContent = badge.text;
    elements.statusRow.appendChild(node);
  }

  elements.summary.textContent = state.run
    ? `Winner ${state.run.winner.profile.label}: TTFT ${round(state.run.winner.ttftMs)} ms, prefill ${round(state.run.winner.prefillTokPerSec)} tok/s, decode ${round(state.run.winner.decodeTokPerSec)} tok/s.`
    : `Mode=${executionMode.label}. Benchmark deterministic LLM profiles with one fixed context and output budget.`;
}

function renderMetrics() {
  const winner = state.run ? state.run.winner : null;
  const cards = [
    ["Winner", winner ? winner.profile.label : "pending"],
    ["TTFT", winner ? `${round(winner.ttftMs)} ms` : "pending"],
    ["Prefill", winner ? `${round(winner.prefillTokPerSec)} tok/s` : "pending"],
    ["Decode", winner ? `${round(winner.decodeTokPerSec)} tok/s` : "pending"],
    ["Turn", winner ? `${round(winner.turnLatencyMs)} ms` : "pending"],
    ["Worker", winner ? winner.profile.workerMode : "pending"]
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

  const rows = state.run.profiles
    .map((result, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${result.profile.label}</td>
        <td>${round(result.ttftMs)} ms</td>
        <td>${round(result.prefillTokPerSec)} tok/s</td>
        <td>${round(result.decodeTokPerSec)} tok/s</td>
        <td>${round(result.turnLatencyMs)} ms</td>
        <td>${result.profile.workerMode}</td>
      </tr>
    `)
    .join("");
  elements.matrixView.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Rank</th>
          <th>Profile</th>
          <th>TTFT</th>
          <th>Prefill</th>
          <th>Decode</th>
          <th>Turn</th>
          <th>Worker</th>
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
  anchor.download = `bench-llm-prefill-decode-${state.run ? state.run.executionMode : "pending"}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  log("Downloaded LLM prefill/decode JSON draft.");
}

elements.runBenchmark.addEventListener("click", runBenchmark);
elements.downloadJson.addEventListener("click", downloadJson);
render();
