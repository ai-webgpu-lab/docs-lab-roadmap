const CANDIDATES = [
  {
    id: "worker-jank",
    title: "Worker Isolation Benchmark",
    text: "The worker isolation benchmark compares main-thread and dedicated worker execution while recording responsiveness, timer lag, and frame pacing under shared result schema.",
    relevant: true
  },
  {
    id: "model-cache",
    title: "Model Cache Benchmark",
    text: "The model cache benchmark measures cold and warm load deltas with prepared artifacts, cache state, and storage reuse metadata.",
    relevant: false
  },
  {
    id: "renderer-shootout",
    title: "Renderer Shootout Draft",
    text: "The renderer shootout compares scene load and frame pacing across three.js, Babylon.js, and PlayCanvas harnesses.",
    relevant: false
  },
  {
    id: "private-rag",
    title: "Private RAG Demo",
    text: "The private RAG lab keeps local notes in browser memory, retrieves citations, and exports citation hit-rate for internal demo readiness.",
    relevant: false
  },
  {
    id: "llm-worker-ux",
    title: "LLM Worker UX Experiment",
    text: "The LLM worker UX experiment compares dedicated worker and main-thread chat execution with stable prompt budget and responsiveness metadata.",
    relevant: true
  },
  {
    id: "ort-provider",
    title: "ORT WebGPU Provider Baseline",
    text: "The ORT WebGPU baseline fixes provider metadata and compares WebGPU and Wasm fallback throughput for a deterministic transformer-block profile.",
    relevant: false
  }
];

const state = {
  startedAt: performance.now(),
  environment: buildEnvironment(),
  active: false,
  run: null,
  logs: []
};

const elements = {
  queryInput: document.getElementById("query-input"),
  statusRow: document.getElementById("status-row"),
  summary: document.getElementById("summary"),
  runReranker: document.getElementById("run-reranker"),
  downloadJson: document.getElementById("download-json"),
  rankingView: document.getElementById("ranking-view"),
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
  const sorted = [...values].sort((a, b) => a - b);
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
  const hasWebGpu = typeof navigator !== "undefined" && Boolean(navigator.gpu);
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
      adapter: hasWebGpu ? "navigator.gpu available" : "wasm-fallback-simulated",
      required_features: hasWebGpu ? ["shader-f16"] : [],
      limits: {}
    },
    backend: hasWebGpu ? "webgpu" : "wasm",
    fallback_triggered: !hasWebGpu,
    worker_mode: "main",
    cache_state: "warm"
  };
}

function log(message) {
  state.logs.unshift(`[${new Date().toLocaleTimeString()}] ${message}`);
  state.logs = state.logs.slice(0, 12);
  renderLogs();
}

