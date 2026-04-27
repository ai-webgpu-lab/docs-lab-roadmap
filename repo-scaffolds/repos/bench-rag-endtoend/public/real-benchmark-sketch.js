// Real RAG end-to-end benchmark sketch for bench-rag-endtoend.
//
// Gated by ?mode=real-rag-bench. Default deterministic harness path is untouched.
// `loadBenchmarkAndRuntime` is parameterized so tests can inject stubs.
// Each profile runs feature-extraction (retrieve) + text-generation (answer)
// and aggregates by total elapsed.

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

function dot(a, b) {
  let total = 0;
  const len = Math.min(a.length, b.length);
  for (let index = 0; index < len; index += 1) total += a[index] * b[index];
  return total;
}

function toArray(maybeTensor) {
  if (!maybeTensor) return [];
  if (Array.isArray(maybeTensor)) return maybeTensor;
  if (maybeTensor.data && typeof maybeTensor.data[Symbol.iterator] === "function") return Array.from(maybeTensor.data);
  return [];
}

export function buildRealRagBenchAdapter({
  Benchmark,
  pipeline,
  benchmarkVersion = DEFAULT_BENCHMARK_VERSION,
  transformersVersion = DEFAULT_TRANSFORMERS_VERSION,
  suiteId = "rag-endtoend"
}) {
  if (!Benchmark) throw new Error("buildRealRagBenchAdapter requires Benchmark");
  if (typeof pipeline !== "function") throw new Error("buildRealRagBenchAdapter requires a callable pipeline");
  const id = `bench-rag-${suiteId}-${benchmarkVersion.replace(/[^0-9]/g, "")}-${transformersVersion.replace(/[^0-9]/g, "")}`;
  let suite = null;
  let profileResults = [];
  const runtimeCache = new Map();

  return {
    id,
    label: `RAG end-to-end bench (benchmark.js ${benchmarkVersion} + Transformers.js ${transformersVersion})`,
    version: benchmarkVersion,
    capabilities: ["profile-comparison", "winner-selection", "real-benchmark", "rag-pipeline"],
    benchmarkType: "rag-endtoend",
    isReal: true,
    async createBenchmark({ name = suiteId } = {}) {
      const SuiteCtor = Benchmark.Suite || (typeof Benchmark === "function" ? Benchmark.Suite : null);
      if (!SuiteCtor) throw new Error("Benchmark.Suite not available");
      suite = new SuiteCtor(name);
      profileResults = [];
      runtimeCache.clear();
      return suite;
    },
    async runProfile({ profileId, embedderId, generatorId, query, documents = [], outputTokens = 32 } = {}) {
      if (!suite) throw new Error("createBenchmark() must run before runProfile()");
      if (!profileId || !embedderId || !generatorId) throw new Error("runProfile requires profileId, embedderId, generatorId");
      if (documents.length === 0) throw new Error("runProfile requires at least one document");
      const cacheKey = `${embedderId}|${generatorId}`;
      let runtime = runtimeCache.get(cacheKey);
      if (!runtime) {
        const embedder = await pipeline("feature-extraction", embedderId, { device: "webgpu", dtype: "fp32" });
        const generator = await pipeline("text-generation", generatorId, { device: "webgpu", dtype: "q4" });
        runtime = { embedder, generator };
        runtimeCache.set(cacheKey, runtime);
      }
      const retrieveStart = performance.now();
      const queryEmbedding = toArray(await runtime.embedder(query, { pooling: "mean", normalize: true }));
      const scored = [];
      for (const doc of documents) {
        const text = doc.text || String(doc);
        const docEmbedding = toArray(await runtime.embedder(text, { pooling: "mean", normalize: true }));
        scored.push({ id: doc.id || null, text, score: dot(queryEmbedding, docEmbedding) });
      }
      scored.sort((left, right) => right.score - left.score);
      const top = scored.slice(0, 3);
      const retrieveMs = performance.now() - retrieveStart;
      const answerStart = performance.now();
      const promptText = `Context:\n${top.map((entry) => `- ${entry.text}`).join("\n")}\n\nQuestion: ${query}\nAnswer:`;
      const output = await runtime.generator(promptText, { max_new_tokens: outputTokens, return_full_text: false });
      const answerMs = performance.now() - answerStart;
      const text = Array.isArray(output) && output[0] && output[0].generated_text ? output[0].generated_text : "";
      const elapsedMs = retrieveMs + answerMs;
      const tokens = text.split(/\s+/).filter(Boolean).length || outputTokens;
      const sample = {
        profileId,
        embedderId,
        generatorId,
        elapsedMs,
        retrieveMs,
        answerMs,
        topK: top,
        tokens,
        decodeTokPerSec: tokens / Math.max(elapsedMs / 1000, 0.001)
      };
      profileResults.push(sample);
      return sample;
    },
    async aggregateResults() {
      if (!profileResults.length) return { profileCount: 0, winner: null, samples: [] };
      const sorted = [...profileResults].sort((left, right) => left.elapsedMs - right.elapsedMs);
      return { profileCount: sorted.length, winner: sorted[0].profileId, samples: sorted };
    }
  };
}

export async function connectRealRagBench({
  registry = typeof window !== "undefined" ? window.__aiWebGpuLabBenchmarkRegistry : null,
  loader = loadBenchmarkAndRuntime,
  benchmarkVersion = DEFAULT_BENCHMARK_VERSION,
  transformersVersion = DEFAULT_TRANSFORMERS_VERSION,
  suiteId = "rag-endtoend"
} = {}) {
  if (!registry) throw new Error("benchmark registry not available");
  const { Benchmark, pipeline } = await loader({ benchmarkVersion, transformersVersion });
  const adapter = buildRealRagBenchAdapter({ Benchmark, pipeline, benchmarkVersion, transformersVersion, suiteId });
  registry.register(adapter);
  return { adapter, Benchmark, pipeline };
}

if (typeof window !== "undefined" && window.location && typeof window.location.search === "string") {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "real-rag-bench" && !window.__aiWebGpuLabRealRagBenchBootstrapping) {
    window.__aiWebGpuLabRealRagBenchBootstrapping = true;
    connectRealRagBench().catch((error) => {
      console.warn(`[real-rag-bench] bootstrap failed: ${error.message}`);
      window.__aiWebGpuLabRealRagBenchBootstrapError = error.message;
    });
  }
}
