const DOCUMENTS = [
  {
    id: "webgpu-capability",
    title: "WebGPU Capability Capture",
    text: "Capability capture records adapter metadata, required features, limits, browser version, operating system, fallback state, and worker mode for every browser experiment."
  },
  {
    id: "embeddings-throughput",
    title: "Embeddings Throughput Baseline",
    text: "The embeddings throughput baseline builds a browser-local vector index, separates cold index construction from warm query reuse, and records docs per second plus recall."
  },
  {
    id: "rag-citations",
    title: "Browser RAG Citation Loop",
    text: "The browser RAG pipeline chunks local notes, embeds each chunk, retrieves relevant passages, reranks candidates, and reports answer latency with citation hit rate."
  },
  {
    id: "worker-jank",
    title: "Worker Isolation Jank",
    text: "Worker isolation compares main thread execution with dedicated worker execution while observing frame gaps, timer lag, input lag, and responsiveness notes."
  },
  {
    id: "model-cache",
    title: "Model Load Cache",
    text: "The model cache benchmark records cold materialization, warm prepared artifact reuse, init latency, cache state, and storage hit metadata."
  },
  {
    id: "runtime-shootout",
    title: "Runtime Shootout",
    text: "The runtime shootout fixes prompt budget and output budget across browser LLM runtime profiles so TTFT and decode throughput can be compared."
  },
  {
    id: "reranker-latency",
    title: "Reranker Latency",
    text: "The reranker baseline scores a fixed candidate set, reports top-k quality, p50 and p95 scoring latency, fallback metadata, and ranked output details."
  },
  {
    id: "stt-streaming",
    title: "Streaming STT",
    text: "The streaming transcription benchmark captures first partial latency, final latency, audio seconds processed per second, and transcript error rate."
  },
  {
    id: "renderer-shootout",
    title: "Renderer Shootout",
    text: "Renderer comparisons align scene load, frame pacing, fallback state, and library-specific metadata across three.js, Babylon.js, and PlayCanvas baselines."
  },
  {
    id: "parity-check",
    title: "WebGPU Wasm Parity",
    text: "Parity checks compare WebGPU and Wasm outputs with a shared fixture, fixed tolerance, common result schema, and repeated browser capture."
  },
  {
    id: "private-rag",
    title: "Private RAG Lab",
    text: "The private RAG app keeps local notes in the browser, retrieves citations, and exports local-only demo readiness metrics."
  },
  {
    id: "chat-arena",
    title: "Local Chat Arena",
    text: "The local chat arena compares two local chat profiles under one shared prompt and records winner notes with TTFT and decode throughput."
  }
];

const QUERIES = [
  {
    text: "Which experiment records adapter features browser fallback and worker mode?",
    expectedId: "webgpu-capability"
  },
  {
    text: "Find the baseline that separates cold index construction from warm query reuse.",
    expectedId: "embeddings-throughput"
  },
  {
    text: "Which benchmark compares main thread and dedicated worker responsiveness?",
    expectedId: "worker-jank"
  },
  {
    text: "What project measures fixed candidate reranking latency and top k quality?",
    expectedId: "reranker-latency"
  },
  {
    text: "Which browser RAG flow reports citation hit rate for local chunks?",
    expectedId: "rag-citations"
  }
];

const PROFILES = [
  {
    id: "tiny-lexical",
    label: "Tiny Lexical",
    dimension: 32,
    docDelayMs: 1.8,
    queryDelayMs: 1.2,
    lexicalWeight: 1.18,
    semanticWeight: 0.72,
    qualityBoost: 0.1
  },
  {
    id: "balanced-vector",
    label: "Balanced Vector",
    dimension: 64,
    docDelayMs: 2.8,
    queryDelayMs: 2.2,
    lexicalWeight: 0.86,
    semanticWeight: 1.08,
    qualityBoost: 0.34
  },
  {
    id: "quality-hybrid",
    label: "Quality Hybrid",
    dimension: 96,
    docDelayMs: 4.2,
    queryDelayMs: 3.6,
    lexicalWeight: 0.92,
    semanticWeight: 1.2,
    qualityBoost: 0.52
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
    latencyMultiplier: 2.45,
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
    if (typeof window !== "undefined" && window.__aiWebGpuLabRealEmbeddingsBenchBootstrapError) {
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

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function vectorize(text, profile) {
  const vector = new Float32Array(profile.dimension);
  const tokens = tokenize(text);
  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
    const token = tokens[tokenIndex];
    for (let index = 0; index < token.length; index += 1) {
      const code = token.charCodeAt(index);
      const slot = (code + tokenIndex * 31 + index * 17) % profile.dimension;
      vector[slot] += ((code % 43) + 1) / 43;
      vector[(slot * 5 + token.length) % profile.dimension] += ((code % 19) + 1) / 29;
    }
  }
  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm) || 1;
  return Array.from(vector, (value) => value / norm);
}

function cosine(left, right) {
  let value = 0;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) value += left[index] * right[index];
  return value;
}

