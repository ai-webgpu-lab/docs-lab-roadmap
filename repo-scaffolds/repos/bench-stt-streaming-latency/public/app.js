const AUDIO_SECONDS = 18;
const CHUNK_SECONDS = 2;
const REFERENCE_TRANSCRIPT = "browser speech benchmarks need first partial latency final latency fallback metadata and transcript quality metrics";

const PROFILES = [
  {
    id: "tiny-streaming",
    label: "Tiny Streaming",
    chunkDelayMs: 28,
    firstPartialChunks: 1,
    finalDelayMs: 54,
    wordDropEvery: 0,
    wordSubstituteEvery: 11,
    workerMode: "worker"
  },
  {
    id: "base-balanced",
    label: "Base Balanced",
    chunkDelayMs: 38,
    firstPartialChunks: 2,
    finalDelayMs: 70,
    wordDropEvery: 0,
    wordSubstituteEvery: 0,
    workerMode: "worker"
  },
  {
    id: "quality-large",
    label: "Quality Large",
    chunkDelayMs: 52,
    firstPartialChunks: 2,
    finalDelayMs: 92,
    wordDropEvery: 0,
    wordSubstituteEvery: 0,
    workerMode: "worker"
  }
];

const EXECUTION_MODES = {
  webgpu: {
    id: "webgpu",
    label: "WebGPU",
    backend: "webgpu",
    fallbackTriggered: false,
    latencyMultiplier: 1
  },
  fallback: {
    id: "fallback",
    label: "Wasm Fallback",
    backend: "wasm",
    fallbackTriggered: true,
    latencyMultiplier: 2.25
  }
};

function resolveExecutionMode() {
  const requested = new URLSearchParams(window.location.search).get("mode");
  return EXECUTION_MODES[requested] || EXECUTION_MODES.webgpu;
}

const executionMode = resolveExecutionMode();

const state = {
  startedAt: performance.now(),
  environment: buildEnvironment(),
  active: false,
  run: null,
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
    worker_mode: executionMode.fallbackTriggered ? "main" : "worker",
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

function words(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
}

function mutateTranscript(profile) {
  const tokens = words(REFERENCE_TRANSCRIPT);
  const output = [];
  for (let index = 0; index < tokens.length; index += 1) {
    if (profile.wordDropEvery && (index + 1) % profile.wordDropEvery === 0) continue;
    if (profile.wordSubstituteEvery && (index + 1) % profile.wordSubstituteEvery === 0) {
      output.push("metric");
      continue;
    }
    output.push(tokens[index]);
  }
  return output.join(" ");
}

function editDistance(left, right) {
  const matrix = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));
  for (let i = 0; i <= left.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= right.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[left.length][right.length];
}

function wordErrorRate(reference, hypothesis) {
  const referenceWords = words(reference);
  const hypothesisWords = words(hypothesis);
  return referenceWords.length ? editDistance(referenceWords, hypothesisWords) / referenceWords.length : 0;
}

function charErrorRate(reference, hypothesis) {
  const referenceChars = reference.replace(/\s+/g, "").split("");
  const hypothesisChars = hypothesis.replace(/\s+/g, "").split("");
  return referenceChars.length ? editDistance(referenceChars, hypothesisChars) / referenceChars.length : 0;
}

async function runProfile(profile) {
  const chunkCount = Math.ceil(AUDIO_SECONDS / CHUNK_SECONDS);
  const startedAt = performance.now();
  let firstPartialMs = 0;

  for (let chunk = 1; chunk <= chunkCount; chunk += 1) {
    await sleep(profile.chunkDelayMs * executionMode.latencyMultiplier);
    if (!firstPartialMs && chunk >= profile.firstPartialChunks) {
      firstPartialMs = performance.now() - startedAt;
    }
  }

  await sleep(profile.finalDelayMs * executionMode.latencyMultiplier);
  const finalLatencyMs = performance.now() - startedAt;
  const transcript = mutateTranscript(profile);
  const wer = wordErrorRate(REFERENCE_TRANSCRIPT, transcript);
  const cer = charErrorRate(REFERENCE_TRANSCRIPT, transcript);

  return {
    profile: {
      ...profile,
      workerMode: executionMode.fallbackTriggered ? "main" : profile.workerMode
    },
    audioSeconds: AUDIO_SECONDS,
    chunkCount,
    firstPartialMs,
    finalLatencyMs,
    audioSecPerSec: AUDIO_SECONDS / Math.max(finalLatencyMs / 1000, 0.001),
    wer,
    cer,
    transcript
  };
}

function scoreResult(result) {
  return result.audioSecPerSec - (result.firstPartialMs * 0.008) - (result.finalLatencyMs * 0.003) - (result.wer * 20) - (result.cer * 10);
}

