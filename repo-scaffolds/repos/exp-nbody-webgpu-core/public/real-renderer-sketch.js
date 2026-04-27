// Real raw-WebGPU N-body compute integration sketch for exp-nbody-webgpu-core.
//
// Gated by ?mode=real-nbody. Default deterministic harness path is untouched.
// `loadWebGpuFromBrowser` is parameterized so tests can inject a stub instead
// of using navigator.gpu directly.

const NBODY_COMPUTE_SHADER = /* wgsl */ `
struct Body {
  position : vec3<f32>,
  velocity : vec3<f32>,
};

@group(0) @binding(0) var<storage, read_write> bodies : array<Body>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let index = gid.x;
  if (index >= arrayLength(&bodies)) { return; }
  var body = bodies[index];
  let r = max(length(body.position), 0.05);
  let pull = -body.position / (r * r * r) * 0.0008;
  body.velocity = body.velocity + pull;
  body.position = body.position + body.velocity;
  bodies[index] = body;
}
`;

export async function loadWebGpuFromBrowser({ navigatorGpu = (typeof navigator !== "undefined" ? navigator.gpu : null) } = {}) {
  if (!navigatorGpu) {
    throw new Error("navigator.gpu unavailable");
  }
  const adapter = await navigatorGpu.requestAdapter();
  if (!adapter) {
    throw new Error("no GPU adapter available");
  }
  const device = await adapter.requestDevice();
  return { adapter, device };
}

export function buildRealNbodyAdapter({ device, version = "raw-webgpu-1" }) {
  if (!device || typeof device.createShaderModule !== "function") {
    throw new Error("buildRealNbodyAdapter requires a GPUDevice");
  }
  const id = `nbody-rawgpu-${version.replace(/[^0-9]/g, "") || "1"}`;
  let pipeline = null;
  let buffer = null;
  let bodyCount = 0;
  let bindGroup = null;

  return {
    id,
    label: `Raw WebGPU N-body compute (${version})`,
    version,
    capabilities: ["scene-load", "frame-pace", "real-render", "compute-dispatch"],
    backendHint: "webgpu",
    isReal: true,
    async createRenderer() {
      const module = device.createShaderModule({ code: NBODY_COMPUTE_SHADER });
      pipeline = device.createComputePipeline({
        layout: "auto",
        compute: { module, entryPoint: "main" }
      });
      return pipeline;
    },
    async loadScene({ count = 1024 } = {}) {
      if (!pipeline) {
        throw new Error("createRenderer() must run before loadScene()");
      }
      bodyCount = count;
      const bodySize = 32; // 8 floats per body, padded to vec4 alignment
      buffer = device.createBuffer({
        size: bodySize * count,
        usage: 0x80 | 0x40 | 0x08 // STORAGE | COPY_DST | COPY_SRC
      });
      const layout = pipeline.getBindGroupLayout(0);
      bindGroup = device.createBindGroup({
        layout,
        entries: [{ binding: 0, resource: { buffer } }]
      });
      return { buffer, bindGroup, count };
    },
    async renderFrame({ frameIndex = 0 } = {}) {
      if (!pipeline || !buffer || !bindGroup) {
        throw new Error("loadScene() must run before renderFrame()");
      }
      const startedAt = performance.now();
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      const workgroups = Math.ceil(bodyCount / 64);
      pass.dispatchWorkgroups(workgroups);
      pass.end();
      device.queue.submit([encoder.finish()]);
      return { frameMs: performance.now() - startedAt, frameIndex, bodyCount, workgroups };
    }
  };
}

export async function connectRealNbody({
  registry = typeof window !== "undefined" ? window.__aiWebGpuLabRendererRegistry : null,
  loader = loadWebGpuFromBrowser,
  version = "raw-webgpu-1"
} = {}) {
  if (!registry) {
    throw new Error("renderer registry not available");
  }
  const { device } = await loader({});
  const adapter = buildRealNbodyAdapter({ device, version });
  registry.register(adapter);
  return { adapter, device };
}

if (typeof window !== "undefined" && window.location && typeof window.location.search === "string") {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "real-nbody" && !window.__aiWebGpuLabRealNbodyBootstrapping) {
    window.__aiWebGpuLabRealNbodyBootstrapping = true;
    connectRealNbody().catch((error) => {
      console.warn(`[real-nbody] bootstrap failed: ${error.message}`);
      window.__aiWebGpuLabRealNbodyBootstrapError = error.message;
    });
  }
}
