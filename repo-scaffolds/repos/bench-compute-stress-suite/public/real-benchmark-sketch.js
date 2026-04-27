// Real compute stress suite benchmark sketch for bench-compute-stress-suite.
//
// Gated by ?mode=real-compute-bench. Default deterministic harness path is
// untouched. `loadBenchmarkAndDevice` is parameterized so tests can inject stubs.

const DEFAULT_BENCHMARK_VERSION = "2.1.4";
const DEFAULT_BENCHMARK_CDN = (version) => `https://esm.sh/benchmark@${version}`;

const SHADERS = {
  nbody: /* wgsl */ `
    struct Body { position: vec3<f32>, velocity: vec3<f32> };
    @group(0) @binding(0) var<storage, read_write> bodies : array<Body>;
    @compute @workgroup_size(64)
    fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
      let index = gid.x;
      if (index >= arrayLength(&bodies)) { return; }
      var body = bodies[index];
      let r = max(length(body.position), 0.05);
      body.velocity = body.velocity + (-body.position / (r * r * r)) * 0.001;
      body.position = body.position + body.velocity;
      bodies[index] = body;
    }
  `,
  fluid: /* wgsl */ `
    struct Particle { position: vec2<f32>, velocity: vec2<f32>, pressure: f32, density: f32 };
    @group(0) @binding(0) var<storage, read_write> particles : array<Particle>;
    @compute @workgroup_size(64)
    fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
      let index = gid.x;
      if (index >= arrayLength(&particles)) { return; }
      var p = particles[index];
      p.velocity = p.velocity + vec2<f32>(0.0, -0.001) - p.position * 0.0002;
      p.position = p.position + p.velocity;
      particles[index] = p;
    }
  `
};

export async function loadBenchmarkAndDevice({
  benchmarkVersion = DEFAULT_BENCHMARK_VERSION,
  navigatorGpu = (typeof navigator !== "undefined" ? navigator.gpu : null)
} = {}) {
  if (!navigatorGpu) throw new Error("navigator.gpu unavailable");
  const benchmarkModule = await import(/* @vite-ignore */ DEFAULT_BENCHMARK_CDN(benchmarkVersion));
  const Benchmark = benchmarkModule.default || benchmarkModule.Benchmark || benchmarkModule;
  if (!Benchmark) throw new Error("benchmark module missing Benchmark export");
  const adapter = await navigatorGpu.requestAdapter();
  if (!adapter) throw new Error("no GPU adapter available");
  const device = await adapter.requestDevice();
  return { Benchmark, adapter, device };
}

export function buildRealComputeBenchAdapter({
  Benchmark,
  device,
  benchmarkVersion = DEFAULT_BENCHMARK_VERSION,
  suiteId = "compute-stress-suite"
}) {
  if (!Benchmark) throw new Error("buildRealComputeBenchAdapter requires Benchmark");
  if (!device || typeof device.createShaderModule !== "function") throw new Error("buildRealComputeBenchAdapter requires a GPUDevice");
  const id = `bench-compute-${suiteId}-${benchmarkVersion.replace(/[^0-9]/g, "")}`;
  let suite = null;
  let profileResults = [];
  const pipelineCache = new Map();

  function ensurePipeline(kernel) {
    if (pipelineCache.has(kernel)) return pipelineCache.get(kernel);
    const code = SHADERS[kernel];
    if (!code) throw new Error(`unknown kernel '${kernel}' (expected one of: ${Object.keys(SHADERS).join(", ")})`);
    const module = device.createShaderModule({ code });
    const pipeline = device.createComputePipeline({ layout: "auto", compute: { module, entryPoint: "main" } });
    pipelineCache.set(kernel, pipeline);
    return pipeline;
  }

  return {
    id,
    label: `Compute stress suite bench (benchmark.js ${benchmarkVersion} + raw WebGPU)`,
    version: benchmarkVersion,
    capabilities: ["profile-comparison", "winner-selection", "real-benchmark", "compute-dispatch", "kernel-suite"],
    benchmarkType: "compute-stress-suite",
    isReal: true,
    async createBenchmark({ name = suiteId } = {}) {
      const SuiteCtor = Benchmark.Suite || (typeof Benchmark === "function" ? Benchmark.Suite : null);
      if (!SuiteCtor) throw new Error("Benchmark.Suite not available");
      suite = new SuiteCtor(name);
      profileResults = [];
      pipelineCache.clear();
      return suite;
    },
    async runProfile({ profileId, kernel, count = 1024, dispatches = 32 } = {}) {
      if (!suite) throw new Error("createBenchmark() must run before runProfile()");
      if (!profileId || !kernel) throw new Error("runProfile requires profileId and kernel");
      const pipeline = ensurePipeline(kernel);
      const stride = kernel === "fluid" ? 24 : 32;
      const buffer = device.createBuffer({ size: stride * count, usage: 0x80 | 0x40 | 0x08 });
      const layout = pipeline.getBindGroupLayout(0);
      const bindGroup = device.createBindGroup({ layout, entries: [{ binding: 0, resource: { buffer } }] });
      const startedAt = performance.now();
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      const workgroups = Math.ceil(count / 64);
      for (let step = 0; step < dispatches; step += 1) {
        pass.dispatchWorkgroups(workgroups);
      }
      pass.end();
      device.queue.submit([encoder.finish()]);
      const elapsedMs = performance.now() - startedAt;
      const sample = {
        profileId,
        kernel,
        count,
        dispatches,
        workgroups,
        elapsedMs,
        stepsPerSec: dispatches / Math.max(elapsedMs / 1000, 0.001)
      };
      profileResults.push(sample);
      return sample;
    },
    async aggregateResults() {
      if (!profileResults.length) return { profileCount: 0, winner: null, samples: [] };
      const sorted = [...profileResults].sort((left, right) => right.stepsPerSec - left.stepsPerSec);
      return { profileCount: sorted.length, winner: sorted[0].profileId, samples: sorted };
    }
  };
}

export async function connectRealComputeBench({
  registry = typeof window !== "undefined" ? window.__aiWebGpuLabBenchmarkRegistry : null,
  loader = loadBenchmarkAndDevice,
  benchmarkVersion = DEFAULT_BENCHMARK_VERSION,
  suiteId = "compute-stress-suite"
} = {}) {
  if (!registry) throw new Error("benchmark registry not available");
  const { Benchmark, device } = await loader({ benchmarkVersion });
  const adapter = buildRealComputeBenchAdapter({ Benchmark, device, benchmarkVersion, suiteId });
  registry.register(adapter);
  return { adapter, Benchmark, device };
}

if (typeof window !== "undefined" && window.location && typeof window.location.search === "string") {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "real-compute-bench" && !window.__aiWebGpuLabRealComputeBenchBootstrapping) {
    window.__aiWebGpuLabRealComputeBenchBootstrapping = true;
    connectRealComputeBench().catch((error) => {
      console.warn(`[real-compute-bench] bootstrap failed: ${error.message}`);
      window.__aiWebGpuLabRealComputeBenchBootstrapError = error.message;
    });
  }
}