async function runBenchmark() {
  if (state.active) return;
  state.active = true;
  state.run = null;
  render();

  const results = [];
  for (const profile of PROFILES) {
    log(`Running ${profile.label} in ${executionMode.label} mode.`);
    const result = await runProfile(profile);
    results.push(result);
    log(`${profile.label}: first=${round(result.firstPartialMs)} ms, final=${round(result.finalLatencyMs)} ms, WER=${round(result.wer, 4)}.`);
  }

  results.sort((left, right) => scoreResult(right) - scoreResult(left));
  state.run = {
    executionMode: executionMode.id,
    winner: results[0],
    profiles: results
  };
  state.environment.worker_mode = results[0].profile.workerMode;
  state.active = false;
  log(`Winner: ${results[0].profile.label} (${executionMode.label}).`);
  render();
}

function buildResult() {
  const run = state.run;
  const winner = run ? run.winner : null;
  return {
    meta: {
      repo: "bench-stt-streaming-latency",
      commit: "bootstrap-generated",
      timestamp: new Date().toISOString(),
      owner: "ai-webgpu-lab",
      track: "benchmark",
      scenario: run ? `stt-streaming-latency-${run.executionMode}` : "stt-streaming-latency-pending",
      notes: winner
        ? `winner=${winner.profile.id}; audioSeconds=${winner.audioSeconds}; chunks=${winner.chunkCount}; executionMode=${run.executionMode}; backend=${state.environment.backend}`
        : "Run the fixed STT streaming latency benchmark."
    },
    environment: state.environment,
    workload: {
      kind: "stt",
      name: "stt-streaming-latency-benchmark",
      input_profile: `${AUDIO_SECONDS}s-audio-${CHUNK_SECONDS}s-chunks-${PROFILES.length}-profiles`,
      model_id: winner ? winner.profile.id : "pending",
      dataset: "synthetic-streaming-transcript-v1"
    },
    metrics: {
      common: {
        time_to_interactive_ms: round(performance.now() - state.startedAt, 2) || 0,
        init_ms: winner ? round(winner.firstPartialMs, 2) || 0 : 0,
        success_rate: winner ? 1 : 0.5,
        peak_memory_note: navigator.deviceMemory ? `${navigator.deviceMemory} GB reported by browser` : "deviceMemory unavailable",
        error_type: ""
      },
      stt: {
        audio_sec_per_sec: winner ? round(winner.audioSecPerSec, 2) || 0 : 0,
        first_partial_ms: winner ? round(winner.firstPartialMs, 2) || 0 : 0,
        final_latency_ms: winner ? round(winner.finalLatencyMs, 2) || 0 : 0,
        wer: winner ? round(winner.wer, 4) || 0 : 0,
        cer: winner ? round(winner.cer, 4) || 0 : 0
      }
    },
    status: winner ? "success" : "partial",
    artifacts: {
      raw_logs: state.logs.slice(0, 5),
      deploy_url: "https://ai-webgpu-lab.github.io/bench-stt-streaming-latency/"
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
    badges.push({ text: `${AUDIO_SECONDS}s audio` });
  }

  elements.statusRow.innerHTML = "";
  for (const badge of badges) {
    const node = document.createElement("span");
    node.className = "badge";
    node.textContent = badge.text;
    elements.statusRow.appendChild(node);
  }

  elements.summary.textContent = state.run
    ? `Winner ${state.run.winner.profile.label}: first ${round(state.run.winner.firstPartialMs)} ms, final ${round(state.run.winner.finalLatencyMs)} ms, WER ${round(state.run.winner.wer, 4)}.`
    : `Mode=${executionMode.label}. Benchmark deterministic streaming STT profiles with one fixed transcript fixture.`;
}

function renderMetrics() {
  const winner = state.run ? state.run.winner : null;
  const cards = [
    ["Winner", winner ? winner.profile.label : "pending"],
    ["First Partial", winner ? `${round(winner.firstPartialMs)} ms` : "pending"],
    ["Final", winner ? `${round(winner.finalLatencyMs)} ms` : "pending"],
    ["Audio/sec", winner ? round(winner.audioSecPerSec) : "pending"],
    ["WER", winner ? round(winner.wer, 4) : "pending"],
    ["CER", winner ? round(winner.cer, 4) : "pending"]
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
        <td>${round(result.firstPartialMs)} ms</td>
        <td>${round(result.finalLatencyMs)} ms</td>
        <td>${round(result.audioSecPerSec)}</td>
        <td>${round(result.wer, 4)}</td>
        <td>${round(result.cer, 4)}</td>
      </tr>
    `)
    .join("");
  elements.matrixView.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Rank</th>
          <th>Profile</th>
          <th>First Partial</th>
          <th>Final</th>
          <th>Audio/sec</th>
          <th>WER</th>
          <th>CER</th>
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
  anchor.download = `bench-stt-streaming-latency-${state.run ? state.run.executionMode : "pending"}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  log("Downloaded STT streaming latency JSON draft.");
}

elements.runBenchmark.addEventListener("click", runBenchmark);
elements.downloadJson.addEventListener("click", downloadJson);
render();
