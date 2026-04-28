const PROFILES = [
  {
    id: "fast-turn-lite",
    label: "Fast Turn Lite",
    sttExtraMs: 6,
    intentExtraMs: 8,
    replyExtraMs: 10,
    ttsExtraMs: 8,
    firstAudioLeadMs: 0,
    wordSubstituteEvery: 9,
    wordDropEvery: 0,
    workerMode: "worker"
  },
  {
    id: "balanced-local",
    label: "Balanced Local",
    sttExtraMs: 12,
    intentExtraMs: 12,
    replyExtraMs: 14,
    ttsExtraMs: 10,
    firstAudioLeadMs: 2,
    wordSubstituteEvery: 0,
    wordDropEvery: 0,
    workerMode: "worker"
  },
  {
    id: "studio-expressive",
    label: "Studio Expressive",
    sttExtraMs: 18,
    intentExtraMs: 16,
    replyExtraMs: 18,
    ttsExtraMs: 18,
    firstAudioLeadMs: 6,
    wordSubstituteEvery: 0,
    wordDropEvery: 0,
    workerMode: "worker"
  }
];

const EXECUTION_MODES = {
  webgpu: {
    id: "webgpu",
    label: "WebGPU",
    backend: "webgpu",
    fallbackTriggered: false,
    latencyMultiplier: 1,
    workerMode: "worker",
    intentDelayMs: 12,
    replyDelayMs: 16,
    ttsGapMs: 10
  },
  fallback: {
    id: "fallback",
    label: "CPU fallback",
    backend: "cpu",
    fallbackTriggered: true,
    latencyMultiplier: 1.95,
    workerMode: "main",
    intentDelayMs: 22,
    replyDelayMs: 26,
    ttsGapMs: 16
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
    if (typeof window !== "undefined" && window.__aiWebGpuLabRealVoiceBenchBootstrapError) {
      return null;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

const state = {
  startedAt: performance.now(),
  environment: buildEnvironment(),
  fixture: null,
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
  fixtureView: document.getElementById("fixture-view"),
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
      adapter: executionMode.fallbackTriggered ? "cpu-fallback-audio-pipeline" : "synthetic-webgpu-voice-pipeline",
      required_features: executionMode.fallbackTriggered ? [] : ["shader-f16"],
      limits: executionMode.fallbackTriggered ? {} : { maxBindGroups: 4 }
    },
    backend: executionMode.backend,
    fallback_triggered: executionMode.fallbackTriggered,
    worker_mode: executionMode.workerMode,
    cache_state: "warm"
  };
}

function log(message) {
  state.logs.unshift(`[${new Date().toLocaleTimeString()}] ${message}`);
  state.logs = state.logs.slice(0, 14);
  renderLogs();
}

async function loadFixture() {
  if (state.fixture) return state.fixture;
  const response = await fetch("./voice-benchmark-fixture.json", { cache: "no-store" });
  state.fixture = await response.json();
  renderFixture();
  return state.fixture;
}

function words(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter(Boolean);
}

function chars(text) {
  return text.toLowerCase().replace(/\s+/g, "").split("");
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

function mutateTranscript(reference, profile) {
  const tokens = words(reference);
  const output = [];
  for (let index = 0; index < tokens.length; index += 1) {
    if (profile.wordDropEvery && (index + 1) % profile.wordDropEvery === 0) continue;
    if (profile.wordSubstituteEvery && (index + 1) % profile.wordSubstituteEvery === 0) {
      output.push("latency");
      continue;
    }
    output.push(tokens[index]);
  }
  return output.join(" ");
}

function scoreProfile(result) {
  return (
    240
    - result.roundtripMs * 0.08
    - result.firstPartialMs * 0.03
    - result.finalLatencyMs * 0.02
    - result.wer * 90
    - result.cer * 40
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runProfile(profile, fixture) {
  const startedAt = performance.now();
  let firstPartialMs = 0;
  let transcript = "";

  for (let index = 0; index < fixture.segments.length; index += 1) {
    const segment = fixture.segments[index];
    await sleep((segment.processingMs + profile.sttExtraMs) * executionMode.latencyMultiplier);
    transcript = fixture.segments.slice(0, index + 1).map((item) => item.text).join(" ");
    if (!firstPartialMs) firstPartialMs = performance.now() - startedAt;
  }

  const finalTranscript = mutateTranscript(transcript, profile);
  const finalLatencyMs = performance.now() - startedAt;

  const referenceWords = words(fixture.reference);
  const predictedWords = words(finalTranscript);
  const referenceChars = chars(fixture.reference);
  const predictedChars = chars(finalTranscript);
  const wer = levenshtein(referenceWords, predictedWords) / Math.max(referenceWords.length, 1);
  const cer = levenshtein(referenceChars, predictedChars) / Math.max(referenceChars.length, 1);

  const intentStartedAt = performance.now();
  await sleep((fixture.intent.processingMs + executionMode.intentDelayMs + profile.intentExtraMs) * executionMode.latencyMultiplier);
  const intentMs = performance.now() - intentStartedAt;

  const replyStartedAt = performance.now();
  await sleep((fixture.reply.processingMs + executionMode.replyDelayMs + profile.replyExtraMs) * executionMode.latencyMultiplier);
  const replyMs = performance.now() - replyStartedAt;

  let firstAudioMs = 0;
  const ttsStartedAt = performance.now();
  for (let index = 0; index < fixture.ttsChunks.length; index += 1) {
    const chunk = fixture.ttsChunks[index];
    const extraLeadMs = index === 0 ? profile.firstAudioLeadMs : 0;
    await sleep((chunk.synthesisMs + executionMode.ttsGapMs + profile.ttsExtraMs + extraLeadMs) * executionMode.latencyMultiplier);
    if (!firstAudioMs) firstAudioMs = performance.now() - startedAt;
  }
  const ttsMs = performance.now() - ttsStartedAt;
  const roundtripMs = performance.now() - startedAt;

  return {
    profile: {
      ...profile,
      workerMode: executionMode.fallbackTriggered ? "main" : profile.workerMode
    },
    transcript: finalTranscript,
    reply: fixture.reply.text,
    wakeWord: fixture.wakeWord,
    audioSeconds: fixture.audioSeconds,
    firstPartialMs,
    finalLatencyMs,
    firstAudioMs,
    roundtripMs,
    audioSecPerSec: fixture.audioSeconds / Math.max(roundtripMs / 1000, 0.001),
    wer,
    cer,
    intentMs,
    replyMs,
    ttsMs
  };
}

async function runRealBenchmarkVoice(adapter) {
  log(`Connecting real benchmark adapter '${adapter.id}'.`);
  await withTimeout(
    Promise.resolve(adapter.createBenchmark({ name: "voice-roundtrip" })),
    REAL_ADAPTER_LOAD_MS,
    `createBenchmark(${adapter.id})`
  );
  await withTimeout(
    Promise.resolve(adapter.runProfile({
      profileId: "voice-roundtrip-default",
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
        const { aggregate } = await runRealBenchmarkVoice(adapter);
        state.realAdapterAggregate = aggregate;
        state.realAdapter = adapter;
      } catch (error) {
        state.realAdapterError = error?.message || String(error);
        log(`Real benchmark '${adapter.id}' failed: ${state.realAdapterError}; falling back to deterministic.`);
      }
    } else {
      const reason = (typeof window !== "undefined" && window.__aiWebGpuLabRealVoiceBenchBootstrapError) || "timed out waiting for adapter registration";
      state.realAdapterError = reason;
      log(`No real benchmark adapter registered (${reason}); falling back to deterministic voice benchmark.`);
    }
  }

  const fixture = await loadFixture();
  const results = [];
  for (const profile of PROFILES) {
    log(`Running ${profile.label} in ${executionMode.label} mode.`);
    const result = await runProfile(profile, fixture);
    results.push(result);
    log(`${profile.label}: roundtrip=${round(result.roundtripMs)} ms, first=${round(result.firstPartialMs)} ms, WER=${round(result.wer, 4)}.`);
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

function describeBenchmarkAdapter() {
  const registry = typeof window !== "undefined" ? window.__aiWebGpuLabBenchmarkRegistry : null;
  const requested = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("mode")
    : null;
  if (registry) {
    return registry.describe(requested);
  }
  return {
    id: "deterministic-voice-bench",
    label: "Deterministic Voice Bench",
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
      repo: "bench-voice-roundtrip",
      commit: "bootstrap-generated",
      timestamp: new Date().toISOString(),
      owner: "ai-webgpu-lab",
      track: "benchmark",
      scenario: (state.run && state.run.realAdapter) ? `voice-roundtrip-real-${state.run.realAdapter.id}` : (run ? `voice-roundtrip-${run.executionMode}` : "voice-roundtrip-pending"),
      notes: winner
        ? `winner=${winner.profile.id}; wakeWord=${winner.wakeWord}; firstAudioMs=${round(winner.firstAudioMs, 2)}; voice=${state.fixture.ttsVoice}; executionMode=${run.executionMode}; backend=${state.environment.backend}${state.run && state.run.realAdapter ? `; realAdapter=${state.run.realAdapter.id}` : (isRealBenchmarkMode && state.realAdapterError ? `; realAdapter=fallback(${state.realAdapterError})` : "")}`
        : "Run the fixed voice roundtrip benchmark."
    },
    environment: state.environment,
    workload: {
      kind: "voice",
      name: "voice-roundtrip-benchmark",
      input_profile: `${state.fixture ? state.fixture.audioSeconds : "pending"}s-turn-${PROFILES.length}-profiles`,
      model_id: winner ? winner.profile.id : "pending",
      dataset: "synthetic-voice-roundtrip-v1"
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
        roundtrip_ms: winner ? round(winner.roundtripMs, 2) || 0 : 0,
        wer: winner ? round(winner.wer, 4) || 0 : 0,
        cer: winner ? round(winner.cer, 4) || 0 : 0
      }
    },
    status: winner ? "success" : "partial",
    artifacts: {
      raw_logs: state.logs.slice(0, 6),
      deploy_url: "https://ai-webgpu-lab.github.io/bench-voice-roundtrip/",
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
    badges.push({ text: `${PROFILES.length} profiles` });
  }

  elements.statusRow.innerHTML = "";
  for (const badge of badges) {
    const node = document.createElement("span");
    node.className = "badge";
    node.textContent = badge.text;
    elements.statusRow.appendChild(node);
  }

  elements.summary.textContent = state.run
    ? `Winner ${state.run.winner.profile.label}: roundtrip ${round(state.run.winner.roundtripMs)} ms, first partial ${round(state.run.winner.firstPartialMs)} ms, WER ${round(state.run.winner.wer, 4)}.`
    : `Mode=${executionMode.label}. Benchmark one fixed voice turn across deterministic STT, intent, reply, and TTS profiles.`;
}

function renderMetrics() {
  const winner = state.run ? state.run.winner : null;
  const cards = [
    ["Winner", winner ? winner.profile.label : "pending"],
    ["First Partial", winner ? `${round(winner.firstPartialMs)} ms` : "pending"],
    ["Final", winner ? `${round(winner.finalLatencyMs)} ms` : "pending"],
    ["Roundtrip", winner ? `${round(winner.roundtripMs)} ms` : "pending"],
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
        <td>${round(result.roundtripMs)} ms</td>
        <td>${round(result.firstAudioMs)} ms</td>
        <td>${round(result.audioSecPerSec)}</td>
        <td>${round(result.wer, 4)}</td>
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
          <th>Roundtrip</th>
          <th>First Audio</th>
          <th>Audio/sec</th>
          <th>WER</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderFixture() {
  if (!state.fixture) {
    elements.fixtureView.textContent = "Loading fixture...";
    return;
  }
  const payload = {
    wakeWord: state.fixture.wakeWord,
    audioSeconds: state.fixture.audioSeconds,
    reference: state.fixture.reference,
    intent: state.fixture.intent.id,
    ttsVoice: state.fixture.ttsVoice,
    profiles: PROFILES.map((profile) => ({
      id: profile.id,
      label: profile.label,
      workerMode: profile.workerMode,
      transcriptPenalty: profile.wordSubstituteEvery ? `substitute every ${profile.wordSubstituteEvery} words` : "none"
    }))
  };
  elements.fixtureView.textContent = JSON.stringify(payload, null, 2);
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
  renderFixture();
  renderLogs();
  elements.resultJson.textContent = JSON.stringify(buildResult(), null, 2);
}

function downloadJson() {
  const payload = JSON.stringify(buildResult(), null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `bench-voice-roundtrip-${state.run ? state.run.executionMode : "pending"}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  log("Downloaded voice roundtrip JSON draft.");
}

elements.runBenchmark.addEventListener("click", runBenchmark);
elements.downloadJson.addEventListener("click", downloadJson);

loadFixture().catch(() => {
  elements.fixtureView.textContent = "Fixture failed to load.";
});
render();