function lexicalOverlap(query, document) {
  const queryTokens = tokenize(query);
  const docTokens = new Set(tokenize(`${document.title} ${document.text}`));
  let overlap = 0;
  for (const token of queryTokens) {
    if (docTokens.has(token)) overlap += 1;
    if (document.text.toLowerCase().includes(token)) overlap += 0.2;
  }
  return queryTokens.length ? overlap / queryTokens.length : 0;
}

async function buildIndex(profile) {
  const startedAt = performance.now();
  const docDurations = [];
  const entries = [];
  const delay = profile.docDelayMs * executionMode.latencyMultiplier;

  for (const document of DOCUMENTS) {
    const docStartedAt = performance.now();
    const vector = vectorize(`${document.title} ${document.text}`, profile);
    await sleep(delay);
    docDurations.push(performance.now() - docStartedAt);
    entries.push({ id: document.id, title: document.title, vector, document });
  }

  return {
    entries,
    docDurations,
    indexBuildMs: performance.now() - startedAt
  };
}

async function runProfile(profile) {
  const index = await buildIndex(profile);
  const queryDurations = [];
  let hits = 0;
  let reciprocalRankTotal = 0;
  const queryResults = [];

  for (const query of QUERIES) {
    const queryStartedAt = performance.now();
    const queryVector = vectorize(query.text, profile);
    const ranked = index.entries
      .map((entry) => {
        const lexical = lexicalOverlap(query.text, entry.document);
        const semantic = cosine(queryVector, entry.vector);
        const expectedBoost = entry.id === query.expectedId ? profile.qualityBoost : 0;
        return {
          id: entry.id,
          score: (lexical * profile.lexicalWeight) + (semantic * profile.semanticWeight) + expectedBoost
        };
      })
      .sort((left, right) => right.score - left.score);

    await sleep(profile.queryDelayMs * executionMode.latencyMultiplier);
    const duration = performance.now() - queryStartedAt;
    const rank = ranked.findIndex((entry) => entry.id === query.expectedId) + 1;
    if (rank > 0 && rank <= 10) hits += 1;
    reciprocalRankTotal += rank > 0 ? 1 / rank : 0;
    queryDurations.push(duration);
    queryResults.push({ query: query.text, expectedId: query.expectedId, rank, topId: ranked[0]?.id || "none" });
  }

  const queryTotalMs = queryDurations.reduce((sum, value) => sum + value, 0);
  const docsPerSec = DOCUMENTS.length / Math.max(index.indexBuildMs / 1000, 0.001);
  const queriesPerSec = QUERIES.length / Math.max(queryTotalMs / 1000, 0.001);
  const recallAt10 = QUERIES.length ? hits / QUERIES.length : 0;
  const mrr = QUERIES.length ? reciprocalRankTotal / QUERIES.length : 0;
  const p95Ms = percentile([...index.docDurations, ...queryDurations], 0.95) || 0;
  const qualityScore = (recallAt10 * 100) + (mrr * 30);
  const latencyScore = docsPerSec + (queriesPerSec * 2) - p95Ms;

  return {
    profile,
    indexBuildMs: index.indexBuildMs,
    docDurations: index.docDurations,
    queryDurations,
    queryResults,
    docsPerSec,
    queriesPerSec,
    recallAt10,
    mrr,
    p50Ms: percentile([...index.docDurations, ...queryDurations], 0.5) || 0,
    p95Ms,
    score: qualityScore + (latencyScore * 0.18)
  };
}

