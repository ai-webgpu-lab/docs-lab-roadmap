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
    if (typeof window !== "undefined" && window.__aiWebGpuLabRealVoiceAgentBootstrapError) {
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
  transcript: "",
  reply: "",
  logs: []
};

const elements = {
  statusRow: document.getElementById("status-row"),
  summary: document.getElementById("summary"),
  runLab: document.getElementById("run-lab"),
  downloadJson: document.getElementById("download-json"),
  transcriptView: document.getElementById("transcript-view"),
  replyView: document.getElementById("reply-view"),
  workspaceGrid: document.getElementById("workspace-grid"),
  taskGrid: document.getElementById("task-grid"),
  metricGrid: document.getElementById("metric-grid"),
  metaGrid: document.getElementById("meta-grid"),
  fixtureView: document.getElementById("fixture-view"),
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
      adapter: navigator.gpu ? "navigator.gpu available" : "browser-fixture-no-webgpu",
      required_features: navigator.gpu ? ["shader-f16"] : [],
      limits: navigator.gpu ? { maxBindGroups: 4 } : {}
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

function words(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter(Boolean);
}

function chars(text) {
  return text.toLowerCase().replace(/\s+/g, "").split("");
}

function levenshtein(left, right) {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const matrix = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let row = 0; row < rows; row += 1) matrix[row][0] = row;
  for (let col = 0; col < cols; col += 1) matrix[0][col] = col;
  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + cost
      );
    }
  }
  return matrix[left.length][right.length];
}

async function loadFixture() {
  if (state.fixture) return state.fixture;
  const response = await fetch("./voice-agent-fixture.json", { cache: "no-store" });
  state.fixture = await response.json();
  renderFixture();
  renderWorkspace();
  renderTasks();
  return state.fixture;
}

async function runVoiceTurn(fixture) {
  const startedAt = performance.now();
  let firstPartialMs = 0;
  let transcript = "";

  log(`Wake word detected: ${fixture.wakeWord}.`);
  for (let index = 0; index < fixture.segments.length; index += 1) {
    const segment = fixture.segments[index];
    await sleep(segment.processingMs);
    transcript = fixture.segments.slice(0, index + 1).map((item) => item.text).join(" ");
    if (!firstPartialMs) firstPartialMs = performance.now() - startedAt;
    state.transcript = transcript;
    elements.transcriptView.textContent = transcript;
    log(`Partial ${index + 1}/${fixture.segments.length}: ${segment.text}`);
  }

  const finalLatencyMs = performance.now() - startedAt;
  const referenceWords = words(fixture.reference);
  const predictedWords = words(transcript);
  const referenceChars = chars(fixture.reference);
  const predictedChars = chars(transcript);
  const wer = levenshtein(referenceWords, predictedWords) / Math.max(referenceWords.length, 1);
  const cer = levenshtein(referenceChars, predictedChars) / Math.max(referenceChars.length, 1);

  return {
    transcript,
    firstPartialMs,
    finalLatencyMs,
    wer,
    cer,
    startedAt
  };
}

async function runAgentTasks(fixture) {
  const stepLatencies = [];
  const taskStates = [];
  const draftLines = [];
  let totalToolCalls = 0;
  let successfulToolCalls = 0;

  log(`Intent routed: ${fixture.intent.id}.`);
  await sleep(fixture.intent.processingMs);

  for (const task of fixture.tasks) {
    let completedSteps = 0;
    for (const step of task.steps) {
      await sleep(step.latencyMs);
      stepLatencies.push(step.latencyMs);
      totalToolCalls += 1;
      successfulToolCalls += 1;
      completedSteps += 1;
      if (step.draftLine) {
        draftLines.push(step.draftLine);
      }
      log(step.effect);
    }
    taskStates.push({
      id: task.id,
      goal: task.goal,
      completed: true,
      completedSteps,
      stepCount: task.steps.length
    });
  }

  return {
    workflowId: fixture.workflowId,
    page: fixture.workspace.page,
    taskStates,
    taskSuccessRate: 1,
    avgStepLatencyMs: average(stepLatencies),
    toolCallSuccessRate: successfulToolCalls / Math.max(totalToolCalls, 1),
    userInterventionCount: 0,
    totalToolCalls,
    draftLines
  };
}

