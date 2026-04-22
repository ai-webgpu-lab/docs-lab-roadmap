const CACHE_KEY = "ai-webgpu-lab:embeddings-index:v1";

const state = {
  startedAt: performance.now(),
  environment: buildEnvironment(),
  fixture: null,
  cachePresent: false,
  activeScenario: "idle",
  run: null,
  logs: []
};

const elements = {
  statusRow: document.getElementById("status-row"),
  summary: document.getElementById("summary"),
  runCold: document.getElementById("run-cold"),
  runWarm: document.getElementById("run-warm"),
  clearCache: document.getElementById("clear-cache"),
  downloadJson: document.getElementById("download-json"),
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

function percentile(values, ratio) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function parseBrowser() {
  const ua = navigator.userAgent;
  for (const [needle, name] of [["Edg/", "Edge"], ["Chrome/", "Chrome"], ["Firefox/", "Firefox"], ["Version/", "Safari"]]) {
    const marker = ua.indexOf(needle);
    if (marker >= 0) {
      return { name, version: ua.slice(marker + needle.length).split(/[\s)/;]/)[0] || "unknown" };
    }
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
    gpu: { adapter: "not-applicable", required_features: [], limits: {} },
    backend: "mixed",
    fallback_triggered: false,
    worker_mode: "main",
    cache_state: "unknown"
  };
}

function log(message) {
  state.logs.unshift(`[${new Date().toLocaleTimeString()}] ${message}`);
  state.logs = state.logs.slice(0, 12);
  renderLogs();
}

function vectorizeText(text, dimension = 64) {
  const vector = new Float32Array(dimension);
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    const slot = (code + index * 17) % dimension;
    vector[slot] += (code % 37) / 37;
    vector[(slot * 7 + 3) % dimension] += ((code % 13) + 1) / 17;
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

async function loadFixture() {
  if (state.fixture) return state.fixture;
  const response = await fetch("./docs-fixture.json", { cache: "no-store" });
  state.fixture = await response.json();
  return state.fixture;
}

function readCachedIndex() {
  const raw = localStorage.getItem(CACHE_KEY);
  if (!raw) return null;
  return JSON.parse(raw);
}

function writeCachedIndex(payload) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
}

function clearCachedIndex() {
  localStorage.removeItem(CACHE_KEY);
  state.cachePresent = false;
}