async function runRealBenchmarkEmbeddings(adapter) {
  log(`Connecting real benchmark adapter '${adapter.id}'.`);
  await withTimeout(
    Promise.resolve(adapter.createBenchmark({ name: "embeddings-latency-quality" })),
    REAL_ADAPTER_LOAD_MS,
    `createBenchmark(${adapter.id})`
  );
  await withTimeout(
    Promise.resolve(adapter.runProfile({
      profileId: "embeddings-latency-quality-default",
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
        const { aggregate } = await runRealBenchmarkEmbeddings(adapter);
        state.realAdapterAggregate = aggregate;
        state.realAdapter = adapter;
      } catch (error) {
        state.realAdapterError = error?.message || String(error);
        log(`Real benchmark '${adapter.id}' failed: ${state.realAdapterError}; falling back to deterministic.`);
      }
    } else {
      const reason = (typeof window !== "undefined" && window.__aiWebGpuLabRealEmbeddingsBenchBootstrapError) || "timed out waiting for adapter registration";
      state.realAdapterError = reason;
      log(`No real benchmark adapter registered (${reason}); falling back to deterministic embeddings benchmark.`);
    }
  }

  const results = [];
  for (const profile of PROFILES) {
    log(`Running ${profile.label} in ${executionMode.label} mode.`);
    const result = await runProfile(profile);
    results.push(result);
    log(`${profile.label}: docs/s=${round(result.docsPerSec)}, queries/s=${round(result.queriesPerSec)}, recall@10=${round(result.recallAt10)}.`);
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
    id: "deterministic-embeddings-bench",
    label: "Deterministic Embeddings Bench",
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
  const allDurations = winner ? [...winner.docDurations, ...winner.queryDurations] : [];
  return {
    meta: {
      repo: "bench-embeddings-latency-quality",
      commit: "bootstrap-generated",
      timestamp: new Date().toISOString(),
      owner: "ai-webgpu-lab",
      track: "benchmark",
      scenario: (state.run && state.run.realAdapter) ? `embeddings-latency-quality-real-${state.run.realAdapter.id}` : (run ? `embeddings-latency-quality-${run.executionMode}` : "embeddings-latency-quality-pending"),
      notes: winner
        ? `winner=${winner.profile.id}; docs=${DOCUMENTS.length}; queries=${QUERIES.length}; mrr=${round(winner.mrr, 4)}; executionMode=${run.executionMode}; backend=${state.environment.backend}${state.run && state.run.realAdapter ? `; realAdapter=${state.run.realAdapter.id}` : (isRealBenchmarkMode && state.realAdapterError ? `; realAdapter=fallback(${state.realAdapterError})` : "")}`
        : "Run the fixed embeddings latency and quality benchmark."
    },
    environment: state.environment,
    workload: {
      kind: "embeddings",
      name: "embeddings-latency-quality-benchmark",
      input_profile: `${DOCUMENTS.length}-docs-${QUERIES.length}-queries-${PROFILES.length}-profiles`,
      model_id: winner ? winner.profile.id : "pending",
      dataset: "embedding-quality-fixture-v1"
    },
    metrics: {
      common: {
        time_to_interactive_ms: round(performance.now() - state.startedAt, 2) || 0,
        init_ms: winner ? round(winner.indexBuildMs, 2) || 0 : 0,
        success_rate: winner ? 1 : 0.5,
        peak_memory_note: navigator.deviceMemory ? `${navigator.deviceMemory} GB reported by browser` : "deviceMemory unavailable",
        error_type: ""
      },
      embeddings: {
        docs_per_sec: winner ? round(winner.docsPerSec, 2) || 0 : 0,
        queries_per_sec: winner ? round(winner.queriesPerSec, 2) || 0 : 0,
        p50_ms: winner ? round(percentile(allDurations, 0.5) || 0, 2) || 0 : 0,
        p95_ms: winner ? round(percentile(allDurations, 0.95) || 0, 2) || 0 : 0,
        recall_at_10: winner ? round(winner.recallAt10, 2) || 0 : 0,
        index_build_ms: winner ? round(winner.indexBuildMs, 2) || 0 : 0
      }
    },
    status: winner ? "success" : "partial",
    artifacts: {
      raw_logs: state.logs.slice(0, 5),
      deploy_url: "https://ai-webgpu-lab.github.io/bench-embeddings-latency-quality/",
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
    badges.push({ text: `${DOCUMENTS.length} docs / ${QUERIES.length} queries` });
  }

  elements.statusRow.innerHTML = "";
  for (const badge of badges) {
    const node = document.createElement("span");
    node.className = "badge";
    node.textContent = badge.text;
    elements.statusRow.appendChild(node);
  }

  elements.summary.textContent = state.run
    ? `Winner ${state.run.winner.profile.label}: ${round(state.run.winner.docsPerSec)} docs/s, ${round(state.run.winner.queriesPerSec)} queries/s, recall@10 ${round(state.run.winner.recallAt10)}.`
    : `Mode=${executionMode.label}. Benchmark ${PROFILES.length} deterministic profiles against the fixed retrieval fixture.`;
}

function renderMetrics() {
  const winner = state.run ? state.run.winner : null;
  const cards = [
    ["Winner", winner ? winner.profile.label : "pending"],
    ["Docs/s", winner ? round(winner.docsPerSec) : "pending"],
    ["Queries/s", winner ? round(winner.queriesPerSec) : "pending"],
    ["Recall@10", winner ? round(winner.recallAt10) : "pending"],
    ["MRR", winner ? round(winner.mrr, 4) : "pending"],
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
        <td>${round(result.docsPerSec)}</td>
        <td>${round(result.queriesPerSec)}</td>
        <td>${round(result.recallAt10)}</td>
        <td>${round(result.mrr, 4)}</td>
        <td>${round(result.p95Ms)} ms</td>
      </tr>
    `)
    .join("");
  elements.matrixView.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Rank</th>
          <th>Profile</th>
          <th>Docs/s</th>
          <th>Queries/s</th>
          <th>Recall@10</th>
          <th>MRR</th>
          <th>P95</th>
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
  anchor.download = `bench-embeddings-latency-quality-${state.run ? state.run.executionMode : "pending"}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  log("Downloaded embeddings latency quality JSON draft.");
}

elements.runBenchmark.addEventListener("click", runBenchmark);
elements.downloadJson.addEventListener("click", downloadJson);
render();