async function runTts(fixture) {
  const startedAt = performance.now();
  let firstAudioMs = 0;
  for (let index = 0; index < fixture.ttsChunks.length; index += 1) {
    const chunk = fixture.ttsChunks[index];
    await sleep(chunk.synthesisMs);
    if (!firstAudioMs) firstAudioMs = performance.now() - startedAt;
    log(`TTS chunk ${index + 1}/${fixture.ttsChunks.length}: ${chunk.text}`);
  }
  return {
    firstAudioMs,
    ttsMs: performance.now() - startedAt
  };
}

function buildReply(draftLines) {
  return [
    "Here is the local voice-agent brief.",
    ...draftLines
  ].join("\n");
}

async function executeVoiceAgentWorkload(fixture) {
  const wallStartedAt = performance.now();
  const voice = await runVoiceTurn(fixture);
  const agent = await runAgentTasks(fixture);
  const reply = buildReply(agent.draftLines);
  state.reply = reply;
  elements.replyView.textContent = reply;
  log("Integrated reply draft prepared.");
  const tts = await runTts(fixture);

  return {
    wakeWord: fixture.wakeWord,
    intentId: fixture.intent.id,
    route: fixture.intent.route,
    audioSeconds: fixture.audioSeconds,
    transcript: voice.transcript,
    reply,
    ttsVoice: fixture.ttsVoice,
    workflowId: agent.workflowId,
    page: agent.page,
    taskStates: agent.taskStates,
    segmentCount: fixture.segments.length,
    taskCount: fixture.tasks.length,
    firstPartialMs: voice.firstPartialMs,
    finalLatencyMs: voice.finalLatencyMs,
    roundtripMs: performance.now() - wallStartedAt,
    firstAudioMs: tts.firstAudioMs,
    audioSecPerSec: fixture.audioSeconds / Math.max(voice.finalLatencyMs / 1000, 0.001),
    wer: voice.wer,
    cer: voice.cer,
    taskSuccessRate: agent.taskSuccessRate,
    avgStepLatencyMs: agent.avgStepLatencyMs,
    toolCallSuccessRate: agent.toolCallSuccessRate,
    userInterventionCount: agent.userInterventionCount,
    ttsMs: tts.ttsMs
  };
}

async function runRealSurfaceVoiceAgent(adapter, fixture) {
  log(`Connecting real app-surface adapter '${adapter.id}'.`);
  const dataset = await withTimeout(
    Promise.resolve(adapter.loadDataset({ taskId: fixture.intent.id })),
    REAL_ADAPTER_LOAD_MS,
    `loadDataset(${adapter.id})`
  );
  const renderInfo = await withTimeout(
    Promise.resolve(adapter.renderSurface({ frameIndex: 0 })),
    REAL_ADAPTER_LOAD_MS,
    `renderSurface(${adapter.id})`
  );
  const result = await executeVoiceAgentWorkload(fixture);
  await withTimeout(
    Promise.resolve(adapter.recordTelemetry({
      kind: "voice-agent-run",
      route: result.route,
      taskSuccessRate: result.taskSuccessRate,
      roundtripMs: result.roundtripMs
    })),
    REAL_ADAPTER_LOAD_MS,
    `recordTelemetry(${adapter.id})`
  );
  log(`Real adapter '${adapter.id}' executed task ${dataset?.preset?.id || fixture.intent.id} (frame ${renderInfo?.frameIndex ?? 0}).`);
  return { ...result, realAdapter: adapter, realDataset: dataset, realRenderInfo: renderInfo };
}

