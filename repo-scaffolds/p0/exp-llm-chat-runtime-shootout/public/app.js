const state = {
  startedAt: performance.now(),
  environment: buildEnvironment(),
  profiles: null,
  active: false,
  run: null,
  output: "",
  logs: []
};

const elements = {
  promptInput: document.getElementById("prompt-input"),
  statusRow: document.getElementById("status-row"),
  summary: document.getElementById("summary"),
  runWebllm: document.getElementById("run-webllm"),
  runTransformers: document.getElementById("run-transformers"),
  downloadJson: document.getElementById("download-json"),
  outputView: document.getElementById("output-view"),
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
    gpu: { adapter: "profile-driven", required_features: [], limits: {} },
    backend: "mixed",
    fallback_triggered: false,
    worker_mode: "unknown",
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
  const response = await fetch("./runtime-profiles.json", { cache: "no-store" });
  state.profiles = await response.json();
  return state.profiles;
}

function tokenizePrompt(prompt) {
  return prompt.trim().split(/\s+/).filter(Boolean);
}

function buildResponseTokens(promptTokens, count) {
  const vocabulary = promptTokens.concat(["browser", "cache", "worker", "fallback", "latency", "runtime", "probe", "baseline"]);
  const tokens = [];
  for (let index = 0; index < count; index += 1) {
    tokens.push(vocabulary[index % vocabulary.length]);
  }
  return tokens;
}

async function simulateRuntime(profile, prompt) {
  const promptTokens = tokenizePrompt(prompt);
  const outputBudget = profile.outputTokens;
  const responseTokens = buildResponseTokens(promptTokens, outputBudget);
  const initStartedAt = performance.now();
  await new Promise((resolve) => setTimeout(resolve, profile.initDelayMs));
  const initMs = performance.now() - initStartedAt;

  const prefillStartedAt = performance.now();
  let processedPrefill = 0;
  while (processedPrefill < promptTokens.length) {
    processedPrefill += profile.prefillChunk;
    await new Promise((resolve) => setTimeout(resolve, profile.prefillDelayMs));
  }
  const prefillMs = performance.now() - prefillStartedAt;

  const decodeStartedAt = performance.now();
  let ttftMs = 0;
  let emitted = 0;
  let text = "";
  while (emitted < responseTokens.length) {
    await new Promise((resolve) => setTimeout(resolve, profile.decodeDelayMs));
    if (emitted === 0) ttftMs = performance.now() - decodeStartedAt;
    const chunk = responseTokens.slice(emitted, emitted + profile.decodeChunk);
    emitted += chunk.length;
    text += `${chunk.join(" ")} `;
    state.output = text.trim();
    elements.outputView.textContent = state.output;
  }
  const decodeMs = performance.now() - decodeStartedAt;

  return {
    profile,
    promptTokens: promptTokens.length,
    outputTokens: responseTokens.length,
    initMs,
    ttftMs,
    prefillTokPerSec: promptTokens.length / Math.max(prefillMs / 1000, 0.001),
    decodeTokPerSec: responseTokens.length / Math.max(decodeMs / 1000, 0.001),
    turnLatencyMs: initMs + prefillMs + decodeMs,
    text: state.output.trim()
  };
}

async function runProfile(profileId) {
  if (state.active) return;
  const profiles = await loadProfiles();
  const profile = profiles.find((item) => item.id === profileId);
  if (!profile) return;

  state.active = true;
  state.output = "";
  state.environment.worker_mode = profile.workerMode;
  state.environment.backend = profile.backend;
  render();

  log(`Running ${profile.label} profile.`);
  const run = await simulateRuntime(profile, elements.promptInput.value);
  state.run = run;
  state.active = false;
  log(`${profile.label} complete: TTFT ${round(run.ttftMs, 2)} ms, decode ${round(run.decodeTokPerSec, 2)} tok/s.`);
  render();
}

function buildResult() {
  const run = state.run;
  return {
    meta: {
      repo: "exp-llm-chat-runtime-shootout",
      commit: "bootstrap-generated",
      timestamp: new Date().toISOString(),
      owner: "ai-webgpu-lab",
      track: "llm",
      scenario: run ? `runtime-profile-${run.profile.id}` : "runtime-profile-pending",
      notes: run
        ? `synthetic runtime profile=${run.profile.label}; promptTokens=${run.promptTokens}; outputTokens=${run.outputTokens}`
        : "Run one runtime readiness profile."
    },
    environment: state.environment,
    workload: {
      kind: "llm-chat",
      name: "runtime-readiness-chat",
      input_profile: run ? `prompt-${run.promptTokens}-output-${run.outputTokens}` : "prompt-pending",
      model_id: run ? run.profile.id : "pending",
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
      deploy_url: "https://ai-webgpu-lab.github.io/exp-llm-chat-runtime-shootout/"
    }
  };
}

function renderStatus() {
  const badges = state.active
    ? ["Profile running", "Streaming output"]
    : state.run
      ? [`${state.run.profile.label} complete`, `${round(state.run.decodeTokPerSec, 2)} tok/s`]
      : ["Profiles ready", "Awaiting run"];
  elements.statusRow.innerHTML = "";
  for (const text of badges) {
    const node = document.createElement("span");
    node.className = "badge";
    node.textContent = text;
    elements.statusRow.appendChild(node);
  }
  elements.summary.textContent = state.run
    ? `Last run: ${state.run.profile.label}, TTFT ${round(state.run.ttftMs, 2)} ms, turn latency ${round(state.run.turnLatencyMs, 2)} ms.`
    : "Run one profile at a time with the shared prompt to compare TTFT, prefill speed, decode speed, and total turn latency.";
}

function renderMetrics() {
  const run = state.run;
  const cards = [
    ["Profile", run ? run.profile.label : "pending"],
    ["TTFT", run ? `${round(run.ttftMs, 2)} ms` : "pending"],
    ["Prefill", run ? `${round(run.prefillTokPerSec, 2)} tok/s` : "pending"],
    ["Decode", run ? `${round(run.decodeTokPerSec, 2)} tok/s` : "pending"],
    ["Turn Latency", run ? `${round(run.turnLatencyMs, 2)} ms` : "pending"],
    ["Worker Mode", state.environment.worker_mode]
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
  const entries = state.logs.length ? state.logs : ["No runtime activity yet."];
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
  if (!state.output && !state.active && !state.run) elements.outputView.textContent = "No runtime run yet.";
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(buildResult(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `exp-llm-chat-runtime-shootout-${state.run ? state.run.profile.id : "pending"}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  log("Downloaded runtime readiness JSON draft.");
}

elements.runWebllm.addEventListener("click", () => runProfile("webllm-style"));
elements.runTransformers.addEventListener("click", () => runProfile("transformersjs-style"));
elements.downloadJson.addEventListener("click", downloadJson);

(async function init() {
  await loadProfiles();
  log("LLM chat runtime readiness harness ready.");
  render();
})();
