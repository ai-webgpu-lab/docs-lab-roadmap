// Real agent step latency benchmark sketch for bench-agent-step-latency.
//
// Gated by ?mode=real-agent-bench. Default deterministic harness path is untouched.
// `loadBenchmarkAndRuntime` is parameterized so tests can inject stubs.

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

export function buildRealAgentBenchAdapter({
  Benchmark,
  pipeline,
  benchmarkVersion = DEFAULT_BENCHMARK_VERSION,
  transformersVersion = DEFAULT_TRANSFORMERS_VERSION,
  suiteId = "agent-step-latency"
}) {
  if (!Benchmark) throw new Error("buildRealAgentBenchAdapter requires Benchmark");
  if (typeof pipeline !== "function") throw new Error("buildRealAgentBenchAdapter requires a callable pipeline");
  const id = `bench-agent-${suiteId}-${benchmarkVersion.replace(/[^0-9]/g, "")}-${transformersVersion.replace(/[^0-9]/g, "")}`;
  let suite = null;
  let profileResults = [];
  const runtimeCache = new Map();

  return {
    id,
    label: `Agent step latency bench (benchmark.js ${benchmarkVersion} + Transformers.js ${transformersVersion})`,
    version: benchmarkVersion,
    capabilities: ["profile-comparison", "winner-selection", "real-benchmark", "agent-tool-call"],
    benchmarkType: "agent-step-latency",
    isReal: true,
    async createBenchmark({ name = suiteId } = {}) {
      const SuiteCtor = Benchmark.Suite || (typeof Benchmark === "function" ? Benchmark.Suite : null);
      if (!SuiteCtor) throw new Error("Benchmark.Suite not available");
      suite = new SuiteCtor(name);
      profileResults = [];
      runtimeCache.clear();
      return suite;
    },
    async runProfile({ profileId, modelId, task, tools = [], outputTokens = 96 } = {}) {
      if (!suite) throw new Error("createBenchmark() must run before runProfile()");
      if (!profileId || !modelId) throw new Error("runProfile requires profileId and modelId");
      if (!task) throw new Error("runProfile requires a task description");
      let runtime = runtimeCache.get(modelId);
      if (!runtime) {
        runtime = await pipeline("text-generation", modelId, { device: "webgpu", dtype: "q4" });
        runtimeCache.set(modelId, runtime);
      }
      const startedAt = performance.now();
      const promptText = `Task: ${task}\nTools: ${tools.join(", ")}\nPlan:`;
      const output = await runtime(promptText, { max_new_tokens: outputTokens, return_full_text: false });
      const elapsedMs = performance.now() - startedAt;
      const text = Array.isArray(output) && output[0] && output[0].generated_text ? output[0].generated_text : "";
      const tokens = text.split(/\s+/).filter(Boolean).length || outputTokens;
      const stepCount = (text.match(/\n/g) || []).length + 1;
      const sample = {
        profileId,
        modelId,
        elapsedMs,
        avgStepLatencyMs: elapsedMs / Math.max(stepCount, 1),
        stepCount,
        tokens,
        decodeTokPerSec: tokens / Math.max(elapsedMs / 1000, 0.001)
      };
      profileResults.push(sample);
      return sample;
    },
    async aggregateResults() {
      if (!profileResults.length) return { profileCount: 0, winner: null, samples: [] };
      const sorted = [...profileResults].sort((left, right) => left.avgStepLatencyMs - right.avgStepLatencyMs);
      return { profileCount: sorted.length, winner: sorted[0].profileId, samples: sorted };
    }
  };
}

export async function connectRealAgentBench({
  registry = typeof window !== "undefined" ? window.__aiWebGpuLabBenchmarkRegistry : null,
  loader = loadBenchmarkAndRuntime,
  benchmarkVersion = DEFAULT_BENCHMARK_VERSION,
  transformersVersion = DEFAULT_TRANSFORMERS_VERSION,
  suiteId = "agent-step-latency"
} = {}) {
  if (!registry) throw new Error("benchmark registry not available");
  const { Benchmark, pipeline } = await loader({ benchmarkVersion, transformersVersion });
  const adapter = buildRealAgentBenchAdapter({ Benchmark, pipeline, benchmarkVersion, transformersVersion, suiteId });
  registry.register(adapter);
  return { adapter, Benchmark, pipeline };
}

if (typeof window !== "undefined" && window.location && typeof window.location.search === "string") {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "real-agent-bench" && !window.__aiWebGpuLabRealAgentBenchBootstrapping) {
    window.__aiWebGpuLabRealAgentBenchBootstrapping = true;
    connectRealAgentBench().catch((error) => {
      console.warn(`[real-agent-bench] bootstrap failed: ${error.message}`);
      window.__aiWebGpuLabRealAgentBenchBootstrapError = error.message;
    });
  }
}
