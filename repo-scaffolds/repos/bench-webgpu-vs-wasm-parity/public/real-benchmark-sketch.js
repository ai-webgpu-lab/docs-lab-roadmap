// Real WebGPU vs Wasm parity benchmark sketch for bench-webgpu-vs-wasm-parity.
//
// Gated by ?mode=real-parity-bench. Default deterministic harness path is
// untouched. `loadBenchmarkAndDevice` is parameterized so tests can inject stubs.
// The adapter computes the same numeric kernel (vector add) on a WebGPU
// compute pipeline and a JS-only reference, then reports max abs error and
// relative error.

const DEFAULT_BENCHMARK_VERSION = "2.1.4";
const DEFAULT_BENCHMARK_CDN = (version) => `https://esm.sh/benchmark@${version}`;

const VECTOR_ADD_SHADER = /* wgsl */ `
@group(0) @binding(0) var<storage, read> a : array<f32>;
@group(0) @binding(1) var<storage, read> b : array<f32>;
@group(0) @binding(2) var<storage, read_write> c : array<f32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let index = gid.x;
  if (index >= arrayLength(&a)) { return; }
  c[index] = a[index] + b[index];
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

function jsVectorAdd(a, b) {
  const out = new Float32Array(a.length);
  for (let index = 0; index < a.length; index += 1) {
    out[index] = a[index] + b[index];
  }
  return out;
}

export function buildRealParityBenchAdapter({
  Benchmark,
  device,
  benchmarkVersion = DEFAULT_BENCHMARK_VERSION,
  suiteId = "webgpu-vs-wasm-parity"
}) {
  if (!Benchmark) throw new Error("buildRealParityBenchAdapter requires Benchmark");
  if (!device || typeof device.createShaderModule !== "function") throw new Error("buildRealParityBenchAdapter requires a GPUDevice");
  const id = `bench-parity-${suiteId}-${benchmarkVersion.replace(/[^0-9]/g, "")}`;
  let suite = null;
  let profileResults = [];
  let pipeline = null;

  function ensurePipeline() {
    if (pipeline) return pipeline;
    const module = device.createShaderModule({ code: VECTOR_ADD_SHADER });
    pipeline = device.createComputePipeline({ layout: "auto", compute: { module, entryPoint: "main" } });
    return pipeline;
  }

  return {
    id,
    label: `WebGPU vs Wasm parity bench (benchmark.js ${benchmarkVersion} + raw WebGPU)`,
    version: benchmarkVersion,
    capabilities: ["profile-comparison", "winner-selection", "real-benchmark", "numeric-parity"],
    benchmarkType: "webgpu-vs-wasm-parity",
    isReal: true,
    async createBenchmark({ name = suiteId } = {}) {
      const SuiteCtor = Benchmark.Suite || (typeof Benchmark === "function" ? Benchmark.Suite : null);
      if (!SuiteCtor) throw new Error("Benchmark.Suite not available");
      suite = new SuiteCtor(name);
      profileResults = [];
      pipeline = null;
      return suite;
    },
    async runProfile({ profileId, vectorSize = 4096, generator = (i) => Math.sin(i * 0.001), referenceImpl = jsVectorAdd } = {}) {
      if (!suite) throw new Error("createBenchmark() must run before runProfile()");
      if (!profileId) throw new Error("runProfile requires profileId");
      const a = new Float32Array(vectorSize);
      const b = new Float32Array(vectorSize);
      for (let index = 0; index < vectorSize; index += 1) {
        a[index] = generator(index);
        b[index] = generator(index + 1);
      }
      const expected = referenceImpl(a, b);
      const activePipeline = ensurePipeline();
      const aBuffer = device.createBuffer({ size: 4 * vectorSize, usage: 0x80 | 0x04 | 0x08 });
      const bBuffer = device.createBuffer({ size: 4 * vectorSize, usage: 0x80 | 0x04 | 0x08 });
      const cBuffer = device.createBuffer({ size: 4 * vectorSize, usage: 0x80 | 0x04 | 0x08 });
      device.queue.writeBuffer(aBuffer, 0, a);
      device.queue.writeBuffer(bBuffer, 0, b);
      const layout = activePipeline.getBindGroupLayout(0);
      const bindGroup = device.createBindGroup({
        layout,
        entries: [
          { binding: 0, resource: { buffer: aBuffer } },
          { binding: 1, resource: { buffer: bBuffer } },
          { binding: 2, resource: { buffer: cBuffer } }
        ]
      });
      const startedAt = performance.now();
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setPipeline(activePipeline);
      pass.setBindGroup(0, bindGroup);
      pass.dispatchWorkgroups(Math.ceil(vectorSize / 64));
      pass.end();
      device.queue.submit([encoder.finish()]);
      let actual = null;
      if (typeof device.readBuffer === "function") {
        actual = await device.readBuffer(cBuffer, 0, 4 * vectorSize);
      }
      const elapsedMs = performance.now() - startedAt;
      let maxAbsError = 0;
      let maxRelError = 0;
      if (actual && actual.length === expected.length) {
        for (let index = 0; index < expected.length; index += 1) {
          const abs = Math.abs(actual[index] - expected[index]);
          maxAbsError = Math.max(maxAbsError, abs);
          const denom = Math.max(Math.abs(expected[index]), 1e-9);
          maxRelError = Math.max(maxRelError, abs / denom);
        }
      }
      const passRate = actual && actual.length === expected.length && maxAbsError < 1e-4 ? 1 : 0;
      const sample = {
        profileId,
        vectorSize,
        elapsedMs,
        passRate,
        maxAbsError,
        maxRelError,
        actualAvailable: Boolean(actual)
      };
      profileResults.push(sample);
      return sample;
    },
    async aggregateResults() {
      if (!profileResults.length) return { profileCount: 0, winner: null, samples: [] };
      const sorted = [...profileResults].sort((left, right) => left.maxAbsError - right.maxAbsError);
      return { profileCount: sorted.length, winner: sorted[0].profileId, samples: sorted };
    }
  };
}

export async function connectRealParityBench({
  registry = typeof window !== "undefined" ? window.__aiWebGpuLabBenchmarkRegistry : null,
  loader = loadBenchmarkAndDevice,
  benchmarkVersion = DEFAULT_BENCHMARK_VERSION,
  suiteId = "webgpu-vs-wasm-parity"
} = {}) {
  if (!registry) throw new Error("benchmark registry not available");
  const { Benchmark, device } = await loader({ benchmarkVersion });
  const adapter = buildRealParityBenchAdapter({ Benchmark, device, benchmarkVersion, suiteId });
  registry.register(adapter);
  return { adapter, Benchmark, device };
}

if (typeof window !== "undefined" && window.location && typeof window.location.search === "string") {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "real-parity-bench" && !window.__aiWebGpuLabRealParityBenchBootstrapping) {
    window.__aiWebGpuLabRealParityBenchBootstrapping = true;
    connectRealParityBench().catch((error) => {
      console.warn(`[real-parity-bench] bootstrap failed: ${error.message}`);
      window.__aiWebGpuLabRealParityBenchBootstrapError = error.message;
    });
  }
}
