// Real atomics and memory benchmark sketch for bench-atomics-and-memory.
//
// Gated by ?mode=real-atomics-bench. Default deterministic harness path is
// untouched. `loadBenchmarkAndDevice` is parameterized so tests can inject stubs.

const DEFAULT_BENCHMARK_VERSION = "2.1.4";
const DEFAULT_BENCHMARK_CDN = (version) => `https://esm.sh/benchmark@${version}`;

const HISTOGRAM_SHADER = /* wgsl */ `
@group(0) @binding(0) var<storage, read> samples : array<u32>;
@group(0) @binding(1) var<storage, read_write> bins : array<atomic<u32>>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let index = gid.x;
  if (index >= arrayLength(&samples)) { return; }
  let bin = samples[index] % arrayLength(&bins);
  atomicAdd(&bins[bin], 1u);
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

export function buildRealAtomicsBenchAdapter({
  Benchmark,
  device,
  benchmarkVersion = DEFAULT_BENCHMARK_VERSION,
  suiteId = "atomics-and-memory"
}) {
  if (!Benchmark) throw new Error("buildRealAtomicsBenchAdapter requires Benchmark");
  if (!device || typeof device.createShaderModule !== "function") throw new Error("buildRealAtomicsBenchAdapter requires a GPUDevice");
  const id = `bench-atomics-${suiteId}-${benchmarkVersion.replace(/[^0-9]/g, "")}`;
  let suite = null;
  let profileResults = [];
  let pipeline = null;

  function ensurePipeline() {
    if (pipeline) return pipeline;
    const module = device.createShaderModule({ code: HISTOGRAM_SHADER });
    pipeline = device.createComputePipeline({ layout: "auto", compute: { module, entryPoint: "main" } });
    return pipeline;
  }

  return {
    id,
    label: `Atomics and memory bench (benchmark.js ${benchmarkVersion} + raw WebGPU)`,
    version: benchmarkVersion,
    capabilities: ["profile-comparison", "winner-selection", "real-benchmark", "atomics-histogram"],
    benchmarkType: "atomics-and-memory",
    isReal: true,
    async createBenchmark({ name = suiteId } = {}) {
      const SuiteCtor = Benchmark.Suite || (typeof Benchmark === "function" ? Benchmark.Suite : null);
      if (!SuiteCtor) throw new Error("Benchmark.Suite not available");
      suite = new SuiteCtor(name);
      profileResults = [];
      pipeline = null;
      return suite;
    },
    async runProfile({ profileId, sampleCount = 65536, binCount = 256 } = {}) {
      if (!suite) throw new Error("createBenchmark() must run before runProfile()");
      if (!profileId) throw new Error("runProfile requires profileId");
      const activePipeline = ensurePipeline();
      const samplesBuffer = device.createBuffer({ size: 4 * sampleCount, usage: 0x80 | 0x40 | 0x08 });
      const binsBuffer = device.createBuffer({ size: 4 * binCount, usage: 0x80 | 0x40 | 0x08 });
      const layout = activePipeline.getBindGroupLayout(0);
      const bindGroup = device.createBindGroup({
        layout,
        entries: [
          { binding: 0, resource: { buffer: samplesBuffer } },
          { binding: 1, resource: { buffer: binsBuffer } }
        ]
      });
      const startedAt = performance.now();
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setPipeline(activePipeline);
      pass.setBindGroup(0, bindGroup);
      const workgroups = Math.ceil(sampleCount / 64);
      pass.dispatchWorkgroups(workgroups);
      pass.end();
      device.queue.submit([encoder.finish()]);
      const elapsedMs = performance.now() - startedAt;
      const bytesProcessed = sampleCount * 4;
      const sample = {
        profileId,
        sampleCount,
        binCount,
        workgroups,
        elapsedMs,
        memoryBandwidthGbps: (bytesProcessed / 1e9) / Math.max(elapsedMs / 1000, 0.001),
        atomicsPerSec: sampleCount / Math.max(elapsedMs / 1000, 0.001)
      };
      profileResults.push(sample);
      return sample;
    },
    async aggregateResults() {
      if (!profileResults.length) return { profileCount: 0, winner: null, samples: [] };
      const sorted = [...profileResults].sort((left, right) => right.memoryBandwidthGbps - left.memoryBandwidthGbps);
      return { profileCount: sorted.length, winner: sorted[0].profileId, samples: sorted };
    }
  };
}

export async function connectRealAtomicsBench({
  registry = typeof window !== "undefined" ? window.__aiWebGpuLabBenchmarkRegistry : null,
  loader = loadBenchmarkAndDevice,
  benchmarkVersion = DEFAULT_BENCHMARK_VERSION,
  suiteId = "atomics-and-memory"
} = {}) {
  if (!registry) throw new Error("benchmark registry not available");
  const { Benchmark, device } = await loader({ benchmarkVersion });
  const adapter = buildRealAtomicsBenchAdapter({ Benchmark, device, benchmarkVersion, suiteId });
  registry.register(adapter);
  return { adapter, Benchmark, device };
}

if (typeof window !== "undefined" && window.location && typeof window.location.search === "string") {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "real-atomics-bench" && !window.__aiWebGpuLabRealAtomicsBenchBootstrapping) {
    window.__aiWebGpuLabRealAtomicsBenchBootstrapping = true;
    connectRealAtomicsBench().catch((error) => {
      console.warn(`[real-atomics-bench] bootstrap failed: ${error.message}`);
      window.__aiWebGpuLabRealAtomicsBenchBootstrapError = error.message;
    });
  }
}