async function runLab() {
  if (state.active) return;
  state.active = true;
  state.run = null;
  state.realAdapterError = null;
  state.transcript = "";
  state.reply = "";
  render();

  const fixture = await loadFixture();

  if (isRealSurfaceMode) {
    log(`Mode=${requestedMode} requested; awaiting real app-surface adapter registration.`);
    const adapter = await awaitRealSurface();
    if (adapter) {
      try {
        state.run = await runRealSurfaceVoiceAgent(adapter, fixture);
        state.active = false;
        log(`Real app-surface '${adapter.id}' complete: roundtrip ${round(state.run.roundtripMs)} ms.`);
        render();
        return;
      } catch (error) {
        state.realAdapterError = error?.message || String(error);
        log(`Real surface '${adapter.id}' failed: ${state.realAdapterError}; falling back to deterministic.`);
      }
    } else {
      const reason = (typeof window !== "undefined" && window.__aiWebGpuLabRealVoiceAgentBootstrapError) || "timed out waiting for adapter registration";
      state.realAdapterError = reason;
      log(`No real app-surface adapter registered (${reason}); falling back to deterministic voice agent demo.`);
    }
  }

  state.run = { ...(await executeVoiceAgentWorkload(fixture)), realAdapter: null };
  state.active = false;
  log(`Voice agent demo complete: roundtrip ${round(state.run.roundtripMs)} ms, task_success_rate ${round(state.run.taskSuccessRate, 2)}.`);
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
    id: "deterministic-voice-agent",
    label: "Deterministic Voice Agent",
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
      repo: "app-voice-agent-lab",
      commit: "bootstrap-generated",
      timestamp: new Date().toISOString(),
      owner: "ai-webgpu-lab",
      track: "integration",
      scenario: run
        ? (run.realAdapter ? `voice-agent-lab-real-${run.realAdapter.id}` : "voice-agent-lab-demo")
        : "voice-agent-lab-pending",
      notes: run
        ? `wake_word=${run.wakeWord}; intent=${run.intentId}; route=${run.route}; workflow=${run.workflowId}; page=${run.page}; tasks=${run.taskCount}; local_only=true; tts_voice=${run.ttsVoice}${run.realAdapter ? `; realAdapter=${run.realAdapter.id}` : (isRealSurfaceMode && state.realAdapterError ? `; realAdapter=fallback(${state.realAdapterError})` : "")}`
        : "Run the integrated voice agent lab demo."
    },
    environment: state.environment,
    workload: {
      kind: "voice-agent",
      name: "voice-agent-lab-demo",
      input_profile: run ? `${run.segmentCount}-segments-${run.taskCount}-tasks` : "voice-agent-pending",
      model_id: "deterministic-voice-agent-app-v1",
      dataset: "voice-agent-fixture-v1"
    },
    metrics: {
      common: {
        time_to_interactive_ms: round(performance.now() - state.startedAt, 2) || 0,
        init_ms: run ? round(run.roundtripMs, 2) || 0 : 0,
        success_rate: run ? 1 : 0.5,
        peak_memory_note: navigator.deviceMemory ? `${navigator.deviceMemory} GB reported by browser` : "deviceMemory unavailable",
        error_type: ""
      },
      stt: {
        audio_sec_per_sec: run ? round(run.audioSecPerSec, 2) || 0 : 0,
        first_partial_ms: run ? round(run.firstPartialMs, 2) || 0 : 0,
        final_latency_ms: run ? round(run.finalLatencyMs, 2) || 0 : 0,
        roundtrip_ms: run ? round(run.roundtripMs, 2) || 0 : 0,
        wer: run ? round(run.wer, 4) || 0 : 0,
        cer: run ? round(run.cer, 4) || 0 : 0
      },
      agent: {
        task_success_rate: run ? round(run.taskSuccessRate, 2) || 0 : 0,
        avg_step_latency_ms: run ? round(run.avgStepLatencyMs, 2) || 0 : 0,
        tool_call_success_rate: run ? round(run.toolCallSuccessRate, 2) || 0 : 0,
        user_intervention_count: run ? run.userInterventionCount : 0
      }
    },
    status: run ? "success" : "partial",
    artifacts: {
      raw_logs: state.logs.slice(0, 6),
      deploy_url: "https://ai-webgpu-lab.github.io/app-voice-agent-lab/",
      app_surface_adapter: describeAppSurfaceAdapter()
    }
  };
}

function renderCards(container, items) {
  container.innerHTML = "";
  for (const [label, value] of items) {
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `<span class="label">${label}</span><div class="value">${value}</div>`;
    container.appendChild(card);
  }
}

function renderWorkspace() {
  elements.workspaceGrid.innerHTML = "";
  if (!state.fixture) return;
  for (const cardData of state.fixture.workspace.cards) {
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `<strong>${cardData.id}</strong><div>${cardData.summary}</div>`;
    const chips = document.createElement("div");
    chips.className = "chip-row";
    for (const token of [`status:${cardData.status}`, `owner:${cardData.owner}`, `priority:${cardData.priority}`]) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = token;
      chips.appendChild(chip);
    }
    card.appendChild(chips);
    elements.workspaceGrid.appendChild(card);
  }
}

