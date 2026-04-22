const CACHE_NAME = "ai-webgpu-lab-model-load-v1";
const CACHE_KEY = new Request(new URL("./synthetic-model-fixture.txt", location.href).href);
const PREPARED_KEY = "ai-webgpu-lab:model-load:prepared-v1";

const state = {
  startedAt: performance.now(),
  environment: buildEnvironment(),
  manifest: null,
  cache: {
    storageAvailable: typeof caches !== "undefined",
    responseCached: false,
    preparedCached: false
  },
  runs: {
    cold: null,
    warm: null,
    last: null
  },
  activeScenario: "idle",
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
  if (!Number.isFinite(value)) {
    return null;
  }

  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

function parseBrowser() {
  const ua = navigator.userAgent;
  const candidates = [
    ["Edg/", "Edge"],
    ["Chrome/", "Chrome"],
    ["Firefox/", "Firefox"],
    ["Version/", "Safari"]
  ];

  for (const [needle, name] of candidates) {
    const marker = ua.indexOf(needle);
    if (marker >= 0) {
      return {
        name,
        version: ua.slice(marker + needle.length).split(/[\s)/;]/)[0] || "unknown"
      };
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

  if (/Linux/i.test(ua)) {
    return { name: "Linux", version: "unknown" };
  }

  return { name: "Unknown", version: "unknown" };
}

function inferDeviceClass() {
  const threads = navigator.hardwareConcurrency || 0;
  const memory = navigator.deviceMemory || 0;
  const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

  if (mobile) {
    return memory >= 6 && threads >= 8 ? "mobile-high" : "mobile-mid";
  }

  if (memory >= 16 && threads >= 12) {
    return "desktop-high";
  }

  if (memory >= 8 && threads >= 8) {
    return "desktop-mid";
  }

  if (threads >= 4) {
    return "laptop";
  }

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
      adapter: "not-applicable",
      required_features: [],
      limits: {}
    },
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

async function fetchManifest() {
  const startedAt = performance.now();
  const response = await fetch("./model-manifest.json", { cache: "no-store" });
  const manifest = await response.json();
  state.manifest = manifest;
  return {
    manifest,
    durationMs: performance.now() - startedAt
  };
}

function buildSyntheticPayload(manifest) {
  const startedAt = performance.now();
  const tokens = new Array(manifest.tokenCount);

  for (let index = 0; index < manifest.tokenCount; index += 1) {
    const value = (Math.imul(index + 1, manifest.multiplier) + manifest.offset) % manifest.modulus;
    tokens[index] = value.toString(16).padStart(manifest.tokenWidth, "0");
  }

  return {
    text: tokens.join(" "),
    durationMs: performance.now() - startedAt
  };
}

function prepareArtifact(payloadText) {
  const startedAt = performance.now();
  const tokens = payloadText.split(" ");
  let checksum = 0;
  let projection = 0;

  for (let index = 0; index < tokens.length; index += 1) {
    const value = parseInt(tokens[index], 16);
    checksum = (checksum + Math.imul(value + 17, index + 3)) % 2147483647;
    projection += Math.sin((value % 360) * 0.0174533) * 0.5;
  }

  return {
    prepared: {
      checksum,
      tokenCount: tokens.length,
      projection: round(projection, 4)
    },
    durationMs: performance.now() - startedAt
  };
}

async function refreshCacheState() {
  let responseCached = false;
  if (typeof caches !== "undefined") {
    const cache = await caches.open(CACHE_NAME);
    responseCached = Boolean(await cache.match(CACHE_KEY));
  }

  state.cache = {
    storageAvailable: typeof caches !== "undefined",
    responseCached,
    preparedCached: Boolean(localStorage.getItem(PREPARED_KEY))
  };
}

async function clearStoredArtifacts() {
  if (typeof caches !== "undefined") {
    const cache = await caches.open(CACHE_NAME);
    await cache.delete(CACHE_KEY);
  }

  localStorage.removeItem(PREPARED_KEY);
  await refreshCacheState();
  log("Cleared cached response and prepared artifact state.");
}

function renderStatus() {
  let summary = "Run cold first to prime Cache Storage and prepared artifacts, then run warm to measure how much work gets skipped on the second visit.";
  let badges = [
    { tone: "warn", text: "Idle" },
    { tone: "warn", text: "No load benchmark run yet" }
  ];

  if (state.activeScenario !== "idle") {
    summary = `${state.activeScenario} run is in progress. Manifest fetch, payload materialization, and prepared artifact steps are being measured.`;
    badges = [
      { tone: "success", text: `${state.activeScenario} running` },
      { tone: "warn", text: "Storage active" }
    ];
  } else if (state.runs.last) {
    const last = state.runs[state.runs.last];
    const delta = state.runs.cold && state.runs.warm
      ? `Warm delta ${round(state.runs.cold.totalMs - state.runs.warm.totalMs, 2)} ms.`
      : "Run the other scenario to compute a delta.";
    summary = `Last completed scenario: ${state.runs.last}. ${last.preparedHit ? "Prepared artifact cache hit." : "Prepared artifact cache miss."} ${delta}`;
    badges = [
      { tone: "success", text: `${state.runs.last} complete` },
      { tone: last.preparedHit ? "success" : "warn", text: last.preparedHit ? "Prepared hit" : "Prepared miss" }
    ];
  }

  elements.summary.textContent = summary;
  elements.statusRow.innerHTML = "";
  for (const badge of badges) {
    const node = document.createElement("span");
    node.className = `badge ${badge.tone}`;
    node.textContent = badge.text;
    elements.statusRow.appendChild(node);
  }
}

function renderMetrics() {
  const lastRun = state.runs.last ? state.runs[state.runs.last] : null;
  const coldRun = state.runs.cold;
  const warmRun = state.runs.warm;

  const cards = [
    ["Manifest", state.manifest ? state.manifest.modelId : "pending"],
    ["Storage", state.cache.storageAvailable ? "Cache Storage + localStorage" : "localStorage only"],
    ["Response Cache", state.cache.responseCached ? "present" : "empty"],
    ["Prepared Cache", state.cache.preparedCached ? "present" : "empty"],
    ["Last Total", lastRun ? `${round(lastRun.totalMs, 2)} ms` : "pending"],
    ["Last Prepare", lastRun ? `${round(lastRun.prepareMs, 2)} ms` : "pending"],
    ["Cold Total", coldRun ? `${round(coldRun.totalMs, 2)} ms` : "pending"],
    ["Warm Total", warmRun ? `${round(warmRun.totalMs, 2)} ms` : "pending"],
    ["Warm Delta", coldRun && warmRun ? `${round(coldRun.totalMs - warmRun.totalMs, 2)} ms` : "pending"]
  ];

  elements.metricGrid.innerHTML = "";
  for (const [label, value] of cards) {
    const card = document.createElement("article");
    card.className = "card";
    const labelNode = document.createElement("span");
    labelNode.className = "label";
    labelNode.textContent = label;
    const valueNode = document.createElement("div");
    valueNode.className = "value";
    valueNode.textContent = value;
    card.appendChild(labelNode);
    card.appendChild(valueNode);
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
    const labelNode = document.createElement("span");
    labelNode.className = "label";
    labelNode.textContent = label;
    const valueNode = document.createElement("div");
    valueNode.className = "value";
    valueNode.textContent = value;
    card.appendChild(labelNode);
    card.appendChild(valueNode);
    elements.metaGrid.appendChild(card);
  }
}

function renderLogs() {
  elements.logList.innerHTML = "";

  if (!state.logs.length) {
    const li = document.createElement("li");
    li.textContent = "No load benchmark activity yet.";
    elements.logList.appendChild(li);
    return;
  }

  for (const entry of state.logs) {
    const li = document.createElement("li");
    li.textContent = entry;
    elements.logList.appendChild(li);
  }
}

function buildResult() {
  const run = state.runs.last ? state.runs[state.runs.last] : null;
  const comparisonNote = state.runs.cold && state.runs.warm
    ? `coldTotalMs=${round(state.runs.cold.totalMs, 2)}; warmTotalMs=${round(state.runs.warm.totalMs, 2)}; deltaMs=${round(state.runs.cold.totalMs - state.runs.warm.totalMs, 2)}`
    : "Run both scenarios to capture cold/warm delta.";

  return {
    meta: {
      repo: "bench-model-load-and-cache",
      commit: "bootstrap-generated",
      timestamp: new Date().toISOString(),
      owner: "ai-webgpu-lab",
      track: "benchmark",
      scenario: run ? `model-load-${run.scenario}` : "model-load-pending",
      notes: run
        ? `manifestFetchMs=${round(run.manifestFetchMs, 2)}; materializeMs=${round(run.materializeMs, 2)}; cacheReadMs=${round(run.cacheReadMs, 2)}; prepareMs=${round(run.prepareMs, 2)}; preparedHit=${run.preparedHit}; ${comparisonNote}`
        : comparisonNote
    },
    environment: state.environment,
    workload: {
      kind: "llm-chat",
      name: "synthetic-model-load-cache-harness",
      input_profile: state.manifest ? `${state.manifest.tokenCount}-synthetic-tokens` : "manifest-pending",
      model_id: state.manifest ? state.manifest.modelId : "pending"
    },
    metrics: {
      common: {
        time_to_interactive_ms: round(performance.now() - state.startedAt, 2) || 0,
        init_ms: run ? round(run.totalMs, 2) || 0 : 0,
        success_rate: run ? 1 : 0.5,
        peak_memory_note: navigator.deviceMemory ? `${navigator.deviceMemory} GB reported by browser` : "deviceMemory unavailable",
        error_type: ""
      }
    },
    status: run ? "success" : "partial",
    artifacts: {
      raw_logs: state.logs.slice(0, 5),
      deploy_url: "https://ai-webgpu-lab.github.io/bench-model-load-and-cache/"
    }
  };
}

function renderResult() {
  elements.resultJson.textContent = JSON.stringify(buildResult(), null, 2);
}

function render() {
  renderStatus();
  renderMetrics();
  renderEnvironment();
  renderLogs();
  renderResult();
}

async function runScenario(mode) {
  if (state.activeScenario !== "idle") {
    return;
  }

  state.activeScenario = mode;
  state.environment.cache_state = mode;
  render();

  if (mode === "cold") {
    await clearStoredArtifacts();
  }

  log(`${mode} load started.`);
  const { manifest, durationMs: manifestFetchMs } = await fetchManifest();
  const run = {
    scenario: mode,
    manifestFetchMs,
    materializeMs: 0,
    cacheWriteMs: 0,
    cacheReadMs: 0,
    prepareMs: 0,
    preparedHit: false,
    checksum: 0,
    totalMs: 0
  };
  const startedAt = performance.now();

  let payloadText = "";

  if (mode === "cold") {
    const materialized = buildSyntheticPayload(manifest);
    payloadText = materialized.text;
    run.materializeMs = materialized.durationMs;

    if (typeof caches !== "undefined") {
      const cacheWriteStartedAt = performance.now();
      const cache = await caches.open(CACHE_NAME);
      await cache.put(CACHE_KEY, new Response(payloadText, { headers: { "content-type": "text/plain" } }));
      run.cacheWriteMs = performance.now() - cacheWriteStartedAt;
    }

    const prepared = prepareArtifact(payloadText);
    run.prepareMs = prepared.durationMs;
    run.checksum = prepared.prepared.checksum;
    localStorage.setItem(PREPARED_KEY, JSON.stringify(prepared.prepared));
  } else {
    if (typeof caches !== "undefined") {
      const cacheReadStartedAt = performance.now();
      const cache = await caches.open(CACHE_NAME);
      const response = await cache.match(CACHE_KEY);
      if (response) {
        payloadText = await response.text();
      }
      run.cacheReadMs = performance.now() - cacheReadStartedAt;
    }

    if (!payloadText) {
      const materialized = buildSyntheticPayload(manifest);
      payloadText = materialized.text;
      run.materializeMs = materialized.durationMs;
    }

    const preparedRaw = localStorage.getItem(PREPARED_KEY);
    if (preparedRaw) {
      const prepared = JSON.parse(preparedRaw);
      run.preparedHit = true;
      run.checksum = prepared.checksum;
    } else {
      const prepared = prepareArtifact(payloadText);
      run.prepareMs = prepared.durationMs;
      run.checksum = prepared.prepared.checksum;
      localStorage.setItem(PREPARED_KEY, JSON.stringify(prepared.prepared));
    }
  }

  run.totalMs = performance.now() - startedAt + manifestFetchMs;
  state.runs[mode] = run;
  state.runs.last = mode;
  state.activeScenario = "idle";
  await refreshCacheState();
  log(`${mode} load finished in ${round(run.totalMs, 2)} ms. preparedHit=${run.preparedHit}.`);
  render();
}

function downloadJson() {
  const payload = JSON.stringify(buildResult(), null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `bench-model-load-and-cache-${state.runs.last || "pending"}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  log("Downloaded model load benchmark JSON draft.");
}

elements.runCold.addEventListener("click", () => {
  runScenario("cold");
});

elements.runWarm.addEventListener("click", () => {
  runScenario("warm");
});

elements.clearCache.addEventListener("click", async () => {
  if (state.activeScenario !== "idle") {
    return;
  }

  await clearStoredArtifacts();
  render();
});

elements.downloadJson.addEventListener("click", downloadJson);

(async function initialize() {
  await fetchManifest();
  await refreshCacheState();
  log("Model load and cache harness ready.");
  render();
})();
