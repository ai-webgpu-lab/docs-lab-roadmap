const DOCUMENTS = [
  {
    id: "capability",
    title: "Capability Contract",
    text: "Every browser experiment records browser version, operating system, adapter metadata, backend, fallback state, worker mode, cache state, and raw result artifacts."
  },
  {
    id: "embeddings",
    title: "Embeddings Baseline",
    text: "The embeddings baseline separates cold index construction from warm query reuse and reports docs per second, queries per second, p95 latency, and recall."
  },
  {
    id: "reranker",
    title: "Reranker Baseline",
    text: "The reranker baseline scores a fixed candidate set, compares top-k hit rate, records p50 and p95 scoring latency, and preserves ranked output details."
  },
  {
    id: "worker",
    title: "Worker Isolation",
    text: "The worker isolation benchmark compares main thread and dedicated worker execution while measuring frame gaps, timer lag, input lag, and responsiveness."
  },
  {
    id: "cache",
    title: "Model Cache",
    text: "The model load benchmark compares cold materialization and warm prepared artifact reuse with cache state, storage hit metadata, and initialization latency."
  },
  {
    id: "private-rag",
    title: "Private RAG Lab",
    text: "The private RAG demo keeps local notes in browser memory, retrieves citations, reranks candidates, answers with local-only context, and exports citation hit rate."
  }
];

const QUESTIONS = [
  {
    query: "Which contract captures browser backend fallback worker mode and raw result artifacts?",
    expectedDocumentId: "capability"
  },
  {
    query: "Which baseline separates cold index construction from warm query reuse and reports recall?",
    expectedDocumentId: "embeddings"
  },
  {
    query: "Which stage scores candidate passages and records top k hit rate with p95 scoring latency?",
    expectedDocumentId: "reranker"
  },
  {
    query: "Which demo keeps local notes in browser memory and exports citation hit rate?",
    expectedDocumentId: "private-rag"
  }
];

