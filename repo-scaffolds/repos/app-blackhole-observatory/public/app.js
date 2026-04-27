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
    if (typeof window !== "undefined" && window.__aiWebGpuLabRealSurfaceBootstrapError) {
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
  run: null,
  realAdapterError: null,
  logs: []
};

const elements = {
  statusRow: document.getElementById("status-row"),
  summary: document.getElementById("summary"),
  runObservatory: document.getElementById("run-observatory"),
  downloadJson: document.getElementById("download-json"),
  viewCaption: document.getElementById("view-caption"),
  profileList: document.getElementById("profile-list"),
  presetList: document.getElementById("preset-list"),
  controlList: document.getElementById("control-list"),
  metricGrid: document.getElementById("metric-grid"),
  metaGrid: document.getElementById("meta-grid"),
  fixtureView: document.getElementById("fixture-view"),
  logList: document.getElementById("log-list"),
  resultJson: document.getElementById("result-json"),
  canvas: document.getElementById("scene-canvas")
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
      adapter: navigator.gpu ? "navigator.gpu available" : "browser-fixture-no-webgpu",
      required_features: navigator.gpu ? ["shader-f16", "timestamp-query"] : [],
      limits: navigator.gpu ? { maxTextureDimension2D: 8192, maxBindGroups: 4 } : {}
    },
    backend: "browser-fixture",
    fallback_triggered: false,
    worker_mode: "hybrid",
    cache_state: "warm"
  };
}

