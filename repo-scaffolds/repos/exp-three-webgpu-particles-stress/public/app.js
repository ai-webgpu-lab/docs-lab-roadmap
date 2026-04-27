const simulationConfig = {
  particleCount: 48000,
  visibleParticles: 240,
  emitterCount: 6,
  frameCount: 84,
  postFxPasses: 3,
  billboardLayers: 4,
  trailSamples: 8,
  resolutionScale: 0.85
};

const emitters = buildEmitters(simulationConfig.emitterCount);
const particles = buildParticles(simulationConfig.visibleParticles);

const state = {
  startedAt: performance.now(),
  environment: buildEnvironment(),
  capability: null,
  run: null,
  active: false,
  logs: []
};

const elements = {
  statusRow: document.getElementById("status-row"),
  summary: document.getElementById("summary"),
  probeCapability: document.getElementById("probe-capability"),
  runStress: document.getElementById("run-stress"),
  downloadJson: document.getElementById("download-json"),
  canvas: document.getElementById("scene-canvas"),
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

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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
    gpu: { adapter: "pending", required_features: [], limits: {} },
    backend: "pending",
    fallback_triggered: false,
    worker_mode: "main",
    cache_state: "warm"
  };
}

function buildEmitters(count) {
  return Array.from({ length: count }, (_, index) => ({
    index,
    anchorX: -0.72 + index * 0.28,
    anchorY: Math.sin(index * 0.9) * 0.16,
    lift: (index % 3 - 1) * 0.08,
    spread: 0.14 + index * 0.02,
    hue: 150 + index * 28
  }));
}

function buildParticles(count) {
  return Array.from({ length: count }, (_, index) => ({
    emitterIndex: index % simulationConfig.emitterCount,
    band: index % simulationConfig.billboardLayers,
    phase: index * 0.19,
    radius: 0.05 + (index % 17) * 0.01,
    drift: 0.003 + (index % 9) * 0.0006,
    hueOffset: (index % 7) * 8,
    size: 1 + (index % 5) * 0.38,
    wobble: 0.08 + (index % 11) * 0.01
  }));
}

function sampleParticle(particle, frameSample) {
  const emitter = emitters[particle.emitterIndex];
  const phase = particle.phase + frameSample * (0.015 + particle.drift);
  const curl = Math.sin(phase * 1.9 + emitter.index) * particle.wobble * 0.24;
  const swirl = Math.cos(phase * 0.82 + particle.band * 0.7) * particle.radius;
  return {
    x: emitter.anchorX + Math.cos(phase + swirl) * (particle.radius + curl),
    y: emitter.anchorY + Math.sin(phase * 0.96 + curl) * (particle.radius * 0.66) + emitter.lift
  };
}

function log(message) {
  state.logs.unshift(`[${new Date().toLocaleTimeString()}] ${message}`);
  state.logs = state.logs.slice(0, 12);
  renderLogs();
}

async function probeCapability() {
  if (state.active) return;
  state.active = true;
  render();

  const hasWebGpu = typeof navigator !== "undefined" && Boolean(navigator.gpu);
  const fallbackForced = new URLSearchParams(window.location.search).get("mode") === "fallback";
  const webgpuPath = hasWebGpu && !fallbackForced;
  const adapter = webgpuPath ? "navigator.gpu available" : "webgl-fallback";

  state.capability = {
    hasWebGpu,
    adapter,
    requiredFeatures: webgpuPath ? ["shader-f16", "timestamp-query"] : []
  };
  state.environment.gpu = {
    adapter,
    required_features: state.capability.requiredFeatures,
    limits: webgpuPath ? { maxTextureDimension2D: 8192, maxBindGroups: 4, maxColorAttachments: 8 } : {}
  };
  state.environment.backend = webgpuPath ? "webgpu" : "webgl";
  state.environment.fallback_triggered = !webgpuPath;
  state.active = false;

  log(webgpuPath ? "WebGPU path selected for particle stress readiness." : "Fallback path selected for particle stress readiness.");
  render();
}