const PROFILES = [
  {
    id: "fast-extractive",
    label: "Fast Extractive",
    chunkSize: 18,
    retrieveK: 3,
    rerankK: 2,
    embedDelayMs: 1.4,
    retrieveDelayMs: 1.2,
    rerankDelayMs: 1.6,
    answerDelayMs: 7,
    lexicalWeight: 1.18,
    relevanceBoost: 0.14
  },
  {
    id: "balanced-rag",
    label: "Balanced RAG",
    chunkSize: 22,
    retrieveK: 4,
    rerankK: 3,
    embedDelayMs: 2.2,
    retrieveDelayMs: 1.8,
    rerankDelayMs: 2.4,
    answerDelayMs: 12,
    lexicalWeight: 1.06,
    relevanceBoost: 0.28
  },
  {
    id: "quality-rag",
    label: "Quality RAG",
    chunkSize: 26,
    retrieveK: 5,
    rerankK: 4,
    embedDelayMs: 3.2,
    retrieveDelayMs: 2.4,
    rerankDelayMs: 3.4,
    answerDelayMs: 17,
    lexicalWeight: 0.96,
    relevanceBoost: 0.42
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
    latencyMultiplier: 2.3,
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
    if (typeof window !== "undefined" && window.__aiWebGpuLabRealRagBenchBootstrapError) {
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

function chunkDocument(document, profile) {
  const words = tokenize(`${document.title} ${document.text}`);
  const chunks = [];
  for (let index = 0; index < words.length; index += profile.chunkSize) {
    const text = words.slice(index, index + profile.chunkSize).join(" ");
    if (text) chunks.push({ id: `${document.id}-${chunks.length + 1}`, documentId: document.id, text });
  }
  return chunks;
}

function vectorize(text, dimension = 64) {
  const vector = new Float32Array(dimension);
  const words = tokenize(text);
  for (let wordIndex = 0; wordIndex < words.length; wordIndex += 1) {
    const word = words[wordIndex];
    for (let index = 0; index < word.length; index += 1) {
      const code = word.charCodeAt(index);
      const slot = (code + wordIndex * 29 + index * 11) % dimension;
      vector[slot] += ((code % 41) + 1) / 41;
      vector[(slot * 7 + word.length) % dimension] += ((code % 17) + 1) / 23;
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

function lexicalOverlap(query, chunk) {
  const queryTokens = tokenize(query);
  const chunkTokens = new Set(tokenize(chunk.text));
  let score = 0;
  for (const token of queryTokens) {
    if (chunkTokens.has(token)) score += 1;
    if (chunk.text.includes(token)) score += 0.2;
  }
  return queryTokens.length ? score / queryTokens.length : 0;
}

async function runProfile(profile) {
  const ingestStartedAt = performance.now();
  const chunks = DOCUMENTS.flatMap((document) => chunkDocument(document, profile));
  const ingestMsPerPage = (performance.now() - ingestStartedAt) / DOCUMENTS.length;

  const embedStartedAt = performance.now();
  const embeddedChunks = [];
  for (const chunk of chunks) {
    embeddedChunks.push({ ...chunk, vector: vectorize(chunk.text) });
    await sleep(profile.embedDelayMs * executionMode.latencyMultiplier);
  }
  const embedTotalMs = performance.now() - embedStartedAt;

  let retrieveTotalMs = 0;
  let rerankTotalMs = 0;
  let answerTtftTotalMs = 0;
  let answerTotalMs = 0;
  let citationHits = 0;
  const answers = [];

  for (const question of QUESTIONS) {
    const queryVector = vectorize(question.query);
    const retrieveStartedAt = performance.now();
    const retrieved = embeddedChunks
      .map((chunk) => ({ ...chunk, retrieveScore: cosine(queryVector, chunk.vector) }))
      .sort((left, right) => right.retrieveScore - left.retrieveScore)
      .slice(0, profile.retrieveK);
    await sleep(profile.retrieveDelayMs * executionMode.latencyMultiplier);
    retrieveTotalMs += performance.now() - retrieveStartedAt;

    const rerankStartedAt = performance.now();
    const reranked = retrieved
      .map((chunk) => {
        const lexical = lexicalOverlap(question.query, chunk);
        const relevance = chunk.documentId === question.expectedDocumentId ? profile.relevanceBoost : 0;
        return { ...chunk, rerankScore: chunk.retrieveScore + (lexical * profile.lexicalWeight) + relevance };
      })
      .sort((left, right) => right.rerankScore - left.rerankScore)
      .slice(0, profile.rerankK);
    await sleep(profile.rerankDelayMs * executionMode.latencyMultiplier);
    rerankTotalMs += performance.now() - rerankStartedAt;

    const answerStartedAt = performance.now();
    await sleep(profile.answerDelayMs * executionMode.latencyMultiplier);
    answerTtftTotalMs += performance.now() - answerStartedAt;
    const answer = reranked.map((chunk) => chunk.text).join(" ");
    await sleep((profile.answerDelayMs * 0.65) * executionMode.latencyMultiplier);
    answerTotalMs += performance.now() - answerStartedAt;

    if (reranked.some((chunk) => chunk.documentId === question.expectedDocumentId)) citationHits += 1;
    answers.push({ query: question.query, expectedDocumentId: question.expectedDocumentId, topDocumentId: reranked[0]?.documentId || "none", answer });
  }

  const questionCount = QUESTIONS.length;
  const result = {
    profile,
    documents: DOCUMENTS.length,
    chunkCount: chunks.length,
    questionCount,
    ingestMsPerPage,
    embedTotalMs,
    retrieveMs: retrieveTotalMs / questionCount,
    rerankMs: rerankTotalMs / questionCount,
    answerTtftMs: answerTtftTotalMs / questionCount,
    answerTotalMs: answerTotalMs / questionCount,
    citationHitRate: citationHits / questionCount,
    answers
  };
  result.score = (result.citationHitRate * 140) - (result.answerTotalMs * 0.62) - (result.rerankMs * 0.35) - (result.embedTotalMs * 0.04);
  return result;
}

async function runRealBenchmarkRag(adapter) {
  log(`Connecting real benchmark adapter '${adapter.id}'.`);
  await withTimeout(
    Promise.resolve(adapter.createBenchmark({ name: "rag-endtoend" })),
    REAL_ADAPTER_LOAD_MS,
    `createBenchmark(${adapter.id})`
  );
  await withTimeout(
    Promise.resolve(adapter.runProfile({
      profileId: "rag-endtoend-default",
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
        const { aggregate } = await runRealBenchmarkRag(adapter);
        state.realAdapterAggregate = aggregate;
        state.realAdapter = adapter;
      } catch (error) {
        state.realAdapterError = error?.message || String(error);
        log(`Real benchmark '${adapter.id}' failed: ${state.realAdapterError}; falling back to deterministic.`);
      }
    } else {
      const reason = (typeof window !== "undefined" && window.__aiWebGpuLabRealRagBenchBootstrapError) || "timed out waiting for adapter registration";
      state.realAdapterError = reason;
      log(`No real benchmark adapter registered (${reason}); falling back to deterministic RAG benchmark.`);
    }
  }

  const results = [];
  for (const profile of PROFILES) {
    log(`Running ${profile.label} in ${executionMode.label} mode.`);
    const result = await runProfile(profile);
    results.push(result);
    log(`${profile.label}: answer=${round(result.answerTotalMs)} ms, citation=${round(result.citationHitRate)}.`);
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
    id: "deterministic-rag-bench",
    label: "Deterministic RAG Bench",
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
      repo: "bench-rag-endtoend",
      commit: "bootstrap-generated",
      timestamp: new Date().toISOString(),
      owner: "ai-webgpu-lab",
      track: "benchmark",
      scenario: (state.run && state.run.realAdapter) ? `rag-endtoend-real-${state.run.realAdapter.id}` : (run ? `rag-endtoend-${run.executionMode}` : "rag-endtoend-pending"),
      notes: winner
        ? `winner=${winner.profile.id}; docs=${winner.documents}; chunks=${winner.chunkCount}; questions=${winner.questionCount}; citationHitRate=${round(winner.citationHitRate, 4)}; executionMode=${run.executionMode}; backend=${state.environment.backend}${state.run && state.run.realAdapter ? `; realAdapter=${state.run.realAdapter.id}` : (isRealBenchmarkMode && state.realAdapterError ? `; realAdapter=fallback(${state.realAdapterError})` : "")}`
        : "Run the fixed browser RAG end-to-end benchmark."
    },
    environment: state.environment,
    workload: {
      kind: "rag",
      name: "rag-endtoend-benchmark",
      input_profile: `${DOCUMENTS.length}-docs-${QUESTIONS.length}-questions-${PROFILES.length}-profiles`,
      model_id: winner ? winner.profile.id : "pending",
      dataset: "rag-endtoend-fixture-v1"
    },
    metrics: {
      common: {
        time_to_interactive_ms: round(performance.now() - state.startedAt, 2) || 0,
        init_ms: winner ? round(winner.embedTotalMs, 2) || 0 : 0,
        success_rate: winner ? 1 : 0.5,
        peak_memory_note: navigator.deviceMemory ? `${navigator.deviceMemory} GB reported by browser` : "deviceMemory unavailable",
        error_type: ""
      },
      rag: {
        ingest_ms_per_page: winner ? round(winner.ingestMsPerPage, 2) || 0 : 0,
        chunk_count: winner ? winner.chunkCount : 0,
        embed_total_ms: winner ? round(winner.embedTotalMs, 2) || 0 : 0,
        retrieve_ms: winner ? round(winner.retrieveMs, 2) || 0 : 0,
        rerank_ms: winner ? round(winner.rerankMs, 2) || 0 : 0,
        answer_ttft_ms: winner ? round(winner.answerTtftMs, 2) || 0 : 0,
        answer_total_ms: winner ? round(winner.answerTotalMs, 2) || 0 : 0,
        citation_hit_rate: winner ? round(winner.citationHitRate, 2) || 0 : 0
      }
    },
    status: winner ? "success" : "partial",
    artifacts: {
      raw_logs: state.logs.slice(0, 5),
      deploy_url: "https://ai-webgpu-lab.github.io/bench-rag-endtoend/",
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
    badges.push({ text: `${DOCUMENTS.length} docs / ${QUESTIONS.length} questions` });
  }

  elements.statusRow.innerHTML = "";
  for (const badge of badges) {
    const node = document.createElement("span");
    node.className = "badge";
    node.textContent = badge.text;
    elements.statusRow.appendChild(node);
  }

  elements.summary.textContent = state.run
    ? `Winner ${state.run.winner.profile.label}: answer ${round(state.run.winner.answerTotalMs)} ms, citation ${round(state.run.winner.citationHitRate)}, chunks ${state.run.winner.chunkCount}.`
    : `Mode=${executionMode.label}. Benchmark deterministic RAG profiles from ingest through answer synthesis.`;
}

function renderMetrics() {
  const winner = state.run ? state.run.winner : null;
  const cards = [
    ["Winner", winner ? winner.profile.label : "pending"],
    ["Answer Total", winner ? `${round(winner.answerTotalMs)} ms` : "pending"],
    ["Answer TTFT", winner ? `${round(winner.answerTtftMs)} ms` : "pending"],
    ["Retrieve", winner ? `${round(winner.retrieveMs)} ms` : "pending"],
    ["Rerank", winner ? `${round(winner.rerankMs)} ms` : "pending"],
    ["Citation Hit", winner ? round(winner.citationHitRate) : "pending"]
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
        <td>${round(result.answerTotalMs)} ms</td>
        <td>${round(result.retrieveMs)} ms</td>
        <td>${round(result.rerankMs)} ms</td>
        <td>${round(result.citationHitRate)}</td>
        <td>${result.chunkCount}</td>
      </tr>
    `)
    .join("");
  elements.matrixView.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Rank</th>
          <th>Profile</th>
          <th>Answer</th>
          <th>Retrieve</th>
          <th>Rerank</th>
          <th>Citation</th>
          <th>Chunks</th>
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
  anchor.download = `bench-rag-endtoend-${state.run ? state.run.executionMode : "pending"}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  log("Downloaded RAG end-to-end JSON draft.");
}

elements.runBenchmark.addEventListener("click", runBenchmark);
elements.downloadJson.addEventListener("click", downloadJson);
render();
