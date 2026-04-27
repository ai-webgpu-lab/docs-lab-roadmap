const EXECUTION_MODES = {
  worker: {
    id: "worker",
    label: "Dedicated Worker",
    workerMode: "worker",
    initDelayMs: 72,
    prefillDelayMs: 11,
    decodeDelayMs: 15,
    prefillChunk: 14,
    decodeChunk: 4,
    inputLagMultiplier: 0.45
  },
  main: {
    id: "main",
    label: "Main Thread",
    workerMode: "main",
    initDelayMs: 84,
    prefillDelayMs: 18,
    decodeDelayMs: 28,
    prefillChunk: 12,
    decodeChunk: 4,
    inputLagMultiplier: 1.9
  }
};

function resolveExecutionMode() {
  const requested = new URLSearchParams(window.location.search).get("mode");
  return EXECUTION_MODES[requested] || EXECUTION_MODES.worker;
}

const executionMode = resolveExecutionMode();

const state = {
  startedAt: performance.now(),
  environment: buildEnvironment(),
  active: false,
  run: null,
  output: "",
  logs: []
};

const elements = {
  promptInput: document.getElementById("prompt-input"),
  probeInput: document.getElementById("probe-input"),
  statusRow: document.getElementById("status-row"),
  summary: document.getElementById("summary"),
  runTurn: document.getElementById("run-turn"),
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
      adapter: "synthetic-webgpu-profile",
      required_features: ["shader-f16"],
      limits: {}
    },
    backend: "webgpu",
    fallback_triggered: false,
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
  const vocabulary = promptTokens.concat(["worker", "main", "typing", "latency", "stream", "smooth", "budget", "browser"]);
  const tokens = [];
  for (let index = 0; index < count; index += 1) {
    tokens.push(vocabulary[index % vocabulary.length]);
  }
  return tokens;
}

function estimateInputLag(promptTokens) {
  const base = executionMode.workerMode === "worker" ? 8 : 24;
  return round((base + promptTokens.length * executionMode.inputLagMultiplier), 2);
}

function appendOutput(text) {
  state.output = `${state.output} ${text}`.trim();
  elements.outputView.textContent = state.output;
}

async function simulateMainThread(promptTokens, outputTokens) {
  const profile = executionMode;
  const initStartedAt = performance.now();
  await sleep(profile.initDelayMs);
  const initMs = performance.now() - initStartedAt;

  const prefillStartedAt = performance.now();
  let consumed = 0;
  while (consumed < promptTokens.length) {
    consumed += profile.prefillChunk;
    await sleep(profile.prefillDelayMs);
  }
  const prefillMs = performance.now() - prefillStartedAt;

  const decodeStartedAt = performance.now();
  let emitted = 0;
  let ttftMs = 0;
  while (emitted < outputTokens.length) {
    await sleep(profile.decodeDelayMs);
    if (emitted === 0) ttftMs = performance.now() - decodeStartedAt;
    const chunk = outputTokens.slice(emitted, emitted + profile.decodeChunk);
    emitted += chunk.length;
    appendOutput(chunk.join(" "));
  }
  const decodeMs = performance.now() - decodeStartedAt;

  return {
    initMs,
    ttftMs,
    prefillTokPerSec: promptTokens.length / Math.max(prefillMs / 1000, 0.001),
    decodeTokPerSec: outputTokens.length / Math.max(decodeMs / 1000, 0.001),
    turnLatencyMs: initMs + prefillMs + decodeMs
  };
}

async function simulateWorker(promptTokens, outputTokens) {
  if (!("Worker" in window)) {
    log("Worker unavailable; using main-thread fallback path.");
    return simulateMainThread(promptTokens, outputTokens);
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker("./llm-worker.js");
    worker.onmessage = (event) => {
      if (event.data.type === "chunk") {
        appendOutput(event.data.text);
      } else if (event.data.type === "complete") {
        worker.terminate();
        resolve(event.data.result);
      }
    };
    worker.onerror = (error) => {
      worker.terminate();
      reject(error);
    };
    worker.postMessage({
      type: "run",
      promptTokens,
      outputTokens,
      profile: executionMode
    });
  });
}

async function runTurn() {
  if (state.active) return;
  state.active = true;
  state.output = "";
  render();

  const promptTokens = tokenizePrompt(elements.promptInput.value);
  const outputTokens = buildResponseTokens(promptTokens, 56);
  log(`Running ${executionMode.label} chat UX profile.`);

  const result = executionMode.workerMode === "worker"
    ? await simulateWorker(promptTokens, outputTokens)
    : await simulateMainThread(promptTokens, outputTokens);

  state.run = {
    promptTokens: promptTokens.length,
    outputTokens: outputTokens.length,
    responsivenessLagMs: estimateInputLag(promptTokens),
    ...result
  };
  state.active = false;
  log(`${executionMode.label} complete: TTFT ${round(state.run.ttftMs, 2)} ms, decode ${round(state.run.decodeTokPerSec, 2)} tok/s, input lag ${state.run.responsivenessLagMs} ms.`);
  render();
}