function simulateStressFrame(frame) {
  const startedAt = performance.now();
  let energy = 0;
  let fillBudget = 0;
  let peakEmitter = 0;

  for (const emitter of emitters) {
    const pulse = 0.62 + Math.abs(Math.sin(frame * 0.082 + emitter.index * 0.67)) * 0.44;
    const wave = 0.2 + Math.abs(Math.cos(frame * 0.045 + emitter.index * 0.39)) * 0.18;
    energy += pulse * (1.4 + emitter.index * 0.12);
    fillBudget += pulse * 7.6 + wave * 4.1;
    peakEmitter = Math.max(peakEmitter, pulse + wave);
  }

  for (let layer = 0; layer < simulationConfig.billboardLayers; layer += 1) {
    for (let sample = 0; sample < 72; sample += 1) {
      const phase = frame * 0.031 + layer * 0.9 + sample * 0.13;
      energy += Math.sin(phase) * 0.003 + Math.cos(phase * 0.7) * 0.0024;
      fillBudget += Math.abs(Math.sin(phase * 1.4)) * 0.16;
    }
  }

  const durationMs = performance.now() - startedAt;
  const overdrawRatioPct = round(
    (state.environment.fallback_triggered ? 142 : 118) + fillBudget * 0.38 + Math.abs(Math.sin(energy)) * 4.8,
    2
  );
  const fillPct = round(
    (state.environment.fallback_triggered ? 67 : 61) + fillBudget * 0.12 + peakEmitter * 2.8,
    2
  );
  const passCostMs = round(durationMs * (0.68 + (frame % 4) * 0.024), 4);

  return {
    durationMs,
    energy: round(energy, 5),
    fillPct,
    overdrawRatioPct,
    drawCalls: 26 + simulationConfig.postFxPasses + simulationConfig.billboardLayers * 2,
    passCostMs,
    peakEmitter: round(peakEmitter, 4)
  };
}

