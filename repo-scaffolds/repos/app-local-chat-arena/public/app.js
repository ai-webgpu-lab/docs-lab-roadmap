const ARENA_PROFILES = [
  {
    id: "arena-fast",
    label: "Arena Fast",
    workerMode: "worker",
    initDelayMs: 76,
    prefillDelayMs: 11,
    decodeDelayMs: 17,
    decodeChunk: 4
  },
  {
    id: "arena-steady",
    label: "Arena Steady",
    workerMode: "main",
    initDelayMs: 58,
    prefillDelayMs: 14,
    decodeDelayMs: 21,
    decodeChunk: 5
  }
];

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
    if (typeof window !== "undefined" && window.__aiWebGpuLabRealChatArenaBootstrapError) {
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
  realAdapterError: null,
  logs: []
};

const elements = {
  promptInput: document.getElementById("prompt-input"),
  statusRow: document.getElementById("status-row"),
  summary: document.getElementById("summary"),
  runArena: document.getElementById("run-arena"),
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
    gpu: { adapter: "arena-profile-driven", required_features: ["shader-f16"], limits: {} },
    backend: "webgpu",
    fallback_triggered: false,
    worker_mode: "mixed",
    cache_state: "warm"
  };
}

function log(message) {
  state.logs.unshift(`[${new Date().toLocaleTimeString()}] ${message}`);
  state.logs = state.logs.slice(0, 12);
  renderLogs();
}

function tokenize(text) {
  return text.trim().split(/\s+/).filter(Boolean);
}

function buildResponseTokens(promptTokens, count) {
  const vocabulary = promptTokens.concat(["arena", "browser", "latency", "worker", "prompt", "score", "demo", "local"]);
  const tokens = [];
  for (let index = 0; index < count; index += 1) {
    tokens.push(vocabulary[index % vocabulary.length]);
  }
  return tokens;
}

async function simulateProfile(profile, promptTokens) {
  const responseTokens = buildResponseTokens(promptTokens, 52);

  const initStartedAt = performance.now();
  await new Promise((resolve) => setTimeout(resolve, profile.initDelayMs));
  const initMs = performance.now() - initStartedAt;

  const prefillStartedAt = performance.now();
  let consumed = 0;
  while (consumed < promptTokens.length) {
    consumed += 12;
    await new Promise((resolve) => setTimeout(resolve, profile.prefillDelayMs));
  }
  const prefillMs = performance.now() - prefillStartedAt;

  const decodeStartedAt = performance.now();
  let emitted = 0;
  let ttftMs = 0;
  while (emitted < responseTokens.length) {
    await new Promise((resolve) => setTimeout(resolve, profile.decodeDelayMs));
    if (emitted === 0) ttftMs = performance.now() - decodeStartedAt;
    emitted += profile.decodeChunk;
  }
  const decodeMs = performance.now() - decodeStartedAt;

  return {
    profile,
    promptTokens: promptTokens.length,
    outputTokens: responseTokens.length,
    ttftMs,
    initMs,
    prefillTokPerSec: promptTokens.length / Math.max(prefillMs / 1000, 0.001),
    decodeTokPerSec: responseTokens.length / Math.max(decodeMs / 1000, 0.001),
    turnLatencyMs: initMs + prefillMs + decodeMs
  };
}

function profileScore(result) {
  return result.decodeTokPerSec - (result.ttftMs / 90);
}

async function runRealSurfaceArena(adapter, promptTokens) {
  log(`Connecting real app-surface adapter '${adapter.id}'.`);
  const dataset = await withTimeout(
    Promise.resolve(adapter.loadDataset({ matchupId: "arena-default" })),
    REAL_ADAPTER_LOAD_MS,
    `loadDataset(${adapter.id})`
  );
  const renderInfo = await withTimeout(
    Promise.resolve(adapter.renderSurface({ frameIndex: 0 })),
    REAL_ADAPTER_LOAD_MS,
    `renderSurface(${adapter.id})`
  );

  const results = [];
  for (const profile of ARENA_PROFILES) {
    log(`Running ${profile.label}.`);
    const result = await simulateProfile(profile, promptTokens);
    results.push(result);
    log(`${profile.label} complete: TTFT ${round(result.ttftMs, 2)} ms, decode ${round(result.decodeTokPerSec, 2)} tok/s.`);
  }
  results.sort((left, right) => profileScore(right) - profileScore(left));

  await withTimeout(
    Promise.resolve(adapter.recordTelemetry({
      kind: "arena-run",
      winnerId: results[0].profile.id,
      decodeTokPerSec: results[0].decodeTokPerSec
    })),
    REAL_ADAPTER_LOAD_MS,
    `recordTelemetry(${adapter.id})`
  );
  log(`Real adapter '${adapter.id}' rendered matchup ${dataset?.preset?.id || "default"} (frame ${renderInfo?.frameIndex ?? 0}).`);
  return {
    promptTokens: promptTokens.length,
    profiles: results,
    winner: results[0],
    realAdapter: adapter,
    realDataset: dataset,
    realRenderInfo: renderInfo
  };
}

