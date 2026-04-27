// Real multimodal latency benchmark sketch for bench-multimodal-latency.
//
// Gated by ?mode=real-multimodal-bench. Default deterministic harness path is
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

export function buildRealMultimodalBenchAdapter({
  Benchmark,
  pipeline,
  benchmarkVersion = DEFAULT_BENCHMARK_VERSION,
  transformersVersion = DEFAULT_TRANSFORMERS_VERSION,
  suiteId = "multimodal-latency"
}) {
  if (!Benchmark) throw new Error("buildRealMultimodalBenchAdapter requires Benchmark");
  if (typeof pipeline !== "function") throw new Error("buildRealMultimodalBenchAdapter requires a callable pipeline");
  const id = `bench-multimodal-${suiteId}-${benchmarkVersion.replace(/[^0-9]/g, "")}-${transformersVersion.replace(/[^0-9]/g, "")}`;
  let suite = null;
  let profileResults = [];
  const runtimeCache = new Map();

  return {
    id,
    label: `Multimodal latency bench (benchmark.js ${benchmarkVersion} + Transformers.js ${transformersVersion})`,
    version: benchmarkVersion,
    capabilities: ["profile-comparison", "winner-selection", "real-benchmark", "vlm-answer"],
    benchmarkType: "multimodal-latency",
    isReal: true,
    async createBenchmark({ name = suiteId } = {}) {
      const SuiteCtor = Benchmark.Suite || (typeof Benchmark === "function" ? Benchmark.Suite : null);
      if (!SuiteCtor) throw new Error("Benchmark.Suite not available");
      suite = new SuiteCtor(name);
      profileResults = [];
      runtimeCache.clear();
      return suite;
    },
    async runProfile({ profileId, modelId, image, question, outputTokens = 32 } = {}) {
      if (!suite) throw new Error("createBenchmark() must run before runProfile()");
      if (!profileId || !modelId) throw new Error("runProfile requires profileId and modelId");
      let runtime = runtimeCache.get(modelId);
      if (!runtime) {
        runtime = await pipeline("image-text-to-text", modelId, { device: "webgpu", dtype: "q4" });
        runtimeCache.set(modelId, runtime);
      }
      const startedAt = performance.now();
      const output = await runtime({ image, text: question || "Describe the image." }, { max_new_tokens: outputTokens });
      const elapsedMs = performance.now() - startedAt;
      const text = Array.isArray(output) && output[0] && output[0].generated_text
        ? output[0].generated_text
        : (typeof output === "string" ? output : "");
      const tokens = text.split(/\s+/).filter(Boolean).length || outputTokens;
      const sample = { profileId, modelId, elapsedMs, answerTotalMs: elapsedMs, tokens, decodeTokPerSec: tokens / Math.max(elapsedMs / 1000, 0.001) };
      profileResults.push(sample);
      return sample;
    },
    async aggregateResults() {
      if (!profileResults.length) return { profileCount: 0, winner: null, samples: [] };
      const sorted = [...profileResults].sort((left, right) => left.answerTotalMs - right.answerTotalMs);
      return { profileCount: sorted.length, winner: sorted[0].profileId, samples: sorted };
    }
  };
}

export async function connectRealMultimodalBench({
  registry = typeof window !== "undefined" ? window.__aiWebGpuLabBenchmarkRegistry : null,
  loader = loadBenchmarkAndRuntime,
  benchmarkVersion = DEFAULT_BENCHMARK_VERSION,
  transformersVersion = DEFAULT_TRANSFORMERS_VERSION,
  suiteId = "multimodal-latency"
} = {}) {
  if (!registry) throw new Error("benchmark registry not available");
  const { Benchmark, pipeline } = await loader({ benchmarkVersion, transformersVersion });
  const adapter = buildRealMultimodalBenchAdapter({ Benchmark, pipeline, benchmarkVersion, transformersVersion, suiteId });
  registry.register(adapter);
  return { adapter, Benchmark, pipeline };
}

if (typeof window !== "undefined" && window.location && typeof window.location.search === "string") {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "real-multimodal-bench" && !window.__aiWebGpuLabRealMultimodalBenchBootstrapping) {
    window.__aiWebGpuLabRealMultimodalBenchBootstrapping = true;
    connectRealMultimodalBench().catch((error) => {
      console.warn(`[real-multimodal-bench] bootstrap failed: ${error.message}`);
      window.__aiWebGpuLabRealMultimodalBenchBootstrapError = error.message;
    });
  }
}
