const state = {
  startedAt: performance.now(),
  environment: buildEnvironment(),
  fixture: null,
  active: false,
  run: null,
  transcript: "",
  logs: []
};

const elements = {
  statusRow: document.getElementById("status-row"),
  summary: document.getElementById("summary"),
  runTranscription: document.getElementById("run-transcription"),
  downloadJson: document.getElementById("download-json"),
  transcriptView: document.getElementById("transcript-view"),
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
    cache_state: "cold"
  };
}

function log(message) {
  state.logs.unshift(`[${new Date().toLocaleTimeString()}] ${message}`);
  state.logs = state.logs.slice(0, 12);
  renderLogs();
}

async function loadFixture() {
  if (state.fixture) return state.fixture;
  const response = await fetch("./transcript-fixture.json", { cache: "no-store" });
  state.fixture = await response.json();
  return state.fixture;
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

async function runTranscription() {
  if (state.active) return;
  state.active = true;
  state.transcript = "";
  render();
  const fixture = await loadFixture();
  const startedAt = performance.now();
  let firstPartialMs = 0;
  const partials = [];

  for (let index = 0; index < fixture.segments.length; index += 1) {
    const segment = fixture.segments[index];
    await new Promise((resolve) => setTimeout(resolve, segment.processingMs));
    const partial = fixture.segments.slice(0, index + 1).map((item) => item.text).join(" ");
    partials.push(partial);
    if (!firstPartialMs) firstPartialMs = performance.now() - startedAt;
    state.transcript = partial;
    elements.transcriptView.textContent = state.transcript;
    log(`Partial ${index + 1}/${fixture.segments.length}: ${segment.text}`);
  }

  const finalTranscript = state.transcript;
  const finalLatencyMs = performance.now() - startedAt;
  const referenceWords = fixture.reference.toLowerCase().split(/\s+/);
  const predictedWords = finalTranscript.toLowerCase().split(/\s+/);
  const referenceChars = fixture.reference.toLowerCase().replace(/\s+/g, "").split("");
  const predictedChars = finalTranscript.toLowerCase().replace(/\s+/g, "").split("");
  const wer = levenshtein(referenceWords, predictedWords) / Math.max(referenceWords.length, 1);
  const cer = levenshtein(referenceChars, predictedChars) / Math.max(referenceChars.length, 1);

  state.run = {
    segmentCount: fixture.segments.length,
    audioSeconds: fixture.audioSeconds,
    firstPartialMs,
    finalLatencyMs,
    audioSecPerSec: fixture.audioSeconds / Math.max(finalLatencyMs / 1000, 0.001),
    wer,
    cer,
    finalTranscript
  };
  state.active = false;
  log(`Transcription complete: audioSec/s ${round(state.run.audioSecPerSec, 2)}, WER ${round(wer, 3)}.`);
  render();
}

function buildResult() {
  const run = state.run;
  return {
    meta: {
      repo: "exp-stt-whisper-webgpu",
      commit: "bootstrap-generated",
      timestamp: new Date().toISOString(),
      owner: "ai-webgpu-lab",
      track: "audio",
      scenario: run ? "file-transcription-readiness" : "file-transcription-pending",
      notes: run
        ? `deterministic segment fixture; segments=${run.segmentCount}; transcriptLength=${run.finalTranscript.split(/\s+/).length}`
        : "Run the file transcription readiness harness."
    },
    environment: state.environment,
    workload: {
      kind: "stt",
      name: "file-transcription-readiness",
      input_profile: state.fixture ? `${state.fixture.audioSeconds}s-${state.fixture.segments.length}-segments` : "fixture-pending",
      dataset: "transcript-fixture-v1"
    },
    metrics: {
      common: {
        time_to_interactive_ms: round(performance.now() - state.startedAt, 2) || 0,
        init_ms: run ? round(run.finalLatencyMs, 2) || 0 : 0,
        success_rate: run ? 1 : 0.5,
        peak_memory_note: navigator.deviceMemory ? `${navigator.deviceMemory} GB reported by browser` : "deviceMemory unavailable",
        error_type: ""
      },
      stt: {
        audio_sec_per_sec: run ? round(run.audioSecPerSec, 2) || 0 : 0,
        first_partial_ms: run ? round(run.firstPartialMs, 2) || 0 : 0,
        final_latency_ms: run ? round(run.finalLatencyMs, 2) || 0 : 0,
        wer: run ? round(run.wer, 4) || 0 : 0,
        cer: run ? round(run.cer, 4) || 0 : 0
      }
    },
    status: run ? "success" : "partial",
    artifacts: {
      raw_logs: state.logs.slice(0, 5),
      deploy_url: "https://ai-webgpu-lab.github.io/exp-stt-whisper-webgpu/"
    }
  };
}

function renderStatus() {
  const badges = state.active
    ? ["Transcription running", "Partials streaming"]
    : state.run
      ? [`WER ${round(state.run.wer, 4)}`, `${round(state.run.audioSecPerSec, 2)} audioSec/s`]
      : ["Fixture ready", "Awaiting run"];
  elements.statusRow.innerHTML = "";
  for (const text of badges) {
    const node = document.createElement("span");
    node.className = "badge";
    node.textContent = text;
    elements.statusRow.appendChild(node);
  }
  elements.summary.textContent = state.run
    ? `Last run: first partial ${round(state.run.firstPartialMs, 2)} ms, final latency ${round(state.run.finalLatencyMs, 2)} ms, WER ${round(state.run.wer, 4)}.`
    : "Run the file transcription harness to process bundled segments, emit partials, and score the final transcript against the reference.";
}

function renderMetrics() {
  const run = state.run;
  const cards = [
    ["Audio", run ? `${state.fixture.audioSeconds} s` : "pending"],
    ["First Partial", run ? `${round(run.firstPartialMs, 2)} ms` : "pending"],
    ["Final Latency", run ? `${round(run.finalLatencyMs, 2)} ms` : "pending"],
    ["AudioSec/s", run ? `${round(run.audioSecPerSec, 2)}` : "pending"],
    ["WER", run ? `${round(run.wer, 4)}` : "pending"],
    ["CER", run ? `${round(run.cer, 4)}` : "pending"]
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
  const entries = state.logs.length ? state.logs : ["No transcription activity yet."];
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
  if (!state.transcript && !state.active && !state.run) elements.transcriptView.textContent = "No transcription run yet.";
  elements.resultJson.textContent = JSON.stringify(buildResult(), null, 2);
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(buildResult(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `exp-stt-whisper-webgpu-${state.run ? "file" : "pending"}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  log("Downloaded transcription readiness JSON draft.");
}

elements.runTranscription.addEventListener("click", runTranscription);
elements.downloadJson.addEventListener("click", downloadJson);

(async function init() {
  await loadFixture();
  log("File transcription readiness harness ready.");
  render();
})();
