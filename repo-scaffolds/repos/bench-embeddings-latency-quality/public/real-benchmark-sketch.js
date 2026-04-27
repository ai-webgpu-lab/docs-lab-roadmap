// Real embeddings latency/quality benchmark sketch for bench-embeddings-latency-quality.
//
// Gated by ?mode=real-embeddings-bench. Default deterministic harness path is
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

export function buildRealEmbeddingsBenchAdapter({
  Benchmark,
  pipeline,
  benchmarkVersion = DEFAULT_BENCHMARK_VERSION,
  transformersVersion = DEFAULT_TRANSFORMERS_VERSION,
  suiteId = "embeddings-latency-quality"
}) {
  if (!Benchmark) throw new Error("buildRealEmbeddingsBenchAdapter requires Benchmark");
  if (typeof pipeline !== "function") throw new Error("buildRealEmbeddingsBenchAdapter requires a callable pipeline");
  const id = `bench-embeddings-${suiteId}-${benchmarkVersion.replace(/[^0-9]/g, "")}-${transformersVersion.replace(/[^0-9]/g, "")}`;
  let suite = null;
  let profileResults = [];
  const runtimeCache = new Map();

  return {
    id,
    label: `Embeddings latency/quality bench (benchmark.js ${benchmarkVersion} + Transformers.js ${transformersVersion})`,
    version: benchmarkVersion,
    capabilities: ["profile-comparison", "winner-selection", "real-benchmark", "embeddings-quality"],
    benchmarkType: "embeddings-latency-quality",
    isReal: true,
    async createBenchmark({ name = suiteId } = {}) {
      const SuiteCtor = Benchmark.Suite || (typeof Benchmark === "function" ? Benchmark.Suite : null);
      if (!SuiteCtor) throw new Error("Benchmark.Suite not available");
      suite = new SuiteCtor(name);
      profileResults = [];
      runtimeCache.clear();
      return suite;
    },
    async runProfile({ profileId, modelId, query, candidates = [] } = {}) {
      if (!suite) throw new Error("createBenchmark() must run before runProfile()");
      if (!profileId || !modelId) throw new Error("runProfile requires profileId and modelId");
      let runtime = runtimeCache.get(modelId);
      if (!runtime) {
        runtime = await pipeline("feature-extraction", modelId, { device: "webgpu", dtype: "fp32" });
        runtimeCache.set(modelId, runtime);
      }
      const startedAt = performance.now();
      let count = 0;
      let dimensions = 0;
      for (const text of [query, ...candidates]) {
        const output = await runtime(String(text || ""), { pooling: "mean", normalize: true });
        if (output && output.dims) dimensions = output.dims[output.dims.length - 1] || dimensions;
        count += 1;
      }
      const elapsedMs = performance.now() - startedAt;
      const sample = { profileId, modelId, elapsedMs, embeddingsPerSec: count / Math.max(elapsedMs / 1000, 0.001), dimensions };
      profileResults.push(sample);
      return sample;
    },
    async aggregateResults() {
      if (!profileResults.length) return { profileCount: 0, winner: null, samples: [] };
      const sorted = [...profileResults].sort((left, right) => right.embeddingsPerSec - left.embeddingsPerSec);
      return { profileCount: sorted.length, winner: sorted[0].profileId, samples: sorted };
    }
  };
}

export async function connectRealEmbeddingsBench({
  registry = typeof window !== "undefined" ? window.__aiWebGpuLabBenchmarkRegistry : null,
  loader = loadBenchmarkAndRuntime,
  benchmarkVersion = DEFAULT_BENCHMARK_VERSION,
  transformersVersion = DEFAULT_TRANSFORMERS_VERSION,
  suiteId = "embeddings-latency-quality"
} = {}) {
  if (!registry) throw new Error("benchmark registry not available");
  const { Benchmark, pipeline } = await loader({ benchmarkVersion, transformersVersion });
  const adapter = buildRealEmbeddingsBenchAdapter({ Benchmark, pipeline, benchmarkVersion, transformersVersion, suiteId });
  registry.register(adapter);
  return { adapter, Benchmark, pipeline };
}

if (typeof window !== "undefined" && window.location && typeof window.location.search === "string") {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "real-embeddings-bench" && !window.__aiWebGpuLabRealEmbeddingsBenchBootstrapping) {
    window.__aiWebGpuLabRealEmbeddingsBenchBootstrapping = true;
    connectRealEmbeddingsBench().catch((error) => {
      console.warn(`[real-embeddings-bench] bootstrap failed: ${error.message}`);
      window.__aiWebGpuLabRealEmbeddingsBenchBootstrapError = error.message;
    });
  }
}
