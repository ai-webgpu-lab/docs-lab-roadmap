const EXECUTION_MODES = {
  webgpu: {
    id: "webgpu",
    label: "WebGPU",
    backend: "webgpu",
    fallbackTriggered: false,
    workerMode: "worker",
    initDelayMs: 84,
    prefillDelayMs: 12,
    decodeDelayMs: 19
  },
  fallback: {
    id: "fallback",
    label: "Wasm Fallback",
    backend: "wasm",
    fallbackTriggered: true,
    workerMode: "main",
    initDelayMs: 148,
    prefillDelayMs: 23,
    decodeDelayMs: 41
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
const isRealRuntimeMode = typeof requestedMode === "string" && requestedMode.startsWith("real-");
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

function findRegisteredRealRuntime() {
  const registry = typeof window !== "undefined" ? window.__aiWebGpuLabRuntimeRegistry : null;
  if (!registry || typeof registry.list !== "function") return null;
  return registry.list().find((adapter) => adapter && adapter.isReal === true) || null;
}

async function awaitRealRuntime(timeoutMs = REAL_ADAPTER_WAIT_MS) {
  const startedAt = performance.now();
  while (performance.now() - startedAt < timeoutMs) {
    const adapter = findRegisteredRealRuntime();
    if (adapter) return adapter;
    if (typeof window !== "undefined" && window.__aiWebGpuLabRealWebLLMBootstrapError) {
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
  run: null,
  output: "",
  realAdapterError: null,
  logs: []
};

const elements = {
  promptInput: document.getElementById("prompt-input"),
  statusRow: document.getElementById("status-row"),
  summary: document.getElementById("summary"),
  runChat: document.getElementById("run-chat"),
  downloadJson: document.getElementById("download-json"),
  outputView: document.getElementById("output-view"),
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

function tokenizePrompt(prompt) {
  return prompt.trim().split(/\s+/).filter(Boolean);
}

function buildResponseTokens(promptTokens, count) {
  const vocabulary = promptTokens.concat(["webllm", "browser", "worker", "fallback", "context", "decode", "stability", "prompt"]);
  const tokens = [];
  for (let index = 0; index < count; index += 1) {
    tokens.push(vocabulary[index % vocabulary.length]);
  }
  return tokens;
}

async function runRealRuntimeWebLLM(adapter) {
  log(`Connecting real runtime adapter '${adapter.id}'.`);
  await withTimeout(
    Promise.resolve(adapter.loadModel({ modelId: "webllm-browser-chat-default" })),
    REAL_ADAPTER_LOAD_MS,
    `loadModel(${adapter.id})`
  );
  const prefill = await withTimeout(
    Promise.resolve(adapter.prefill({ promptTokens: 96 })),
    REAL_ADAPTER_LOAD_MS,
    `prefill(${adapter.id})`
  );
  const decode = await withTimeout(
    Promise.resolve(adapter.decode({ tokenBudget: 32 })),
    REAL_ADAPTER_LOAD_MS,
    `decode(${adapter.id})`
  );
  log(`Real runtime adapter '${adapter.id}' ready: prefill_tok_per_sec=${prefill?.tokPerSec ?? "?"}, decode_tok_per_sec=${decode?.tokPerSec ?? "?"}.`);
  return { adapter, prefill, decode };
}

async function runChatTurn() {
  if (state.active) return;
  state.active = true;
  state.output = "";
  render();

  if (isRealRuntimeMode) {
    log(`Mode=${requestedMode} requested; awaiting real runtime adapter registration.`);
    const adapter = await awaitRealRuntime();
    if (adapter) {
      try {
        const { prefill, decode } = await runRealRuntimeWebLLM(adapter);
        state.realAdapterPrefill = prefill;
        state.realAdapterDecode = decode;
        state.realAdapter = adapter;
      } catch (error) {
        state.realAdapterError = error?.message || String(error);
        log(`Real runtime '${adapter.id}' failed: ${state.realAdapterError}; falling back to deterministic.`);
      }
    } else {
      const reason = (typeof window !== "undefined" && window.__aiWebGpuLabRealWebLLMBootstrapError) || "timed out waiting for adapter registration";
      state.realAdapterError = reason;
      log(`No real runtime adapter registered (${reason}); falling back to deterministic WebLLM baseline.`);
    }
  }

  const promptTokens = tokenizePrompt(elements.promptInput.value);
  const responseTokens = buildResponseTokens(promptTokens, 56);

  const initStartedAt = performance.now();
  await new Promise((resolve) => setTimeout(resolve, executionMode.initDelayMs));
  const initMs = performance.now() - initStartedAt;

  const prefillStartedAt = performance.now();
  let consumed = 0;
  while (consumed < promptTokens.length) {
    consumed += 14;
    await new Promise((resolve) => setTimeout(resolve, executionMode.prefillDelayMs));
  }
  const prefillMs = performance.now() - prefillStartedAt;

  const decodeStartedAt = performance.now();
  let emitted = 0;
  let ttftMs = 0;
  let text = "";
  while (emitted < responseTokens.length) {
    await new Promise((resolve) => setTimeout(resolve, executionMode.decodeDelayMs));
    if (emitted === 0) ttftMs = performance.now() - decodeStartedAt;
    const chunk = responseTokens.slice(emitted, emitted + 4);
    emitted += chunk.length;
    text += `${chunk.join(" ")} `;
    state.output = text.trim();
    elements.outputView.textContent = state.output;
  }
  const decodeMs = performance.now() - decodeStartedAt;

  state.run = {
    promptTokens: promptTokens.length,
    outputTokens: responseTokens.length,
    initMs,
    ttftMs,
    prefillTokPerSec: promptTokens.length / Math.max(prefillMs / 1000, 0.001),
    decodeTokPerSec: responseTokens.length / Math.max(decodeMs / 1000, 0.001),
    turnLatencyMs: initMs + prefillMs + decodeMs,
    realAdapter: state.realAdapter || null
  };
  state.active = false;
  log(`${executionMode.label} chat turn complete: TTFT ${round(state.run.ttftMs, 2)} ms, decode ${round(state.run.decodeTokPerSec, 2)} tok/s.`);
  render();
}

function describeRuntimeAdapter() {
  const registry = typeof window !== "undefined" ? window.__aiWebGpuLabRuntimeRegistry : null;
  const requested = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("mode")
    : null;
  if (registry) {
    return registry.describe(requested);
  }
  return {
    id: "deterministic-webllm",
    label: "Deterministic WebLLM",
    status: "deterministic",
    isReal: false,
    version: "1.0.0",
    capabilities: ["prefill", "decode", "fixed-output-budget"],
    runtimeType: "synthetic",
    message: "Runtime adapter registry unavailable; using inline deterministic mock."
  };
}

function buildResult() {
  const run = state.run;
  return {
    meta: {
      repo: "exp-webllm-browser-chat",
      commit: "bootstrap-generated",
      timestamp: new Date().toISOString(),
      owner: "ai-webgpu-lab",
      track: "llm",
      scenario: (state.run && state.run.realAdapter) ? `webllm-browser-chat-real-${state.run.realAdapter.id}` : (run ? `webllm-browser-chat-readiness-${executionMode.id}` : "webllm-browser-chat-pending"),
      notes: run
        ? `promptTokens=${run.promptTokens}; outputTokens=${run.outputTokens}; executionMode=${executionMode.id}; backend=${executionMode.backend}${state.run && state.run.realAdapter ? `; realAdapter=${state.run.realAdapter.id}` : (isRealRuntimeMode && state.realAdapterError ? `; realAdapter=fallback(${state.realAdapterError})` : "")}`
        : "Run the WebLLM-style browser chat readiness turn."
    },
    environment: state.environment,
    workload: {
      kind: "llm-chat",
      name: "webllm-browser-chat-readiness",
      input_profile: run ? `prompt-${run.promptTokens}-output-${run.outputTokens}` : "prompt-pending",
      model_id: "webllm-browser-chat-baseline",
      context_tokens: run ? run.promptTokens : 0,
      output_tokens: run ? run.outputTokens : 0
    },
    metrics: {
      common: {
        time_to_interactive_ms: round(performance.now() - state.startedAt, 2) || 0,
        init_ms: run ? round(run.initMs, 2) || 0 : 0,
        success_rate: run ? 1 : 0.5,
        peak_memory_note: navigator.deviceMemory ? `${navigator.deviceMemory} GB reported by browser` : "deviceMemory unavailable",
        error_type: ""
      },
      llm: {
        ttft_ms: run ? round(run.ttftMs, 2) || 0 : 0,
        prefill_tok_per_sec: run ? round(run.prefillTokPerSec, 2) || 0 : 0,
        decode_tok_per_sec: run ? round(run.decodeTokPerSec, 2) || 0 : 0,
        turn_latency_ms: run ? round(run.turnLatencyMs, 2) || 0 : 0
      }
    },
    status: run ? "success" : "partial",
    artifacts: {
      raw_logs: state.logs.slice(0, 5),
      deploy_url: "https://ai-webgpu-lab.github.io/exp-webllm-browser-chat/",
      runtime_adapter: describeRuntimeAdapter()
    }
  };
}

function renderStatus() {
  const badges = state.active
    ? [`${executionMode.label} turn running`, state.environment.worker_mode]
    : state.run
      ? [`${executionMode.label} turn complete`, `${round(state.run.decodeTokPerSec, 2)} tok/s`]
      : [`${executionMode.label} mode ready`, "Awaiting run"];
  elements.statusRow.innerHTML = "";
  for (const text of badges) {
    const node = document.createElement("span");
    node.className = "badge";
    node.textContent = text;
    elements.statusRow.appendChild(node);
  }
  elements.summary.textContent = state.run
    ? `Last run: ${executionMode.label}, TTFT ${round(state.run.ttftMs, 2)} ms, turn latency ${round(state.run.turnLatencyMs, 2)} ms.`
    : "Run one chat turn to measure init, TTFT, decode throughput, and total turn latency for the active mode.";
}

function renderMetrics() {
  const run = state.run;
  const cards = [
    ["Mode", executionMode.label],
    ["Backend", state.environment.backend],
    ["TTFT", run ? `${round(run.ttftMs, 2)} ms` : "pending"],
    ["Prefill", run ? `${round(run.prefillTokPerSec, 2)} tok/s` : "pending"],
    ["Decode", run ? `${round(run.decodeTokPerSec, 2)} tok/s` : "pending"],
    ["Turn Latency", run ? `${round(run.turnLatencyMs, 2)} ms` : "pending"]
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
  const entries = state.logs.length ? state.logs : ["No chat activity yet."];
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
  if (!state.output && !state.active && !state.run) elements.outputView.textContent = "No chat run yet.";
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(buildResult(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `exp-webllm-browser-chat-${executionMode.id}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  log("Downloaded WebLLM browser chat JSON draft.");
}

elements.runChat.addEventListener("click", runChatTurn);
elements.downloadJson.addEventListener("click", downloadJson);

log(`WebLLM browser chat readiness harness ready in ${executionMode.label} mode.`);
render();