async function buildIndex(documents) {
  const batchSize = 3;
  const perDocMs = [];
  const entries = [];
  const startedAt = performance.now();

  for (let start = 0; start < documents.length; start += batchSize) {
    const batch = documents.slice(start, start + batchSize);
    for (const doc of batch) {
      const docStartedAt = performance.now();
      const vector = vectorizeText(`${doc.title} ${doc.text}`);
      perDocMs.push(performance.now() - docStartedAt);
      entries.push({ id: doc.id, title: doc.title, vector });
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return {
    entries,
    batchSize,
    perDocMs,
    indexBuildMs: performance.now() - startedAt
  };
}

function runQueries(indexEntries, queries) {
  const queryDurations = [];
  let hits = 0;

  for (const query of queries) {
    const queryStartedAt = performance.now();
    const vector = vectorizeText(query.text);
    const ranked = indexEntries
      .map((entry) => ({ id: entry.id, score: cosineSimilarity(vector, entry.vector) }))
      .sort((left, right) => right.score - left.score)
      .slice(0, 10);
    queryDurations.push(performance.now() - queryStartedAt);
    if (ranked.some((entry) => entry.id === query.expectedId)) hits += 1;
  }

  return {
    queryDurations,
    recallAt10: queries.length ? hits / queries.length : 0
  };
}

async function runScenario(mode) {
  if (state.activeScenario !== "idle") return;
  const fixture = await loadFixture();
  state.activeScenario = mode;
  state.environment.cache_state = mode;
  render();

  if (mode === "cold") clearCachedIndex();

  const cached = readCachedIndex();
  let indexPayload = cached;
  let indexBuildMs = 0;
  let perDocMs = [];

  if (!cached || mode === "cold") {
    log(`${mode} run: building synthetic embedding index.`);
    const built = await buildIndex(fixture.documents);
    indexPayload = { createdAt: new Date().toISOString(), entries: built.entries, batchSize: built.batchSize };
    writeCachedIndex(indexPayload);
    state.cachePresent = true;
    indexBuildMs = built.indexBuildMs;
    perDocMs = built.perDocMs;
  } else {
    state.cachePresent = true;
    log("Warm run: reusing cached embedding index.");
    perDocMs = fixture.documents.map(() => 0);
  }

  const queryStats = runQueries(indexPayload.entries, fixture.queries);
  const totalMs = indexBuildMs + queryStats.queryDurations.reduce((sum, value) => sum + value, 0);
  const run = {
    scenario: mode,
    batchSize: indexPayload.batchSize || 3,
    documentCount: fixture.documents.length,
    queryCount: fixture.queries.length,
    indexBuildMs,
    perDocMs,
    queryDurations: queryStats.queryDurations,
    totalMs,
    docsPerSec: fixture.documents.length / Math.max(indexBuildMs / 1000, 0.001),
    queriesPerSec: fixture.queries.length / Math.max(queryStats.queryDurations.reduce((sum, value) => sum + value, 0) / 1000, 0.001),
    recallAt10: queryStats.recallAt10
  };

  state.run = run;
  state.activeScenario = "idle";
  log(`${mode} run complete: docs/s=${round(run.docsPerSec, 2)}, queries/s=${round(run.queriesPerSec, 2)}, recall@10=${round(run.recallAt10, 2)}.`);
  render();
}

function buildResult() {
  const run = state.run;
  return {
    meta: {
      repo: "exp-embeddings-browser-throughput",
      commit: "bootstrap-generated",
      timestamp: new Date().toISOString(),
      owner: "ai-webgpu-lab",
      track: "ml",
      scenario: run ? `synthetic-embeddings-${run.scenario}` : "synthetic-embeddings-pending",
      notes: run
        ? `synthetic fixture; batchSize=${run.batchSize}; docs=${run.documentCount}; queries=${run.queryCount}; cacheState=${run.scenario}`
        : "Run cold and warm synthetic embedding harness."
    },
    environment: state.environment,
    workload: {
      kind: "embeddings",
      name: "synthetic-embedding-throughput",
      input_profile: state.fixture ? `${state.fixture.documents.length}-docs-${state.fixture.queries.length}-queries` : "fixture-pending",
      model_id: "synthetic-browser-embedder-v1",
      dataset: "docs-fixture-v1"
    },
    metrics: {
      common: {
        time_to_interactive_ms: round(performance.now() - state.startedAt, 2) || 0,
        init_ms: run ? round(run.indexBuildMs, 2) || 0 : 0,
        success_rate: run ? 1 : 0.5,
        peak_memory_note: navigator.deviceMemory ? `${navigator.deviceMemory} GB reported by browser` : "deviceMemory unavailable",
        error_type: ""
      },
      embeddings: {
        docs_per_sec: run ? round(run.docsPerSec, 2) || 0 : 0,
        queries_per_sec: run ? round(run.queriesPerSec, 2) || 0 : 0,
        p50_ms: run ? round(percentile(run.perDocMs.filter((value) => value > 0), 0.5) || 0, 2) || 0 : 0,
        p95_ms: run ? round(percentile(run.perDocMs.filter((value) => value > 0), 0.95) || 0, 2) || 0 : 0,
        recall_at_10: run ? round(run.recallAt10, 2) || 0 : 0,
        index_build_ms: run ? round(run.indexBuildMs, 2) || 0 : 0
      }
    },
    status: run ? "success" : "partial",
    artifacts: {
      raw_logs: state.logs.slice(0, 5),
      deploy_url: "https://ai-webgpu-lab.github.io/exp-embeddings-browser-throughput/"
    }
  };
}

function renderStatus() {
  const badges = [];
  if (state.activeScenario !== "idle") {
    badges.push({ text: `${state.activeScenario} running` });
    badges.push({ text: "Indexing in progress" });
  } else if (state.run) {
    badges.push({ text: `${state.run.scenario} complete` });
    badges.push({ text: state.cachePresent ? "Cache present" : "Cache empty" });
  } else {
    badges.push({ text: "Fixture ready" });
    badges.push({ text: state.cachePresent ? "Cache present" : "Cache empty" });
  }

  elements.statusRow.innerHTML = "";
  for (const badge of badges) {
    const node = document.createElement("span");
    node.className = "badge";
    node.textContent = badge.text;
    elements.statusRow.appendChild(node);
  }
  elements.summary.textContent = state.run
    ? `Last run ${state.run.scenario}: ${round(state.run.docsPerSec, 2)} docs/s, ${round(state.run.queriesPerSec, 2)} queries/s, recall@10 ${round(state.run.recallAt10, 2)}.`
    : "Run cold first to build and persist the document index, then run warm to measure reuse against the same fixture.";
}

function renderMetrics() {
  const run = state.run;
  const cards = [
    ["Scenario", run ? run.scenario : "pending"],
    ["Docs/s", run ? `${round(run.docsPerSec, 2)}` : "pending"],
    ["Queries/s", run ? `${round(run.queriesPerSec, 2)}` : "pending"],
    ["Index Build", run ? `${round(run.indexBuildMs, 2)} ms` : "pending"],
    ["Recall@10", run ? `${round(run.recallAt10, 2)}` : "pending"],
    ["Doc P95", run ? `${round(percentile(run.perDocMs.filter((value) => value > 0), 0.95) || 0, 2)} ms` : "pending"]
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
    ["Cache State", state.environment.cache_state]
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
  const entries = state.logs.length ? state.logs : ["No embedding activity yet."];
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
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(buildResult(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `exp-embeddings-browser-throughput-${state.run ? state.run.scenario : "pending"}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  log("Downloaded embeddings throughput JSON draft.");
}

elements.runCold.addEventListener("click", () => runScenario("cold"));
elements.runWarm.addEventListener("click", () => runScenario("warm"));
elements.clearCache.addEventListener("click", () => {
  clearCachedIndex();
  log("Cleared cached embedding index.");
  render();
});
elements.downloadJson.addEventListener("click", downloadJson);

(async function init() {
  await loadFixture();
  state.cachePresent = Boolean(readCachedIndex());
  log("Embeddings throughput harness ready.");
  render();
})();
