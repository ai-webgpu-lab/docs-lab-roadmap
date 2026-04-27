// Real diffusion shootout benchmark sketch for bench-diffusion-browser-shootout.
//
// Gated by ?mode=real-diffusion-bench. Default deterministic harness path is
// untouched. `loadBenchmarkAndRuntime` is parameterized so tests can inject stubs.

const DEFAULT_BENCHMARK_VERSION = "2.1.4";
const DEFAULT_BENCHMARK_CDN = (version) => `https://esm.sh/benchmark@${version}`;
const DEFAULT_TRANSFORMERS_VERSION = "3.0.0";
const DEFAULT_TRANSFORMERS_CDN = (version) => `https://esm.sh/@huggingface/transformers@${version}`;

export async function loadBenchmarkAndRuntime({
  benchmarkVersion = DEFAULT_BENCHMARK_VERSION,
  transformersVersion = DEFAULT_TRANSFORMERS_VERSION
} = {}) {
  const [benchmarkModule, transformers] = await Promise.all([
    import(/* @vite-ignore */ DEFAULT_BENCHMARK_CDN(benchmarkVersion)),
    import(/* @vite-ignore */ DEFAULT_TRANSFORMERS_CDN(transformersVersion))
  ]);
  const Benchmark = benchmarkModule.default || benchmarkModule.Benchmark || benchmarkModule;
  if (!Benchmark) throw new Error("benchmark module missing Benchmark export");
  if (!transformers || typeof transformers.pipeline !== "function") {
    throw new Error("transformers module missing pipeline()");
  }
  return { Benchmark, transformers, pipeline: transformers.pipeline };
}

export function buildRealDiffusionBenchAdapter({
  Benchmark,
  pipeline,
  benchmarkVersion = DEFAULT_BENCHMARK_VERSION,
  transformersVersion = DEFAULT_TRANSFORMERS_VERSION,
  suiteId = "diffusion-browser-shootout"
}) {
  if (!Benchmark) throw new Error("buildRealDiffusionBenchAdapter requires Benchmark");
  if (typeof pipeline !== "function") throw new Error("buildRealDiffusionBenchAdapter requires a callable pipeline");
  const id = `bench-diffusion-${suiteId}-${benchmarkVersion.replace(/[^0-9]/g, "")}-${transformersVersion.replace(/[^0-9]/g, "")}`;
  let suite = null;
  let profileResults = [];
  const runtimeCache = new Map();

  return {
    id,
    label: `Diffusion shootout bench (benchmark.js ${benchmarkVersion} + Transformers.js ${transformersVersion})`,
    version: benchmarkVersion,
    capabilities: ["profile-comparison", "winner-selection", "real-benchmark", "diffusion-image"],
    benchmarkType: "diffusion-browser-shootout",
    isReal: true,
    async createBenchmark({ name = suiteId } = {}) {
      const SuiteCtor = Benchmark.Suite || (typeof Benchmark === "function" ? Benchmark.Suite : null);
      if (!SuiteCtor) throw new Error("Benchmark.Suite not available");
      suite = new SuiteCtor(name);
      profileResults = [];
      runtimeCache.clear();
      return suite;
    },
    async runProfile({ profileId, modelId, prompt, steps = 4, height = 256, width = 256 } = {}) {
      if (!suite) throw new Error("createBenchmark() must run before runProfile()");
      if (!profileId || !modelId) throw new Error("runProfile requires profileId and modelId");
      let runtime = runtimeCache.get(modelId);
      if (!runtime) {
        runtime = await pipeline("text-to-image", modelId, { device: "webgpu", dtype: "fp16" });
        runtimeCache.set(modelId, runtime);
      }
      const startedAt = performance.now();
      const output = await runtime(prompt || "a serene blackhole observatory", {
        num_inference_steps: steps,
        guidance_scale: 1.0,
        height,
        width
      });
      const elapsedMs = performance.now() - startedAt;
      const image = Array.isArray(output) ? output[0] : output;
      const widthPx = image && image.width ? image.width : width;
      const heightPx = image && image.height ? image.height : height;
      const sample = {
        profileId,
        modelId,
        elapsedMs,
        secPerImage: elapsedMs / 1000,
        stepsPerSec: steps / Math.max(elapsedMs / 1000, 0.001),
        widthPx,
        heightPx
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

export async function connectRealDiffusionBench({
  registry = typeof window !== "undefined" ? window.__aiWebGpuLabBenchmarkRegistry : null,
  loader = loadBenchmarkAndRuntime,
  benchmarkVersion = DEFAULT_BENCHMARK_VERSION,
  transformersVersion = DEFAULT_TRANSFORMERS_VERSION,
  suiteId = "diffusion-browser-shootout"
} = {}) {
  if (!registry) throw new Error("benchmark registry not available");
  const { Benchmark, pipeline } = await loader({ benchmarkVersion, transformersVersion });
  const adapter = buildRealDiffusionBenchAdapter({ Benchmark, pipeline, benchmarkVersion, transformersVersion, suiteId });
  registry.register(adapter);
  return { adapter, Benchmark, pipeline };
}

if (typeof window !== "undefined" && window.location && typeof window.location.search === "string") {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "real-diffusion-bench" && !window.__aiWebGpuLabRealDiffusionBenchBootstrapping) {
    window.__aiWebGpuLabRealDiffusionBenchBootstrapping = true;
    connectRealDiffusionBench().catch((error) => {
      console.warn(`[real-diffusion-bench] bootstrap failed: ${error.message}`);
      window.__aiWebGpuLabRealDiffusionBenchBootstrapError = error.message;
    });
  }
}