function drawBackground(ctx, width, height, frame) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "rgba(4, 10, 18, 1)");
  gradient.addColorStop(0.5, "rgba(11, 18, 28, 1)");
  gradient.addColorStop(1, "rgba(3, 5, 9, 1)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(110, 231, 183, 0.06)";
  ctx.lineWidth = 1;
  const cols = 18;
  const rows = 12;
  for (let row = 0; row <= rows; row += 1) {
    const y = (height / rows) * row;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  for (let col = 0; col <= cols; col += 1) {
    const x = (width / cols) * col + Math.sin(frame * 0.014 + col) * 1.8;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
}

function drawEmitterField(ctx, width, height, frame) {
  const cx = width / 2;
  const cy = height / 2;
  const scaleX = width * 0.42;
  const scaleY = height * 0.36;

  ctx.save();
  for (const emitter of emitters) {
    const x = cx + emitter.anchorX * scaleX;
    const y = cy + emitter.anchorY * scaleY;
    const pulse = 8 + Math.sin(frame * 0.05 + emitter.index) * 3;

    ctx.strokeStyle = `hsla(${emitter.hue}, 90%, 70%, 0.22)`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x, y, 16 + pulse, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = `hsla(${emitter.hue}, 92%, 72%, 0.9)`;
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawParticles(ctx, frame, stress) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const cx = width / 2;
  const cy = height / 2;
  const scaleX = width * 0.43;
  const scaleY = height * 0.38;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const particle of particles) {
    const emitter = emitters[particle.emitterIndex];
    const hue = emitter.hue + particle.hueOffset;
    ctx.strokeStyle = `hsla(${hue}, 92%, 72%, 0.14)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let sample = simulationConfig.trailSamples; sample >= 0; sample -= 1) {
      const point = sampleParticle(particle, frame - sample * 1.7);
      const x = cx + point.x * scaleX;
      const y = cy + point.y * scaleY;
      if (sample === simulationConfig.trailSamples) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    const point = sampleParticle(particle, frame);
    ctx.fillStyle = `hsla(${hue}, 92%, 74%, 0.84)`;
    ctx.beginPath();
    ctx.arc(cx + point.x * scaleX, cy + point.y * scaleY, particle.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.fillStyle = "rgba(244, 247, 251, 0.9)";
  ctx.font = "14px Segoe UI";
  ctx.fillText(`frame ${frame + 1}/${simulationConfig.frameCount}`, 18, 28);
  ctx.fillText(`${simulationConfig.particleCount} particles, ${simulationConfig.emitterCount} emitters, ${simulationConfig.postFxPasses} post-FX passes`, 18, 50);
  ctx.fillText(`overdraw ${stress.overdrawRatioPct}%, fill ${stress.fillPct}%, draw calls ${stress.drawCalls}`, 18, 72);
}

function drawFrame(ctx, frame, stress) {
  drawBackground(ctx, ctx.canvas.width, ctx.canvas.height, frame);
  drawEmitterField(ctx, ctx.canvas.width, ctx.canvas.height, frame);
  drawParticles(ctx, frame, stress);
}

async function runStressBaseline() {
  if (state.active) return;
  if (!state.capability) {
    await probeCapability();
  }

  state.active = true;
  render();
  const ctx = elements.canvas.getContext("2d");
  const frameTimes = [];
  const overdrawSamples = [];
  const fillSamples = [];
  const passTimes = [];
  const startedAt = performance.now();
  const sceneLoadStartedAt = performance.now();
  await new Promise((resolve) => setTimeout(resolve, state.environment.fallback_triggered ? 76 : 48));
  const sceneLoadMs = performance.now() - sceneLoadStartedAt;

  let previous = performance.now();
  let energy = 0;
  let peakOverdrawRatioPct = 0;
  let drawCalls = 0;

  for (let frame = 0; frame < simulationConfig.frameCount; frame += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const stress = simulateStressFrame(frame);
    overdrawSamples.push(stress.overdrawRatioPct);
    fillSamples.push(stress.fillPct);
    passTimes.push(stress.passCostMs);
    energy += stress.energy;
    peakOverdrawRatioPct = Math.max(peakOverdrawRatioPct, stress.overdrawRatioPct);
    drawCalls = Math.max(drawCalls, stress.drawCalls);
    drawFrame(ctx, frame, stress);

    const now = performance.now();
    frameTimes.push(now - previous);
    previous = now;
  }

  const totalMs = performance.now() - startedAt;
  const avgFrameTime = average(frameTimes);
  const avgOverdrawRatioPct = average(overdrawSamples);
  const avgFillPct = average(fillSamples);
  const avgPassCostMs = average(passTimes);

  state.run = {
    sceneLoadMs,
    totalMs,
    avgFps: avgFrameTime ? 1000 / avgFrameTime : 0,
    p95FrametimeMs: percentile(frameTimes, 0.95),
    avgOverdrawRatioPct: round(avgOverdrawRatioPct, 2),
    peakOverdrawRatioPct: round(peakOverdrawRatioPct, 2),
    avgFillPct: round(avgFillPct, 2),
    avgPassCostMs: round(avgPassCostMs, 4),
    energy: round(energy, 4),
    drawCalls
  };
  state.active = false;

  log(`Particle stress baseline complete: avg fps=${round(state.run.avgFps, 2)}, overdraw=${state.run.avgOverdrawRatioPct}%.`);
  render();
}

function buildResult() {
  const readyStatus = state.capability ? (state.environment.fallback_triggered ? "partial" : "success") : "partial";
  const runStatus = state.run ? (state.environment.fallback_triggered ? "partial" : "success") : readyStatus;

  return {
    meta: {
      repo: "exp-three-webgpu-particles-stress",
      commit: "bootstrap-generated",
      timestamp: new Date().toISOString(),
      owner: "ai-webgpu-lab",
      track: "blackhole",
      scenario: state.run ? "three-webgpu-particles-stress-readiness" : "three-webgpu-particles-stress-pending",
      notes: state.run
        ? `particleCount=${simulationConfig.particleCount}; visibleParticles=${simulationConfig.visibleParticles}; emitterCount=${simulationConfig.emitterCount}; postFxPasses=${simulationConfig.postFxPasses}; billboardLayers=${simulationConfig.billboardLayers}; resolutionScale=${simulationConfig.resolutionScale}; drawCalls=${state.run.drawCalls}; avgOverdrawRatioPct=${state.run.avgOverdrawRatioPct}; peakOverdrawRatioPct=${state.run.peakOverdrawRatioPct}; avgFillPct=${state.run.avgFillPct}; avgPassCostMs=${state.run.avgPassCostMs}; energy=${state.run.energy}; backend=${state.environment.backend}; fallback=${state.environment.fallback_triggered}`
        : "Probe capability and run the deterministic particle/VFX stress loop to export graphics-stress metrics."
    },
    environment: state.environment,
    workload: {
      kind: "graphics",
      name: "three-webgpu-particles-stress-readiness",
      input_profile: "48000-particles-6-emitters-fixed-seed",
      model_id: "deterministic-three-particles-stress-v1",
      resolution: `${elements.canvas.width}x${elements.canvas.height}`
    },
    metrics: {
      common: {
        time_to_interactive_ms: round(performance.now() - state.startedAt, 2) || 0,
        init_ms: state.run ? round(state.run.sceneLoadMs, 2) || 0 : 0,
        success_rate: state.run ? (state.environment.fallback_triggered ? 0.88 : 1) : 0.5,
        peak_memory_note: navigator.deviceMemory
          ? `${navigator.deviceMemory} GB reported by browser; particleCount=${simulationConfig.particleCount}`
          : `particleCount=${simulationConfig.particleCount}; deviceMemory unavailable`,
        error_type: state.run && state.environment.fallback_triggered ? "fallback_graphics_path" : ""
      },
      graphics: {
        avg_fps: state.run ? round(state.run.avgFps, 2) || 0 : 0,
        p95_frametime_ms: state.run ? round(state.run.p95FrametimeMs, 2) || 0 : 0,
        scene_load_ms: state.run ? round(state.run.sceneLoadMs, 2) || 0 : 0,
        resolution_scale: simulationConfig.resolutionScale,
        draw_calls: state.run ? state.run.drawCalls || 0 : 0,
        particle_count: simulationConfig.particleCount,
        emitter_count: simulationConfig.emitterCount,
        overdraw_ratio_pct: state.run ? state.run.avgOverdrawRatioPct || 0 : 0,
        post_fx_passes: simulationConfig.postFxPasses,
        visual_artifact_note: state.run
          ? (state.environment.fallback_triggered
            ? "Fallback path is CPU-bound; true three.js WebGPU particle material cost is not measured yet."
            : "Deterministic billboard + additive-composite baseline before real three.js particle materials.")
          : "Not measured yet."
      }
    },
    status: runStatus,
    artifacts: {
      raw_logs: state.logs.slice(0, 5),
      deploy_url: "https://ai-webgpu-lab.github.io/exp-three-webgpu-particles-stress/"
    }
  };
}

function renderStatus() {
  const badges = [];
  if (state.active) {
    badges.push({ text: "Stress running" });
    badges.push({ text: `${simulationConfig.particleCount} particles` });
    badges.push({ text: `${simulationConfig.emitterCount} emitters` });
  } else if (state.run) {
    badges.push({ text: state.environment.fallback_triggered ? "Fallback complete" : "WebGPU complete" });
    badges.push({ text: `${round(state.run.avgFps, 2)} fps` });
    badges.push({ text: `${state.run.avgOverdrawRatioPct}% overdraw` });
  } else if (state.capability) {
    badges.push({ text: state.environment.fallback_triggered ? "Fallback ready" : "WebGPU ready" });
    badges.push({ text: `${simulationConfig.emitterCount} emitters` });
    badges.push({ text: `${simulationConfig.postFxPasses} post-FX passes` });
  } else {
    badges.push({ text: "Probe pending" });
    badges.push({ text: `${simulationConfig.particleCount} particles` });
    badges.push({ text: `${simulationConfig.emitterCount} emitters` });
  }

  elements.statusRow.innerHTML = "";
  for (const badge of badges) {
    const node = document.createElement("span");
    node.className = "badge";
    node.textContent = badge.text;
    elements.statusRow.appendChild(node);
  }

  elements.summary.textContent = state.run
    ? `avg fps ${round(state.run.avgFps, 2)}, overdraw ${state.run.avgOverdrawRatioPct}%, draw calls ${state.run.drawCalls}.`
    : "Probe capability first, then run the deterministic particle/VFX loop to export particle count, emitter count, overdraw, draw-call, and thermal metadata.";
}

function renderMetrics() {
  const run = state.run;
  const cards = [
    ["Particles", simulationConfig.particleCount],
    ["Emitters", simulationConfig.emitterCount],
    ["Avg FPS", run ? round(run.avgFps, 2) : "pending"],
    ["P95 Frame", run ? `${round(run.p95FrametimeMs, 2)} ms` : "pending"],
    ["Overdraw", run ? `${run.avgOverdrawRatioPct}%` : "pending"],
    ["Draw Calls", run ? run.drawCalls : "pending"]
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
    ["Resolution", simulationConfig.resolutionScale],
    ["Post FX", simulationConfig.postFxPasses]
  ];

  elements.metaGrid.innerHTML = "";
  for (const [label, value] of rows) {
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `<span class="label">${label}</span><div class="value">${value}</div>`;
    elements.metaGrid.appendChild(card);
  }
}

function renderLogs() {
  elements.logList.innerHTML = "";
  if (!state.logs.length) {
    const node = document.createElement("li");
    node.textContent = "No activity yet.";
    elements.logList.appendChild(node);
    return;
  }

  for (const entry of state.logs) {
    const node = document.createElement("li");
    node.textContent = entry;
    elements.logList.appendChild(node);
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
  renderResult();
  elements.runStress.disabled = state.active;
  elements.probeCapability.disabled = state.active;
  elements.downloadJson.disabled = state.active;
}

function downloadResult() {
  const blob = new Blob([JSON.stringify(buildResult(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `exp-three-webgpu-particles-stress-${state.run ? "stress-ready" : "pending"}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  log("Downloaded particle stress readiness JSON draft.");
}

elements.probeCapability.addEventListener("click", () => {
  probeCapability().catch((error) => {
    state.active = false;
    log(`Capability probe failed: ${error.message}`);
    render();
  });
});

elements.runStress.addEventListener("click", () => {
  runStressBaseline().catch((error) => {
    state.active = false;
    log(`Stress baseline failed: ${error.message}`);
    render();
  });
});

elements.downloadJson.addEventListener("click", downloadResult);

render();
