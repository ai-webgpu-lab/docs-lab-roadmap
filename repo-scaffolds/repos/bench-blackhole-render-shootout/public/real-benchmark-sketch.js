// Real blackhole render shootout benchmark sketch for bench-blackhole-render-shootout.
//
// Gated by ?mode=real-blackhole-bench. Default deterministic harness path is
// untouched. `loadBenchmarkAndDevice` is parameterized so tests can inject stubs.

const DEFAULT_BENCHMARK_VERSION = "2.1.4";
const DEFAULT_BENCHMARK_CDN = (version) => `https://esm.sh/benchmark@${version}`;

const GEODESIC_SHADER = /* wgsl */ `
struct Geodesic {
  position : vec3<f32>,
  direction : vec3<f32>,
  affine    : f32,
};
@group(0) @binding(0) var<storage, read_write> geodesics : array<Geodesic>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let index = gid.x;
  if (index >= arrayLength(&geodesics)) { return; }
  var g = geodesics[index];
  let r = max(length(g.position), 0.05);
  let pull = -g.position / (r * r * r);
  g.direction = g.direction + pull * 0.05;
  g.position = g.position + g.direction * 0.05;
  g.affine = g.affine + 0.05;
  geodesics[index] = g;
}
`;

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

export function buildRealBlackholeBenchAdapter({
  Benchmark,
  device,
  benchmarkVersion = DEFAULT_BENCHMARK_VERSION,
  suiteId = "blackhole-render-shootout"
}) {
  if (!Benchmark) throw new Error("buildRealBlackholeBenchAdapter requires Benchmark");
  if (!device || typeof device.createShaderModule !== "function") throw new Error("buildRealBlackholeBenchAdapter requires a GPUDevice");
  const id = `bench-blackhole-${suiteId}-${benchmarkVersion.replace(/[^0-9]/g, "")}`;
  let suite = null;
  let profileResults = [];
  let pipeline = null;

  function ensurePipeline() {
    if (pipeline) return pipeline;
    const module = device.createShaderModule({ code: GEODESIC_SHADER });
    pipeline = device.createComputePipeline({ layout: "auto", compute: { module, entryPoint: "main" } });
    return pipeline;
  }

  return {
    id,
    label: `Blackhole render shootout bench (benchmark.js ${benchmarkVersion} + raw WebGPU)`,
    version: benchmarkVersion,
    capabilities: ["profile-comparison", "winner-selection", "real-benchmark", "compute-dispatch", "ray-step-budget"],
    benchmarkType: "blackhole-render-shootout",
    isReal: true,
    async createBenchmark({ name = suiteId } = {}) {
      const SuiteCtor = Benchmark.Suite || (typeof Benchmark === "function" ? Benchmark.Suite : null);
      if (!SuiteCtor) throw new Error("Benchmark.Suite not available");
      suite = new SuiteCtor(name);
      profileResults = [];
      pipeline = null;
      return suite;
    },
    async runProfile({ profileId, geodesicCount = 4096, rayStepBudget = 96 } = {}) {
      if (!suite) throw new Error("createBenchmark() must run before runProfile()");
      if (!profileId) throw new Error("runProfile requires profileId");
      const activePipeline = ensurePipeline();
      const buffer = device.createBuffer({ size: 32 * geodesicCount, usage: 0x80 | 0x40 | 0x08 });
      const layout = activePipeline.getBindGroupLayout(0);
      const bindGroup = device.createBindGroup({ layout, entries: [{ binding: 0, resource: { buffer } }] });
      const startedAt = performance.now();
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setPipeline(activePipeline);
      pass.setBindGroup(0, bindGroup);
      const workgroups = Math.ceil(geodesicCount / 64);
      for (let step = 0; step < rayStepBudget; step += 1) {
        pass.dispatchWorkgroups(workgroups);
      }
      pass.end();
      device.queue.submit([encoder.finish()]);
      const elapsedMs = performance.now() - startedAt;
      const sample = {
        profileId,
        geodesicCount,
        rayStepBudget,
        elapsedMs,
        workgroups,
        dispatchPerSec: (rayStepBudget * workgroups) / Math.max(elapsedMs / 1000, 0.001)
      };
      profileResults.push(sample);
      return sample;
    },
    async aggregateResults() {
      if (!profileResults.length) return { profileCount: 0, winner: null, samples: [] };
      const sorted = [...profileResults].sort((left, right) => right.dispatchPerSec - left.dispatchPerSec);
      return { profileCount: sorted.length, winner: sorted[0].profileId, samples: sorted };
    }
  };
}

export async function connectRealBlackholeBench({
  registry = typeof window !== "undefined" ? window.__aiWebGpuLabBenchmarkRegistry : null,
  loader = loadBenchmarkAndDevice,
  benchmarkVersion = DEFAULT_BENCHMARK_VERSION,
  suiteId = "blackhole-render-shootout"
} = {}) {
  if (!registry) throw new Error("benchmark registry not available");
  const { Benchmark, device } = await loader({ benchmarkVersion });
  const adapter = buildRealBlackholeBenchAdapter({ Benchmark, device, benchmarkVersion, suiteId });
  registry.register(adapter);
  return { adapter, Benchmark, device };
}

if (typeof window !== "undefined" && window.location && typeof window.location.search === "string") {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "real-blackhole-bench" && !window.__aiWebGpuLabRealBlackholeBenchBootstrapping) {
    window.__aiWebGpuLabRealBlackholeBenchBootstrapping = true;
    connectRealBlackholeBench().catch((error) => {
      console.warn(`[real-blackhole-bench] bootstrap failed: ${error.message}`);
      window.__aiWebGpuLabRealBlackholeBenchBootstrapError = error.message;
    });
  }
}