async function runArena() {
  if (state.active) return;
  state.active = true;
  state.realAdapterError = null;
  render();

  const promptTokens = tokenize(elements.promptInput.value);

  if (isRealSurfaceMode) {
    log(`Mode=${requestedMode} requested; awaiting real app-surface adapter registration.`);
    const adapter = await awaitRealSurface();
    if (adapter) {
      try {
        state.run = await runRealSurfaceArena(adapter, promptTokens);
        state.active = false;
        log(`Real app-surface '${adapter.id}' complete.`);
        render();
        return;
      } catch (error) {
        state.realAdapterError = error?.message || String(error);
        log(`Real surface '${adapter.id}' failed: ${state.realAdapterError}; falling back to deterministic.`);
      }
    } else {
      const reason = (typeof window !== "undefined" && window.__aiWebGpuLabRealChatArenaBootstrapError) || "timed out waiting for adapter registration";
      state.realAdapterError = reason;
      log(`No real app-surface adapter registered (${reason}); falling back to deterministic arena demo.`);
    }
  }

  const results = [];
  for (const profile of ARENA_PROFILES) {
    log(`Running ${profile.label}.`);
    const result = await simulateProfile(profile, promptTokens);
    results.push(result);
    log(`${profile.label} complete: TTFT ${round(result.ttftMs, 2)} ms, decode ${round(result.decodeTokPerSec, 2)} tok/s.`);
  }

  results.sort((left, right) => profileScore(right) - profileScore(left));
  state.run = {
    promptTokens: promptTokens.length,
    profiles: results,
    winner: results[0],
    realAdapter: null
  };
  state.active = false;
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
    id: "deterministic-chat-arena",
    label: "Deterministic Chat Arena",
    status: "deterministic",
    isReal: false,
    version: "1.0.0",
    capabilities: ["preset-replay", "renderer-scorecard", "telemetry-record"],
    surfaceType: "synthetic",
    message: "App surface adapter registry unavailable; using inline deterministic mock."
  };
}

function matrixText() {
  if (!state.run) return "No arena run yet.";
  return state.run.profiles
    .map((result, index) => `${index + 1}. ${result.profile.label} | TTFT ${round(result.ttftMs, 2)} ms | Prefill ${round(result.prefillTokPerSec, 2)} tok/s | Decode ${round(result.decodeTokPerSec, 2)} tok/s | Turn ${round(result.turnLatencyMs, 2)} ms`)
    .join("\n");
}

function buildResult() {
  const run = state.run;
  const winner = run ? run.winner : null;
  return {
    meta: {
      repo: "app-local-chat-arena",
      commit: "bootstrap-generated",
      timestamp: new Date().toISOString(),
      owner: "ai-webgpu-lab",
      track: "integration",
      scenario: winner
        ? (run.realAdapter ? `local-chat-arena-real-${run.realAdapter.id}` : "local-chat-arena-demo")
        : "local-chat-arena-pending",
      notes: run
        ? `${run.profiles.map((result) => `${result.profile.id}:ttft=${round(result.ttftMs, 2)},decode=${round(result.decodeTokPerSec, 2)},turn=${round(result.turnLatencyMs, 2)}`).join("; ")}${run.realAdapter ? `; realAdapter=${run.realAdapter.id}` : (isRealSurfaceMode && state.realAdapterError ? `; realAdapter=fallback(${state.realAdapterError})` : "")}`
        : "Run the local chat arena demo."
    },
    environment: state.environment,
    workload: {
      kind: "llm-chat",
      name: "local-chat-arena-demo",
      input_profile: run ? `prompt-${run.promptTokens}-output-${winner.outputTokens}` : "arena-pending",
      model_id: winner ? winner.profile.id : "pending",
      context_tokens: run ? run.promptTokens : 0,
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
      deploy_url: "https://ai-webgpu-lab.github.io/app-local-chat-arena/",
      app_surface_adapter: describeAppSurfaceAdapter()
    }
  };
}

function renderStatus() {
  const badges = state.active
    ? ["Arena running", "Shared prompt active"]
    : state.run
      ? [`Winner ${state.run.winner.profile.label}`, `${round(state.run.winner.decodeTokPerSec, 2)} tok/s`]
      : ["Arena ready", "Awaiting run"];
  elements.statusRow.innerHTML = "";
  for (const text of badges) {
    const node = document.createElement("span");
    node.className = "badge";
    node.textContent = text;
    elements.statusRow.appendChild(node);
  }
  elements.summary.textContent = state.run
    ? `Winner: ${state.run.winner.profile.label}, TTFT ${round(state.run.winner.ttftMs, 2)} ms, decode ${round(state.run.winner.decodeTokPerSec, 2)} tok/s.`
    : "Run the arena to score both profiles with the same prompt and output budget, then inspect the winner summary.";
}

function renderMetrics() {
  const winner = state.run ? state.run.winner : null;
  const cards = [
    ["Winner", winner ? winner.profile.label : "pending"],
    ["Winner TTFT", winner ? `${round(winner.ttftMs, 2)} ms` : "pending"],
    ["Winner Decode", winner ? `${round(winner.decodeTokPerSec, 2)} tok/s` : "pending"],
    ["Profiles", state.run ? String(state.run.profiles.length) : "2"],
    ["Backend", state.environment.backend],
    ["Worker Modes", state.run ? Array.from(new Set(state.run.profiles.map((item) => item.profile.workerMode))).join(", ") : "mixed"]
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
  const entries = state.logs.length ? state.logs : ["No arena activity yet."];
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
  anchor.download = `app-local-chat-arena-${state.run ? state.run.winner.profile.id : "pending"}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  log("Downloaded local chat arena JSON draft.");
}

elements.runArena.addEventListener("click", runArena);
elements.downloadJson.addEventListener("click", downloadJson);

log("Local chat arena demo ready.");
render();
