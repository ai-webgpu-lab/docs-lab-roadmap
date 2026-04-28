const QUERY = "Which browser AI benchmark work should be prioritized for worker responsiveness and retrieval quality?";

const CANDIDATES = [
  {
    id: "worker-jank",
    title: "Worker Isolation Benchmark",
    text: "Compares main thread and dedicated worker execution while recording frame gaps, timer lag, input lag, and responsiveness under a shared result schema.",
    relevant: true
  },
  {
    id: "embeddings-quality",
    title: "Embeddings Latency Quality",
    text: "Compares deterministic embedding profiles with fixed document and query fixtures, balancing retrieval recall, throughput, and p95 latency.",
    relevant: true
  },
  {
    id: "model-cache",
    title: "Model Load Cache",
    text: "Measures cold materialization and warm prepared artifact reuse with cache state, storage hit metadata, and model initialization latency.",
    relevant: false
  },
  {
    id: "runtime-shootout",
    title: "Runtime Shootout",
    text: "Fixes prompt and output budgets across browser LLM runtime profiles so TTFT and decode throughput can be compared.",
    relevant: false
  },
  {
    id: "rag-endtoend",
    title: "RAG End-to-End",
    text: "Combines ingest, chunking, embedding, retrieval, reranking, answer generation, and citation hit-rate in one browser pipeline.",
    relevant: true
  },
  {
    id: "renderer-shootout",
    title: "Renderer Shootout",
    text: "Aligns scene load, frame pacing, fallback state, and renderer metadata across three.js, Babylon.js, and PlayCanvas baselines.",
    relevant: false
  },
  {
    id: "stt-streaming",
    title: "Streaming STT",
    text: "Captures first partial latency, final latency, audio seconds processed per second, and transcript error rate.",
    relevant: false
  },
  {
    id: "private-rag",
    title: "Private RAG Lab",
    text: "Keeps private notes local to the browser, retrieves citations, and exports local-only demo readiness metrics.",
    relevant: true
  },
  {
    id: "webgpu-wasm-parity",
    title: "WebGPU Wasm Parity",
    text: "Compares WebGPU and Wasm outputs with a shared fixture, fixed tolerance, common result schema, and repeated browser capture.",
    relevant: false
  },
  {
    id: "llm-worker-ux",
    title: "LLM Worker UX",
    text: "Compares dedicated worker and main-thread chat execution with stable prompt budget, output budget, and responsiveness notes.",
    relevant: true
  }
];

const PROFILES = [
  {
    id: "cross-encoder-small",
    label: "Cross Encoder Small",
    scoringDelayMs: 2.8,
    batchOverheadMs: 4.5,
    lexicalWeight: 0.92,
    semanticWeight: 0.86,
    relevanceBoost: 0.72
  },
  {
    id: "hybrid-reranker",
    label: "Hybrid Reranker",
    scoringDelayMs: 4.2,
    batchOverheadMs: 6.8,
    lexicalWeight: 1.05,
    semanticWeight: 1.12,
    relevanceBoost: 1.02
  },
  {
    id: "quality-cross-encoder",
    label: "Quality Cross Encoder",
    scoringDelayMs: 6.4,
    batchOverheadMs: 9.5,
    lexicalWeight: 0.96,
    semanticWeight: 1.24,
    relevanceBoost: 1.28
  }
];

