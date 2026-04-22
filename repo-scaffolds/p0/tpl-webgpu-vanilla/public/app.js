const knownLimitKeys = [
  "maxTextureDimension2D",
  "maxBindGroups",
  "maxBufferSize",
  "maxStorageBufferBindingSize",
  "maxComputeInvocationsPerWorkgroup"
];

const state = {
  startedAt: performance.now(),
  environment: buildEnvironment(),
  capability: null,
  sample: {
    running: false,
    available: false,
    initMs: null,
    frameSamples: [],
    animationFrame: 0,
    adapter: null,
    device: null,
    features: [],
    limits: {},
    error: "",
    lastFrameAt: 0
  },
  logs: []
};

const elements = {
  statusRow: document.getElementById("status-row"),
  summary: document.getElementById("summary"),
  probeCapability: document.getElementById("probe-capability"),
  runSample: document.getElementById("run-sample"),
  downloadJson: document.getElementById("download-json"),
  resetSample: document.getElementById("reset-sample"),
  metricGrid: document.getElementById("metric-grid"),
  metaGrid: document.getElementById("meta-grid"),
  logList: document.getElementById("log-list"),
  resultJson: document.getElementById("result-json"),
  canvas: document.getElementById("starter-canvas")
};

function round(value, digits = 2) {
  if (!Number.isFinite(value)) {
    return null;
  }

  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

function average(values) {
  if (!values.length) {
    return null;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function percentile(values, ratio) {
  if (!values.length) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
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
      adapter: "unknown",
      required_features: [],
      limits: {}
    },
    backend: "wasm",
    fallback_triggered: true,
    worker_mode: "main",
    cache_state: "unknown"
  };
}

function extractLimits(source) {
  const limits = {};
  if (!source) {
    return limits;
  }

  for (const key of knownLimitKeys) {
    if (key in source && Number.isFinite(source[key])) {
      limits[key] = Number(source[key]);
    }
  }

  return limits;
}

function log(message) {
  state.logs.unshift(`[${new Date().toLocaleTimeString()}] ${message}`);
  state.logs = state.logs.slice(0, 10);
  renderLogs();
}

function sampleStatus() {
  if (!("gpu" in navigator)) {
    return {
      summary: "This browser does not expose navigator.gpu. The template can still export a fallback JSON draft.",
      badges: [
        { tone: "danger", text: "WebGPU unavailable" },
        { tone: "warn", text: "Fallback only" }
      ]
    };
  }

  if (state.sample.running) {
    return {
      summary: "Triangle sample is running. Capture frame pacing for a few seconds, then export the JSON draft.",
      badges: [
        { tone: "success", text: "WebGPU active" },
        { tone: "success", text: "Triangle sample running" }
      ]
    };
  }

  if (state.sample.available) {
    return {
      summary: "Capability probe succeeded. Start the triangle sample to validate canvas configuration and basic frame pacing.",
      badges: [
        { tone: "success", text: "Capability ready" },
        { tone: "warn", text: "Sample idle" }
      ]
    };
  }

  if (state.sample.error) {
    return {
      summary: `Last WebGPU attempt failed: ${state.sample.error}`,
      badges: [
        { tone: "danger", text: "Probe failed" },
        { tone: "warn", text: "Fallback JSON available" }
      ]
    };
  }

  return {
    summary: "Run the capability probe first. If WebGPU is available, start the triangle sample to capture init and frame pacing metrics.",
    badges: [
      { tone: "warn", text: "Capability pending" },
      { tone: "warn", text: "Sample pending" }
    ]
  };
}

function renderStatus() {
  const status = sampleStatus();
  elements.summary.textContent = status.summary;
  elements.statusRow.innerHTML = "";

  for (const badge of status.badges) {
    const node = document.createElement("span");
    node.className = `badge ${badge.tone}`;
    node.textContent = badge.text;
    elements.statusRow.appendChild(node);
  }
}

function metricCards() {
  const avgFrameMs = average(state.sample.frameSamples);
  const avgFps = avgFrameMs ? 1000 / avgFrameMs : null;
  const p95Frame = percentile(state.sample.frameSamples, 0.95);

  return [
    ["TTI", `${round(performance.now() - state.startedAt, 1) || 0} ms`],
    ["Init", state.sample.initMs ? `${round(state.sample.initMs, 1)} ms` : "pending"],
    ["Adapter", state.sample.adapter || "pending"],
    ["Avg FPS", avgFps ? `${round(avgFps, 1)} fps` : "pending"],
    ["P95 Frame", p95Frame ? `${round(p95Frame, 2)} ms` : "pending"],
    ["Features", state.sample.features.length ? String(state.sample.features.length) : "pending"]
  ];
}

function renderMetrics() {
  elements.metricGrid.innerHTML = "";

  for (const [label, value] of metricCards()) {
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
    ["Adapter", state.environment.gpu.adapter],
    ["Limits", Object.keys(state.environment.gpu.limits || {}).length ? JSON.stringify(state.environment.gpu.limits) : "pending"]
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
    li.textContent = "No activity yet.";
    elements.logList.appendChild(li);
    return;
  }

  for (const item of state.logs) {
    const li = document.createElement("li");
    li.textContent = item;
    elements.logList.appendChild(li);
  }
}

function buildResult() {
  const avgFrameMs = average(state.sample.frameSamples);
  const avgFps = avgFrameMs ? 1000 / avgFrameMs : null;
  const p95Frame = percentile(state.sample.frameSamples, 0.95);
  const success = Boolean(state.sample.available);

  return {
    meta: {
      repo: "tpl-webgpu-vanilla",
      commit: "bootstrap-generated",
      timestamp: new Date().toISOString(),
      owner: "ai-webgpu-lab",
      track: "infra",
      scenario: "minimal-webgpu-starter",
      notes: success
        ? "Raw WebGPU canvas starter with adapter/device acquisition and animated triangle sample."
        : `WebGPU unavailable. Last error: ${state.sample.error || "navigator.gpu unavailable"}`
    },
    environment: state.environment,
    workload: {
      kind: "graphics",
      name: "minimal-webgpu-triangle",
      input_profile: "single-canvas-960x540",
      renderer: "raw-webgpu",
      resolution: "960x540"
    },
    metrics: {
      common: {
        time_to_interactive_ms: round(performance.now() - state.startedAt, 2) || 0,
        init_ms: round(state.sample.initMs || 0, 2) || 0,
        success_rate: success ? 1 : 0,
        peak_memory_note: navigator.deviceMemory ? `${navigator.deviceMemory} GB reported by browser` : "deviceMemory unavailable",
        error_type: state.sample.error || ""
      },
      graphics: {
        avg_fps: round(avgFps || 0, 2) || 0,
        p95_frametime_ms: round(p95Frame || 0, 2) || 0,
        scene_load_ms: round(state.sample.initMs || 0, 2) || 0,
        resolution_scale: 1,
        taa_enabled: false,
        visual_artifact_note: success ? "Animated triangle sample rendered without additional post-processing." : "Fallback only"
      }
    },
    status: success ? "success" : "partial",
    artifacts: {
      raw_logs: state.logs.slice(0, 5),
      deploy_url: "https://ai-webgpu-lab.github.io/tpl-webgpu-vanilla/"
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

async function requestAdapterInfo(adapter) {
  if (typeof adapter.requestAdapterInfo !== "function") {
    return null;
  }

  try {
    return await adapter.requestAdapterInfo();
  } catch (error) {
    return null;
  }
}

async function probeCapability() {
  state.sample.error = "";

  if (!("gpu" in navigator)) {
    state.sample.available = false;
    state.environment.backend = "wasm";
    state.environment.fallback_triggered = true;
    state.environment.gpu = {
      adapter: "navigator.gpu unavailable",
      required_features: [],
      limits: {}
    };
    log("Capability probe stopped: navigator.gpu unavailable.");
    render();
    return;
  }

  const startedAt = performance.now();

  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error("No GPU adapter returned");
    }

    const adapterInfo = await requestAdapterInfo(adapter);
    state.sample.available = true;
    state.sample.adapter = (adapterInfo && (adapterInfo.description || adapterInfo.vendor || adapterInfo.architecture)) || "WebGPU adapter";
    state.sample.limits = extractLimits(adapter.limits);
    state.sample.initMs = performance.now() - startedAt;

    state.environment.backend = "webgpu";
    state.environment.fallback_triggered = false;
    state.environment.gpu = {
      adapter: state.sample.adapter,
      required_features: [],
      limits: state.sample.limits
    };

    log(`Capability probe ready: ${state.sample.adapter}.`);
  } catch (error) {
    state.sample.available = false;
    state.sample.error = error instanceof Error ? error.message : String(error);
    state.environment.backend = "wasm";
    state.environment.fallback_triggered = true;
    state.environment.gpu = {
      adapter: "unavailable",
      required_features: [],
      limits: {}
    };
    log(`Capability probe failed: ${state.sample.error}.`);
  }

  render();
}

function stopSample() {
  state.sample.running = false;
  if (state.sample.animationFrame) {
    cancelAnimationFrame(state.sample.animationFrame);
    state.sample.animationFrame = 0;
  }
}

function resetCanvas() {
  stopSample();
  const context = elements.canvas.getContext("2d");
  if (context) {
    context.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
    context.fillStyle = "#09121b";
    context.fillRect(0, 0, elements.canvas.width, elements.canvas.height);
    context.fillStyle = "#7dd3fc";
    context.font = "20px Segoe UI";
    context.fillText("Run the triangle sample to validate the minimal WebGPU path.", 24, 42);
  }
}

async function startTriangleSample() {
  await probeCapability();

  if (!state.sample.available || !("gpu" in navigator)) {
    render();
    return;
  }

  stopSample();
  state.sample.frameSamples = [];
  state.sample.lastFrameAt = 0;
  state.sample.error = "";

  const startedAt = performance.now();

  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error("No GPU adapter returned");
    }

    const device = await adapter.requestDevice();
    const adapterInfo = await requestAdapterInfo(adapter);
    const context = elements.canvas.getContext("webgpu");
    const format = typeof navigator.gpu.getPreferredCanvasFormat === "function" ? navigator.gpu.getPreferredCanvasFormat() : "bgra8unorm";

    if (!context) {
      throw new Error("Failed to acquire webgpu canvas context");
    }

    context.configure({
      device,
      format,
      alphaMode: "opaque"
    });

    const shaderModule = device.createShaderModule({
      code: `
        struct Uniforms {
          time: f32,
          pad0: f32,
          pad1: f32,
          pad2: f32
        };

        @group(0) @binding(0) var<uniform> uniforms: Uniforms;

        struct VSOut {
          @builtin(position) position: vec4<f32>,
          @location(0) color: vec3<f32>
        };

        @vertex
        fn vsMain(@builtin(vertex_index) vertexIndex: u32) -> VSOut {
          var positions = array<vec2<f32>, 3>(
            vec2<f32>(0.0, 0.72),
            vec2<f32>(-0.68, -0.42),
            vec2<f32>(0.68, -0.42)
          );

          var colors = array<vec3<f32>, 3>(
            vec3<f32>(0.49, 0.83, 0.99),
            vec3<f32>(0.52, 0.94, 0.67),
            vec3<f32>(0.99, 0.76, 0.35)
          );

          let angle = uniforms.time * 0.00105;
          let base = positions[vertexIndex];
          let c = cos(angle);
          let s = sin(angle);
          let rotated = vec2<f32>(
            base.x * c - base.y * s,
            base.x * s + base.y * c
          );

          var out: VSOut;
          out.position = vec4<f32>(rotated, 0.0, 1.0);
          out.color = colors[vertexIndex];
          return out;
        }

        @fragment
        fn fsMain(in: VSOut) -> @location(0) vec4<f32> {
          return vec4<f32>(in.color, 1.0);
        }
      `
    });

    const uniformBuffer = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "uniform" }
        }
      ]
    });

    const pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout]
      }),
      vertex: {
        module: shaderModule,
        entryPoint: "vsMain"
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fsMain",
        targets: [{ format }]
      },
      primitive: {
        topology: "triangle-list"
      }
    });

    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: uniformBuffer }
        }
      ]
    });

    device.lost.then((info) => {
      stopSample();
      state.sample.error = info && info.message ? info.message : "GPU device lost";
      state.sample.running = false;
      log(`GPU device lost: ${state.sample.error}.`);
      render();
    });

    state.sample.available = true;
    state.sample.running = true;
    state.sample.device = device;
    state.sample.adapter = (adapterInfo && (adapterInfo.description || adapterInfo.vendor || adapterInfo.architecture)) || state.sample.adapter || "WebGPU adapter";
    state.sample.features = Array.from(device.features || []);
    state.sample.limits = extractLimits(device.limits || adapter.limits);
    state.sample.initMs = performance.now() - startedAt;

    state.environment.backend = "webgpu";
    state.environment.fallback_triggered = false;
    state.environment.gpu = {
      adapter: state.sample.adapter,
      required_features: state.sample.features,
      limits: state.sample.limits
    };

    const renderFrame = (timestamp) => {
      if (!state.sample.running) {
        return;
      }

      if (state.sample.lastFrameAt !== 0) {
        const delta = timestamp - state.sample.lastFrameAt;
        state.sample.frameSamples.push(delta);
        state.sample.frameSamples = state.sample.frameSamples.slice(-180);
      }
      state.sample.lastFrameAt = timestamp;

      const uniforms = new Float32Array([timestamp, 0, 0, 0]);
      device.queue.writeBuffer(uniformBuffer, 0, uniforms);

      const encoder = device.createCommandEncoder();
      const textureView = context.getCurrentTexture().createView();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: textureView,
            clearValue: {
              r: 0.04 + ((Math.sin(timestamp * 0.0005) + 1) * 0.02),
              g: 0.09 + ((Math.cos(timestamp * 0.0007) + 1) * 0.03),
              b: 0.14 + ((Math.sin(timestamp * 0.0003) + 1) * 0.02),
              a: 1
            },
            loadOp: "clear",
            storeOp: "store"
          }
        ]
      });

      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3);
      pass.end();
      device.queue.submit([encoder.finish()]);

      if (state.sample.frameSamples.length % 18 === 0) {
        render();
      }

      state.sample.animationFrame = requestAnimationFrame(renderFrame);
    };

    log(`Triangle sample started on ${state.sample.adapter}.`);
    state.sample.animationFrame = requestAnimationFrame(renderFrame);
  } catch (error) {
    state.sample.running = false;
    state.sample.error = error instanceof Error ? error.message : String(error);
    state.environment.backend = "wasm";
    state.environment.fallback_triggered = true;
    log(`Triangle sample failed: ${state.sample.error}.`);
  }

  render();
}

function resetSample() {
  stopSample();
  state.sample.available = false;
  state.sample.initMs = null;
  state.sample.frameSamples = [];
  state.sample.adapter = null;
  state.sample.features = [];
  state.sample.limits = {};
  state.sample.error = "";
  state.environment = buildEnvironment();
  log("Starter state reset.");
  resetCanvas();
  render();
}

function downloadJson() {
  const payload = JSON.stringify(buildResult(), null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "tpl-webgpu-vanilla-baseline.json";
  anchor.click();
  URL.revokeObjectURL(url);
  log("Downloaded template baseline JSON draft.");
}

elements.probeCapability.addEventListener("click", probeCapability);
elements.runSample.addEventListener("click", startTriangleSample);
elements.downloadJson.addEventListener("click", downloadJson);
elements.resetSample.addEventListener("click", resetSample);

resetCanvas();
log("Minimal WebGPU starter ready.");
render();