function buildResult() {
  const run = state.run;
  return {
    meta: {
      repo: "exp-llm-worker-ux",
      commit: "bootstrap-generated",
      timestamp: new Date().toISOString(),
      owner: "ai-webgpu-lab",
      track: "llm",
      scenario: run ? `llm-worker-ux-${executionMode.id}` : "llm-worker-ux-pending",
      notes: run
        ? `executionMode=${executionMode.id}; workerMode=${executionMode.workerMode}; promptTokens=${run.promptTokens}; outputTokens=${run.outputTokens}; responsivenessLagMs=${run.responsivenessLagMs}`
        : "Run the LLM worker UX readiness turn."
    },
    environment: state.environment,
    workload: {
      kind: "llm-chat",
      name: "llm-worker-ux-readiness",
      input_profile: run ? `prompt-${run.promptTokens}-output-${run.outputTokens}` : "prompt-pending",
      model_id: "llm-worker-ux-baseline",
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
      deploy_url: "https://ai-webgpu-lab.github.io/exp-llm-worker-ux/"
    }
  };
}

function renderStatus() {
  const badges = state.active
    ? [`${executionMode.label} running`, state.environment.worker_mode]
    : state.run
      ? [`${executionMode.label} complete`, `${round(state.run.decodeTokPerSec, 2)} tok/s`]
      : [`${executionMode.label} ready`, "Awaiting run"];
  elements.statusRow.innerHTML = "";
  for (const text of badges) {
    const node = document.createElement("span");
    node.className = "badge";
    node.textContent = text;
    elements.statusRow.appendChild(node);
  }
  elements.summary.textContent = state.run
    ? `Last run: ${executionMode.label}, TTFT ${round(state.run.ttftMs, 2)} ms, input lag estimate ${state.run.responsivenessLagMs} ms.`
    : "Run one chat turn to compare the active execution mode against the stable worker/main result contract.";
}

function renderCards(container, items) {
  container.innerHTML = "";
  for (const [label, value] of items) {
    const card = document.createElement("div");
    card.className = "card";
    const labelNode = document.createElement("span");
    labelNode.className = "label";
    labelNode.textContent = label;
    const valueNode = document.createElement("span");
    valueNode.className = "value";
    valueNode.textContent = value;
    card.append(labelNode, valueNode);
    container.appendChild(card);
  }
}

function renderMetrics() {
  const run = state.run;
  renderCards(elements.metricGrid, [
    ["Mode", executionMode.label],
    ["TTFT", run ? `${round(run.ttftMs, 2)} ms` : "pending"],
    ["Decode", run ? `${round(run.decodeTokPerSec, 2)} tok/s` : "pending"],
    ["Turn", run ? `${round(run.turnLatencyMs, 2)} ms` : "pending"],
    ["Input Lag", run ? `${run.responsivenessLagMs} ms` : "pending"],
    ["Output", run ? String(run.outputTokens) : "56"]
  ]);
}

function renderEnvironment() {
  renderCards(elements.metaGrid, [
    ["Browser", `${state.environment.browser.name} ${state.environment.browser.version}`],
    ["OS", `${state.environment.os.name} ${state.environment.os.version}`],
    ["Backend", state.environment.backend],
    ["Worker", state.environment.worker_mode],
    ["Fallback", String(state.environment.fallback_triggered)],
    ["Cache", state.environment.cache_state]
  ]);
}

function renderLogs() {
  elements.logList.innerHTML = "";
  const logs = state.logs.length ? state.logs : ["LLM worker UX harness ready."];
  for (const message of logs) {
    const item = document.createElement("li");
    item.textContent = message;
    elements.logList.appendChild(item);
  }
}

function renderResult() {
  elements.resultJson.textContent = JSON.stringify(buildResult(), null, 2);
}

function render() {
  renderStatus();
  renderMetrics();
  renderEnvironment();
  renderLogs();
  renderResult();
  if (!state.output) elements.outputView.textContent = "No chat turn yet.";
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(buildResult(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `exp-llm-worker-ux-${executionMode.id}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  log("Downloaded LLM worker UX JSON draft.");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

elements.runTurn.addEventListener("click", () => {
  runTurn().catch((error) => {
    state.active = false;
    log(`Run failed: ${error instanceof Error ? error.message : String(error)}`);
    render();
  });
});
elements.downloadJson.addEventListener("click", downloadJson);

render();
log(`LLM worker UX harness ready in ${executionMode.label} mode.`);
