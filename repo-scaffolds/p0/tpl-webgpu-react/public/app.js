(function bootReactWebGpuTemplate() {
  const { createElement: h, useEffect, useRef, useState } = React;

  const knownLimitKeys = [
    "maxTextureDimension2D",
    "maxBindGroups",
    "maxBufferSize",
    "maxStorageBufferBindingSize"
  ];

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

  function App() {
    const canvasRef = useRef(null);
    const animationRef = useRef(0);
    const startedAtRef = useRef(performance.now());
    const deviceRef = useRef(null);
    const [environment, setEnvironment] = useState(buildEnvironment());
    const [capability, setCapability] = useState({
      available: false,
      adapter: "",
      initMs: null,
      features: [],
      limits: {},
      frameSamples: [],
      running: false,
      error: ""
    });
    const [logs, setLogs] = useState(["React starter mounted."]);

    useEffect(() => () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    }, []);

    function pushLog(message) {
      setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${message}`, ...prev].slice(0, 10));
    }

    function resetState() {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }

      animationRef.current = 0;
      deviceRef.current = null;
      setEnvironment(buildEnvironment());
      setCapability({
        available: false,
        adapter: "",
        initMs: null,
        features: [],
        limits: {},
        frameSamples: [],
        running: false,
        error: ""
      });
      pushLog("React starter state reset.");
    }

    async function probeCapability() {
      if (!("gpu" in navigator)) {
        setEnvironment((prev) => ({
          ...prev,
          backend: "wasm",
          fallback_triggered: true,
          gpu: {
            adapter: "navigator.gpu unavailable",
            required_features: [],
            limits: {}
          }
        }));
        setCapability((prev) => ({
          ...prev,
          available: false,
          error: "navigator.gpu unavailable"
        }));
        pushLog("Capability probe failed: navigator.gpu unavailable.");
        return null;
      }

      const startedAt = performance.now();

      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
          throw new Error("No GPU adapter returned");
        }

        const adapterInfo = await requestAdapterInfo(adapter);
        const adapterName = (adapterInfo && (adapterInfo.description || adapterInfo.vendor || adapterInfo.architecture)) || "WebGPU adapter";
        const limits = extractLimits(adapter.limits);

        setEnvironment((prev) => ({
          ...prev,
          backend: "webgpu",
          fallback_triggered: false,
          gpu: {
            adapter: adapterName,
            required_features: [],
            limits
          }
        }));
        setCapability((prev) => ({
          ...prev,
          available: true,
          adapter: adapterName,
          initMs: performance.now() - startedAt,
          limits,
          error: ""
        }));
        pushLog(`Capability probe ready: ${adapterName}.`);
        return { adapter, adapterName };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setEnvironment((prev) => ({
          ...prev,
          backend: "wasm",
          fallback_triggered: true,
          gpu: {
            adapter: "unavailable",
            required_features: [],
            limits: {}
          }
        }));
        setCapability((prev) => ({
          ...prev,
          available: false,
          error: message
        }));
        pushLog(`Capability probe failed: ${message}.`);
        return null;
      }
    }

    async function runScene() {
      const capabilityResult = await probeCapability();
      if (!capabilityResult || !canvasRef.current) {
        return;
      }

      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }

      try {
        const adapter = capabilityResult.adapter;
        const device = await adapter.requestDevice();
        const adapterInfo = await requestAdapterInfo(adapter);
        const adapterName = (adapterInfo && (adapterInfo.description || adapterInfo.vendor || adapterInfo.architecture)) || capabilityResult.adapterName;
        const context = canvasRef.current.getContext("webgpu");
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
                vec2<f32>(0.0, 0.68),
                vec2<f32>(-0.66, -0.4),
                vec2<f32>(0.66, -0.4)
              );

              var colors = array<vec3<f32>, 3>(
                vec3<f32>(1.0, 0.48, 0.09),
                vec3<f32>(0.08, 0.62, 0.74),
                vec3<f32>(0.2, 0.6, 0.24)
              );

              let angle = uniforms.time * 0.001;
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

        deviceRef.current = device;
        const frameSamples = [];
        let previous = 0;

        setCapability((prev) => ({
          ...prev,
          available: true,
          adapter: adapterName,
          initMs: prev.initMs,
          features: Array.from(device.features || []),
          limits: extractLimits(device.limits || adapter.limits),
          frameSamples,
          running: true,
          error: ""
        }));

        setEnvironment((prev) => ({
          ...prev,
          backend: "webgpu",
          fallback_triggered: false,
          gpu: {
            adapter: adapterName,
            required_features: Array.from(device.features || []),
            limits: extractLimits(device.limits || adapter.limits)
          }
        }));

        device.lost.then((info) => {
          setCapability((prev) => ({
            ...prev,
            running: false,
            error: info && info.message ? info.message : "GPU device lost"
          }));
          pushLog("React scene stopped: GPU device lost.");
        });

        const renderFrame = (timestamp) => {
          if (previous !== 0) {
            frameSamples.push(timestamp - previous);
          }
          previous = timestamp;

          const uniforms = new Float32Array([timestamp, 0, 0, 0]);
          device.queue.writeBuffer(uniformBuffer, 0, uniforms);

          const encoder = device.createCommandEncoder();
          const pass = encoder.beginRenderPass({
            colorAttachments: [
              {
                view: context.getCurrentTexture().createView(),
                clearValue: {
                  r: 0.98,
                  g: 0.95 - ((Math.sin(timestamp * 0.0005) + 1) * 0.03),
                  b: 0.9 - ((Math.cos(timestamp * 0.0007) + 1) * 0.04),
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

          if (frameSamples.length % 20 === 0) {
            setCapability((prev) => ({
              ...prev,
              frameSamples: [...frameSamples]
            }));
          }

          animationRef.current = requestAnimationFrame(renderFrame);
        };

        animationRef.current = requestAnimationFrame(renderFrame);
        pushLog(`React scene started on ${adapterName}.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setCapability((prev) => ({
          ...prev,
          running: false,
          error: message
        }));
        setEnvironment((prev) => ({
          ...prev,
          backend: "wasm",
          fallback_triggered: true
        }));
        pushLog(`React scene failed: ${message}.`);
      }
    }

    function downloadJson() {
      const avgFrameMs = average(capability.frameSamples);
      const avgFps = avgFrameMs ? 1000 / avgFrameMs : 0;
      const result = {
        meta: {
          repo: "tpl-webgpu-react",
          commit: "bootstrap-generated",
          timestamp: new Date().toISOString(),
          owner: "ai-webgpu-lab",
          track: "infra",
          scenario: "react-webgpu-starter",
          notes: capability.available
            ? "No-build React starter with capability panel and canvas mount flow."
            : `React starter fallback path. Last error: ${capability.error || "navigator.gpu unavailable"}`
        },
        environment,
        workload: {
          kind: "graphics",
          name: "react-webgpu-canvas",
          input_profile: "react-no-build-static",
          renderer: "react-plus-raw-webgpu",
          resolution: "960x540"
        },
        metrics: {
          common: {
            time_to_interactive_ms: round(performance.now() - startedAtRef.current, 2) || 0,
            init_ms: round(capability.initMs || 0, 2) || 0,
            success_rate: capability.available ? 1 : 0,
            peak_memory_note: navigator.deviceMemory ? `${navigator.deviceMemory} GB reported by browser` : "deviceMemory unavailable",
            error_type: capability.error || ""
          },
          graphics: {
            avg_fps: round(avgFps, 2) || 0,
            p95_frametime_ms: round(percentile(capability.frameSamples, 0.95) || 0, 2) || 0,
            scene_load_ms: round(capability.initMs || 0, 2) || 0,
            resolution_scale: 1,
            taa_enabled: false,
            visual_artifact_note: capability.available ? "React shell mounted successfully and WebGPU scene rendered." : "Fallback only"
          }
        },
        status: capability.available ? "success" : "partial",
        artifacts: {
          raw_logs: logs.slice(0, 5),
          deploy_url: "https://ai-webgpu-lab.github.io/tpl-webgpu-react/"
        }
      };

      const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "tpl-webgpu-react-baseline.json";
      anchor.click();
      URL.revokeObjectURL(url);
      pushLog("Downloaded React starter baseline JSON draft.");
    }

    const avgFrameMs = average(capability.frameSamples);
    const avgFps = avgFrameMs ? 1000 / avgFrameMs : null;
    const p95Frame = percentile(capability.frameSamples, 0.95);
    const summary = !("gpu" in navigator)
      ? "This browser does not expose navigator.gpu. The React shell still exports a fallback JSON draft."
      : capability.running
        ? "React shell and WebGPU scene are running. Let the animation settle, then export the result draft."
        : capability.available
          ? "Capability probe succeeded. Start the React scene to validate canvas mount flow and frame pacing."
          : capability.error
            ? `Last WebGPU attempt failed: ${capability.error}`
            : "Run the capability probe first. This template keeps React in the loop without requiring a build step.";

    const badges = !("gpu" in navigator)
      ? [
          { tone: "danger", text: "WebGPU unavailable" },
          { tone: "warn", text: "Fallback only" }
        ]
      : capability.running
        ? [
            { tone: "success", text: "React mounted" },
            { tone: "success", text: "Scene running" }
          ]
        : capability.available
          ? [
              { tone: "success", text: "Capability ready" },
              { tone: "warn", text: "Scene idle" }
            ]
          : [
              { tone: capability.error ? "danger" : "warn", text: capability.error ? "Probe failed" : "Capability pending" },
              { tone: "warn", text: "Scene pending" }
            ];

    const metrics = [
      ["TTI", `${round(performance.now() - startedAtRef.current, 1) || 0} ms`],
      ["Init", capability.initMs ? `${round(capability.initMs, 1)} ms` : "pending"],
      ["Adapter", capability.adapter || "pending"],
      ["Avg FPS", avgFps ? `${round(avgFps, 1)} fps` : "pending"],
      ["P95 Frame", p95Frame ? `${round(p95Frame, 2)} ms` : "pending"],
      ["Features", capability.features.length ? String(capability.features.length) : "pending"]
    ];

    const environmentCards = [
      ["Browser", `${environment.browser.name} ${environment.browser.version}`],
      ["OS", `${environment.os.name} ${environment.os.version}`],
      ["Device", environment.device.class],
      ["CPU", environment.device.cpu],
      ["Memory", environment.device.memory_gb ? `${environment.device.memory_gb} GB` : "unknown"],
      ["Backend", environment.backend],
      ["Adapter", environment.gpu.adapter],
      ["Limits", Object.keys(environment.gpu.limits || {}).length ? JSON.stringify(environment.gpu.limits) : "pending"]
    ];

    return h(
      "main",
      null,
      h("div", { className: "eyebrow" }, "AI WebGPU Lab Template"),
      h("h1", null, "React WebGPU Starter"),
      h("p", null, "`tpl-webgpu-react` keeps the bootstrap surface static while proving a React mount path, capability panel, and live WebGPU canvas sample without a bundler."),
      h("p", null, "This is the repo-specific baseline for React experiments until the repository graduates to a build-driven workflow."),
      h(
        "section",
        { className: "grid hero" },
        h(
          "article",
          { className: "stack" },
          h(
            "section",
            { className: "panel" },
            h("h2", null, "Starter Controls"),
            h("div", { className: "status-row" }, badges.map((badge) => h("span", { key: badge.text, className: `badge ${badge.tone}` }, badge.text))),
            h("p", null, summary),
            h(
              "div",
              { className: "actions" },
              h("button", { type: "button", onClick: probeCapability }, "Probe Capability"),
              h("button", { type: "button", onClick: runScene }, "Start React Scene"),
              h("button", { type: "button", className: "secondary", onClick: downloadJson }, "Download JSON"),
              h("button", { type: "button", className: "secondary", onClick: resetState }, "Reset")
            )
          ),
          h(
            "section",
            { className: "panel" },
            h("h2", null, "React Template Guidance"),
            h(
              "ul",
              null,
              h("li", null, "Use this when a downstream repo needs React state and rendering from day one."),
              h("li", null, "Keep the no-build static surface only until a real install/build/deploy flow is ready."),
              h("li", null, "Promote the exported JSON into reports/raw after validating browser, adapter, and frame pacing details.")
            )
          )
        ),
        h(
          "article",
          { className: "stack" },
          h(
            "section",
            { className: "panel" },
            h("h2", null, "React Canvas Surface"),
            h("canvas", { ref: canvasRef, width: 960, height: 540, "aria-label": "React WebGPU starter canvas" })
          ),
          h(
            "section",
            { className: "panel" },
            h("h2", null, "Metrics"),
            h(
              "div",
              { className: "metric-grid" },
              metrics.map(([label, value]) =>
                h(
                  "article",
                  { key: label, className: "card" },
                  h("span", { className: "label" }, label),
                  h("div", { className: "value" }, value)
                )
              )
            )
          )
        )
      ),
      h(
        "section",
        { className: "panel" },
        h("h2", null, "Environment Snapshot"),
        h(
          "div",
          { className: "meta-grid" },
          environmentCards.map(([label, value]) =>
            h(
              "article",
              { key: label, className: "card" },
              h("span", { className: "label" }, label),
              h("div", { className: "value" }, value)
            )
          )
        )
      ),
      h(
        "section",
        { className: "grid hero" },
        h(
          "article",
          { className: "panel" },
          h("h2", null, "Activity Log"),
          h(
            "ul",
            null,
            logs.length ? logs.map((entry) => h("li", { key: entry }, entry)) : h("li", null, "No activity yet.")
          )
        ),
        h(
          "article",
          { className: "panel" },
          h("h2", null, "Schema-Aligned Result Draft"),
          h(
            "pre",
            null,
            JSON.stringify(
              {
                meta: {
                  repo: "tpl-webgpu-react",
                  track: "infra",
                  scenario: "react-webgpu-starter"
                },
                environment,
                summary: {
                  available: capability.available,
                  running: capability.running,
                  adapter: capability.adapter || "pending",
                  avg_fps: avgFps ? round(avgFps, 2) : null
                }
              },
              null,
              2
            )
          )
        )
      ),
      h(
        "div",
        { className: "links" },
        h("a", { className: "button", href: "https://github.com/ai-webgpu-lab/tpl-webgpu-react" }, "Open Repository"),
        h("a", { className: "button secondary", href: "https://github.com/ai-webgpu-lab/tpl-webgpu-react/blob/main/README.md" }, "Read README"),
        h("a", { className: "button secondary", href: "https://github.com/ai-webgpu-lab/tpl-webgpu-react/blob/main/RESULTS.md" }, "View Results")
      )
    );
  }

  ReactDOM.createRoot(document.getElementById("app-root")).render(h(App));
})();
