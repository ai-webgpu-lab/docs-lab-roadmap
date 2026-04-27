// Real runtime shootout benchmark sketch for bench-runtime-shootout.
//
// Gated by ?mode=real-runtime-shootout-bench. Default deterministic harness path
// is untouched. `loadBenchmarkAndRuntime` is parameterized so tests can inject
// stubs. This sketch is distinct from real-runtime-sketch.js (which exposes a
// single Transformers.js runtime adapter); here we wrap multi-runtime
// comparison under benchmark.js to compete WebLLM-style vs Transformers.js-style
// vs ORT-Web-style profiles in one suite.

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

export function buildRealRuntimeShootoutBenchAdapter({
  Benchmark,
  pipeline,
  runtimeFactory = null,
  benchmarkVersion = DEFAULT_BENCHMARK_VERSION,
  transformersVersion = DEFAULT_TRANSFORMERS_VERSION,
  suiteId = "runtime-shootout"
}) {
  if (!Benchmark) throw new Error("buildRealRuntimeShootoutBenchAdapter requires Benchmark");
  if (typeof pipeline !== "function") throw new Error("buildRealRuntimeShootoutBenchAdapter requires a callable pipeline");
  const id = `bench-runtime-shootout-${suiteId}-${benchmarkVersion.replace(/[^0-9]/g, "")}-${transformersVersion.replace(/[^0-9]/g, "")}`;
  let suite = null;
  let profileResults = [];
  const runtimeCache = new Map();

  async function obtainRuntime(profile) {
    const cacheKey = `${profile.runtimeKind}|${profile.modelId}`;
    if (runtimeCache.has(cacheKey)) return runtimeCache.get(cacheKey);
    let runtime;
    if (runtimeFactory) {
      runtime = await runtimeFactory(profile);
    } else if (profile.runtimeKind === "transformersjs") {
      runtime = await pipeline("text-generation", profile.modelId, { device: "webgpu", dtype: "q4" });
    } else {
      throw new Error(`runtimeKind '${profile.runtimeKind}' requires runtimeFactory`);
    }
    runtimeCache.set(cacheKey, runtime);
    return runtime;
  }

  return {
    id,
    label: `Runtime shootout bench (benchmark.js ${benchmarkVersion} + multi-runtime)`,
    version: benchmarkVersion,
    capabilities: ["profile-comparison", "winner-selection", "real-benchmark", "multi-runtime"],
    benchmarkType: "runtime-shootout",
    isReal: true,
    async createBenchmark({ name = suiteId } = {}) {
      const SuiteCtor = Benchmark.Suite || (typeof Benchmark === "function" ? Benchmark.Suite : null);
      if (!SuiteCtor) throw new Error("Benchmark.Suite not available");
      suite = new SuiteCtor(name);
      profileResults = [];
      runtimeCache.clear();
      return suite;
    },
    async runProfile({ profileId, runtimeKind, modelId, prompt, outputTokens = 32 } = {}) {
      if (!suite) throw new Error("createBenchmark() must run before runProfile()");
      if (!profileId || !runtimeKind || !modelId) throw new Error("runProfile requires profileId, runtimeKind, modelId");
      const runtime = await obtainRuntime({ runtimeKind, modelId });
      const startedAt = performance.now();
      let text = "";
      if (typeof runtime === "function") {
        const output = await runtime(prompt || "Benchmark prompt", { max_new_tokens: outputTokens, return_full_text: false });
        text = Array.isArray(output) && output[0] && output[0].generated_text ? output[0].generated_text : "";
      } else if (runtime && runtime.chat && runtime.chat.completions && typeof runtime.chat.completions.create === "function") {
        const reply = await runtime.chat.completions.create({
          messages: [{ role: "user", content: prompt || "Benchmark prompt" }],
          max_tokens: outputTokens,
          temperature: 0
        });
        text = reply && reply.choices && reply.choices[0] && reply.choices[0].message ? reply.choices[0].message.content : "";
      } else if (runtime && typeof runtime.run === "function") {
        const reply = await runtime.run({ prompt: prompt || "Benchmark prompt", maxNewTokens: outputTokens });
        text = (reply && reply.text) || "";
      } else {
        throw new Error(`runtime for kind '${runtimeKind}' is not callable`);
      }
      const elapsedMs = performance.now() - startedAt;
      const tokens = text.split(/\s+/).filter(Boolean).length || outputTokens;
      const sample = {
        profileId,
        runtimeKind,
        modelId,
        elapsedMs,
        ttftMs: elapsedMs / Math.max(tokens, 1),
        tokens,
        decodeTokPerSec: tokens / Math.max(elapsedMs / 1000, 0.001)
      };
      profileResults.push(sample);
      return sample;
    },
    async aggregateResults() {
      if (!profileResults.length) return { profileCount: 0, winner: null, samples: [] };
      const sorted = [...profileResults].sort((left, right) => right.decodeTokPerSec - left.decodeTokPerSec);
      return { profileCount: sorted.length, winner: sorted[0].profileId, samples: sorted };
    }
  };
}

export async function connectRealRuntimeShootoutBench({
  registry = typeof window !== "undefined" ? window.__aiWebGpuLabBenchmarkRegistry : null,
  loader = loadBenchmarkAndRuntime,
  runtimeFactory = null,
  benchmarkVersion = DEFAULT_BENCHMARK_VERSION,
  transformersVersion = DEFAULT_TRANSFORMERS_VERSION,
  suiteId = "runtime-shootout"
} = {}) {
  if (!registry) throw new Error("benchmark registry not available");
  const { Benchmark, pipeline } = await loader({ benchmarkVersion, transformersVersion });
  const adapter = buildRealRuntimeShootoutBenchAdapter({ Benchmark, pipeline, runtimeFactory, benchmarkVersion, transformersVersion, suiteId });
  registry.register(adapter);
  return { adapter, Benchmark, pipeline };
}

if (typeof window !== "undefined" && window.location && typeof window.location.search === "string") {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "real-runtime-shootout-bench" && !window.__aiWebGpuLabRealRuntimeShootoutBenchBootstrapping) {
    window.__aiWebGpuLabRealRuntimeShootoutBenchBootstrapping = true;
    connectRealRuntimeShootoutBench().catch((error) => {
      console.warn(`[real-runtime-shootout-bench] bootstrap failed: ${error.message}`);
      window.__aiWebGpuLabRealRuntimeShootoutBenchBootstrapError = error.message;
    });
  }
}
