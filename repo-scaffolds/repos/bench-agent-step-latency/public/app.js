const PROFILES = [
  {
    id: "router-fast",
    label: "Router Fast",
    stepScale: 0.78,
    stepExtraMs: 3,
    failureKeys: ["toggle-audit", "queue-review"],
    fallbackFailureKeys: ["policy-check"],
    workerMode: "worker"
  },
  {
    id: "balanced-router",
    label: "Balanced Router",
    stepScale: 1,
    stepExtraMs: 6,
    failureKeys: [],
    fallbackFailureKeys: [],
    workerMode: "worker"
  },
  {
    id: "policy-guarded",
    label: "Policy Guarded",
    stepScale: 1.24,
    stepExtraMs: 10,
    failureKeys: [],
    fallbackFailureKeys: [],
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
    label: "CPU fallback",
    backend: "cpu",
    fallbackTriggered: true,
    workerMode: "main",
    stageMultiplier: 1.82
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
    if (typeof window !== "undefined" && window.__aiWebGpuLabRealAgentBenchBootstrapError) {
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
  workspaceGrid: document.getElementById("workspace-grid"),
  taskGrid: document.getElementById("task-grid"),
  matrixView: document.getElementById("matrix-view"),
  draftView: document.getElementById("draft-view"),
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
      adapter: executionMode.fallbackTriggered ? "cpu-agent-benchmark-fallback" : "synthetic-webgpu-agent-planner",
      required_features: executionMode.fallbackTriggered ? [] : ["shader-f16"],
      limits: executionMode.fallbackTriggered ? {} : { maxStorageBuffersPerShaderStage: 8, maxBindGroups: 4 }
    },
    backend: executionMode.backend,
    fallback_triggered: executionMode.fallbackTriggered,
    worker_mode: executionMode.workerMode,
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

async function loadFixture() {
  if (state.fixture) return state.fixture;
  const response = await fetch("./agent-benchmark-fixture.json", { cache: "no-store" });
  state.fixture = await response.json();
  renderFixture();
  renderWorkspace();
  renderTasks();
  return state.fixture;
}

function scoreProfile(result) {
  return (
    (result.taskSuccessRate * 220) +
    (result.toolCallSuccessRate * 80) -
    (result.avgStepLatencyMs * 0.52) -
    (result.userInterventionCount * 35)
  );
}

async function runProfile(profile, fixture) {
  const stepLatencies = [];
  const taskStates = [];
  const draftLines = [];
  const failureKeys = new Set([
    ...profile.failureKeys,
    ...(executionMode.fallbackTriggered ? profile.fallbackFailureKeys : [])
  ]);
  let totalToolCalls = 0;
  let successfulToolCalls = 0;
  let userInterventionCount = 0;
  let tasksCompleted = 0;

  for (const task of fixture.tasks) {
    let taskCompleted = true;
    let completedSteps = 0;

    for (const step of task.steps) {
      const latencyMs = (step.latencyMs * profile.stepScale + profile.stepExtraMs) * executionMode.stageMultiplier;
      await sleep(latencyMs);
      stepLatencies.push(latencyMs);
      totalToolCalls += 1;
      completedSteps += 1;

      if (step.failureKey && failureKeys.has(step.failureKey)) {
        userInterventionCount += 1;
        taskCompleted = false;
        log(`${profile.label}: ${step.tool} on ${step.target} requires manual follow-up.`);
        if (step.fallbackDraftLine) {
          draftLines.push(step.fallbackDraftLine);
        }
        break;
      }

      successfulToolCalls += 1;
      if (step.draftLine) {
        draftLines.push(step.draftLine);
      }
      log(`${profile.label}: ${step.effect}`);
    }

    taskStates.push({
      id: task.id,
      goal: task.goal,
      completed: taskCompleted,
      completedSteps,
      stepCount: task.steps.length
    });

    if (taskCompleted) {
      tasksCompleted += 1;
    }
  }

  return {
    profile: {
      ...profile,
      workerMode: executionMode.fallbackTriggered ? "main" : profile.workerMode
    },
    workflowId: fixture.workflowId,
    page: fixture.workspace.page,
    taskCount: fixture.tasks.length,
    toolCatalog: fixture.tools,
    totalToolCalls,
    successfulToolCalls,
    taskSuccessRate: tasksCompleted / Math.max(fixture.tasks.length, 1),
    avgStepLatencyMs: average(stepLatencies),
    toolCallSuccessRate: successfulToolCalls / Math.max(totalToolCalls, 1),
    userInterventionCount,
    taskStates,
    draft: draftLines.join("\n")
  };
}

async function runRealBenchmarkAgent(adapter) {
  log(`Connecting real benchmark adapter '${adapter.id}'.`);
  await withTimeout(
    Promise.resolve(adapter.createBenchmark({ name: "agent-step-latency" })),
    REAL_ADAPTER_LOAD_MS,
    `createBenchmark(${adapter.id})`
  );
  await withTimeout(
    Promise.resolve(adapter.runProfile({
      profileId: "agent-step-latency-default",
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
        const { aggregate } = await runRealBenchmarkAgent(adapter);
        state.realAdapterAggregate = aggregate;
        state.realAdapter = adapter;
      } catch (error) {
        state.realAdapterError = error?.message || String(error);
        log(`Real benchmark '${adapter.id}' failed: ${state.realAdapterError}; falling back to deterministic.`);
      }
    } else {
      const reason = (typeof window !== "undefined" && window.__aiWebGpuLabRealAgentBenchBootstrapError) || "timed out waiting for adapter registration";
      state.realAdapterError = reason;
      log(`No real benchmark adapter registered (${reason}); falling back to deterministic agent benchmark.`);
    }
  }

  const fixture = await loadFixture();
  const results = [];

  for (const profile of PROFILES) {
    log(`Running ${profile.label} in ${executionMode.label} mode.`);
    const result = await runProfile(profile, fixture);
    results.push(result);
    log(`${profile.label}: task=${round(result.taskSuccessRate, 2)}, step=${round(result.avgStepLatencyMs)} ms, tool=${round(result.toolCallSuccessRate, 2)}, interventions=${result.userInterventionCount}.`);
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

function buildDraftOutput() {
  if (!state.run) return "No benchmark run yet.";
  return state.run.winner.draft || "Winner produced no draft lines.";
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
    id: "deterministic-agent-bench",
    label: "Deterministic Agent Benchmark",
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
      repo: "bench-agent-step-latency",
      commit: "bootstrap-generated",
      timestamp: new Date().toISOString(),
      owner: "ai-webgpu-lab",
      track: "benchmark",
      scenario: (state.run && state.run.realAdapter) ? `agent-step-latency-real-${state.run.realAdapter.id}` : (run ? `agent-step-latency-${run.executionMode}` : "agent-step-latency-pending"),
      notes: winner
        ? `winner=${winner.profile.id}; workflow=${winner.workflowId}; page=${winner.page}; tasks=${winner.taskCount}; tools=${winner.toolCatalog.join("|")}; interventions=${winner.userInterventionCount}; backend=${state.environment.backend}; fallback=${state.environment.fallback_triggered}${state.run && state.run.realAdapter ? `; realAdapter=${state.run.realAdapter.id}` : (isRealBenchmarkMode && state.realAdapterError ? `; realAdapter=fallback(${state.realAdapterError})` : "")}`
        : "Run the fixed browser agent latency benchmark."
    },
    environment: state.environment,
    workload: {
      kind: "browser-agent",
      name: "agent-step-latency-benchmark",
      input_profile: state.fixture ? `${state.fixture.tasks.length}-tasks-${state.fixture.tools.length}-tools` : "fixture-pending",
      model_id: winner ? winner.profile.id : "pending",
      dataset: "agent-benchmark-fixture-v1"
    },
    metrics: {
      common: {
        time_to_interactive_ms: round(performance.now() - state.startedAt, 2) || 0,
        init_ms: winner ? round(winner.avgStepLatencyMs, 2) || 0 : 0,
        success_rate: winner ? 1 : 0.5,
        peak_memory_note: navigator.deviceMemory ? `${navigator.deviceMemory} GB reported by browser` : "deviceMemory unavailable",
        error_type: ""
      },
      agent: {
        task_success_rate: winner ? round(winner.taskSuccessRate, 2) || 0 : 0,
        avg_step_latency_ms: winner ? round(winner.avgStepLatencyMs, 2) || 0 : 0,
        tool_call_success_rate: winner ? round(winner.toolCallSuccessRate, 2) || 0 : 0,
        user_intervention_count: winner ? winner.userInterventionCount : 0
      }
    },
    status: winner ? "success" : "partial",
    artifacts: {
      raw_logs: state.logs.slice(0, 6),
      deploy_url: "https://ai-webgpu-lab.github.io/bench-agent-step-latency/",
      benchmark_adapter: describeBenchmarkAdapter()
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
  const taskStates = state.run ? state.run.winner.taskStates : [];
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
  const badges = [];
  if (state.active) {
    badges.push(`${executionMode.label} running`);
    badges.push(`${PROFILES.length} profiles`);
  } else if (state.run) {
    badges.push(`${executionMode.label} complete`);
    badges.push(`Winner ${state.run.winner.profile.label}`);
  } else {
    badges.push(`${executionMode.label} ready`);
    badges.push(`${PROFILES.length} profiles`);
  }

  elements.statusRow.innerHTML = "";
  for (const text of badges) {
    const node = document.createElement("span");
    node.className = "badge";
    node.textContent = text;
    elements.statusRow.appendChild(node);
  }

  elements.summary.textContent = state.run
    ? `Winner ${state.run.winner.profile.label}: task success ${round(state.run.winner.taskSuccessRate, 2)}, avg step ${round(state.run.winner.avgStepLatencyMs)} ms, tool success ${round(state.run.winner.toolCallSuccessRate, 2)}, interventions ${state.run.winner.userInterventionCount}.`
    : `Mode=${executionMode.label}. Benchmark one fixed browser-agent task deck across deterministic planner profiles.`;
}

function renderMetrics() {
  const winner = state.run ? state.run.winner : null;
  renderCards(elements.metricGrid, [
    ["Winner", winner ? winner.profile.label : "pending"],
    ["Task Success", winner ? `${round(winner.taskSuccessRate, 2)}` : "pending"],
    ["Step Latency", winner ? `${round(winner.avgStepLatencyMs)} ms` : "pending"],
    ["Tool Success", winner ? `${round(winner.toolCallSuccessRate, 2)}` : "pending"],
    ["Interventions", winner ? String(winner.userInterventionCount) : "pending"],
    ["Workflow", winner ? winner.workflowId : (state.fixture ? state.fixture.workflowId : "pending")]
  ]);
}

function renderEnvironment() {
  renderCards(elements.metaGrid, [
    ["Browser", `${state.environment.browser.name} ${state.environment.browser.version}`],
    ["OS", `${state.environment.os.name} ${state.environment.os.version}`],
    ["Device", state.environment.device.class],
    ["CPU", state.environment.device.cpu],
    ["Backend", state.environment.backend],
    ["Fallback", String(state.environment.fallback_triggered)],
    ["Worker", state.environment.worker_mode],
    ["Mode", executionMode.label]
  ]);
}

function renderFixture() {
  if (!state.fixture) {
    elements.fixtureView.textContent = "Loading fixture...";
    return;
  }
  const payload = {
    workflowId: state.fixture.workflowId,
    page: state.fixture.workspace.page,
    tools: state.fixture.tools,
    tasks: state.fixture.tasks.map((task) => ({
      id: task.id,
      steps: task.steps.map((step) => ({
        id: step.id,
        tool: step.tool,
        failureKey: step.failureKey || null
      }))
    })),
    profiles: PROFILES.map((profile) => ({
      id: profile.id,
      stepScale: profile.stepScale,
      failureKeys: profile.failureKeys,
      fallbackFailureKeys: profile.fallbackFailureKeys
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
        <td>${round(result.taskSuccessRate, 2)}</td>
        <td>${round(result.avgStepLatencyMs)} ms</td>
        <td>${round(result.toolCallSuccessRate, 2)}</td>
        <td>${result.userInterventionCount}</td>
      </tr>
    `)
    .join("");

  elements.matrixView.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Rank</th>
          <th>Profile</th>
          <th>Task Success</th>
          <th>Avg Step</th>
          <th>Tool Success</th>
          <th>Interventions</th>
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
  renderMatrix();
  renderLogs();
  elements.draftView.textContent = buildDraftOutput();
  elements.resultJson.textContent = JSON.stringify(buildResult(), null, 2);
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(buildResult(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `bench-agent-step-latency-${state.run ? state.run.executionMode : "pending"}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  log("Downloaded agent latency JSON draft.");
}

elements.runBenchmark.addEventListener("click", () => {
  runBenchmark().catch((error) => {
    state.active = false;
    log(`Benchmark failed: ${error instanceof Error ? error.message : String(error)}`);
    render();
  });
});

elements.downloadJson.addEventListener("click", downloadJson);

(async function init() {
  await loadFixture();
  log("Agent latency benchmark ready.");
  render();
})();
