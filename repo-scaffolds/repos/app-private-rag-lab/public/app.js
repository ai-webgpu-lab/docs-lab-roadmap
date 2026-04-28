const PRIVATE_NOTES = [
  {
    id: "policy",
    title: "Local Policy",
    text: "The private RAG lab keeps source documents in the browser. Network connectors stay disabled until a review records data flow, retention, and user consent. Every answer should expose citations and local-only status before demo promotion."
  },
  {
    id: "cache",
    title: "Cache Rules",
    text: "Cold and warm cache states must be recorded separately. A warm run can reuse prepared chunks and embeddings, but the result must still report cache state, document count, chunk count, and citation hit-rate."
  },
  {
    id: "ux",
    title: "Demo UX",
    text: "The app surface should show ingest progress, retrieval evidence, answer latency, and error state. The first demo does not need remote upload, account login, or shared workspace features."
  },
  {
    id: "runtime",
    title: "Runtime Plan",
    text: "The deterministic fixture will be replaced by browser embeddings, a reranker, and a local generator. The output schema should remain stable when those runtime providers are connected."
  }
];

const EVAL_QUESTIONS = [
  {
    query: "What controls should stay visible before remote connectors are added?",
    expectedDocumentId: "policy"
  },
  {
    query: "How should cold and warm runs be recorded?",
    expectedDocumentId: "cache"
  },
  {
    query: "Which interface signals matter for demo readiness?",
    expectedDocumentId: "ux"
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
    if (typeof window !== "undefined" && window.__aiWebGpuLabRealPrivateRagBootstrapError) {
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
  questionInput: document.getElementById("question-input"),
  statusRow: document.getElementById("status-row"),
  summary: document.getElementById("summary"),
  runLab: document.getElementById("run-lab"),
  downloadJson: document.getElementById("download-json"),
  answerView: document.getElementById("answer-view"),
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
    gpu: { adapter: "not-applicable", required_features: [], limits: {} },
    backend: "browser-fixture",
    fallback_triggered: false,
    worker_mode: "main",
    cache_state: "warm"
  };
}

function log(message) {
  state.logs.unshift(`[${new Date().toLocaleTimeString()}] ${message}`);
  state.logs = state.logs.slice(0, 12);
  renderLogs();
}

function vectorizeText(text, dimension = 64) {
  const vector = new Float32Array(dimension);
  const normalized = text.toLowerCase();
  for (let index = 0; index < normalized.length; index += 1) {
    const code = normalized.charCodeAt(index);
    const slot = (code + index * 17) % dimension;
    vector[slot] += (code % 29) / 29;
    vector[(slot * 7 + 11) % dimension] += ((code % 13) + 1) / 17;
  }
  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm) || 1;
  return Array.from(vector, (value) => value / norm);
}

function cosineSimilarity(left, right) {
  let dot = 0;
  for (let index = 0; index < left.length; index += 1) dot += left[index] * right[index];
  return dot;
}

function chunkDocument(document) {
  return document.text
    .split(". ")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((text, index) => ({
      id: `${document.id}-chunk-${index + 1}`,
      documentId: document.id,
      title: document.title,
      text: text.endsWith(".") ? text : `${text}.`
    }));
}

function tokenize(text) {
  return text.trim().split(/\s+/).filter(Boolean);
}

function rerank(question, chunks) {
  const queryTokens = new Set(tokenize(question.toLowerCase()).map((token) => token.replace(/[^a-z0-9-]/g, "")));
  return chunks
    .map((chunk) => {
      const text = chunk.text.toLowerCase();
      let lexicalBoost = 0;
      for (const token of queryTokens) {
        if (token && text.includes(token)) lexicalBoost += 0.025;
      }
      return { ...chunk, rerankScore: chunk.score + lexicalBoost };
    })
    .sort((left, right) => right.rerankScore - left.rerankScore);
}