function log(message) {
  state.logs.unshift(`[${new Date().toLocaleTimeString()}] ${message}`);
  state.logs = state.logs.slice(0, 16);
  renderLogs();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadFixture() {
  if (state.fixture) return state.fixture;
  const response = await fetch("./blackhole-observatory-fixture.json", { cache: "no-store" });
  state.fixture = await response.json();
  renderPreset();
  renderControls();
  renderFixture();
  renderProfiles();
  return state.fixture;
}

function drawPlaceholder() {
  const ctx = elements.canvas.getContext("2d");
  const { width, height } = elements.canvas;
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#02040a");
  gradient.addColorStop(0.5, "#08101b");
  gradient.addColorStop(1, "#110916");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(94, 234, 212, 0.12)";
  ctx.lineWidth = 1;
  for (let index = 0; index < 10; index += 1) {
    const y = (height / 9) * index;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(236, 243, 251, 0.92)";
  ctx.font = "600 30px Segoe UI";
  ctx.fillText("Observatory preview pending", 36, 60);
  ctx.font = "18px Segoe UI";
  ctx.fillStyle = "rgba(158, 176, 202, 0.92)";
  ctx.fillText("Run the observatory to score renderer candidates and render the deterministic blackhole view.", 36, 94);
}

function createRng(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function drawObservatoryView(fixture, winner) {
  const ctx = elements.canvas.getContext("2d");
  const { width, height } = elements.canvas;
  const rng = createRng(fixture.observatory.seed);
  const cx = width * 0.43;
  const cy = height * 0.52;
  const ringRadius = fixture.observatory.photonRingRadiusPx;

  const sky = ctx.createLinearGradient(0, 0, width, height);
  sky.addColorStop(0, "#02040a");
  sky.addColorStop(0.45, "#07111d");
  sky.addColorStop(1, "#120a18");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  for (let star = 0; star < 190; star += 1) {
    const x = rng() * width;
    const y = rng() * height * 0.72;
    const alpha = 0.18 + rng() * 0.52;
    const size = 0.8 + rng() * 1.8;
    ctx.fillStyle = `rgba(246, 240, 231, ${alpha})`;
    ctx.fillRect(x, y, size, size);
  }

  ctx.strokeStyle = "rgba(94, 234, 212, 0.16)";
  ctx.lineWidth = 1;
  for (let line = -6; line <= 6; line += 1) {
    ctx.beginPath();
    for (let step = -16; step <= 16; step += 1) {
      const x = step * 28;
      const y = line * 24;
      const dist = Math.max(24, Math.hypot(x, y));
      const bend = ringRadius * ringRadius / dist * 0.2;
      const angle = Math.atan2(y, x) + Math.sin(step * 0.22 + line) * 0.02;
      const px = cx + x + Math.cos(angle + Math.PI / 2) * bend;
      const py = cy + y + Math.sin(angle + Math.PI / 2) * bend;
      if (step === -16) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.sin(fixture.observatory.spin) * 0.08);
  ctx.scale(1, 0.38);
  for (let point = 0; point < 150; point += 1) {
    const phase = point / 150 * Math.PI * 2;
    const band = point % 5;
    const radius = ringRadius * 1.55 + band * 13 + Math.sin(phase * 3 + fixture.observatory.spin) * 4;
    const hot = Math.cos(phase) > 0 ? 1 : 0.58;
    const alpha = 0.18 + hot * 0.4;
    ctx.fillStyle = band < 3 ? `rgba(244, 196, 91, ${round(alpha, 3)})` : `rgba(251, 113, 133, ${round(alpha * 0.76, 3)})`;
    ctx.beginPath();
    ctx.arc(Math.cos(phase) * radius, Math.sin(phase) * radius, 2.1 + band * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  for (let halo = 0; halo < 4; halo += 1) {
    ctx.strokeStyle = halo === 0 ? "rgba(246, 240, 231, 0.86)" : `rgba(244, 196, 91, ${0.38 - halo * 0.08})`;
    ctx.lineWidth = halo === 0 ? 2.4 : 1.4;
    ctx.beginPath();
    ctx.arc(cx, cy, ringRadius + halo * 10, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = "#010101";
  ctx.beginPath();
  ctx.arc(cx, cy, ringRadius * 0.76, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(236, 243, 251, 0.94)";
  ctx.font = "600 30px Segoe UI";
  ctx.fillText(fixture.observatory.label, 34, 56);
  ctx.font = "18px Segoe UI";
  ctx.fillStyle = "rgba(158, 176, 202, 0.92)";
  ctx.fillText(`preset=${fixture.observatory.capturePreset} | spin=${fixture.observatory.spin} | inclination=${fixture.observatory.inclinationDeg} deg`, 34, 88);

  const panelX = width * 0.7;
  const panelY = 74;
  const panelW = width * 0.24;
  const panelH = height - 132;
  ctx.fillStyle = "rgba(10, 15, 25, 0.84)";
  ctx.fillRect(panelX, panelY, panelW, panelH);
  ctx.strokeStyle = "rgba(226, 232, 240, 0.14)";
  ctx.lineWidth = 1;
  ctx.strokeRect(panelX, panelY, panelW, panelH);

  ctx.fillStyle = "rgba(236, 243, 251, 0.94)";
  ctx.font = "600 20px Segoe UI";
  ctx.fillText("Selected Renderer", panelX + 18, panelY + 34);
  ctx.font = "18px Segoe UI";
  ctx.fillStyle = "rgba(94, 234, 212, 0.96)";
  ctx.fillText(winner.label, panelX + 18, panelY + 64);

  const rows = [
    `avg_fps ${winner.avgFps}`,
    `p95_frametime ${winner.p95FrameMs} ms`,
    `scene_load ${winner.sceneLoadMs} ms`,
    `ray_steps ${winner.raySteps}`,
    `science_alignment ${winner.scienceAlignment}`,
    `score ${winner.observatoryScore}`
  ];
  ctx.font = "16px Segoe UI";
  ctx.fillStyle = "rgba(203, 213, 225, 0.92)";
  rows.forEach((row, index) => {
    ctx.fillText(row, panelX + 18, panelY + 110 + index * 30);
  });

  ctx.fillStyle = "rgba(244, 196, 91, 0.94)";
  ctx.fillText(`photon_ring_radius ${fixture.observatory.photonRingRadiusPx}px`, panelX + 18, panelY + 316);
  ctx.fillStyle = "rgba(158, 176, 202, 0.92)";
  ctx.fillText(`checksum ${fixture.observatory.geodesicChecksum}`, panelX + 18, panelY + 346);
  ctx.fillText(`lensing_arc ${fixture.observatory.lensingArcPct}`, panelX + 18, panelY + 376);
}

function evaluateProfiles(fixture) {
  return [...fixture.profiles]
    .sort((left, right) => right.observatoryScore - left.observatoryScore)
    .map((profile, index) => ({ ...profile, rank: index + 1 }));
}

async function runRealSurfaceObservatory(adapter) {
  log(`Connecting real app-surface adapter '${adapter.id}'.`);
  const fixture = await loadFixture();
  const ranked = evaluateProfiles(fixture);
  const winner = ranked[0];

  const dataset = await withTimeout(
    Promise.resolve(adapter.loadDataset({ presetId: fixture.observatory.id })),
    REAL_ADAPTER_LOAD_MS,
    `loadDataset(${adapter.id})`
  );
  const renderInfo = await withTimeout(
    Promise.resolve(adapter.renderSurface({ canvas: elements.canvas, frameIndex: 0 })),
    REAL_ADAPTER_LOAD_MS,
    `renderSurface(${adapter.id})`
  );
  await withTimeout(
    Promise.resolve(adapter.recordTelemetry({
      kind: "observatory-run",
      winnerId: winner.id,
      observatoryScore: winner.observatoryScore
    })),
    REAL_ADAPTER_LOAD_MS,
    `recordTelemetry(${adapter.id})`
  );
  log(`Real adapter '${adapter.id}' rendered preset ${dataset?.preset?.id || "(unknown)"} (frame ${renderInfo?.frameIndex ?? 0}).`);
  return {
    preset: fixture.observatory,
    leaderboard: ranked,
    winner,
    realAdapter: adapter,
    realDataset: dataset,
    realRenderInfo: renderInfo
  };
}

async function runObservatory() {
  if (state.active) return;
  state.active = true;
  state.run = null;
  state.realAdapterError = null;
  render();

  if (isRealSurfaceMode) {
    log(`Mode=${requestedMode} requested; awaiting real app-surface adapter registration.`);
    const adapter = await awaitRealSurface();
    if (adapter) {
      try {
        state.run = await runRealSurfaceObservatory(adapter);
        drawObservatoryView(await loadFixture(), state.run.winner);
        log(`Real app-surface '${adapter.id}' complete.`);
        state.active = false;
        render();
        return;
      } catch (error) {
        state.realAdapterError = error?.message || String(error);
        log(`Real surface '${adapter.id}' failed: ${state.realAdapterError}; falling back to deterministic.`);
      }
    } else {
      const reason = (typeof window !== "undefined" && window.__aiWebGpuLabRealSurfaceBootstrapError) || "timed out waiting for adapter registration";
      state.realAdapterError = reason;
      log(`No real app-surface adapter registered (${reason}); falling back to deterministic observatory demo.`);
    }
  }

  const fixture = await loadFixture();
  log(`Preset loaded: ${fixture.observatory.id}.`);
  const ranked = evaluateProfiles(fixture);

  for (const profile of ranked) {
    await sleep(110);
    log(`${profile.label} scored ${profile.observatoryScore} with science_alignment=${profile.scienceAlignment}.`);
  }

  const winner = ranked[0];
  await sleep(180);
  drawObservatoryView(fixture, winner);
  log(`Winner selected: ${winner.label}.`);

  state.run = {
    preset: fixture.observatory,
    leaderboard: ranked,
    winner,
    realAdapter: null
  };
  state.active = false;
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
    id: "deterministic-observatory",
    label: "Deterministic Observatory",
    status: "deterministic",
    isReal: false,
    version: "1.0.0",
    capabilities: ["preset-replay", "renderer-scorecard", "telemetry-record"],
    surfaceType: "synthetic",
    message: "App surface adapter registry unavailable; using inline deterministic mock."
  };
}

function buildResult() {
  const run = state.run;
  return {
    meta: {
      repo: "app-blackhole-observatory",
      commit: "bootstrap-generated",
      timestamp: new Date().toISOString(),
      owner: "ai-webgpu-lab",
      track: "integration",
      scenario: run
        ? (run.realAdapter ? `blackhole-observatory-real-${run.realAdapter.id}` : "blackhole-observatory-demo")
        : "blackhole-observatory-pending",
      notes: run
        ? `preset=${run.preset.id}; winner=${run.winner.id}; observatory_score=${run.winner.observatoryScore}; checksum=${run.preset.geodesicChecksum}${run.realAdapter ? `; realAdapter=${run.realAdapter.id}` : (isRealSurfaceMode && state.realAdapterError ? `; realAdapter=fallback(${state.realAdapterError})` : "")}`
        : "Run the blackhole observatory demo."
    },
    environment: state.environment,
    workload: {
      kind: "blackhole-observatory",
      name: "blackhole-observatory-demo",
      input_profile: run ? run.preset.capturePreset : "observatory-pending",
      model_id: run ? run.winner.id : "pending",
      renderer: run ? run.winner.renderer : "pending"
    },
    metrics: {
      common: {
        time_to_interactive_ms: round(performance.now() - state.startedAt, 2) || 0,
        init_ms: run ? run.winner.sceneLoadMs : 0,
        success_rate: run ? 1 : 0.5,
        peak_memory_note: navigator.deviceMemory ? `${navigator.deviceMemory} GB reported by browser` : "deviceMemory unavailable",
        error_type: ""
      },
      graphics: {
        avg_fps: run ? run.winner.avgFps : 0,
        p95_frametime_ms: run ? run.winner.p95FrameMs : 0,
        scene_load_ms: run ? run.winner.sceneLoadMs : 0,
        ray_steps: run ? run.winner.raySteps : 0,
        taa_enabled: run ? run.winner.taaEnabled : false,
        resolution_scale: run ? run.winner.resolutionScale : 0
      },
      blackhole: {
        spin: run ? run.preset.spin : 0,
        inclination_deg: run ? run.preset.inclinationDeg : 0,
        photon_ring_radius_px: run ? run.preset.photonRingRadiusPx : 0,
        lensing_arc_pct: run ? run.preset.lensingArcPct : 0,
        geodesic_checksum: run ? run.preset.geodesicChecksum : 0,
        renderer_consensus_score: run ? run.winner.observatoryScore : 0,
        science_alignment_score: run ? run.winner.scienceAlignment : 0
      }
    },
    status: run ? "success" : "partial",
    artifacts: {
      raw_logs: state.logs.slice(0, 8),
      deploy_url: "https://ai-webgpu-lab.github.io/app-blackhole-observatory/",
      app_surface_adapter: describeAppSurfaceAdapter()
    }
  };
}

function renderStatus() {
  const badges = state.active
    ? ["Observatory running", "Renderer scorecard active"]
    : state.run
      ? [`Winner ${state.run.winner.label}`, `${state.run.winner.avgFps} fps`]
      : ["Observatory ready", "Awaiting run"];

  elements.statusRow.innerHTML = "";
  for (const text of badges) {
    const node = document.createElement("span");
    node.className = "badge";
    node.textContent = text;
    elements.statusRow.appendChild(node);
  }

  elements.summary.textContent = state.active
    ? "Evaluating deterministic blackhole renderer candidates and observatory telemetry."
    : state.run
      ? `Observatory run complete. winner=${state.run.winner.label}, avg_fps=${state.run.winner.avgFps}, renderer_consensus_score=${state.run.winner.observatoryScore}.`
      : "Run the observatory to evaluate renderer candidates, lock a science-oriented winner, and export one blackhole showcase result.";
}

function renderProfiles() {
  if (!state.fixture) {
    elements.profileList.innerHTML = "<li>Loading renderer profiles...</li>";
    return;
  }

  const profiles = state.run ? state.run.leaderboard : evaluateProfiles(state.fixture);
  elements.profileList.innerHTML = profiles.map((profile) => {
    const winner = state.run && state.run.winner.id === profile.id ? " winner" : "";
    return `<li><strong>${profile.rank}. ${profile.label}${winner}</strong><br><span>${profile.renderer}</span><br><span>fps=${profile.avgFps}, p95=${profile.p95FrameMs} ms, science=${profile.scienceAlignment}, score=${profile.observatoryScore}</span></li>`;
  }).join("");
}

function renderPreset() {
  if (!state.fixture) {
    elements.presetList.innerHTML = "";
    elements.viewCaption.textContent = "Loading preset...";
    return;
  }

  const preset = state.run ? state.run.preset : state.fixture.observatory;
  elements.viewCaption.textContent = preset.note;
  const rows = [
    ["Preset", preset.label],
    ["Spin", String(preset.spin)],
    ["Inclination", `${preset.inclinationDeg} deg`],
    ["Mass", `${preset.massBillionsSolar} billion solar masses`],
    ["Distance", `${preset.distanceMly} million light-years`],
    ["Exposure", preset.exposure]
  ];
  elements.presetList.innerHTML = rows.map(([label, value]) => `<li><strong>${label}</strong><br><span>${value}</span></li>`).join("");
}

function renderControls() {
  if (!state.fixture) {
    elements.controlList.innerHTML = "";
    return;
  }
  elements.controlList.innerHTML = state.fixture.controlDeck
    .map((item) => `<li><strong>${item.label}</strong><br><span>${item.value}</span></li>`)
    .join("");
}

function renderFixture() {
  if (!state.fixture) {
    elements.fixtureView.textContent = "Loading observatory fixture...";
    return;
  }
  elements.fixtureView.textContent = JSON.stringify({
    observatory: state.fixture.observatory,
    profiles: state.fixture.profiles.map((profile) => ({
      id: profile.id,
      renderer: profile.renderer,
      observatoryScore: profile.observatoryScore,
      scienceAlignment: profile.scienceAlignment,
      raySteps: profile.raySteps
    })),
    controlDeck: state.fixture.controlDeck
  }, null, 2);
}

function renderMetrics() {
  const run = state.run;
  const cards = [
    ["Winner", run ? run.winner.label : "pending"],
    ["Avg FPS", run ? String(run.winner.avgFps) : "pending"],
    ["P95 Frametime", run ? `${run.winner.p95FrameMs} ms` : "pending"],
    ["Scene Load", run ? `${run.winner.sceneLoadMs} ms` : "pending"],
    ["Photon Ring", run ? `${run.preset.photonRingRadiusPx}px` : "pending"],
    ["Lensing Arc", run ? String(run.preset.lensingArcPct) : "pending"],
    ["Science Alignment", run ? String(run.winner.scienceAlignment) : "pending"],
    ["Consensus Score", run ? String(run.winner.observatoryScore) : "pending"]
  ];
  elements.metricGrid.innerHTML = cards
    .map(([label, value]) => `<article class="metric-card"><span>${label}</span><strong>${value}</strong></article>`)
    .join("");
}

function renderMeta() {
  const run = state.run;
  const winner = run ? run.winner : null;
  const preset = run ? run.preset : state.fixture ? state.fixture.observatory : null;
  const cards = [
    ["Backend", state.environment.backend],
    ["Worker Mode", state.environment.worker_mode],
    ["GPU Adapter", state.environment.gpu.adapter],
    ["Preset", preset ? preset.capturePreset : "pending"],
    ["Winner Renderer", winner ? winner.renderer : "pending"],
    ["Ray Steps", winner ? String(winner.raySteps) : "pending"],
    ["TAA", winner ? String(winner.taaEnabled) : "pending"],
    ["Checksum", preset ? String(preset.geodesicChecksum) : "pending"]
  ];
  elements.metaGrid.innerHTML = cards
    .map(([label, value]) => `<article class="meta-card"><span>${label}</span><strong>${value}</strong></article>`)
    .join("");
}

function renderLogs() {
  elements.logList.textContent = state.logs.length ? state.logs.join("\n") : "No events yet.";
}

function renderResultJson() {
  elements.resultJson.textContent = JSON.stringify(buildResult(), null, 2);
}

function render() {
  renderStatus();
  renderProfiles();
  renderPreset();
  renderControls();
  renderFixture();
  renderMetrics();
  renderMeta();
  renderLogs();
  renderResultJson();
  elements.downloadJson.disabled = !state.run;
}

function downloadResult() {
  if (!state.run) return;
  const blob = new Blob([`${JSON.stringify(buildResult(), null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `app-blackhole-observatory-${state.run ? "demo" : "pending"}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

elements.runObservatory.addEventListener("click", () => {
  runObservatory().catch((error) => {
    state.active = false;
    log(`Run failed: ${error.message}`);
    render();
  });
});
elements.downloadJson.addEventListener("click", downloadResult);

drawPlaceholder();
loadFixture().then(render).catch((error) => {
  log(`Fixture load failed: ${error.message}`);
  render();
});
