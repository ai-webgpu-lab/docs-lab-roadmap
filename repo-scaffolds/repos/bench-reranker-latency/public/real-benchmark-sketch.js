// Real reranker latency benchmark sketch for bench-reranker-latency.
//
// Gated by ?mode=real-reranker-bench. Default deterministic harness path is
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

export function buildRealRerankerBenchAdapter({
  Benchmark,
  pipeline,
  benchmarkVersion = DEFAULT_BENCHMARK_VERSION,
  transformersVersion = DEFAULT_TRANSFORMERS_VERSION,
  suiteId = "reranker-latency"
}) {
  if (!Benchmark) throw new Error("buildRealRerankerBenchAdapter requires Benchmark");
  if (typeof pipeline !== "function") throw new Error("buildRealRerankerBenchAdapter requires a callable pipeline");
  const id = `bench-reranker-${suiteId}-${benchmarkVersion.replace(/[^0-9]/g, "")}-${transformersVersion.replace(/[^0-9]/g, "")}`;
  let suite = null;
  let profileResults = [];
  const runtimeCache = new Map();

  return {
    id,
    label: `Reranker latency bench (benchmark.js ${benchmarkVersion} + Transformers.js ${transformersVersion})`,
    version: benchmarkVersion,
    capabilities: ["profile-comparison", "winner-selection", "real-benchmark", "rerank-quality"],
    benchmarkType: "reranker-latency",
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
      if (candidates.length === 0) throw new Error("runProfile requires at least one candidate");
      let runtime = runtimeCache.get(modelId);
      if (!runtime) {
        runtime = await pipeline("text-classification", modelId, { device: "webgpu", dtype: "fp32" });
        runtimeCache.set(modelId, runtime);
      }
      const startedAt = performance.now();
      const scored = [];
      for (const candidate of candidates) {
        const inputs = `${query}\t${candidate.text || candidate}`;
        const output = await runtime(inputs);
        const score = Array.isArray(output) && output[0] && Number.isFinite(output[0].score) ? output[0].score : 0;
        scored.push({ id: candidate.id || null, score, text: candidate.text || String(candidate) });
      }
      scored.sort((left, right) => right.score - left.score);
      const elapsedMs = performance.now() - startedAt;
      const sample = { profileId, modelId, elapsedMs, candidatesPerSec: candidates.length / Math.max(elapsedMs / 1000, 0.001), topK: scored.slice(0, 5) };
      profileResults.push(sample);
      return sample;
    },
    async aggregateResults() {
      if (!profileResults.length) return { profileCount: 0, winner: null, samples: [] };
      const sorted = [...profileResults].sort((left, right) => right.candidatesPerSec - left.candidatesPerSec);
      return { profileCount: sorted.length, winner: sorted[0].profileId, samples: sorted };
    }
  };
}

export async function connectRealRerankerBench({
  registry = typeof window !== "undefined" ? window.__aiWebGpuLabBenchmarkRegistry : null,
  loader = loadBenchmarkAndRuntime,
  benchmarkVersion = DEFAULT_BENCHMARK_VERSION,
  transformersVersion = DEFAULT_TRANSFORMERS_VERSION,
  suiteId = "reranker-latency"
} = {}) {
  if (!registry) throw new Error("benchmark registry not available");
  const { Benchmark, pipeline } = await loader({ benchmarkVersion, transformersVersion });
  const adapter = buildRealRerankerBenchAdapter({ Benchmark, pipeline, benchmarkVersion, transformersVersion, suiteId });
  registry.register(adapter);
  return { adapter, Benchmark, pipeline };
}

if (typeof window !== "undefined" && window.location && typeof window.location.search === "string") {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "real-reranker-bench" && !window.__aiWebGpuLabRealRerankerBenchBootstrapping) {
    window.__aiWebGpuLabRealRerankerBenchBootstrapping = true;
    connectRealRerankerBench().catch((error) => {
      console.warn(`[real-reranker-bench] bootstrap failed: ${error.message}`);
      window.__aiWebGpuLabRealRerankerBenchBootstrapError = error.message;
    });
  }
}