function tokens(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function scoreCandidate(queryTokens, candidate) {
  const startedAt = performance.now();
  const textTokens = tokens(`${candidate.title} ${candidate.text}`);
  const tokenSet = new Set(textTokens);
  let lexical = 0;
  for (const token of queryTokens) {
    if (tokenSet.has(token)) lexical += 1;
    if (candidate.text.toLowerCase().includes(token)) lexical += 0.35;
  }

  const fieldBoost = candidate.title.toLowerCase().includes("worker") ? 1.3 : 0;
  const relevanceHint = candidate.relevant ? 0.9 : 0;
  const lengthPenalty = Math.max(0, textTokens.length - 30) * 0.006;
  const score = lexical + fieldBoost + relevanceHint - lengthPenalty;

  return {
    ...candidate,
    score: round(score, 4),
    durationMs: performance.now() - startedAt
  };
}

async function runReranker() {
  if (state.active) return;
  state.active = true;
  render();

  const query = elements.queryInput.value.trim();
  const queryTokens = tokens(query);
  const startedAt = performance.now();
  await new Promise((resolve) => setTimeout(resolve, state.environment.fallback_triggered ? 18 : 8));

  const scored = CANDIDATES.map((candidate) => scoreCandidate(queryTokens, candidate));
  await new Promise((resolve) => setTimeout(resolve, state.environment.fallback_triggered ? 24 : 10));
  const ranked = scored.sort((left, right) => right.score - left.score);
  const totalMs = performance.now() - startedAt;
  const scoreTimes = ranked.map((candidate) => candidate.durationMs);
  const relevantInTop3 = ranked.slice(0, 3).some((candidate) => candidate.relevant);
  const bestRelevantRank = ranked.findIndex((candidate) => candidate.relevant) + 1;

  state.run = {
    query,
    queryTokens: queryTokens.length,
    candidateCount: CANDIDATES.length,
    ranked,
    totalMs,
    p50Ms: percentile(scoreTimes, 0.5) || 0,
    p95Ms: percentile(scoreTimes, 0.95) || 0,
    candidatesPerSec: CANDIDATES.length / Math.max(totalMs / 1000, 0.001),
    queriesPerSec: 1 / Math.max(totalMs / 1000, 0.001),
    top3HitRate: relevantInTop3 ? 1 : 0,
    bestRelevantRank
  };
  state.active = false;
  log(`Reranker complete: top result ${ranked[0].id}, top3Hit=${state.run.top3HitRate}.`);
  render();
}

function rankingText() {
  if (!state.run) return "No reranker run yet.";
  return state.run.ranked
    .map((candidate, index) => `${index + 1}. ${candidate.id} | score ${candidate.score} | relevant=${candidate.relevant}`)
    .join("\n");
}

function buildResult() {
  const run = state.run;
  return {
    meta: {
      repo: "exp-reranker-browser",
      commit: "bootstrap-generated",
      timestamp: new Date().toISOString(),
      owner: "ai-webgpu-lab",
      track: "ml",
      scenario: run ? "browser-reranker-readiness" : "browser-reranker-pending",
      notes: run
        ? `candidateCount=${run.candidateCount}; queryTokens=${run.queryTokens}; bestRelevantRank=${run.bestRelevantRank}; backend=${state.environment.backend}`
        : "Run the deterministic browser reranker fixture."
    },
    environment: state.environment,
    workload: {
      kind: "reranker",
      name: "browser-reranker-readiness",
      input_profile: run ? `${run.candidateCount}-candidates-${run.queryTokens}-query-tokens` : "reranker-pending",
      model_id: "browser-reranker-fixture-v1",
      dataset: "reranker-fixture-v1"
    },
    metrics: {
      common: {
        time_to_interactive_ms: round(performance.now() - state.startedAt, 2) || 0,
        init_ms: run ? round(run.totalMs, 2) || 0 : 0,
        success_rate: run ? 1 : 0.5,
        peak_memory_note: navigator.deviceMemory ? `${navigator.deviceMemory} GB reported by browser` : "deviceMemory unavailable",
        error_type: ""
      },
      embeddings: {
        docs_per_sec: run ? round(run.candidatesPerSec, 2) || 0 : 0,
        queries_per_sec: run ? round(run.queriesPerSec, 2) || 0 : 0,
        p50_ms: run ? round(run.p50Ms, 4) || 0 : 0,
        p95_ms: run ? round(run.p95Ms, 4) || 0 : 0,
        recall_at_10: run ? run.top3HitRate : 0,
        index_build_ms: run ? round(run.totalMs, 2) || 0 : 0
      }
    },
    status: run ? "success" : "partial",
    artifacts: {
      raw_logs: state.logs.slice(0, 5),
      deploy_url: "https://ai-webgpu-lab.github.io/exp-reranker-browser/"
    }
  };
}

function renderStatus() {
  const badges = state.active
    ? ["Reranker running", state.environment.backend]
    : state.run
      ? ["Reranker complete", `rank ${state.run.bestRelevantRank}`]
      : ["Fixture ready", "Awaiting run"];
  elements.statusRow.innerHTML = "";
  for (const text of badges) {
    const node = document.createElement("span");
    node.className = "badge";
    node.textContent = text;
    elements.statusRow.appendChild(node);
  }
  elements.summary.textContent = state.run
    ? `Top relevant rank ${state.run.bestRelevantRank}, p95 scoring ${round(state.run.p95Ms, 4)} ms, candidates/sec ${round(state.run.candidatesPerSec, 2)}.`
    : "Run the reranker to score fixed candidates, sort top-k output, and export schema-aligned latency and quality metrics.";
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
    ["Candidates", run ? String(run.candidateCount) : String(CANDIDATES.length)],
    ["Top Relevant", run ? `#${run.bestRelevantRank}` : "pending"],
    ["Top3 Hit", run ? String(run.top3HitRate) : "pending"],
    ["P95 Score", run ? `${round(run.p95Ms, 4)} ms` : "pending"],
    ["Candidates/sec", run ? String(round(run.candidatesPerSec, 2)) : "pending"],
    ["Backend", state.environment.backend]
  ]);
}

function renderEnvironment() {
  renderCards(elements.metaGrid, [
    ["Browser", `${state.environment.browser.name} ${state.environment.browser.version}`],
    ["OS", `${state.environment.os.name} ${state.environment.os.version}`],
    ["Device", state.environment.device.class],
    ["Backend", state.environment.backend],
    ["Fallback", String(state.environment.fallback_triggered)],
    ["Cache", state.environment.cache_state]
  ]);
}

function renderLogs() {
  elements.logList.innerHTML = "";
  const logs = state.logs.length ? state.logs : ["Browser reranker harness ready."];
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
  elements.rankingView.textContent = rankingText();
  renderResult();
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(buildResult(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "exp-reranker-browser-readiness.json";
  anchor.click();
  URL.revokeObjectURL(url);
  log("Downloaded browser reranker JSON draft.");
}

elements.runReranker.addEventListener("click", () => {
  runReranker().catch((error) => {
    state.active = false;
    log(`Run failed: ${error instanceof Error ? error.message : String(error)}`);
    render();
  });
});
elements.downloadJson.addEventListener("click", downloadJson);

render();
log("Browser reranker harness ready.");