async function runQuestion(question, embeddedChunks) {
  const queryVector = vectorizeText(question.query);
  const retrieveStartedAt = performance.now();
  const retrieved = embeddedChunks
    .map((chunk) => ({ ...chunk, score: cosineSimilarity(queryVector, chunk.vector) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 4);
  const retrieveMs = performance.now() - retrieveStartedAt;

  const rerankStartedAt = performance.now();
  const reranked = rerank(question.query, retrieved);
  const rerankMs = performance.now() - rerankStartedAt;

  const answerStartedAt = performance.now();
  await new Promise((resolve) => setTimeout(resolve, 16));
  const ttftMs = performance.now() - answerStartedAt;
  const answer = reranked.slice(0, 2).map((chunk) => `[${chunk.title}] ${chunk.text}`).join(" ");
  await new Promise((resolve) => setTimeout(resolve, 12));

  return {
    query: question.query,
    expectedDocumentId: question.expectedDocumentId,
    topDocumentId: reranked[0]?.documentId || "none",
    answer,
    retrieveMs,
    rerankMs,
    answerTtftMs: ttftMs,
    answerTotalMs: performance.now() - answerStartedAt,
    citationHit: reranked.some((chunk) => chunk.documentId === question.expectedDocumentId)
  };
}

async function executeRagWorkload() {
  log("Private RAG lab: ingesting bundled notes.");
  const ingestStartedAt = performance.now();
  const chunks = PRIVATE_NOTES.flatMap((document) => chunkDocument(document));
  const ingestMsPerPage = (performance.now() - ingestStartedAt) / PRIVATE_NOTES.length;

  const embedStartedAt = performance.now();
  const embeddedChunks = chunks.map((chunk) => ({ ...chunk, vector: vectorizeText(chunk.text) }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  const embedTotalMs = performance.now() - embedStartedAt;

  const customQuestion = elements.questionInput.value.trim();
  const questions = customQuestion
    ? [{ query: customQuestion, expectedDocumentId: "policy" }, ...EVAL_QUESTIONS]
    : EVAL_QUESTIONS;

  const answers = [];
  for (const question of questions) {
    const answer = await runQuestion(question, embeddedChunks);
    answers.push(answer);
    log(`Answered "${question.query}" with top citation ${answer.topDocumentId}.`);
  }

  const citationHits = answers.filter((answer) => answer.citationHit).length;
  const avg = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);

  return {
    documents: PRIVATE_NOTES.length,
    chunkCount: chunks.length,
    questionCount: questions.length,
    ingestMsPerPage,
    embedTotalMs,
    retrieveMs: avg(answers.map((answer) => answer.retrieveMs)),
    rerankMs: avg(answers.map((answer) => answer.rerankMs)),
    answerTtftMs: avg(answers.map((answer) => answer.answerTtftMs)),
    answerTotalMs: avg(answers.map((answer) => answer.answerTotalMs)),
    citationHitRate: citationHits / questions.length,
    answers
  };
}

async function runRealSurfacePrivateRag(adapter) {
  log(`Connecting real app-surface adapter '${adapter.id}'.`);
  const dataset = await withTimeout(
    Promise.resolve(adapter.loadDataset({ corpusId: "private-notes" })),
    REAL_ADAPTER_LOAD_MS,
    `loadDataset(${adapter.id})`
  );
  const renderInfo = await withTimeout(
    Promise.resolve(adapter.renderSurface({ frameIndex: 0 })),
    REAL_ADAPTER_LOAD_MS,
    `renderSurface(${adapter.id})`
  );

  const result = await executeRagWorkload();

  await withTimeout(
    Promise.resolve(adapter.recordTelemetry({
      kind: "private-rag-run",
      questionCount: result.questionCount,
      citationHitRate: result.citationHitRate
    })),
    REAL_ADAPTER_LOAD_MS,
    `recordTelemetry(${adapter.id})`
  );
  log(`Real adapter '${adapter.id}' ingested corpus ${dataset?.preset?.id || "private-notes"} (frame ${renderInfo?.frameIndex ?? 0}).`);
  return { ...result, realAdapter: adapter, realDataset: dataset, realRenderInfo: renderInfo };
}

async function runLab() {
  if (state.active) return;
  state.active = true;
  state.realAdapterError = null;
  render();

  if (isRealSurfaceMode) {
    log(`Mode=${requestedMode} requested; awaiting real app-surface adapter registration.`);
    const adapter = await awaitRealSurface();
    if (adapter) {
      try {
        state.run = await runRealSurfacePrivateRag(adapter);
        state.active = false;
        log(`Real app-surface '${adapter.id}' complete: hit-rate ${round(state.run.citationHitRate, 2)} across ${state.run.questionCount} questions.`);
        render();
        return;
      } catch (error) {
        state.realAdapterError = error?.message || String(error);
        log(`Real surface '${adapter.id}' failed: ${state.realAdapterError}; falling back to deterministic.`);
      }
    } else {
      const reason = (typeof window !== "undefined" && window.__aiWebGpuLabRealPrivateRagBootstrapError) || "timed out waiting for adapter registration";
      state.realAdapterError = reason;
      log(`No real app-surface adapter registered (${reason}); falling back to deterministic private RAG demo.`);
    }
  }

  state.run = { ...(await executeRagWorkload()), realAdapter: null };
  state.active = false;
  log(`Private RAG lab complete: hit-rate ${round(state.run.citationHitRate, 2)} across ${state.run.questionCount} questions.`);
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
    id: "deterministic-private-rag",
    label: "Deterministic Private RAG",
    status: "deterministic",
    isReal: false,
    version: "1.0.0",
    capabilities: ["preset-replay", "renderer-scorecard", "telemetry-record"],
    surfaceType: "synthetic",
    message: "App surface adapter registry unavailable; using inline deterministic mock."
  };
}

function buildAnswerText() {
  if (!state.run) return "No answer yet.";
  return state.run.answers
    .map((answer, index) => `${index + 1}. ${answer.query}\nCitation: ${answer.topDocumentId}\n${answer.answer}`)
    .join("\n\n");
}

function buildResult() {
  const run = state.run;
  return {
    meta: {
      repo: "app-private-rag-lab",
      commit: "bootstrap-generated",
      timestamp: new Date().toISOString(),
      owner: "ai-webgpu-lab",
      track: "integration",
      scenario: run
        ? (run.realAdapter ? `private-rag-lab-real-${run.realAdapter.id}` : "private-rag-lab-demo")
        : "private-rag-lab-pending",
      notes: run
        ? `private fixture; docs=${run.documents}; chunks=${run.chunkCount}; questions=${run.questionCount}; local_only=true${run.realAdapter ? `; realAdapter=${run.realAdapter.id}` : (isRealSurfaceMode && state.realAdapterError ? `; realAdapter=fallback(${state.realAdapterError})` : "")}`
        : "Run the private RAG lab demo."
    },
    environment: state.environment,
    workload: {
      kind: "rag",
      name: "private-rag-lab-demo",
      input_profile: run ? `${run.documents}-private-notes-${run.questionCount}-questions` : "private-rag-pending",
      dataset: "private-notes-fixture-v1"
    },
    metrics: {
      common: {
        time_to_interactive_ms: round(performance.now() - state.startedAt, 2) || 0,
        init_ms: run ? round(run.embedTotalMs, 2) || 0 : 0,
        success_rate: run ? 1 : 0.5,
        peak_memory_note: navigator.deviceMemory ? `${navigator.deviceMemory} GB reported by browser` : "deviceMemory unavailable",
        error_type: ""
      },
      rag: {
        ingest_ms_per_page: run ? round(run.ingestMsPerPage, 2) || 0 : 0,
        chunk_count: run ? run.chunkCount : 0,
        embed_total_ms: run ? round(run.embedTotalMs, 2) || 0 : 0,
        retrieve_ms: run ? round(run.retrieveMs, 2) || 0 : 0,
        rerank_ms: run ? round(run.rerankMs, 2) || 0 : 0,
        answer_ttft_ms: run ? round(run.answerTtftMs, 2) || 0 : 0,
        answer_total_ms: run ? round(run.answerTotalMs, 2) || 0 : 0,
        citation_hit_rate: run ? round(run.citationHitRate, 2) || 0 : 0
      }
    },
    status: run ? "success" : "partial",
    artifacts: {
      raw_logs: state.logs.slice(0, 5),
      deploy_url: "https://ai-webgpu-lab.github.io/app-private-rag-lab/",
      app_surface_adapter: describeAppSurfaceAdapter()
    }
  };
}

function renderStatus() {
  const badges = state.active
    ? ["RAG running", "Local fixture active"]
    : state.run
      ? ["RAG complete", `Hit rate ${round(state.run.citationHitRate, 2)}`]
      : ["Private notes ready", "Awaiting run"];
  elements.statusRow.innerHTML = "";
  for (const text of badges) {
    const node = document.createElement("span");
    node.className = "badge";
    node.textContent = text;
    elements.statusRow.appendChild(node);
  }
  elements.summary.textContent = state.run
    ? `Retrieved ${state.run.chunkCount} chunks from ${state.run.documents} private notes with citation hit-rate ${round(state.run.citationHitRate, 2)}.`
    : "Run the private RAG lab to ingest bundled notes, retrieve citations, and draft a local answer.";
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
    ["Documents", run ? String(run.documents) : String(PRIVATE_NOTES.length)],
    ["Chunks", run ? String(run.chunkCount) : "pending"],
    ["Citation Hit", run ? String(round(run.citationHitRate, 2)) : "pending"],
    ["Retrieve", run ? `${round(run.retrieveMs, 2)} ms` : "pending"],
    ["Answer Total", run ? `${round(run.answerTotalMs, 2)} ms` : "pending"],
    ["Cache", state.environment.cache_state]
  ]);
}

function renderEnvironment() {
  renderCards(elements.metaGrid, [
    ["Browser", `${state.environment.browser.name} ${state.environment.browser.version}`],
    ["OS", `${state.environment.os.name} ${state.environment.os.version}`],
    ["Device", state.environment.device.class],
    ["Backend", state.environment.backend],
    ["Worker", state.environment.worker_mode],
    ["Fallback", String(state.environment.fallback_triggered)]
  ]);
}

function renderLogs() {
  elements.logList.innerHTML = "";
  const logs = state.logs.length ? state.logs : ["Private RAG lab ready."];
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
  elements.answerView.textContent = buildAnswerText();
  renderResult();
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(buildResult(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "app-private-rag-lab-demo.json";
  anchor.click();
  URL.revokeObjectURL(url);
  log("Downloaded private RAG lab JSON draft.");
}

elements.runLab.addEventListener("click", () => {
  runLab().catch((error) => {
    state.active = false;
    log(`Run failed: ${error instanceof Error ? error.message : String(error)}`);
    render();
  });
});
elements.downloadJson.addEventListener("click", downloadJson);

render();
log("Private RAG lab demo ready.");