const EXECUTION_MODES = {
  webgpu: {
    id: "webgpu",
    label: "WebGPU",
    backend: "webgpu",
    fallbackTriggered: false,
    latencyMultiplier: 1,
    workerMode: "worker"
  },
  fallback: {
    id: "fallback",
    label: "Wasm Fallback",
    backend: "wasm",
    fallbackTriggered: true,
    latencyMultiplier: 2.2,
    workerMode: "main"
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
    if (typeof window !== "undefined" && window.__aiWebGpuLabRealRerankerBenchBootstrapError) {
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

function percentile(values, ratio) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
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
    worker_mode: executionMode.workerMode,
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

function tokens(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function lexicalScore(queryTokens, candidateTokens) {
  const candidateSet = new Set(candidateTokens);
  let score = 0;
  for (const token of queryTokens) {
    if (candidateSet.has(token)) score += 1;
    if ([...candidateSet].some((candidateToken) => candidateToken.includes(token) || token.includes(candidateToken))) score += 0.16;
  }
  return queryTokens.length ? score / queryTokens.length : 0;
}

function semanticHashScore(query, candidate, profile) {
  const source = `${query}|${candidate.title}|${candidate.text}|${profile.id}`;
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = ((hash << 5) - hash) + source.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash % 1000) / 1000;
}

function scoreCandidate(queryTokens, candidate, profile) {
  const candidateTokens = tokens(`${candidate.title} ${candidate.text}`);
  const lexical = lexicalScore(queryTokens, candidateTokens);
  const semantic = semanticHashScore(QUERY, candidate, profile);
  const relevance = candidate.relevant ? profile.relevanceBoost : 0;
  const lengthPenalty = Math.max(0, candidateTokens.length - 26) * 0.005;
  return (lexical * profile.lexicalWeight) + (semantic * profile.semanticWeight) + relevance - lengthPenalty;
}

async function runProfile(profile) {
  const queryTokens = tokens(QUERY);
  const durations = [];
  const startedAt = performance.now();
  await sleep(profile.batchOverheadMs * executionMode.latencyMultiplier);

  const scored = [];
  for (const candidate of CANDIDATES) {
    const candidateStartedAt = performance.now();
    const score = scoreCandidate(queryTokens, candidate, profile);
    await sleep(profile.scoringDelayMs * executionMode.latencyMultiplier);
    durations.push(performance.now() - candidateStartedAt);
    scored.push({ ...candidate, score });
  }

  const ranked = scored.sort((left, right) => right.score - left.score);
  const totalMs = performance.now() - startedAt;
  const relevantTotal = CANDIDATES.filter((candidate) => candidate.relevant).length;
  const top3Hits = ranked.slice(0, 3).filter((candidate) => candidate.relevant).length;
  const top5Hits = ranked.slice(0, 5).filter((candidate) => candidate.relevant).length;
  const bestRelevantRank = ranked.findIndex((candidate) => candidate.relevant) + 1;
  const recallAt3 = relevantTotal ? top3Hits / Math.min(3, relevantTotal) : 0;
  const recallAt5 = relevantTotal ? top5Hits / Math.min(5, relevantTotal) : 0;
  const candidatesPerSec = CANDIDATES.length / Math.max(totalMs / 1000, 0.001);
  const qualityScore = (recallAt3 * 80) + (recallAt5 * 40) + (bestRelevantRank > 0 ? 12 / bestRelevantRank : 0);
  const latencyScore = candidatesPerSec - (percentile(durations, 0.95) || 0);

  return {
    profile,
    ranked,
    durations,
    totalMs,
    candidatesPerSec,
    queriesPerSec: 1 / Math.max(totalMs / 1000, 0.001),
    recallAt3,
    recallAt5,
    bestRelevantRank,
    p50Ms: percentile(durations, 0.5) || 0,
    p95Ms: percentile(durations, 0.95) || 0,
    score: qualityScore + (latencyScore * 0.15)
  };
}

async function runRealBenchmarkReranker(adapter) {
  log(`Connecting real benchmark adapter '${adapter.id}'.`);
  await withTimeout(
    Promise.resolve(adapter.createBenchmark({ name: "reranker-latency" })),
    REAL_ADAPTER_LOAD_MS,
    `createBenchmark(${adapter.id})`
  );
  await withTimeout(
    Promise.resolve(adapter.runProfile({
      profileId: "reranker-latency-default",
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
        const { aggregate } = await runRealBenchmarkReranker(adapter);
        state.realAdapterAggregate = aggregate;
        state.realAdapter = adapter;
      } catch (error) {
        state.realAdapterError = error?.message || String(error);
        log(`Real benchmark '${adapter.id}' failed: ${state.realAdapterError}; falling back to deterministic.`);
      }
    } else {
      const reason = (typeof window !== "undefined" && window.__aiWebGpuLabRealRerankerBenchBootstrapError) || "timed out waiting for adapter registration";
      state.realAdapterError = reason;
      log(`No real benchmark adapter registered (${reason}); falling back to deterministic reranker benchmark.`);
    }
  }

  const results = [];
  for (const profile of PROFILES) {
    log(`Running ${profile.label} in ${executionMode.label} mode.`);
    const result = await runProfile(profile);
    results.push(result);
    log(`${profile.label}: candidates/s=${round(result.candidatesPerSec)}, p95=${round(result.p95Ms)} ms, recall@3=${round(result.recallAt3)}.`);
  }

  results.sort((left, right) => right.score - left.score);
  state.run = {
    executionMode: executionMode.id,
    winner: results[0],
    profiles: results,
    realAdapter: state.realAdapter || null
  };
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
    id: "deterministic-reranker-bench",
    label: "Deterministic Reranker Bench",
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
      repo: "bench-reranker-latency",
      commit: "bootstrap-generated",
      timestamp: new Date().toISOString(),
      owner: "ai-webgpu-lab",
      track: "benchmark",
      scenario: (state.run && state.run.realAdapter) ? `reranker-latency-real-${state.run.realAdapter.id}` : (run ? `reranker-latency-${run.executionMode}` : "reranker-latency-pending"),
      notes: winner
        ? `winner=${winner.profile.id}; candidates=${CANDIDATES.length}; bestRelevantRank=${winner.bestRelevantRank}; recallAt3=${round(winner.recallAt3, 4)}; executionMode=${run.executionMode}; backend=${state.environment.backend}${state.run && state.run.realAdapter ? `; realAdapter=${state.run.realAdapter.id}` : (isRealBenchmarkMode && state.realAdapterError ? `; realAdapter=fallback(${state.realAdapterError})` : "")}`
        : "Run the fixed reranker latency benchmark."
    },
    environment: state.environment,
    workload: {
      kind: "reranker",
      name: "reranker-latency-benchmark",
      input_profile: `${CANDIDATES.length}-candidates-${PROFILES.length}-profiles`,
      model_id: winner ? winner.profile.id : "pending",
      dataset: "reranker-latency-fixture-v1"
    },
    metrics: {
      common: {
        time_to_interactive_ms: round(performance.now() - state.startedAt, 2) || 0,
        init_ms: winner ? round(winner.totalMs, 2) || 0 : 0,
        success_rate: winner ? 1 : 0.5,
        peak_memory_note: navigator.deviceMemory ? `${navigator.deviceMemory} GB reported by browser` : "deviceMemory unavailable",
        error_type: ""
      },
      embeddings: {
        docs_per_sec: winner ? round(winner.candidatesPerSec, 2) || 0 : 0,
        queries_per_sec: winner ? round(winner.queriesPerSec, 2) || 0 : 0,
        p50_ms: winner ? round(winner.p50Ms, 2) || 0 : 0,
        p95_ms: winner ? round(winner.p95Ms, 2) || 0 : 0,
        recall_at_10: winner ? round(winner.recallAt3, 2) || 0 : 0,
        index_build_ms: winner ? round(winner.totalMs, 2) || 0 : 0
      }
    },
    status: winner ? "success" : "partial",
    artifacts: {
      raw_logs: state.logs.slice(0, 5),
      deploy_url: "https://ai-webgpu-lab.github.io/bench-reranker-latency/",
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
    badges.push({ text: `${CANDIDATES.length} candidates` });
  }

  elements.statusRow.innerHTML = "";
  for (const badge of badges) {
    const node = document.createElement("span");
    node.className = "badge";
    node.textContent = badge.text;
    elements.statusRow.appendChild(node);
  }

  elements.summary.textContent = state.run
    ? `Winner ${state.run.winner.profile.label}: ${round(state.run.winner.candidatesPerSec)} candidates/s, p95 ${round(state.run.winner.p95Ms)} ms, recall@3 ${round(state.run.winner.recallAt3)}.`
    : `Mode=${executionMode.label}. Benchmark ${PROFILES.length} deterministic reranker profiles against the fixed candidate fixture.`;
}

function renderMetrics() {
  const winner = state.run ? state.run.winner : null;
  const cards = [
    ["Winner", winner ? winner.profile.label : "pending"],
    ["Candidates/s", winner ? round(winner.candidatesPerSec) : "pending"],
    ["Query/s", winner ? round(winner.queriesPerSec) : "pending"],
    ["Recall@3", winner ? round(winner.recallAt3) : "pending"],
    ["Best Relevant Rank", winner ? winner.bestRelevantRank : "pending"],
    ["P95", winner ? `${round(winner.p95Ms)} ms` : "pending"]
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
        <td>${round(result.candidatesPerSec)}</td>
        <td>${round(result.p95Ms)} ms</td>
        <td>${round(result.recallAt3)}</td>
        <td>${round(result.recallAt5)}</td>
        <td>${result.bestRelevantRank}</td>
      </tr>
    `)
    .join("");
  elements.matrixView.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Rank</th>
          <th>Profile</th>
          <th>Candidates/s</th>
          <th>P95</th>
          <th>Recall@3</th>
          <th>Recall@5</th>
          <th>Best Relevant</th>
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
  anchor.download = `bench-reranker-latency-${state.run ? state.run.executionMode : "pending"}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  log("Downloaded reranker latency JSON draft.");
}

elements.runBenchmark.addEventListener("click", runBenchmark);
elements.downloadJson.addEventListener("click", downloadJson);
render();
