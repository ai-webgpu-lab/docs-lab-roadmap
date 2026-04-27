// Real model load and cache benchmark sketch for bench-model-load-and-cache.
//
// Gated by ?mode=real-model-cache-bench. Default deterministic harness path is
// untouched. `loadBenchmarkAndRuntime` is parameterized so tests can inject stubs.
// The adapter supports cold (cache cleared) vs warm (cache hit) profiles by
// calling caches.delete + cache reload before each cold profile.

const DEFAULT_BENCHMARK_VERSION = "2.1.4";
const DEFAULT_BENCHMARK_CDN = (version) => `https://esm.sh/benchmark@${version}`;
const DEFAULT_TRANSFORMERS_VERSION = "3.0.0";
const DEFAULT_TRANSFORMERS_CDN = (version) => `https://esm.sh/@huggingface/transformers@${version}`;

export async function loadBenchmarkAndRuntime({
  benchmarkVersion = DEFAULT_BENCHMARK_VERSION,
  transformersVersion = DEFAULT_TRANSFORMERS_VERSION,
  cachesImpl = (typeof caches !== "undefined" ? caches : null)
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
  return { Benchmark, transformers, pipeline: transformers.pipeline, caches: cachesImpl };
}

export function buildRealModelCacheBenchAdapter({
  Benchmark,
  pipeline,
  caches: cachesImpl = null,
  benchmarkVersion = DEFAULT_BENCHMARK_VERSION,
  transformersVersion = DEFAULT_TRANSFORMERS_VERSION,
  cacheName = "ai-webgpu-lab-model-cache",
  suiteId = "model-load-and-cache"
}) {
  if (!Benchmark) throw new Error("buildRealModelCacheBenchAdapter requires Benchmark");
  if (typeof pipeline !== "function") throw new Error("buildRealModelCacheBenchAdapter requires a callable pipeline");
  const id = `bench-model-cache-${suiteId}-${benchmarkVersion.replace(/[^0-9]/g, "")}-${transformersVersion.replace(/[^0-9]/g, "")}`;
  let suite = null;
  let profileResults = [];

  return {
    id,
    label: `Model load and cache bench (benchmark.js ${benchmarkVersion} + Transformers.js ${transformersVersion})`,
    version: benchmarkVersion,
    capabilities: ["profile-comparison", "winner-selection", "real-benchmark", "cold-warm-cache"],
    benchmarkType: "model-load-and-cache",
    isReal: true,
    async createBenchmark({ name = suiteId } = {}) {
      const SuiteCtor = Benchmark.Suite || (typeof Benchmark === "function" ? Benchmark.Suite : null);
      if (!SuiteCtor) throw new Error("Benchmark.Suite not available");
      suite = new SuiteCtor(name);
      profileResults = [];
      return suite;
    },
    async runProfile({ profileId, modelId, cacheState = "warm" } = {}) {
      if (!suite) throw new Error("createBenchmark() must run before runProfile()");
      if (!profileId || !modelId) throw new Error("runProfile requires profileId and modelId");
      if (cacheState !== "cold" && cacheState !== "warm") throw new Error(`unsupported cacheState '${cacheState}' (expected 'cold' or 'warm')`);
      let cacheCleared = false;
      if (cacheState === "cold" && cachesImpl && typeof cachesImpl.delete === "function") {
        try {
          cacheCleared = await cachesImpl.delete(cacheName);
        } catch (error) {
          cacheCleared = false;
        }
      }
      const startedAt = performance.now();
      const runtime = await pipeline("text-generation", modelId, { device: "webgpu", dtype: "q4" });
      const elapsedMs = performance.now() - startedAt;
      const sample = {
        profileId,
        modelId,
        cacheState,
        cacheCleared,
        elapsedMs,
        loadMs: elapsedMs,
        runtimeReady: Boolean(runtime)
      };
      profileResults.push(sample);
      return sample;
    },
    async aggregateResults() {
      if (!profileResults.length) return { profileCount: 0, winner: null, samples: [] };
      const sorted = [...profileResults].sort((left, right) => left.loadMs - right.loadMs);
      const cold = profileResults.filter((sample) => sample.cacheState === "cold");
      const warm = profileResults.filter((sample) => sample.cacheState === "warm");
      const speedup = cold.length && warm.length
        ? cold.reduce((sum, sample) => sum + sample.loadMs, 0) / cold.length
            / Math.max(warm.reduce((sum, sample) => sum + sample.loadMs, 0) / warm.length, 1)
        : null;
      return { profileCount: sorted.length, winner: sorted[0].profileId, samples: sorted, coldWarmSpeedup: speedup };
    }
  };
}

export async function connectRealModelCacheBench({
  registry = typeof window !== "undefined" ? window.__aiWebGpuLabBenchmarkRegistry : null,
  loader = loadBenchmarkAndRuntime,
  benchmarkVersion = DEFAULT_BENCHMARK_VERSION,
  transformersVersion = DEFAULT_TRANSFORMERS_VERSION,
  cacheName = "ai-webgpu-lab-model-cache",
  suiteId = "model-load-and-cache"
} = {}) {
  if (!registry) throw new Error("benchmark registry not available");
  const { Benchmark, pipeline, caches: cachesImpl } = await loader({ benchmarkVersion, transformersVersion });
  const adapter = buildRealModelCacheBenchAdapter({ Benchmark, pipeline, caches: cachesImpl, benchmarkVersion, transformersVersion, cacheName, suiteId });
  registry.register(adapter);
  return { adapter, Benchmark, pipeline };
}

if (typeof window !== "undefined" && window.location && typeof window.location.search === "string") {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "real-model-cache-bench" && !window.__aiWebGpuLabRealModelCacheBenchBootstrapping) {
    window.__aiWebGpuLabRealModelCacheBenchBootstrapping = true;
    connectRealModelCacheBench().catch((error) => {
      console.warn(`[real-model-cache-bench] bootstrap failed: ${error.message}`);
      window.__aiWebGpuLabRealModelCacheBenchBootstrapError = error.message;
    });
  }
}