function renderTasks() {
  elements.taskGrid.innerHTML = "";
  if (!state.fixture) return;
  const taskStates = state.run ? state.run.taskStates : [];
  for (const task of state.fixture.tasks) {
    const current = taskStates.find((item) => item.id === task.id);
    const status = current ? (current.completed ? "complete" : "deferred") : "ready";
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `<strong>${task.id}</strong><div>${task.goal}</div><div class="chip-row"><span class="chip">${status}</span><span class="chip">${task.steps.length} steps</span></div>`;
    elements.taskGrid.appendChild(card);
  }
}

function renderStatus() {
  const badges = state.active
    ? ["Voice agent running", "Local-only fixture"]
    : state.run
      ? [`Roundtrip ${round(state.run.roundtripMs)} ms`, `Task ${round(state.run.taskSuccessRate, 2)}`]
      : ["Voice agent ready", "Awaiting run"];

  elements.statusRow.innerHTML = "";
  for (const text of badges) {
    const node = document.createElement("span");
    node.className = "badge";
    node.textContent = text;
    elements.statusRow.appendChild(node);
  }

  elements.summary.textContent = state.run
    ? `Transcript complete, task success ${round(state.run.taskSuccessRate, 2)}, avg step ${round(state.run.avgStepLatencyMs)} ms, roundtrip ${round(state.run.roundtripMs)} ms.`
    : "Run the voice agent lab to simulate wake word detection, transcript assembly, agent task execution, and TTS handoff.";
}

function renderMetrics() {
  const run = state.run;
  renderCards(elements.metricGrid, [
    ["Wake Word", run ? run.wakeWord : (state.fixture ? state.fixture.wakeWord : "pending")],
    ["Roundtrip", run ? `${round(run.roundtripMs)} ms` : "pending"],
    ["First Partial", run ? `${round(run.firstPartialMs)} ms` : "pending"],
    ["Task Success", run ? `${round(run.taskSuccessRate, 2)}` : "pending"],
    ["Step Latency", run ? `${round(run.avgStepLatencyMs)} ms` : "pending"],
    ["Tools", state.fixture ? String(state.fixture.tools.length) : "pending"]
  ]);
}

function renderEnvironment() {
  renderCards(elements.metaGrid, [
    ["Browser", `${state.environment.browser.name} ${state.environment.browser.version}`],
    ["OS", `${state.environment.os.name} ${state.environment.os.version}`],
    ["Device", state.environment.device.class],
    ["CPU", state.environment.device.cpu],
    ["Backend", state.environment.backend],
    ["Worker", state.environment.worker_mode],
    ["Route", state.run ? state.run.route : (state.fixture ? state.fixture.intent.route : "pending")],
    ["Policy", state.fixture ? state.fixture.workspace.settings.capturePolicy : "pending"]
  ]);
}

function renderFixture() {
  if (!state.fixture) {
    elements.fixtureView.textContent = "Loading fixture...";
    return;
  }
  const payload = {
    wakeWord: state.fixture.wakeWord,
    workflowId: state.fixture.workflowId,
    route: state.fixture.intent.route,
    page: state.fixture.workspace.page,
    tools: state.fixture.tools,
    tasks: state.fixture.tasks.map((task) => ({
      id: task.id,
      steps: task.steps.length
    })),
    ttsVoice: state.fixture.ttsVoice
  };
  elements.fixtureView.textContent = JSON.stringify(payload, null, 2);
}

function renderLogs() {
  elements.logList.innerHTML = "";
  const entries = state.logs.length ? state.logs : ["No demo activity yet."];
  for (const entry of entries) {
    const item = document.createElement("li");
    item.textContent = entry;
    elements.logList.appendChild(item);
  }
}

function render() {
  renderStatus();
  renderWorkspace();
  renderTasks();
  renderMetrics();
  renderEnvironment();
  renderFixture();
  renderLogs();
  elements.transcriptView.textContent = state.transcript || "No voice turn yet.";
  elements.replyView.textContent = state.reply || "No reply emitted yet.";
  elements.resultJson.textContent = JSON.stringify(buildResult(), null, 2);
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(buildResult(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `app-voice-agent-lab-${state.run ? "demo" : "pending"}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  log("Downloaded voice agent lab JSON draft.");
}

elements.runLab.addEventListener("click", () => {
  runLab().catch((error) => {
    state.active = false;
    log(`Voice agent lab failed: ${error instanceof Error ? error.message : String(error)}`);
    render();
  });
});

elements.downloadJson.addEventListener("click", downloadJson);

(async function init() {
  await loadFixture();
  log("Voice agent lab demo ready.");
  render();
})();
